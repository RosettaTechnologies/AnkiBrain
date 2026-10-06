import { asendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";
import { addImages } from "../../redux/slices/imagesRegistry";
import { store } from "../../redux";

/*
 * Re-hydrate imagesRegistry previews for ids referenced by restored cards.
 * The registry is memory-only, so after an Anki restart cards coming back
 * from tempCards point at ids the webview no longer knows urls for — while
 * the files themselves still live in media_tmp (GC'd after 7 days). Python
 * resolves each id to {id, url, mediaType} and drops ids that are gone;
 * ADD_CARDS skips missing files the same way, so nothing here is fatal.
 */
export async function pyResolveImages(ids) {
  const registry = store.getState().imagesRegistry.value;
  const missing = [...new Set((ids || []).filter((id) => id && !registry[id]))];
  if (missing.length === 0) {
    return;
  }

  try {
    const res = await asendPythonCommand(IC.RESOLVE_IMAGES, { ids: missing });
    if (res && res.images && res.images.length > 0) {
      store.dispatch(addImages(res.images));
    }
  } catch (err) {
    // Previews stay "image unavailable"; the card data itself is intact.
  }
}

export function collectCardImageIds(cards) {
  const ids = [];
  for (const card of cards || []) {
    for (const imageId of card.images || []) {
      ids.push(imageId);
    }
    // Occlusion cards reference their image through the singular `image` id.
    if (card.type === "occlusion" && card.image) {
      ids.push(card.image);
    }
  }
  return ids;
}
