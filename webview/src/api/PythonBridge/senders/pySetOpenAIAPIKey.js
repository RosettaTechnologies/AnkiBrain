import { sendPythonCommand } from "../index";
import { InterprocessCommand } from "../InterprocessCommand";

export function pySetOpenAIAPIKey(key) {
  sendPythonCommand(InterprocessCommand.SET_OPENAI_API_KEY, { key });
}
