import { asendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";

/**
 * Persist 'LOCAL' | 'SERVER' and restart AnkiBrain's async members in-process,
 * so the new mode's startup runs without an Anki restart.
 * Resolves with {ok, mode?} or {ok: false, error}.
 */
export function pySetUserMode(mode) {
  return asendPythonCommand(IC.SET_USER_MODE, { mode });
}
