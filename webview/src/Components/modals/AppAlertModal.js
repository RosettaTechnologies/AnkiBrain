import {
  Button,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
} from "@chakra-ui/react";
import { useDispatch, useSelector } from "react-redux";
import { setAppAlertModal } from "../../api/redux/slices/appAlertModal";

export function AppAlertModal(props) {
  const dispatch = useDispatch();
  const appAlertModal = useSelector((state) => state.appAlertModal.value);

  const close = async () => {
    dispatch(setAppAlertModal({ show: false, header: "", alertText: "" }));
    if (typeof appAlertModal.onClose === "function") {
      await appAlertModal.onClose();
    }
  };

  return (
    <Modal {...props} isOpen={appAlertModal.show} onClose={close}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{appAlertModal.header}</ModalHeader>
        <ModalCloseButton />
        <ModalBody width={"100%"} height={"100%"} overflow={"auto"}>
          {appAlertModal.alertText}
        </ModalBody>
        <ModalFooter>
          <Button onClick={close}>Close</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
