import { setCurrentChatInput } from "../../redux";
import { PATHS } from "../../constants";

export function handleTalkSelectedText(text, dispatch, navigate) {
  dispatch(setCurrentChatInput(`Can you tell me about ${text}?`));
  navigate(PATHS.TALK);
}
