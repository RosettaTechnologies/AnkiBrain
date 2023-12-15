import { sendPythonCommand } from "../index";
import { InterprocessCommand as IC } from "../InterprocessCommand";

export function pyAskAIConversation(query, useDocuments = false) {
  sendPythonCommand(
    useDocuments
      ? IC.ASK_CONVERSATION_DOCUMENTS
      : IC.ASK_CONVERSATION_NO_DOCUMENTS,
    { query }
  );
}
