import { useEffect, useRef } from "react";
import "./TalkScreen.css";
import { useDispatch, useSelector } from "react-redux";
import { setCurrentChatInput } from "../../../api/redux";
import { AIMessage } from "./AIMessage";
import { UserMessage } from "./UserMessage";
import {
  IonButton,
  IonCheckbox,
  IonIcon,
  IonInput,
  IonSpinner,
} from "@ionic/react";
import { informationCircleOutline, send } from "ionicons/icons";
import {
  clearMessages,
  sendUserMessage,
} from "../../../api/chat";
import { setUseDocuments } from "../../../api/documents";

export function TalkScreen() {
  const dispatch = useDispatch();
  const messages = useSelector((state) => state.messages.value);

  const messageInput = useSelector((state) => state.currentChatInput.value);
  const messagesEndRef = useRef(null);

  const useDocuments = useSelector((state) => state.useDocuments.value);
  const chatLoading = useSelector((state) => state.chatLoading.value);

  const handleUserSubmit = async () => {
    if (messageInput === "") return;

    // Does all the heavy lifting.
    await sendUserMessage(messageInput, useDocuments, dispatch);
  };

  const scrollToChatBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  useEffect(() => {
    scrollToChatBottom();
  }, [messages]);

  return (
    <div className="TalkScreen">
      <div className="TalkScreen-chatContainer">
        {messages.map((msg, index) =>
          msg.type === "ai" ? (
            <AIMessage messageData={msg} key={index} />
          ) : (
            <UserMessage messageData={msg} key={index} />
          )
        )}

        <div ref={messagesEndRef} />

        <div style={{ flexGrow: 1 }}></div>
      </div>

      <div className="TalkScreen-messageInputContainer">
        <IonInput
          className="TalkScreen-input"
          fill="solid"
          placeholder={
            "The AI understands most languages. Start typing in any language and press enter to submit..."
          }
          value={messageInput}
          onIonInput={(e) =>
            dispatch(setCurrentChatInput(e.detail.value || ""))
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleUserSubmit();
            }
          }}
        />
        <div className="TalkScreen-sendArea">
          {chatLoading ? (
            <IonSpinner name="circular" />
          ) : (
            <IonIcon
              className="SendButton"
              icon={send}
              onClick={() => {
                handleUserSubmit();
              }}
              style={{
                opacity: messageInput !== "" ? 1 : 0.5,
                pointerEvents: messageInput !== "" ? "auto" : "none",
                cursor: messageInput !== "" ? "pointer" : "not-allowed",
              }}
            />
          )}
        </div>
      </div>

      <div className="TalkScreen-actions">
        <IonButton
          color="accent"
          onClick={() => {
            clearMessages();
          }}
          disabled={messages.length === 0}
        >
          Clear Chat
        </IonButton>

        <IonCheckbox
          className="TalkScreen-useDocuments"
          checked={useDocuments}
          onIonChange={async (e) => {
            await setUseDocuments(e.detail.checked);
          }}
        >
          Use Documents as Sources (Strict Mode)
        </IonCheckbox>
        <IonIcon
          className="TalkScreen-infoIcon"
          icon={informationCircleOutline}
          aria-label={
            'Forces the ChatAI to use your documents as source material. If asked about anything outside the scope of the documents, it will say "I don\'t know."'
          }
          title={
            'Forces the ChatAI to use your documents as source material. If asked about anything outside the scope of the documents, it will say "I don\'t know."'
          }
        />
      </div>
    </div>
  );
}
