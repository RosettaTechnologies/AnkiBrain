import { setRequestedTopic } from "../../redux/slices/requestedTopic";
import { PATHS } from "../../constants";

export function handleExplainSelectedText(text, dispatch, navigate) {
  dispatch(setRequestedTopic(text));
  navigate(PATHS.TOPIC_EXPLANATION);
}
