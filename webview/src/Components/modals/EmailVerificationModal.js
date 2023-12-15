import {
  Button,
  Flex,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
  useDisclosure,
} from "@chakra-ui/react";
import { useSelector } from "react-redux";
import { useState } from "react";
import { resendVerificationCode, verifyEmail } from "../../api/user";

export function EmailVerificationModal(props) {
  const user = useSelector((state) => state.user.value);
  const [verificationCode, setVerificationCode] = useState("");
  const { onClose } = useDisclosure();
  return (
    // Show if logged in but not verified.
    <Modal isOpen={user && !user.isVerified} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Validate Email</ModalHeader>
        <ModalBody>
          <Flex direction={"column"}>
            <Text>
              Please enter the verification code that was sent to your email
              address.
            </Text>
            <Text fontSize={20}>
              If you don't see the code, <b>check your spam folder.</b>
            </Text>
            <Text>
              If you are still having issues, email ankibrain@rankmd.org for
              manual verification.
            </Text>
            <Input
              placeholder={"Verification code..."}
              value={verificationCode}
              onChange={(e) => {
                setVerificationCode(e.target.value);
              }}
            />
          </Flex>

          <Flex direction={"column"} mt={3}>
            <Button
              variant={"accent"}
              onClick={async () => {
                await verifyEmail(verificationCode, user.accessToken);
              }}
            >
              Validate
            </Button>
            <Button
              mt={3}
              mb={3}
              onClick={async () => {
                await resendVerificationCode(user.accessToken);
              }}
            >
              Resend verification code to my email
            </Button>
          </Flex>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
