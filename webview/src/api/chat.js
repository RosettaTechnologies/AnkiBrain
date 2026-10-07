import {
  addMessage,
  clearMessages as clear,
} from "./redux/slices/messagesSlice";
import { setCurrentChatInput, store, updateUser } from "./redux";
import { pyClearConversation } from "./PythonBridge/senders/pyClearConversation";
import { pyAskAIConversation } from "./PythonBridge/senders/pyAskAIConversation";
import { setChatLoading } from "./redux/slices/chatLoading";
import { isLocalMode } from "./user";
import { sendUserMessageToServer } from "./server-api/chat";
import { errorToast } from "./toast";

export function addAIMessageToStore(
  text,
  sourceSnippets = [],
  model,
  temperature,
  dispatch = store.dispatch
) {
  dispatch(
    addMessage({
      type: "ai",
      text,
      sourceSnippets,
      model,
      temperature,
    })
  );
}

export function addUserMessageToStore(text, dispatch = store.dispatch) {
  dispatch(
    addMessage({
      type: "user",
      text,
    })
  );
}

export async function sendUserMessage(
  text,
  useDocuments = false,
  dispatch = store.dispatch
) {
  if (isLocalMode()) {
    // The lock may still be held by another in-flight command; python pipes
    // one reply per request, so the ask is refused with a readable dialog
    // and the draft is kept instead of parking a spinner forever.
    if (!pyAskAIConversation(text, useDocuments)) {
      return;
    }
    dispatch(setCurrentChatInput(""));
    addUserMessageToStore(text, dispatch);
    dispatch(setChatLoading(true));
    return;
  }

  dispatch(setCurrentChatInput(""));
  dispatch(setChatLoading(true));
  try {
    // Build prevMessages array.
    let prevMessages = [];
    for (let message of store.getState().messages.value) {
      let type = message.type; // message schema is {type: str['ai','user','system'], text: str}
      prevMessages.push({
        type,
        text: message.text,
      });
    }

    addUserMessageToStore(text, dispatch);
    const res = await sendUserMessageToServer(
      text,
      prevMessages,
      useDocuments,
      store.getState().user.value.accessToken
    );

    if (res && res.status === "success") {
      let aiResponse = res.data.response.content;
      addAIMessageToStore(
        aiResponse,
        res.data.response.sourceSnippets,
        res.data.model,
        res.data.temperature,
        dispatch
      );
      dispatch(updateUser(res.data.user));
    }
  } catch (err) {
    errorToast("Chat Error", String((err && err.message) || err));
  } finally {
    dispatch(setChatLoading(false));
  }
}

export async function clearMessages(dispatch = store.dispatch) {
  if (isLocalMode()) {
    await pyClearConversation();
  } else {
    // Nothing to do on server side since we just pass prevMessages to the server.
  }
  dispatch(clear());
}
