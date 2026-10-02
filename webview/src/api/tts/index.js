import { store } from "../redux";
import { setSetupModalOpen, setTtsStatus } from "../redux/slices/tts";
import { pySpeakText } from "../PythonBridge/senders/pySpeakText";
import { pyTtsStatus } from "../PythonBridge/senders/pyTtsStatus";
import { playTtsUrl } from "./player";
import { errorToast, infoToast } from "../toast";

/**
 * AnkiBrain Voice facade: every speak/status call funnels through here so
 * the 'engine absent -> one-click setup' first-use flow has exactly one
 * implementation (Talk buttons, chat speakers, card audio all share it).
 *
 * When the engine is missing the setup dialog opens and the action STOPS
 * there — nothing is queued for replay, and after a successful install the
 * user simply repeats the click. This keeps one rule everywhere: a voice
 * action is exactly what the user asked for, never retried behind their
 * back.
 */

export async function refreshTtsStatus() {
  try {
    const status = await pyTtsStatus();
    store.dispatch(setTtsStatus(status));
    return status;
  } catch (e) {
    return null;
  }
}

export async function speak(text) {
  if (!text) return null;
  try {
    const out = await pySpeakText(text);
    if (out && out.url) playTtsUrl(out.url, text.slice(0, 60));
    return out;
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (msg.includes("TTS_NOT_INSTALLED") || msg.includes("TTS_PACK_MISSING")) {
      // Engine absent: open the setup dialog only. The user presses the
      // speak/generate button again after installing.
      store.dispatch(setSetupModalOpen(true));
      return null;
    }
    if (msg.startsWith("TTS_UNSUPPORTED:")) {
      infoToast("Voice", msg.slice("TTS_UNSUPPORTED:".length).slice(0, 300));
      return null;
    }
    errorToast("Voice Error", msg.slice(0, 300));
    return null;
  }
}

export function openSetupModal() {
  store.dispatch(setSetupModalOpen(true));
  // The modal branches on engine status (install vs repair), so refetch it
  // rather than trusting the Redux cache — e.g. the engine may have been
  // uninstalled outside the Settings screen since the last refresh.
  refreshTtsStatus();
}

export function closeSetupModal() {
  store.dispatch(setSetupModalOpen(false));
}
