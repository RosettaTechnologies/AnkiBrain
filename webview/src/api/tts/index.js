import { store } from "../redux";
import {
  clearPendingText,
  setSetupModalOpen,
  setTtsStatus,
} from "../redux/slices/tts";
import { pySpeakText } from "../PythonBridge/senders/pySpeakText";
import { pyTtsStatus } from "../PythonBridge/senders/pyTtsStatus";
import { playTtsUrl } from "./player";
import { errorToast, infoToast } from "../toast";

/**
 * AnkiBrain Voice facade: every speak/status call funnels through here so
 * the 'engine absent -> one-click setup -> auto-retry' first-use flow has
 * exactly one implementation (Talk buttons, chat speakers, card audio all
 * share it).
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

export async function speak(text, { silentMissing = false } = {}) {
  if (!text) return null;
  try {
    const out = await pySpeakText(text);
    if (out && out.url) playTtsUrl(out.url, text.slice(0, 60));
    return out;
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (msg.includes("TTS_NOT_INSTALLED") || msg.includes("TTS_PACK_MISSING")) {
      if (!silentMissing) {
        // Open the setup modal, queueing this text for instant replay on a
        // successful install.
        store.dispatch(setSetupModalOpen({ open: true, pendingText: text }));
      }
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

/** After TTS_INSTALL_DONE ok: refresh + speak whatever text opened the modal. */
export async function completeInstallFlow() {
  await refreshTtsStatus();
  const pending = store.getState().tts.pendingText;
  store.dispatch(clearPendingText());
  if (pending) {
    await speak(pending);
  }
}

export function openSetupModal(pendingText = null) {
  store.dispatch(setSetupModalOpen({ open: true, pendingText }));
}

export function closeSetupModal() {
  store.dispatch(setSetupModalOpen({ open: false, pendingText: null }));
}
