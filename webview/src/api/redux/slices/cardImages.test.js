import { store } from "..";
import {
  setDocumentContext,
  clearDocumentContext,
} from "./documentContext";
import { addImages, clearImages } from "./imagesRegistry";
import { setCards } from "./cards";

test("documentContext merges updates and clears", () => {
  store.dispatch(
    setDocumentContext({
      docName: "lecture.pdf",
      runId: "abc12345",
      chunksCount: 12,
      imagesCount: 5,
    })
  );
  expect(store.getState().documentContext.value.docName).toBe("lecture.pdf");

  // Partial updates (e.g. a run with no images) keep other fields.
  store.dispatch(setDocumentContext({ chunksCount: 13 }));
  const ctx = store.getState().documentContext.value;
  expect(ctx.chunksCount).toBe(13);
  expect(ctx.docName).toBe("lecture.pdf");

  store.dispatch(clearDocumentContext());
  expect(store.getState().documentContext.value.docName).toBe("");
});

test("imagesRegistry keys images by id and resolves ids back to entries", () => {
  store.dispatch(
    addImages([
      {
        id: "abc12345/ankibrain-deadbeef.png",
        url: "file:///media_tmp/abc12345/ankibrain-deadbeef.png",
        mediaType: "image/png",
        anchorChunk: 2,
      },
    ])
  );

  const registry = store.getState().imagesRegistry.value;
  expect(Object.keys(registry).length).toBe(1);
  expect(
    registry["abc12345/ankibrain-deadbeef.png"].url
  ).toContain("ankibrain-deadbeef");

  // Re-registering the same id (e.g. RESOLVE_IMAGES hydration) overwrites
  // rather than duplicating.
  store.dispatch(
    addImages([
      {
        id: "abc12345/ankibrain-deadbeef.png",
        url: "file:///resolved-again.png",
      },
    ])
  );
  expect(Object.keys(store.getState().imagesRegistry.value).length).toBe(1);
  expect(
    store.getState().imagesRegistry.value["abc12345/ankibrain-deadbeef.png"]
      .url
  ).toBe("file:///resolved-again.png");

  store.dispatch(clearImages());
  expect(Object.keys(store.getState().imagesRegistry.value).length).toBe(0);
});

test("restored cards keep their image ids through setCards", () => {
  // Mirrors the boot path: tempCards with image ids come back from settings
  // and must survive into the store so RESOLVE_IMAGES can hydrate previews.
  store.dispatch(
    setCards([
      {
        type: "basic",
        front: "Q",
        back: "A",
        images: ["abc12345/ankibrain-deadbeef.png"],
      },
    ])
  );

  const cards = store.getState().cards.value;
  expect(cards[0].images).toEqual(["abc12345/ankibrain-deadbeef.png"]);
  expect(cards[0].tags).toEqual([]);
});
