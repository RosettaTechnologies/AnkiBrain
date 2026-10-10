export const CARD_GEN_CHUNK_SIZE_LARGE = 6000;
export const CARD_GEN_CHUNK_SIZE_LEGACY = 3000;

export function getCardGenChunkSize(model) {
  if (/gpt-5\.6/i.test(model || "")) {
    return CARD_GEN_CHUNK_SIZE_LARGE;
  }

  return CARD_GEN_CHUNK_SIZE_LEGACY;
}

export function batchChunks(chunks, maxChars) {
  const batches = [];
  let currentBatch = "";

  for (let chunk of chunks) {
    if (currentBatch && currentBatch.length + chunk.length > maxChars) {
      batches.push(currentBatch);
      currentBatch = "";
    }

    if (!currentBatch) {
      currentBatch = chunk;
    } else {
      currentBatch += "\n\n" + chunk;
    }
  }

  if (currentBatch) {
    batches.push(currentBatch);
  }

  return batches;
}

/*
 * Positional image attachment.
 *
 * The server / ChatAI subprocess reports each extracted image's anchorChunk:
 * the index of the chunk the image sits next to in the document. We batch
 * chunks as before, but remember which chunk indices fall into each batch,
 * then map images into their batch by anchor. Images anchored past the last
 * chunk (trailing images) attach to the final batch.
 *
 * Within a batch, cards are generated from a "[Chunk N]" labeled copy of the
 * text (promptText); the model is asked to cite the chunk each card came
 * from, so images attach per-card instead of to every card in the batch.
 * See assignImagesToCard for the resolution rules.
 */
export const MAX_IMAGES_PER_BATCH = 4;
export const MAX_IMAGES_PER_CARD = 4;
export const CHUNK_ANCHOR_FALLBACK_DISTANCE = 1;

export function batchChunksWithImages(chunks, images, maxChars) {
  const batches = []; // [{text, promptText, chunkStart, chunkEnd, imageIds, images}]
  let currentBatch = null;

  const closeBatch = (endIndex) => {
    if (currentBatch) {
      currentBatch.chunkEnd = endIndex;
      batches.push(currentBatch);
    }
    currentBatch = null;
  };

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (currentBatch && currentBatch.text.length + chunk.length > maxChars) {
      closeBatch(i);
    }

    if (!currentBatch) {
      currentBatch = {
        text: chunk,
        promptText: `[Chunk ${i}]\n${chunk}`,
        chunkStart: i,
        chunkEnd: null,
        imageIds: [],
        images: [],
      };
    } else {
      currentBatch.text += "\n\n" + chunk;
      currentBatch.promptText += `\n\n[Chunk ${i}]\n${chunk}`;
    }
  }
  closeBatch(chunks.length);

  const attach = (batch, imageId, anchorChunk) => {
    if (!batch) return;
    if (batch.images.length >= MAX_IMAGES_PER_BATCH) {
      // Keep batches from becoming image dumps; earliest-positioned images
      // win. The rest are still shown as "not attached" if ever wired up.
      return;
    }
    if (!batch.imageIds.includes(imageId)) {
      batch.imageIds.push(imageId);
      batch.images.push({ id: imageId, anchorChunk });
    }
  };

  for (let image of images || []) {
    let anchor = image.anchorChunk;
    if (anchor === undefined || anchor === null) continue;
    if (anchor >= chunks.length) {
      // Trailing image: attach to the final batch.
      anchor = chunks.length - 1;
    }
    const batch = batches.find(
      (b) => anchor >= b.chunkStart && anchor < b.chunkEnd
    );
    attach(batch, image.id, anchor);
  }

  return batches;
}

const CHUNK_LABEL_REGEX = /\[Chunk \d+\]/;

export function isChunkLabeledText(text) {
  return CHUNK_LABEL_REGEX.test(text || "");
}

/*
 * Resolve which images a generated card should carry, given the batch it
 * came from. `assignment` is { images: [{id, anchorChunk}], chunkStart,
 * chunkEnd }. Rules:
 *   - card cites an integer chunk inside the batch -> images anchored there
 *   - cited chunk has no images -> nearest anchored chunk within
 *     CHUNK_ANCHOR_FALLBACK_DISTANCE (keeps the figure with adjacent text)
 *   - citation missing/garbage/out of range -> legacy batch-level attach
 *   - result capped at MAX_IMAGES_PER_CARD; a card that already has images
 *     (e.g. hand-edited) is left alone.
 * The temporary `chunk` field is left for the caller to strip.
 */
export function assignImagesToCard(card, assignment) {
  if (!assignment || !assignment.images || assignment.images.length === 0) {
    return;
  }
  const { images, chunkStart, chunkEnd } = assignment;
  const cited = card.chunk;
  let ids = null;

  if (Number.isInteger(cited) && cited >= chunkStart && cited < chunkEnd) {
    ids = images
      .filter((im) => im.anchorChunk === cited)
      .map((im) => im.id);
    if (ids.length === 0) {
      let best = Infinity;
      ids = [];
      for (const im of images) {
        const d = Math.abs(im.anchorChunk - cited);
        if (d > CHUNK_ANCHOR_FALLBACK_DISTANCE) continue;
        if (d < best) {
          best = d;
          ids = [im.id];
        } else if (d === best) {
          ids.push(im.id);
        }
      }
    }
  }

  if (ids === null) {
    // Model omitted or miscited "chunk": fall back to today's behavior.
    ids = images.map((im) => im.id);
  }

  if (ids.length > MAX_IMAGES_PER_CARD) {
    ids = ids.slice(0, MAX_IMAGES_PER_CARD);
  }
  if (ids.length > 0 && !card.images) {
    card.images = ids;
  }
}
