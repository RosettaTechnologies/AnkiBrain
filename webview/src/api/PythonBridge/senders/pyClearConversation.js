import { asendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";

export async function pyClearConversation() {
  await asendPythonCommand(IC.CLEAR_CONVERSATION);
}
