/*
 * Staged-document model for Make Cards > From Documents.
 *
 * The split step returns flat chunks plus, for PDFs, a 1-based page number per
 * chunk. This module turns that into reviewable "entries": one entry per PDF
 * page (consecutive chunks on the same page merged), or one entry per chunk
 * when the format has no pages. Entry ids embed their creation index, so
 * images can anchor to entries and generation can remap dense indices after
 * pages are excluded — without changing batching.js or the prompt format.
 */

function entryId(runIndex) {
  return "e" + runIndex;
}

/*
 * Build the staged model from a split result. Every entry starts included.
 *
 * chunks:      [string]              chunk texts
 * chunkPages:  [number|null] | null  1-based page per chunk (null = no pages)
 * images:      [{id,url,mediaType,anchorChunk}]  anchorChunk = chunk index
 * doc:         picker descriptor (for the file name)
 * looseImageIds: registry ids of standalone image files picked alongside the
 *                document; they are not anchored to any entry.
 */
export function buildStagedDocument({
  chunks,
  chunkPages,
  images,
  doc,
  looseImageIds = [],
}) {
  const chunkList = chunks || [];
  const pages = chunkPages || [];
  const pageOf = (i) => (pages[i] === undefined ? null : pages[i]);
  const hasPages = chunkList.some((_, i) => pageOf(i) !== null);

  const entries = [];
  // chunk index -> entry position, so images can be anchored to entries.
  const chunkToEntry = [];

  for (let i = 0; i < chunkList.length; i++) {
    const page = hasPages ? pageOf(i) : null;
    const last = entries[entries.length - 1];

    // Merge only chunks that share a real page number: consecutive page-less
    // chunks stay separate entries (one "Section" each).
    if (last && hasPages && page !== null && last.pageNumber === page) {
      last.text += "\n\n" + chunkList[i];
      chunkToEntry[i] = last.index;
      continue;
    }

    const index = entries.length;
    entries.push({
      id: entryId(index),
      index,
      label: page !== null ? "Page " + page : "Section " + (index + 1),
      pageNumber: page,
      text: chunkList[i],
      included: true,
    });
    chunkToEntry[i] = index;
  }

  const lastEntryId = entries.length > 0 ? entries[entries.length - 1].id : null;

  const annotatedImages = (images || []).map((image) => {
    let anchorEntryId = null;
    const anchor = image.anchorChunk;
    if (typeof anchor === "number" && Number.isFinite(anchor)) {
      if (anchor >= chunkList.length) {
        // Trailing image: the last entry (mirrors batching.js).
        anchorEntryId = lastEntryId;
      } else {
        const position = chunkToEntry[Math.max(0, Math.floor(anchor))];
        anchorEntryId =
          position === undefined ? null : entries[position].id;
      }
    }
    return { ...image, anchorEntryId };
  });

  const firstImageId = annotatedImages[0] && annotatedImages[0].id;
  const runId =
    typeof firstImageId === "string" && firstImageId.includes("/")
      ? firstImageId.split("/")[0]
      : "";

  return {
    docName: (doc && (doc.file_name_with_extension || doc.file_name)) || "",
    runId,
    looseImageIds,
    entries,
    images: annotatedImages,
  };
}

/*
 * Dense input for the existing generation pipeline: texts of the included
 * entries in order, plus the staged images whose entry is included, remapped
 * to dense chunk indices. Images with no entry (loose registry images) are
 * excluded here — the caller handles those separately. The result feeds
 * batchChunksWithImages unchanged, so [Chunk N] labels, chunkStart/chunkEnd,
 * and assignImagesToCard keep working.
 */
export function buildGenerationInput(staged) {
  const entries = (staged && staged.entries) || [];
  const included = entries.filter((entry) => entry.included);
  const denseIndex = new Map(included.map((entry, i) => [entry.id, i]));

  const chunks = included.map((entry) => entry.text);
  const images = ((staged && staged.images) || [])
    .filter(
      (image) => image.anchorEntryId && denseIndex.has(image.anchorEntryId)
    )
    .map((image) => ({
      id: image.id,
      url: image.url,
      mediaType: image.mediaType,
      anchorChunk: denseIndex.get(image.anchorEntryId),
    }));

  return { chunks, images };
}

/*
 * How many images generation would use, across document images anchored to
 * included entries and loose registry images. Used to keep Make Cards
 * enabled for the Image Occlusion type on image-only documents.
 */
export function countGeneratableImages(staged, imagesById = {}) {
  const anchored = ((staged && staged.images) || []).filter((image) => {
    if (!image.anchorEntryId) {
      return false;
    }
    const entry = ((staged && staged.entries) || []).find(
      (e) => e.id === image.anchorEntryId
    );
    return !!entry && entry.included;
  }).length;

  const loose = ((staged && staged.looseImageIds) || []).filter(
    (id) => imagesById[id]
  ).length;

  return anchored + loose;
}
