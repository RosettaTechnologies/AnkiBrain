import {
  Button,
  Checkbox,
  Flex,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalOverlay,
  Text,
} from "@chakra-ui/react";
import { AiOutlineSmile } from "react-icons/ai";
import { VscHeartFilled } from "react-icons/vsc";
import { BiDonateHeart } from "react-icons/bi";
import { MdOutlineRateReview } from "react-icons/md";
import { setShowBootReminderDialog } from "../../api/redux/slices/showBootReminderDialog";
import { pyEditSetting } from "../../api/PythonBridge/senders/pyEditSetting";
import React from "react";
import { useDispatch, useSelector } from "react-redux";

export function BootReminderModal(props) {
  const dispatch = useDispatch();
  const showBootReminderDialog = useSelector(
    (state) => state.showBootReminderDialog.value
  );

  return (
    <Modal isOpen={props.show} onClose={props.onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalCloseButton />
        <ModalBody>
          <Flex direction={"column"} alignItems={"center"} p={5}>
            <Text fontSize={26} fontFamily={"lato"} whiteSpace={"nowrap"}>
              Hi there! Sorry for the interruption...
            </Text>
            <Text>
              If you enjoy using AnkiBrain, please consider leaving a review on
              AnkiWeb or donating to help keep the lights on! Thank you so much!{" "}
            </Text>
            <Flex mb={3}>
              <AiOutlineSmile size={30} style={{ marginRight: 5 }} />
              <VscHeartFilled size={30} color={"red"} />
            </Flex>

            <Button mt={3} p={0} width={325} variant={"accent"}>
              <a
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
                href={"https://donate.stripe.com/7sI16Z1jYdo698I9AC"}
              >
                <BiDonateHeart size={30} style={{ marginRight: 5 }} />
                Donate
              </a>
            </Button>
            <Button mt={3} width={325} p={0}>
              <a
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
                href={"https://ankiweb.net/shared/info/1915225457"}
              >
                <MdOutlineRateReview size={28} style={{ marginRight: 5 }} />
                Review on AnkiWeb
              </a>
            </Button>
            <Checkbox
              mt={5}
              isChecked={showBootReminderDialog}
              onChange={async (e) => {
                dispatch(setShowBootReminderDialog(e.target.checked));
                await pyEditSetting("showBootReminderDialog", e.target.checked);
              }}
            >
              Show this reminder when AnkiBrain starts
            </Checkbox>
          </Flex>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
