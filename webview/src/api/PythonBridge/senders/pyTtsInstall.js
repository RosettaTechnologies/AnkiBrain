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

/**
 * The setup modal's only exit while an install is running (or after a
 * failed attempt): stop the bootstrap worker and delete everything the
 * attempt wrote (partial download caches, uv/CPython, venv, model weights,
 * state.json). The promise resolves with {ok} / {ok:false, error} only once
 * the worker has exited and cleanup finished — await it before closing.
 */
export function pyTtsCancelInstall() {
  return asendPythonCommand(IC.TTS_CANCEL_INSTALL, {});
}
