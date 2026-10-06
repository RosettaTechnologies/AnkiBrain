import { describe, expect, test } from "vitest";
import {
  buildGenerationInput,
  buildStagedDocument,
  countGeneratableImages,
} from "./documentStaging";

const doc = { file_name_with_extension: "lecture.pdf" };

describe("buildStagedDocument", () => {
  test("groups consecutive chunks by 1-based page and anchors images", () => {
    const staged = buildStagedDocument({
      chunks: ["a", "b", "c"],
      chunkPages: [1, 1, 2],
      images: [
        { id: "run1/x.png", url: "u1", mediaType: "image/png", anchorChunk: 2 },
      ],
      doc,
    });

    expect(staged.docName).toBe("lecture.pdf");
    expect(staged.runId).toBe("run1");
    expect(staged.entries.map((e) => [e.label, e.text])).toEqual([
      ["Page 1", "a\n\nb"],
      ["Page 2", "c"],
    ]);
    expect(staged.entries.every((e) => e.included)).toBe(true);
    expect(staged.images[0].anchorEntryId).toBe(staged.entries[1].id);
  });

  test("keeps the real page numbers when pages are non-contiguous", () => {
    const staged = buildStagedDocument({
      chunks: ["a", "b", "c"],
      chunkPages: [1, 1, 3],
      images: [],
      doc,
    });

    expect(staged.entries.map((e) => e.label)).toEqual(["Page 1", "Page 3"]);
    expect(staged.entries.map((e) => e.pageNumber)).toEqual([1, 3]);
  });

  test("falls back to one Section per chunk without page numbers", () => {
    const staged = buildStagedDocument({
      chunks: ["a", "b", "c"],
      chunkPages: null,
      images: [],
      doc,
    });

    expect(staged.entries.map((e) => e.label)).toEqual([
      "Section 1",
      "Section 2",
      "Section 3",
    ]);
    expect(staged.entries.map((e) => e.pageNumber)).toEqual([null, null, null]);
    expect(staged.entries.map((e) => e.text)).toEqual(["a", "b", "c"]);
  });

  test("anchors trailing images to the last entry and untethers null anchors", () => {
    const staged = buildStagedDocument({
      chunks: ["a", "b"],
      chunkPages: [1, 2],
      images: [
        { id: "run1/t.png", url: "u1", mediaType: "image/png", anchorChunk: 2 },
        { id: "run1/n.png", url: "u2", mediaType: "image/png", anchorChunk: null },
      ],
      doc,
    });

    expect(staged.images[0].anchorEntryId).toBe(staged.entries[1].id);
    expect(staged.images[1].anchorEntryId).toBeNull();
  });
});

describe("buildGenerationInput", () => {
  test("drops excluded entries and remaps image anchors densely", () => {
    const staged = buildStagedDocument({
      chunks: ["a", "b", "c"],
      chunkPages: [1, 1, 2],
      images: [
        { id: "run1/p1.png", url: "u1", mediaType: "image/png", anchorChunk: 0 },
        { id: "run1/p2.png", url: "u2", mediaType: "image/png", anchorChunk: 2 },
      ],
      doc,
    });
    staged.entries[0].included = false;

    const { chunks, images } = buildGenerationInput(staged);

    expect(chunks).toEqual(["c"]);
    expect(images).toEqual([
      { id: "run1/p2.png", url: "u2", mediaType: "image/png", anchorChunk: 0 },
    ]);
  });

  test("counts anchored-on-included-entry and loose images", () => {
    const staged = buildStagedDocument({
      chunks: ["a", "b"],
      chunkPages: [1, 2],
      images: [
        { id: "run1/one.png", url: "u1", mediaType: "image/png", anchorChunk: 0 },
      ],
      doc,
      looseImageIds: ["run1/loose.png", "missing.png"],
    });

    expect(countGeneratableImages(staged, { "run1/loose.png": {} })).toBe(2);

    staged.entries[0].included = false;
    expect(countGeneratableImages(staged, { "run1/loose.png": {} })).toBe(1);
  });
});
