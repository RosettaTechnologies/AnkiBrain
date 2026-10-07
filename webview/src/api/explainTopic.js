import { pyExplainTopic } from "./PythonBridge/senders/pyExplainTopic";
import { store } from "./redux";
import { clearMessages } from "./chat";
import { errorToast, infoToast, successToast } from "./toast";
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
  // Server mode needs a session; LOCAL mode has none to check. Checked before
  // the spinner is raised so the refusal can never strand it.
  if (!isLocalMode() && !store.getState().user.value) {
    infoToast("Log in required", "Please log in first.");
    return;
  }

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
    // A refused ask (the pipe is held by another command) never gets a reply,
    // so the spinner has to come down here or it stays up until a restart.
    if (!pyExplainTopic(topic, options)) {
      dispatch(setTopicExplanationLoading(false));
    }
    return;
  }

  try {
    const res = await explain(topic, options);
    if (res.status === "success") {
      dispatch(setTopicExplanation(res.data.response.content));
      successToast("Topic Explanation", `Completed explanation for ${topic}`);
    }
  } catch (err) {
    errorToast(
      "Topic Explanation Failed",
      String((err && err.message) || err)
    );
  } finally {
    dispatch(setTopicExplanationLoading(false));
  }
}
