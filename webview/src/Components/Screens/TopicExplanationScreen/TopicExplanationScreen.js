import "./TopicExplanationScreen.css";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { PATHS } from "../../../api/constants";
import { setTopicExplanation } from "../../../api/redux/slices/topicExplanation";
import { setRequestedTopic } from "../../../api/redux/slices/requestedTopic";
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Input,
  Select,
  Spinner,
  Tag,
  Text,
  useColorMode,
} from "@chakra-ui/react";
import { StarIcon } from "@chakra-ui/icons";
import { explainTopic } from "../../../api/explainTopic";

import {
  setLevelOfDetail,
  setLevelOfExpertise,
} from "../../../api/redux/slices/makeCardsSettings";
import { setUseDocuments } from "../../../api/documents";
import { setMakeCardsText } from "../../../api/redux/slices/makeCardsText";
import { useEffect, useState } from "react";
import { errorToast } from "../../../api/toast";
import { isLocalMode } from "../../../api/user";
import { CustomPromptTopicExplanationModal } from "./CustomPromptTopicExplanationModal";

export function TopicExplanationScreen(props) {
  const levelOfExpertise = useSelector(
    (state) => state.makeCardsSettings.value.levelOfExpertise
  );

  const levelOfDetail = useSelector(
    (state) => state.makeCardsSettings.value.levelOfDetail
  );

  const useDocuments = useSelector((state) => state.useDocuments.value);
  const model = useSelector((state) => state.appSettings.ai.llmModel);
  const temperature = useSelector((state) => state.appSettings.ai.temperature);

  const { colorMode } = useColorMode();
  const requestedTopic = useSelector((state) => state.requestedTopic.value);
  const [requestedTopicWordLength, setRequestedTopicWordLength] = useState(
    requestedTopic.length
  );
  useEffect(() => {
    setRequestedTopicWordLength(requestedTopic.trim().split(/\s+/).length);
  }, [requestedTopic]);

  const topicExplanation = useSelector((state) => state.topicExplanation.value);
  const topicExplanationLoading = useSelector(
    (state) => state.topicExplanation.loading
  );
  const language = useSelector((state) => state.language.value);
  const [showCustomPromptModal, setShowCustomPromptModal] = useState(false);
  const customPromptTopicExplanation = useSelector(
    (state) => state.customPrompts.value.topicExplanation
  );
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const submitTopic = async () => {
    await explainTopic(
      requestedTopic,
      {
        customPrompt: customPromptTopicExplanation,
        levelOfDetail,
        levelOfExpertise,
        useDocuments,
        language,
      },
      dispatch
    );
  };

  return (
    <div className={"TopicExplanationScreen"} style={props.style}>
      <div style={{ width: "100%" }}>
        <CustomPromptTopicExplanationModal
          isOpen={showCustomPromptModal}
          onClose={() => setShowCustomPromptModal(false)}
        />
        <Flex mb={5} justifyContent={"space-around"}>
          <Flex direction={"column"}>
            <Tag p={2} justifyContent={"center"}>
              Level of Detail
            </Tag>
            <Select
              value={levelOfDetail}
              onChange={(e) => {
                dispatch(setLevelOfDetail(e.target.value));
              }}
            >
              <option value={"LOW"}>Low</option>
              <option value={"MEDIUM"}>Medium</option>
              <option value={"HIGH"}>High</option>
              <option value={"EXTREME"}>Extreme</option>
            </Select>
          </Flex>

          <Flex direction={"column"}>
            <Tag p={2} justifyContent={"center"}>
              Level of Expertise
            </Tag>
            <Select
              value={levelOfExpertise}
              onChange={(e) => {
                dispatch(setLevelOfExpertise(e.target.value));
              }}
            >
              <option value={"BEGINNER"}>Beginner</option>
              <option value={"INTERMEDIATE"}>Intermediate</option>
              <option value={"ADVANCED"}>Advanced</option>
              <option value={"EXPERT"}>Expert</option>
            </Select>
          </Flex>
        </Flex>

        <Flex direction={"column"}>
          <Input
            bg={colorMode === "light" ? "white" : "customPurple.700"}
            focusBorderColor={"accent"}
            placeholder={"Enter a topic..."}
            onChange={(event) => {
              dispatch(setRequestedTopic(event.target.value));
            }}
            onSubmit={() => {
              submitTopic();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (requestedTopicWordLength > 750) {
                  errorToast("Too many tokens", "");
                } else {
                  submitTopic();
                }
              } else if (requestedTopicWordLength >= 750) {
                const allowedKeys = ["Backspace"];
                if (!allowedKeys.includes(e.key)) {
                  e.preventDefault();
                }
              }
            }}
            value={requestedTopic}
          />
          <Text alignSelf={"end"} fontSize={12} color={"gray"}>
            {requestedTopicWordLength}/750
          </Text>
        </Flex>

        <Flex justifyContent={"center"} alignItems={"center"} mb={4}>
          <Button
            isDisabled={requestedTopic === "" || topicExplanationLoading}
            variant={"accent"}
            width={150}
            me={5}
            onClick={() => {
              submitTopic();
            }}
          >
            {topicExplanationLoading ? (
              <Spinner />
            ) : (
              <>
                <StarIcon me={3} />
                Explain
              </>
            )}
          </Button>

          <Checkbox
            isChecked={useDocuments}
            onChange={(e) => {
              setUseDocuments(e.target.checked);
            }}
          >
            Use Documents
          </Checkbox>
        </Flex>

        <Flex
          direction={"row"}
          justifyContent={"center"}
          alignItems={"center"}
          mb={5}
        >
          <Button me={2} onClick={() => setShowCustomPromptModal(true)}>
            Customize Prompt
          </Button>

          <Button
            onClick={() => {
              dispatch(setRequestedTopic(""));
              dispatch(setTopicExplanation(""));
            }}
            isDisabled={topicExplanation === "" && requestedTopic === ""}
          >
            Reset
          </Button>
        </Flex>

        <Flex direction={"row"} justifyContent={"center"}>
          <Text fontSize={10} color={"gray"} me={2.5}>
            Model: {model}
          </Text>
          <Text fontSize={10} color={"gray"} me={2.5}>
            Temperature: {temperature}
          </Text>
          <Text fontSize={10} color={"gray"}>
            Language: {language}
          </Text>
        </Flex>

        <Box
          className={"TopicExplanationContainer overflow-auto"}
          bg={colorMode === "light" ? "white" : "customPurple.800"}
          borderWidth={1}
          p={2}
        >
          {topicExplanation}
        </Box>
        <Button
          mt={3}
          mb={3}
          onClick={() => {
            dispatch(setMakeCardsText(topicExplanation));
            navigate(PATHS.MAKE_CARDS);
          }}
          isDisabled={topicExplanation === ""}
        >
          Send to Make Cards
        </Button>
      </div>
    </div>
  );
}
