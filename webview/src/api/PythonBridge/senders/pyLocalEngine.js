import { asendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";

/**
 * Local AI engine lifecycle senders. Status/install/uninstall/reset resolve
 * with the python ack only — real install progress arrives as
 * LOCAL_ENGINE_INSTALL_PROGRESS / LOCAL_ENGINE_INSTALL_DONE pushes.
 */

export function pyLocalEngineStatus() {
  return asendPythonCommand(IC.LOCAL_ENGINE_STATUS, {});
}

/**
 * Kick the pinned local-engine bootstrap. Resolves with the {started} ack
 * only — progress streams in via LOCAL_ENGINE_INSTALL_PROGRESS and the run
 * finishes with a LOCAL_ENGINE_INSTALL_DONE push.
 */
export function pyLocalEngineInstall() {
  return asendPythonCommand(IC.LOCAL_ENGINE_INSTALL, {});
}

/**
 * The setup modal's exit while an install is running (or after a failed
 * attempt): stop the bootstrap worker and delete whatever the attempt wrote.
 * Resolves with {cancelled, ok, error?} only once the worker has exited and
 * cleanup finished — await it before closing.
 */
export function pyLocalEngineCancelInstall() {
  return asendPythonCommand(IC.LOCAL_ENGINE_CANCEL_INSTALL, {});
}

/**
 * Remove the installed local engine runtime: python stops the engine
 * subprocess, then deletes the data tree on a worker thread. The promise
 * stays pending for the duration of the delete — await it, then
 * refreshLocalEngineStatus() so the UI branches on the new state.
 * Resolves with {ok, error?}.
 */
export function pyLocalEngineUninstall() {
  return asendPythonCommand(IC.LOCAL_ENGINE_UNINSTALL, {});
}

/**
 * Reset LOCAL-mode user data (vector store, imported document cache, temp
 * files, saved OpenAI key). The engine runtime itself is untouched.
 * Resolves with {ok, error?}.
 */
export function pyLocalEngineResetData() {
  return asendPythonCommand(IC.LOCAL_ENGINE_RESET_DATA, {});
}
