import { store } from "./redux";
import { setCards } from "./redux/slices/cards";
import { clearImages } from "./redux/slices/imagesRegistry";
import { clearAudio } from "./redux/slices/audioRegistry";
import { addPerfCards } from "./devPerfCards";

beforeEach(() => {
  store.dispatch(setCards([]));
  store.dispatch(clearImages());
  store.dispatch(clearAudio());
});

test("addPerfCards appends a dense basic/cloze/occlusion mix", () => {
  expect(addPerfCards(120)).toBe(120);

  const cards = store.getState().cards.value;
  expect(cards).toHaveLength(120);
  expect(new Set(cards.map((c) => c.uid)).size).toBe(120);

  const types = new Set(cards.map((c) => c.type));
  expect(types.has("basic")).toBe(true);
  expect(types.has("cloze")).toBe(true);
  expect(types.has("occlusion")).toBe(true);

  for (const card of cards) {
    if (card.type === "basic") {
      expect(card.front.length).toBeGreaterThan(300);
      expect(card.back.length).toBeGreaterThan(500);
    }
    if (card.type === "cloze") {
      expect(card.text).toContain("{{c1::");
    }
  }
});

test("every card carries audio for the fields auto-enqueue would want", () => {
  addPerfCards(120);

  for (const card of store.getState().cards.value) {
    if (card.type === "basic") {
      expect(card.audio.front).toBeTruthy();
      expect(card.audio.back).toBeTruthy();
    } else if (card.type === "cloze") {
      expect(card.audio.back).toBeTruthy();
      expect(card.audio.front).toBeUndefined();
    }
  }
});

test("occlusion cards have two distinct-id masks with ordinals 1 and 2", () => {
  addPerfCards(120);

  const occlusions = store
    .getState()
    .cards.value.filter((c) => c.type === "occlusion");
  expect(occlusions.length).toBeGreaterThan(0);

  for (const card of occlusions) {
    expect(card.occlusions).toHaveLength(2);
    expect(new Set(card.occlusions.map((s) => s.id)).size).toBe(2);
    expect(card.occlusions.map((s) => s.ordinal)).toEqual([1, 2]);
  }
});

test("registries cover every media id the cards reference", () => {
  addPerfCards(120);

  const cards = store.getState().cards.value;
  const images = store.getState().imagesRegistry.value;
  const audio = store.getState().audioRegistry.value;

  for (const card of cards) {
    for (const id of card.images || []) {
      expect(images[id]).toBeTruthy();
    }
    if (card.type === "occlusion") {
      expect(images[card.image]).toBeTruthy();
    }
    for (const field of ["front", "back"]) {
      const id = (card.audio || {})[field];
      if (id) {
        expect(audio[id]).toBeTruthy();
      }
    }
  }
});

test("zero and invalid counts are no-ops", () => {
  expect(addPerfCards(0)).toBe(0);
  expect(addPerfCards("nonsense")).toBe(0);
  expect(store.getState().cards.value).toHaveLength(0);
});
