import {
  Button,
  Flex,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setCustomPromptTopicExplanation } from "../../../api/redux/slices/customPrompts";
import { pyEditSetting } from "../../../api/PythonBridge/senders/pyEditSetting";

export function CustomPromptTopicExplanationModal(props) {
  const dispatch = useDispatch();
  const customPromptTopicExplanation = useSelector(
    (state) => state.customPrompts.value.topicExplanation
  );
  const [text, setText] = useState(customPromptTopicExplanation);
  const save = async () => {
    await pyEditSetting("customPromptTopicExplanation", text);
    dispatch(setCustomPromptTopicExplanation(text));
  };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={() => {
        save();
        props.onClose();
      }}
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <Flex direction={"column"}>
            <Text>Custom Prompt</Text>
            <Text fontSize={14} color={"gray"}>
              This setting allows you to specify additional instructions to the
              AI. For example, you can ask the AI to focus only on specific
              characteristics of a topic, or ask for a specific format.
            </Text>
            <Text fontSize={14} color={"gray"}>
              <b>
                This feature is currently experimental. Please send us
                constructive feedback!
              </b>
            </Text>
          </Flex>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Textarea
            placeholder={"Enter your custom instructions..."}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
          />
        </ModalBody>
        <ModalFooter>
          <Button
            onClick={() => {
              save();
              props.onClose();
            }}
          >
            Save
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
