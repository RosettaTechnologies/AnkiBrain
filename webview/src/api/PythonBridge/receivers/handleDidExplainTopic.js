import {
  setTopicExplanation,
  setTopicExplanationLoading,
} from "../../redux/slices/topicExplanation";
import { PATHS } from "../../constants";
import { successToast } from "../../toast";
import { store } from "../../redux";

export function handleDidExplainTopic(topicExplanation, dispatch, navigate) {
  dispatch(setTopicExplanation(topicExplanation));
  dispatch(setTopicExplanationLoading(false));
  navigate(PATHS.TOPIC_EXPLANATION);
  successToast(
    "Completed Topic Explanation",
    `Completed topic explanation for ${store
      .getState()
      .requestedTopic.value.toLowerCase()}`
  );
}
