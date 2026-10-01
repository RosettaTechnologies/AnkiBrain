import { asendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";

export function pyTtsStatus() {
  return asendPythonCommand(IC.TTS_STATUS, {});
}
