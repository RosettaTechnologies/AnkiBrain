import { asendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";

/**
 * Synthesize + resolve with {path, url, media_type, cached, duration_s}.
 * Rejects with 'TTS_NOT_INSTALLED' when the engine has never been set up
 * (the caller decides whether to open the Voice Setup modal with the text
 * queued for replay) or other stable error sentinels.
 */
export function pySpeakText(text, voice = null, speed = null) {
  return asendPythonCommand(IC.SYNTHESIZE_SPEECH, { text, voice, speed });
}
