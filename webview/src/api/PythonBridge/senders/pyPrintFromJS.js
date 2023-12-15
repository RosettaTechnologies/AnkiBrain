import { sendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";

export function pyPrintFromJS(text) {
  sendPythonCommand(IC.PRINT_FROM_JS, { text });
}
