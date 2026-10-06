import { vi } from "vitest";
import { store } from "./redux";
import { setCards } from "./redux/slices/cards";
import { pyGenerateOcclusionShapes } from "./PythonBridge/senders/pyGenerateOcclusionShapes";
import {
  createOcclusionCards,
  cancelOcclusionGeneration,
} from "./occlusionGeneration";

vi.mock("./PythonBridge/senders/pyGenerateOcclusionShapes", () => ({
  pyGenerateOcclusionShapes: vi.fn(),
}));

vi.mock("./toast", () => ({
  errorToast: vi.fn(),
  infoToast: vi.fn(),
  successToast: vi.fn(),
}));

// Let the queue's promise chain (and the mocked call) run to completion.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const SHAPES = [
  { ordinal: 1, shape: "rect", left: 0.1, top: 0.1, width: 0.2, height: 0.2 },
];

beforeEach(() => {
  pyGenerateOcclusionShapes.mockReset();
  store.dispatch(setCards([]));
});

test("auto-generation applies AI shapes to the card by uid", async () => {
  pyGenerateOcclusionShapes.mockResolvedValue({
    shapes: SHAPES,
    header: "Label the diagram",
    backExtra: "Extra",
  });

  const [card] = createOcclusionCards([{ id: "run/img.png" }]);
  expect(store.getState().occlusionGeneration.generating[card.uid]).toBe(true);
  expect(store.getState().cards.value).toHaveLength(1);

  await flush();

  const stored = store.getState().cards.value.find((c) => c.uid === card.uid);
  expect(stored.occlusions).toEqual(SHAPES);
  expect(stored.header).toBe("Label the diagram");
  expect(store.getState().occlusionGeneration.generating[card.uid]).toBeUndefined();
});

test("cancelling a card discards its late result", async () => {
  let resolveCall;
  pyGenerateOcclusionShapes.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveCall = resolve;
      })
  );

  const [card] = createOcclusionCards([{ id: "run/a.png" }]);
  await flush(); // the call is now in flight
  cancelOcclusionGeneration(card.uid);
  expect(store.getState().occlusionGeneration.generating[card.uid]).toBeUndefined();

  resolveCall({ shapes: SHAPES, header: "H", backExtra: "" });
  await flush();

  const stored = store.getState().cards.value.find((c) => c.uid === card.uid);
  expect(stored.occlusions).toEqual([]);
  expect(store.getState().occlusionGeneration.cancelled[card.uid]).toBeUndefined();
});

test("a vision-incapable model stops the batch and marks the rest failed", async () => {
  pyGenerateOcclusionShapes.mockRejectedValue(
    new Error(
      "The selected AI model cannot analyze images. Choose a GPT-5.6 model in Settings to use AI occlusion suggestions."
    )
  );

  const cards = createOcclusionCards([{ id: "run/a.png" }, { id: "run/b.png" }]);
  await flush();

  const state = store.getState().occlusionGeneration;
  expect(Object.keys(state.generating)).toHaveLength(0);
  expect(state.errors[cards[0].uid]).toMatch(/cannot analyze images/);
  expect(state.errors[cards[1].uid]).toMatch(/cannot analyze images/);
  // The second image is never sent to the model.
  expect(pyGenerateOcclusionShapes).toHaveBeenCalledTimes(1);
});
