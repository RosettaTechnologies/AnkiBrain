import {
  Button,
  Input,
  Link,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
} from "@chakra-ui/react";
import { useState } from "react";
import { useSelector } from "react-redux";
import { deleteAccount } from "../../api/user";

const CONFIRM_PHRASE = "yes";

export function DeleteAccountModal({ isOpen, onClose }) {
  const user = useSelector((state) => state.user.value);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const canDelete =
    !busy && confirmText.trim().toLowerCase() === CONFIRM_PHRASE;

  const close = () => {
    setConfirmText("");
    onClose();
  };

  const handleDelete = async () => {
    if (!canDelete || !user || !user.accessToken) {
      return;
    }

    setBusy(true);
    const res = await deleteAccount(user.accessToken);
    if (!res || res.status !== "success") {
      setBusy(false); // stay open so the user can retry or cancel
    }
    // On success deleteAccount() logged the user out and the auth gate has
    // replaced this screen, unmounting the modal.
  };

  return (
    <Modal isOpen={isOpen} onClose={close} closeOnOverlayClick={false}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Delete Account</ModalHeader>
        <ModalCloseButton isDisabled={busy} />
        <ModalBody>
          <Text fontWeight={"bold"}>
            This permanently deletes your AnkiBrain account and cannot be
            undone.
          </Text>
          <Text mt={3}>
            Your account, your remaining balance, and all of the document data
            AnkiBrain stores on its servers will be deleted.
          </Text>
          <Text mt={3}>
            If you would like a refund of your remaining balance, please email{" "}
            <Link href={"mailto:ankibrain@rankmd.org"} color={"blue.400"}>
              ankibrain@rankmd.org
            </Link>{" "}
            before deleting your account.
          </Text>
          <Text mt={4}>
            Type <b>yes</b> to confirm.
          </Text>
          <Input
            mt={2}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={"yes"}
            isDisabled={busy}
            autoFocus
          />
        </ModalBody>
        <ModalFooter>
          <Button variant={"ghost"} mr={3} onClick={close} isDisabled={busy}>
            Cancel
          </Button>
          <Button
            colorScheme={"red"}
            onClick={handleDelete}
            isDisabled={!canDelete}
            isLoading={busy}
          >
            Delete Account
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
