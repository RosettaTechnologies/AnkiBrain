import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
} from "@chakra-ui/react";
import { useDispatch, useSelector } from "react-redux";
import { dismissErrorDialog } from "../../api/redux/slices/errorDialog";

export function ErrorDialog() {
  const dispatch = useDispatch();
  const { current, queue } = useSelector((state) => state.errorDialog.value);

  return (
    <Modal
      isOpen={Boolean(current)}
      onClose={() => dispatch(dismissErrorDialog())}
      isCentered
      size="xl"
      scrollBehavior="inside"
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{current ? current.title : ""}</ModalHeader>
        <ModalBody>
          <Text whiteSpace="pre-wrap" wordBreak="break-word" fontSize="sm">
            {current ? current.message : ""}
          </Text>
          {queue.length > 0 && (
            <Text mt={3} fontSize="xs" color="gray.500">
              +{queue.length} more waiting
            </Text>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="accent" onClick={() => dispatch(dismissErrorDialog())}>
            {queue.length > 0 ? "Next" : "Close"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
