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
