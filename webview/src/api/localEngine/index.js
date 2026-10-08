import { store } from "../redux";
import {
  setLocalEngineStatus,
  setSetupModalMode,
  setSetupModalOpen,
} from "../redux/slices/localEngine";
import { pyLocalEngineStatus } from "../PythonBridge/senders/pyLocalEngine";

/**
 * AnkiBrain Local Engine facade: every status/install/uninstall call funnels
 * through here so the 'engine absent -> one-click setup' first-use flow and
 * the Settings recovery UI share exactly one implementation.
 *
 * Modes: "default" (install/repair), "uninstall" (confirm screen) and
 * "reset" (documents & data confirm screen).
 */

export async function refreshLocalEngineStatus() {
  try {
    const status = await pyLocalEngineStatus();
    store.dispatch(setLocalEngineStatus(status));
    return status;
  } catch (e) {
    return null;
  }
}

export function openLocalEngineModal(mode = "default") {
  store.dispatch(setSetupModalMode(mode));
  store.dispatch(setSetupModalOpen(true));
  // The modal branches on engine status (install vs repair vs uninstall), so
  // refetch it rather than trusting the Redux cache — e.g. the engine may
  // have been uninstalled outside the Settings screen since the last refresh.
  refreshLocalEngineStatus();
}

export function closeLocalEngineModal() {
  store.dispatch(setSetupModalOpen(false));
}

/**
 * LOCAL-mode install gate: true when the webview must replace the app shell
 * with the full-screen engine setup gate. Only an installed-and-in-sync
 * engine admits the app; absent, needs-sync and unsupported all gate (the gate
 * explains the unsupported verdict and points at Anki's Switch User Mode…
 * menu). A null status means python never reported a problem — do not gate, so
 * a failed status round trip degrades to the app instead of trapping on a
 * state nothing can leave. STANDALONE dev is exempt so the UI still previews.
 */
export function needsLocalEngineGate(userMode, appDidBoot, status) {
  if (import.meta.env.VITE_APP_ENV === "STANDALONE") return false;
  if (userMode !== "LOCAL" || !appDidBoot || !status) return false;
  return status.status !== "supported-and-installed";
}
