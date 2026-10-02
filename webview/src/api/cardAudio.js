import { store } from "./redux";
import { fieldsWantingAudio, textForAudioField, audioJobKey } from "./cardAudioFields";
import { requestAudioGeneration } from "./PythonBridge/senders/pyGenerateCardAudio";
import { pyCancelCardAudio } from "./PythonBridge/senders/pyCancelCardAudio";
import { addAudioEntries } from "./redux/slices/audioRegistry";
import { applyCardAudio } from "./redux/slices/cards";
import {
  audioJobSettled,
  audioJobFailed,
  consumeCancelled,
} from "./redux/slices/cardAudio";

/*
 * Card-audio orchestration: turning the review screen's intents (a mode, a
 * field click, an Apply-to-all, a cancel) into GENERATE_CARD_AUDIO batches,
 * and applying the pushed results back onto cards by uid. The bridge
 * mechanics live in senders/pyGenerateCardAudio / pyCancelCardAudio.
 */

// Cards → job items for a mode, minus anything already queued for synthesis.
export function buildAudioItems(cards, mode) {
  const generating = store.getState().cardAudio.generating;
  const items = [];
  for (const card of cards || []) {
    if (!card.uid) {
      continue;
    }
    for (const field of fieldsWantingAudio(card, mode)) {
      if (generating[card.uid] && generating[card.uid][field]) {
        continue;
      }
      items.push({
        uid: card.uid,
        field,
        text: textForAudioField(card, field),
        isCloze: card.type === "cloze",
      });
    }
  }
  return items;
}

// One-click "generate audio for this field" on an EditableCard.
export function requestFieldAudio(card, field) {
  if (!card || !card.uid) {
    return;
  }
  const generating = store.getState().cardAudio.generating[card.uid];
  if (generating && generating[field]) {
    return; // already queued — a click should not double-schedule
  }
  requestAudioGeneration([
    {
      uid: card.uid,
      field,
      text: textForAudioField(card, field),
      isCloze: card.type === "cloze",
    },
  ]);
}

/*
 * CARD_AUDIO_RESULT push handler. Addressing is by uid, so the clip lands on
 * the card it was synthesized from even if the list was edited meanwhile; a
 * deleted card silently drops its result (the file stays cached engine-side
 * for free reuse by an identical text later).
 */
export function handleCardAudioResult(ev) {
  const { uid, field, ok } = ev || {};
  if (!uid || !field) {
    return;
  }

  const state = store.getState();
  const cancelled = !!(
    state.cardAudio.cancelled[uid] && state.cardAudio.cancelled[uid][field]
  );

  store.dispatch(audioJobSettled({ uid, field }));
  store.dispatch(consumeCancelled({ uid, field }));

  if (cancelled) {
    return; // user moved on; discard (python-side file cache remains)
  }

  const card = state.cards.value.find((c) => c.uid === uid);
  if (!card) {
    return; // card deleted mid-flight
  }

  if (!ok) {
    store.dispatch(
      audioJobFailed({
        uid,
        field,
        message: String(ev.error || "Synthesis failed").slice(0, 200),
      })
    );
    return;
  }

  store.dispatch(
    addAudioEntries([{ id: ev.id, url: ev.url, mediaType: "audio/wav" }])
  );
  store.dispatch(applyCardAudio({ uid, field, id: ev.id }));
}

// Cancel scopes: one field / one card / the whole queue.
export function cancelFieldAudio(uid, field) {
  pyCancelCardAudio({ keys: [audioJobKey(uid, field)] });
}

export function cancelCardAudio(uid) {
  const fields = Object.keys(store.getState().cardAudio.generating[uid] || {});
  if (fields.length === 0) {
    return;
  }
  pyCancelCardAudio({ keys: fields.map((f) => audioJobKey(uid, f)) });
}

export function cancelAllCardAudio() {
  pyCancelCardAudio({ all: true });
}

// VoiceSetupModal finished ok: replay whatever a missing engine parked.
export function retryQueuedAudioJobs() {
  const items = store.getState().cardAudio.pendingRetry;
  if (items.length === 0) {
    return;
  }
  requestAudioGeneration([...items]);
}
