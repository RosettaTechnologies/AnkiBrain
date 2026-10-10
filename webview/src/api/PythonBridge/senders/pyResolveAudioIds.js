import { asendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";
import { store } from "../../redux";
import { addAudioEntries } from "../../redux/slices/audioRegistry";
import { pruneCardAudio } from "../../redux/slices/cards";

/*
 * Re-hydrate audioRegistry play urls for ids carried by cards restored from
 * tempCards (mirrors pyResolveImages). Ids whose files were purged from
 * media_tmp are pruned off the cards, so those fields read as "no audio"
 * again and can simply be regenerated — nothing here is ever fatal.
 */
export async function pyResolveAudioIds(ids) {
  const registry = store.getState().audioRegistry.value;
  const missing = [...new Set((ids || []).filter((id) => id && !registry[id]))];
  if (missing.length === 0) {
    return;
  }

  try {
    const res = await asendPythonCommand(IC.RESOLVE_AUDIO_IDS, { ids: missing });
    const entries = (res && res.entries) || [];
    if (entries.length > 0) {
      store.dispatch(addAudioEntries(entries));
    }

    const alive = new Set(entries.map((e) => e.id));
    const gone = missing.filter((id) => !alive.has(id));
    if (gone.length > 0) {
      store.dispatch(pruneCardAudio(gone));
    }
  } catch (err) {
    // Play previews stay unavailable; the card data itself is intact.
  }
}

export function collectCardAudioIds(cards) {
  const ids = [];
  for (const card of cards || []) {
    const audio = card.audio || {};
    for (const field of ["front", "back"]) {
      if (audio[field]) {
        ids.push(audio[field]);
      }
    }
  }
  return ids;
}
