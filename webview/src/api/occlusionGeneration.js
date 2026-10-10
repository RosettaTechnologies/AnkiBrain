import { store, updateUser } from "./redux";
import { addCards, applyCardOcclusions } from "./redux/slices/cards";
import {
  occlusionJobStarted,
  occlusionJobSettled,
  occlusionJobFailed,
  occlusionJobsCancelled,
  consumeOcclusionCancelled,
} from "./redux/slices/occlusionGeneration";
import { pyGenerateOcclusionShapes } from "./PythonBridge/senders/pyGenerateOcclusionShapes";
import { errorToast, infoToast } from "./toast";
import { localConfigGate } from "./localConfig";

/*
 * AI mask generation for image-occlusion cards.
 *
 * Batch auto-generation (Make Cards → Image Occlusion) and the editor's
 * manual "Suggest with AI" both run through ONE sequential lane: the ChatAI
 * subprocess matches a single response per request on a shared pipe, so two
 * concurrent vision calls could cross responses. Jobs are addressed by card
 * uid, and cancel marks let the user walk away from a queued/in-flight card
 * without stopping the rest of the batch.
 */

let laneTail = Promise.resolve();

// Queue a vision task behind everything already running. Never rejects the
// caller's promise on a previous task's failure.
export function enqueueOcclusionTask(task) {
  const run = laneTail.then(task, task);
  laneTail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function runVisionPass({ imageId, context = "" }) {
  const language = store.getState().language.value;
  const res = await pyGenerateOcclusionShapes({ imageId, context, language });
  if (res && res.user) {
    store.dispatch(updateUser(res.user));
  }
  return {
    shapes: (res && res.shapes) || [],
    header: (res && res.header) || "",
    backExtra: (res && res.backExtra) || "",
  };
}

// Manual "Suggest with AI" from the occlusion editor: serialized with the
// batch lane, but without generation bookkeeping (the modal owns its spinner).
export function suggestOcclusionsQueued(imageId, context = "") {
  const gate = localConfigGate(
    store.getState().userMode.value,
    store.getState().appSettings.ai
  );
  if (!gate.ok) {
    infoToast("Setup required", gate.reason);
    return [];
  }
  return enqueueOcclusionTask(() => runVisionPass({ imageId, context }));
}

/*
 * Create one pending occlusion card per image and kick off mask generation.
 * Cards appear in the review list immediately, each with its spinner, so the
 * user can cancel individual images while the batch runs.
 */
export function createOcclusionCards(images, contexts = {}) {
  const list = (images || []).filter((image) => image && image.id);
  if (list.length === 0) {
    return [];
  }

  const newCards = list.map((image) => ({
    type: "occlusion",
    image: image.id,
    occlusions: [],
    occludeInactive: false,
    header: "",
    backExtra: "",
    tags: [],
  }));
  store.dispatch(addCards(newCards));
  requestOcclusionGeneration(
    newCards.map((card) => ({
      uid: card.uid,
      imageId: card.image,
      context: contexts[card.image] || "",
    }))
  );
  return newCards;
}

export function requestOcclusionGeneration(items) {
  const gate = localConfigGate(
    store.getState().userMode.value,
    store.getState().appSettings.ai
  );
  if (!gate.ok) {
    infoToast("Setup required", gate.reason);
    return Promise.resolve();
  }
  const list = (items || []).filter((item) => item && item.uid && item.imageId);
  if (list.length === 0) {
    return Promise.resolve();
  }
  store.dispatch(occlusionJobStarted(list.map((item) => item.uid)));
  // runBatch handles per-card failures itself; this catch only guards
  // against unexpected errors so a batch promise can never go unhandled.
  return enqueueOcclusionTask(() => runBatch(list)).catch((err) => {
    console.warn("occlusion generation batch failed", err);
  });
}

// Retry / first-run for a single card (failed, cancelled, or restored with
// no masks). Context from the original document run is not persisted.
export function requestCardOcclusionGeneration(card) {
  if (!card || !card.uid || !card.image) {
    return;
  }
  if (store.getState().occlusionGeneration.generating[card.uid]) {
    return; // already queued — a click should not double-schedule
  }
  requestOcclusionGeneration([
    { uid: card.uid, imageId: card.image, context: "" },
  ]);
}

// Cancel scopes: one card / the whole queue.
export function cancelOcclusionGeneration(uid) {
  if (!uid) {
    return;
  }
  store.dispatch(occlusionJobsCancelled({ uids: [uid] }));
}

export function cancelAllOcclusionGeneration() {
  store.dispatch(occlusionJobsCancelled({ all: true }));
}

// Errors no per-card retry can fix — every remaining image would fail the
// same way, so the batch stops and reports once.
function isFatalVisionError(message) {
  const msg = String(message || "");
  return (
    /cannot analyze images/i.test(msg) ||
    /log in to use ai occlusion/i.test(msg)
  );
}

async function runBatch(items) {
  let fatalMessage = "";

  for (const item of items) {
    const state = store.getState();
    const uid = item.uid;

    if (state.occlusionGeneration.cancelled[uid]) {
      store.dispatch(occlusionJobSettled({ uid }));
      store.dispatch(consumeOcclusionCancelled({ uid }));
      continue;
    }

    if (!state.cards.value.find((c) => c.uid === uid)) {
      // Card deleted while queued — drop the job silently.
      store.dispatch(occlusionJobSettled({ uid }));
      store.dispatch(consumeOcclusionCancelled({ uid }));
      continue;
    }

    let result = null;
    let message = "";
    try {
      result = await runVisionPass({
        imageId: item.imageId,
        context: item.context,
      });
    } catch (err) {
      message = String((err && err.message) || err);
    }

    const cancelled = !!store.getState().occlusionGeneration.cancelled[uid];
    store.dispatch(occlusionJobSettled({ uid }));
    store.dispatch(consumeOcclusionCancelled({ uid }));
    if (cancelled) {
      continue; // user moved on; discard the result
    }

    if (message) {
      store.dispatch(occlusionJobFailed({ uid, message: message.slice(0, 200) }));
      if (isFatalVisionError(message)) {
        fatalMessage = message;
        break;
      }
      continue;
    }

    store.dispatch(
      applyCardOcclusions({
        uid,
        occlusions: result.shapes,
        header: result.header,
        backExtra: result.backExtra,
      })
    );
  }

  if (fatalMessage) {
    // Settle whatever is left with the same error so each card shows Retry
    // (cancelled ones stay cancelled), then surface the cause once.
    for (const item of items) {
      const state = store.getState();
      const uid = item.uid;
      if (!state.occlusionGeneration.generating[uid]) {
        continue;
      }
      const cancelled = !!state.occlusionGeneration.cancelled[uid];
      store.dispatch(occlusionJobSettled({ uid }));
      store.dispatch(consumeOcclusionCancelled({ uid }));
      if (!cancelled) {
        store.dispatch(
          occlusionJobFailed({ uid, message: fatalMessage.slice(0, 200) })
        );
      }
    }
    errorToast("Mask Generation Failed", fatalMessage.slice(0, 300));
  }
}
