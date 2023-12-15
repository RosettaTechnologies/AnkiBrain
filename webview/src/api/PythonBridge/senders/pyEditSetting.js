import { asendPythonCommand } from "../index";
import { InterprocessCommand } from "../InterprocessCommand";

export function pyEditSetting(key, value) {
  return asendPythonCommand(InterprocessCommand.EDIT_SETTING, {
    key,
    value,
  });
}
