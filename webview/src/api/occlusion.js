import { store, updateUser } from "./redux";
import { addImages } from "./redux/slices/imagesRegistry";
import { pyImportImages } from "./PythonBridge/senders/pyImportImages";
import { pyGenerateOcclusionShapes } from "./PythonBridge/senders/pyGenerateOcclusionShapes";
import { errorToast, infoToast, successToast } from "./toast";

/*
 * Image-occlusion orchestration.
 *
 * A pending occlusion card is one native Anki Image Occlusion note:
 *   { type: "occlusion", image: <media_tmp id>, occlusions: [...], header,
 *     backExtra, occludeInactive, tags }
 * Each occlusion is {ordinal, shape: "rect"|"ellipse", left, top, ...} with
 * coordinates as fractions (0..1) of the image; shapes sharing an ordinal
 * land on the same Anki card. cards.py turns this into Anki's cloze-style
 * occlusion field and calls the native add_image_occlusion_note API.
 */

// How many Anki cards one occlusion card produces (distinct ordinals).
export function occlusionCardCount(card) {
  const ordinals = new Set();
  for (const occlusion of card.occlusions || []) {
    const ordinal = parseInt(occlusion.ordinal, 10);
    ordinals.add(Number.isFinite(ordinal) && ordinal > 0 ? ordinal : 1);
  }
  return ordinals.size;
}

// Notes vs. Anki cards across the pending list; they differ only for
// occlusion cards (one note can carry N cards).
export function countAnkiCards(cards) {
  let notes = 0;
  let ankiCards = 0;
  for (const card of cards || []) {
    notes += 1;
    ankiCards +=
      card.type === "occlusion" ? Math.max(occlusionCardCount(card), 1) : 1;
  }
  return { notes, cards: ankiCards };
}

function applyImportedImages(res, emptyMessage) {
  const images = (res && res.images) || [];
  if (images.length === 0) {
    infoToast("No Images Imported", emptyMessage);
    return [];
  }
  store.dispatch(addImages(images));
  successToast(
    "Images Imported",
    `${images.length} image${images.length === 1 ? "" : "s"} added to the Images panel.`
  );
  return images;
}

export async function importImagesFromFiles() {
  try {
    const res = await pyImportImages("files");
    return applyImportedImages(res, "No image files were selected.");
  } catch (err) {
    errorToast("Import Failed", String((err && err.message) || err));
    return [];
  }
}

export async function importImageFromClipboard() {
  try {
    const res = await pyImportImages("clipboard");
    return applyImportedImages(
      res,
      "The clipboard does not contain an image. Copy an image first, then try again."
    );
  } catch (err) {
    errorToast("Import Failed", String((err && err.message) || err));
    return [];
  }
}

/*
 * AI occlusion suggestions for one image. Always lands in the editor for
 * review — vision coordinates are approximate and must never go straight
 * into the deck.
 */
export async function suggestOcclusions(imageId) {
  const language = store.getState().language.value;
  const res = await pyGenerateOcclusionShapes({ imageId, language });

  if (res && res.user) {
    store.dispatch(updateUser(res.user));
  }

  return {
    shapes: (res && res.shapes) || [],
    header: (res && res.header) || "",
    backExtra: (res && res.backExtra) || "",
  };
}
