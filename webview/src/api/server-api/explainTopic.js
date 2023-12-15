import { postChat } from "./networking/chat";
import { store } from "../redux";
import { infoToast } from "../toast";

export async function explainTopic(
  topic,
  options = {
    customPrompt: "",
    levelOfDetail: "EXTREME",
    levelOfExpertise: "EXPERT",
    useDocuments: false,
    language: store.getState().language.value,
  }
) {
  let language = options.language;

  if (!store.getState().user.value) {
    infoToast("Log in required", "Please log in first.");
    return;
  }

  let { customPrompt, levelOfDetail, levelOfExpertise, useDocuments } = options;
  let query = `
    Explain X using the following parameters:
    X = ${topic}
    LEVEL OF DETAIL = ${levelOfDetail}
    LEVEL OF EXPERTISE = ${levelOfExpertise}
    LANGUAGE = ${language}
    
    ${
      language !== "English"
        ? "When finished, make sure your response is in " + language + " only."
        : ""
    }
    
    ${customPrompt}
  `;

  let model = store.getState().appSettings.ai.llmModel;
  let temperature = store.getState().appSettings.ai.temperature;

  return postChat(
    query,
    [],
    useDocuments,
    model,
    temperature,
    store.getState().user.value.accessToken
  );
}
