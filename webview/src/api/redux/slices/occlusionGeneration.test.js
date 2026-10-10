import { store } from "..";
import { setCards, applyCardOcclusions } from "./cards";
import {
  occlusionJobStarted,
  occlusionJobSettled,
  occlusionJobFailed,
  occlusionJobsCancelled,
  consumeOcclusionCancelled,
  occlusionJobsCleared,
  countOcclusionGenerating,
} from "./occlusionGeneration";

const OCCLUSION_CARD = {
  type: "occlusion",
  image: "abc12345/ankibrain-deadbeef.png",
  occlusions: [],
  occludeInactive: false,
  header: "",
  backExtra: "",
  tags: [],
};

test("mask results land by uid, surviving index shifts and deletes", () => {
  store.dispatch(setCards([{ ...OCCLUSION_CARD }, { ...OCCLUSION_CARD, image: "b/img.png" }]));
  const [uidA, uidB] = store.getState().cards.value.map((c) => c.uid);

  store.dispatch(
    applyCardOcclusions({
      uid: uidB,
      occlusions: [{ ordinal: 1, shape: "rect", left: 0.1, top: 0.1, width: 0.2, height: 0.2 }],
      header: "Label the diagram",
      backExtra: "b",
    })
  );

  // A's card is deleted before A's result arrives — the result is dropped.
  store.dispatch(
    setCards(store.getState().cards.value.filter((c) => c.uid !== uidA))
  );
  store.dispatch(
    applyCardOcclusions({ uid: uidA, occlusions: [{ ordinal: 1, shape: "rect" }] })
  );

  const cards = store.getState().cards.value;
  expect(cards.length).toBe(1);
  expect(cards[0].uid).toBe(uidB);
  expect(cards[0].occlusions).toHaveLength(1);
  expect(cards[0].header).toBe("Label the diagram");
});

test("applyCardOcclusions keeps an existing header when the AI returns none", () => {
  store.dispatch(setCards([{ ...OCCLUSION_CARD, header: "Existing", backExtra: "Notes" }]));
  const uid = store.getState().cards.value[0].uid;

  store.dispatch(
    applyCardOcclusions({ uid, occlusions: [{ ordinal: 1, shape: "rect" }], header: "", backExtra: "" })
  );

  const card = store.getState().cards.value[0];
  expect(card.header).toBe("Existing");
  expect(card.backExtra).toBe("Notes");
  expect(card.occlusions).toHaveLength(1);
});

test("generating marks gate, settle, and cancel", () => {
  store.dispatch(occlusionJobStarted(["u1", "u2", "u3"]));
  expect(countOcclusionGenerating(store.getState().occlusionGeneration.generating)).toBe(3);

  store.dispatch(occlusionJobSettled({ uid: "u1" }));
  expect(countOcclusionGenerating(store.getState().occlusionGeneration.generating)).toBe(2);

  // Failed results settle the spinner and keep a separate error map.
  store.dispatch(occlusionJobSettled({ uid: "u2" }));
  store.dispatch(occlusionJobFailed({ uid: "u2", message: "boom" }));
  expect(store.getState().occlusionGeneration.errors.u2).toBe("boom");
  expect(countOcclusionGenerating(store.getState().occlusionGeneration.generating)).toBe(1);

  // Per-card cancel marks the uid and drops only ITS spinner — other jobs
  // keep going and their results still apply.
  store.dispatch(occlusionJobsCancelled({ uids: ["u3"] }));
  expect(store.getState().occlusionGeneration.cancelled).toEqual({ u3: true });
  expect(countOcclusionGenerating(store.getState().occlusionGeneration.generating)).toBe(0);
  store.dispatch(consumeOcclusionCancelled({ uid: "u3" }));
  expect(store.getState().occlusionGeneration.cancelled).toEqual({});

  // all=true cancel empties everything (spinners included).
  store.dispatch(occlusionJobStarted(["u1", "u2"]));
  store.dispatch(occlusionJobsCancelled({ all: true }));
  expect(countOcclusionGenerating(store.getState().occlusionGeneration.generating)).toBe(0);

  // Bridge-error recovery path: spinners up, then cleared wholesale.
  store.dispatch(occlusionJobStarted(["u1"]));
  store.dispatch(occlusionJobsCleared());
  expect(countOcclusionGenerating(store.getState().occlusionGeneration.generating)).toBe(0);
});

test("re-enrolling a card clears its stale cancel/error marks", () => {
  store.dispatch(occlusionJobsCancelled({ uids: ["u4"] }));
  store.dispatch(occlusionJobFailed({ uid: "u4", message: "old" }));

  store.dispatch(occlusionJobStarted(["u4"]));

  const state = store.getState().occlusionGeneration;
  expect(state.generating.u4).toBe(true);
  expect(state.cancelled.u4).toBeUndefined();
  expect(state.errors.u4).toBeUndefined();
});
