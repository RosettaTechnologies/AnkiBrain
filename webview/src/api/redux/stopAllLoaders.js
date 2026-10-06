import { store } from "./index";
import { setBoolGlobalLoadingIndicator } from "./slices/bGlobalLoadingIndicator";
import { setChatLoading } from "./slices/chatLoading";
import { setDocumentsLoading } from "./slices/documentsLoadingSlice";
import { setTopicExplanationLoading } from "./slices/topicExplanation";
import { audioJobsCleared } from "./slices/cardAudio";
import { occlusionJobsCleared } from "./slices/occlusionGeneration";

export function stopAllLoaders(dispatch = store.dispatch) {
  dispatch(setBoolGlobalLoadingIndicator(false));
  dispatch(setChatLoading(false));
  dispatch(setDocumentsLoading(false));
  dispatch(setTopicExplanationLoading(false));
  // Bridge errors / engine restarts kill in-flight card-audio batches; the
  // marks can't be trusted anymore, and stale marks would gate Add-to-Anki.
  dispatch(audioJobsCleared());
  // Same recovery for in-flight occlusion mask generation.
  dispatch(occlusionJobsCleared());
}
