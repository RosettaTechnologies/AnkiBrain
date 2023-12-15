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
import { setCustomPromptMakeCards } from "../../../api/redux/slices/customPrompts";
import { pyEditSetting } from "../../../api/PythonBridge/senders/pyEditSetting";

export function CustomPromptMakeCardsModal(props) {
  const dispatch = useDispatch();
  const customPromptMakeCards = useSelector(
    (state) => state.customPrompts.value.makeCards
  );

  const [text, setText] = useState(customPromptMakeCards);
  const save = async () => {
    await pyEditSetting("customPromptMakeCards", text);
    dispatch(setCustomPromptMakeCards(text));
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
              AI for making cards. Your custom prompt will be <b>in addition</b>{" "}
              to the internal formatting instructions.
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
