import { useEffect, useRef } from "react";
import "./TalkScreen.css";
import { useDispatch, useSelector } from "react-redux";
import { setCurrentChatInput } from "../../../api/redux";
import { AIMessage } from "./AIMessage";
import { UserMessage } from "./UserMessage";
import {
  Box,
  Button,
  Checkbox,
  Input,
  Spinner,
  Text,
  Tooltip,
  useColorMode,
} from "@chakra-ui/react";
import {
  addAIMessageToStore,
  clearMessages,
  sendUserMessage,
} from "../../../api/chat";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import { setUseDocuments } from "../../../api/documents";
import { isLocalMode } from "../../../api/user";

export function TalkScreen() {
  const dispatch = useDispatch();
  const messages = useSelector((state) => state.messages.value);
  const { colorMode } = useColorMode();

  const messageInput = useSelector((state) => state.currentChatInput.value);
  const messagesEndRef = useRef(null);

  const useDocuments = useSelector((state) => state.useDocuments.value);
  const chatLoading = useSelector((state) => state.chatLoading.value);

  const handleUserSubmit = async () => {
    if (messageInput === "") return;

    // Does all the heavy lifting.
    await sendUserMessage(messageInput, useDocuments, dispatch);
  };

  const handleSubmitAsAI = () => {
    if (messageInput === "") return;
    addAIMessageToStore(messageInput, [], dispatch);
    dispatch(setCurrentChatInput(""));
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
    <div className={"TalkScreen d-flex flex-column"} style={{ height: "100%" }}>
      <Box
        className={"ChatContainer"}
        bg={
          colorMode === "light" ? "rgba(175,235,244,0.25)" : "customPurple.800"
        }
        style={{
          position: "relative",
          borderStyle: "solid",
          borderColor: "rgba(0, 0, 0, 0.10)",
          // backgroundColor: "rgba(175,235,244,0.25)",
          borderRadius: 5,
          display: "flex",
          flexDirection: "column",
          flex: 1,
          overflowY: "scroll",
        }}
      >
        {messages.map((msg, index) =>
          msg.type === "ai" ? (
            <AIMessage messageData={msg} key={index} />
          ) : (
            <UserMessage messageData={msg} key={index} />
          )
        )}

        <div ref={messagesEndRef} />

        <div style={{ flexGrow: 1 }}></div>
      </Box>

      <div
        className={"MessageInputContainer"}
        style={{ width: "100%", position: "relative" }}
      >
        <Input
          bg={colorMode === "light" ? "white" : "customPurple.700"}
          focusBorderColor={"accent"}
          style={{
            width: "100%",
            height: 50,
            paddingLeft: 10,
            paddingRight: 50,
          }}
          placeholder={
            "The AI understands most languages. Start typing in any language and press enter to submit..."
          }
          value={messageInput}
          onChange={(e) => {
            dispatch(setCurrentChatInput(e.target.value));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleUserSubmit();
            }
          }}
        />
        <Box position={"absolute"} zIndex={1000} right={"1%"} bottom={"20%"}>
          {chatLoading && <Spinner color={"accent"} />}

          {!chatLoading && (
            <i
              className={"SendButton bi bi-send-fill"}
              style={{
                fontSize: 20,
                color: "#ec98ff",
                padding: 10,
                opacity: messageInput !== "" ? 1 : 0.5,
                pointerEvents: messageInput !== "" ? "auto" : "none",
                cursor: messageInput !== "" ? "pointer" : "not-allowed",
              }}
              onClick={() => {
                handleUserSubmit();
              }}
            ></i>
          )}
        </Box>
      </div>

      <div className={"mt-2 mb-2 flex flex-direction-row align-items-center"}>
        <Button
          onClick={() => {
            clearMessages();
          }}
          variant={"accent"}
          isDisabled={messages.length === 0}
        >
          Clear Chat
        </Button>

        <Box mt={5} mb={2}>
          <Checkbox
            ms={5}
            isChecked={useDocuments}
            onChange={async (e) => {
              await setUseDocuments(e.target.checked);
            }}
          >
            Use Documents as Sources (Strict Mode)
            <Tooltip
              label={
                "Forces the ChatAI to use your documents as source material. If\n" +
                "            asked about anything outside the scope of the documents, it will say \"I don't\n" +
                '            know."'
              }
            >
              <InfoOutlineIcon fontSize={"sm"} position={"absolute"} />
            </Tooltip>
          </Checkbox>
        </Box>
      </div>
    </div>
  );
}
