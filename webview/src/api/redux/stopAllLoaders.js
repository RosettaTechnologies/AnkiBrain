import { store } from "./index";
import { setBoolGlobalLoadingIndicator } from "./slices/bGlobalLoadingIndicator";
import { setChatLoading } from "./slices/chatLoading";
import { setDocumentsLoading } from "./slices/documentsLoadingSlice";
import { setTopicExplanationLoading } from "./slices/topicExplanation";

export function stopAllLoaders(dispatch = store.dispatch) {
  dispatch(setBoolGlobalLoadingIndicator(false));
  dispatch(setChatLoading(false));
  dispatch(setDocumentsLoading(false));
  dispatch(setTopicExplanationLoading(false));
}
