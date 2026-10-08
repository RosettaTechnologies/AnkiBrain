import { asendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";

/**
 * Restart the ChatAI / voice subprocesses. The panel's global loading overlay
 * covers the restart (python pushes SET_WEBAPP_LOADING, cleared by
 * DID_FINISH_STARTUP). Resolves with the {ok} ack only.
 */
export function pyRestartAnki() {
  return asendPythonCommand(IC.RESTART_ANKI, {});
}
