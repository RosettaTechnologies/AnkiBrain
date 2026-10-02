import { asendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";

/**
 * Synthesize + resolve with {path, url, media_type, cached, duration_s, ...}.
 * Rejects with 'TTS_NOT_INSTALLED' when the engine has never been set up
 * (the caller maps it to the Voice Setup modal; nothing is queued for
 * replay — the user repeats the action after installing) or other stable
 * error sentinels.
 *
 * auto: null/undefined -> follow the ttsAutoDetect setting; false -> speak
 * with `voice` verbatim (used by the Settings voice preview); true -> let
 * the engine detect the text language and swap to a fitting voice.
 */
export function pySpeakText(text, voice = null, speed = null, auto = null) {
  return asendPythonCommand(IC.SYNTHESIZE_SPEECH, { text, voice, speed, auto });
}
