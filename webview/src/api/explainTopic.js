import { pyExplainTopic } from "./PythonBridge/senders/pyExplainTopic";
import { store } from "./redux";
import { clearMessages } from "./chat";
import { infoToast, successToast } from "./toast";
import {
  setTopicExplanation,
  setTopicExplanationLoading,
} from "./redux/slices/topicExplanation";
import { isLocalMode } from "./user";
import { explainTopic as explain } from "./server-api/explainTopic";

export async function explainTopic(
  topic,
  options = {
    customPrompt: "",
    levelOfDetail: "EXTREME",
    levelOfExpertise: "EXPERT",
    useDocuments: false,
    language: store.getState().language.value,
  },
  dispatch = store.dispatch
) {
  dispatch(setTopicExplanationLoading(true));

  // Necessary to reset conversations because of underlying implementation in python
  if (isLocalMode()) {
    if (store.getState().messages.value.length > 0) {
      await clearMessages();
      infoToast(
        "Clearing Conversation",
        "FYI: This action clears your active conversation."
      );
    }
    pyExplainTopic(topic, options);
  } else {
    if (!store.getState().user.value) {
      infoToast("Log in required", "Please log in first.");
      return;
    }

    const res = await explain(topic, options);
    if (res.status === "success") {
      dispatch(setTopicExplanation(res.data.response.content));
      successToast("Topic Explanation", `Completed explanation for ${topic}`);
    }

    dispatch(setTopicExplanationLoading(false));
  }
}
