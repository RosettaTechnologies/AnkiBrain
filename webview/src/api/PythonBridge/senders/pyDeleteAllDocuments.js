import { sendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";

export function pyDeleteAllDocuments() {
  sendPythonCommand(IC.DELETE_ALL_DOCUMENTS);
}