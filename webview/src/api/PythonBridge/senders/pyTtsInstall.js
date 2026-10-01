import { asendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";

/**
 * Kick the pinned Kokoro bootstrap. Resolves with the {started} ack only —
 * real progress arrives as TTS_INSTALL_PROGRESS / TTS_INSTALL_DONE pushes.
 * groups: ['core'] or ['core','ja'] (repair keeps installed groups).
 */
export function pyTtsInstall(groups = ["core"]) {
  return asendPythonCommand(IC.TTS_INSTALL, { groups });
}

export function pyTtsCancelInstall() {
  return asendPythonCommand(IC.TTS_CANCEL_INSTALL, {});
}
