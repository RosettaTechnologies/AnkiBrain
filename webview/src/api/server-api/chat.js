import { postChat } from "./networking/chat";
import { store } from "../redux";
import { infoToast } from "../toast";

export async function sendUserMessageToServer(
  query,
  prevMessages,
  useDocuments,
  accessToken
) {
  if (!store.getState().user.value) {
    infoToast("Log in required", "Please log in first.");
    return;
  }

  let model = store.getState().appSettings.ai.llmModel;
  let temperature = store.getState().appSettings.ai.temperature;
  return postChat(
    query,
    prevMessages,
    useDocuments,
    model,
    temperature,
    accessToken
  );
}
