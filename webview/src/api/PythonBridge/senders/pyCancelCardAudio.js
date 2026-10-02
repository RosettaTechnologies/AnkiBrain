import { asendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";
import { store } from "../../redux";
import { audioJobsCancelled } from "../../redux/slices/cardAudio";

/*
 * Cancel in-flight card-audio jobs. action.payload-style keys: ["uid:field"]
 * for individual fields, or all=true for the whole queue (the Stop button,
 * card deletes, clear-cards). Webview-side marks drop immediately — a
 * cancelled job must stop gating Add-to-Anki even while python is still
 * finishing the current clip — and the cancel keys ensure any late result
 * gets discarded.
 */
export async function pyCancelCardAudio({ keys = [], all = false }) {
  if (keys.length === 0 && !all) {
    return;
  }

  store.dispatch(audioJobsCancelled({ keys, all }));

  try {
    await asendPythonCommand(IC.CANCEL_CARD_AUDIO, { keys, all });
  } catch (err) {
    // Python-side queue state is best-effort: worst case a parked clip still
    // synthesizes and its result is discarded. Nothing to surface to the user.
    console.warn("cancel_card_audio ack failed", err);
  }
}
