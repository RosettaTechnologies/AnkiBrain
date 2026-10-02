import { asendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";

/**
 * Remove the installed voice engine: python stops the engine subprocess,
 * then deletes the data tree on a worker thread. The promise stays pending
 * for the duration of the delete — await it, then refreshTtsStatus() so the
 * UI branches on the new state. Resolves with {ok, error?}.
 */
export function pyTtsUninstall() {
  return asendPythonCommand(IC.TTS_UNINSTALL, {});
}
