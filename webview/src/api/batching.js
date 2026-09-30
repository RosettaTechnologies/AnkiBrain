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
 */
export function batchChunksWithImages(chunks, images, maxChars) {
  const batches = []; // [{text, chunkStart, chunkEnd, imageIds: []}]
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
      currentBatch = { text: chunk, chunkStart: i, chunkEnd: null, imageIds: [] };
    } else {
      currentBatch.text += "\n\n" + chunk;
    }
  }
  closeBatch(chunks.length);

  const attach = (batch, imageId) => {
    if (batch && !batch.imageIds.includes(imageId)) {
      batch.imageIds.push(imageId);
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
    attach(batch, image.id);
  }

  return batches;
}
