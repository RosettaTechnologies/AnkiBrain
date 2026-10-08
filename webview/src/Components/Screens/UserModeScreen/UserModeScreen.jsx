import React, { useState } from "react";
import {
  Box,
  Button,
  Flex,
  Heading,
  List,
  ListItem,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
} from "@chakra-ui/react";
import { useDispatch } from "react-redux";
import { setUserMode } from "../../../api/redux/slices/userMode";
import { setUserModeSelectorOpen } from "../../../api/redux/slices/userModeSelector";
import { pySetUserMode } from "../../../api/PythonBridge/senders/pySetUserMode";
import { errorToast } from "../../../api/toast";

/**
 * User-mode surface, used for both jobs the old Qt dialog had and one it did
 * not:
 *   * first launch (no user_mode yet): the whole app waits on this screen;
 *   * on request from either in-app gate — the SERVER auth gate and the LOCAL
 *     engine gate — so a user is never stuck in a mode they cannot leave.
 * In the second case it renders in place of that gate and is dismissible.
 *
 * The comparison rows carry the substance the old dialog's bullet lists had:
 * setup, speed, where the AI runs, who bills you, whether it follows you to
 * another computer, and how hard it is.
 *
 * Regular is deliberately the dominant choice: Local needs a ~1.2 GB engine
 * download plus the user's own API key. Picking Local goes through a
 * confirmation modal that repeats those costs before anything is downloaded.
 *
 * On success python persists the mode and restarts its async members, then
 * pushes the new mode's startup (auth gate for SERVER, engine gate for LOCAL)
 * — no Anki restart.
 */

const COMPARISON = [
  {
    aspect: "Setup",
    regular: "None — start right away",
    local: "~1.2 GB download + your own model",
  },
  {
    aspect: "Speed",
    regular: "Fastest",
    local: "Often slower",
  },
  {
    aspect: "AI runs on",
    regular: "AnkiBrain's servers",
    local: "This computer",
  },
  {
    aspect: "Cost",
    regular: "Included with your account",
    local: "Your API provider, or free locally",
  },
  {
    aspect: "Every computer",
    regular: "Sign in anywhere",
    local: "This computer only",
  },
  {
    aspect: "Difficulty",
    regular: "Easy",
    local: "Advanced",
  },
];

export function UserModeScreen({ dismissible = false }) {
  const dispatch = useDispatch();
  const [busy, setBusy] = useState(false);
  const [showLocalConfirm, setShowLocalConfirm] = useState(false);

  const selectUserMode = async (mode) => {
    setBusy(true);
    try {
      const res = await pySetUserMode(mode);
      if (res && res.ok) {
        setShowLocalConfirm(false);
        dispatch(setUserMode(mode));
        // Back out of the selector: the new mode's own gate takes over.
        dispatch(setUserModeSelectorOpen(false));
      } else {
        errorToast("Could not switch mode", String((res && res.error) || ""));
      }
    } catch (e) {
      errorToast(
        "Could not switch mode",
        String((e && e.message) || e).slice(0, 300)
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Flex
      direction="column"
      alignItems="center"
      justifyContent="center"
      height="100%"
      width="100%"
      px={6}
      py={8}
      overflow="auto"
    >
      <Flex direction="column" maxWidth={"560px"} width="100%">
        {dismissible && (
          <Button
            variant="ghost"
            size="sm"
            alignSelf="flex-start"
            mb={2}
            isDisabled={busy}
            onClick={() => dispatch(setUserModeSelectorOpen(false))}
          >
            ← Back
          </Button>
        )}

        <Heading size="lg" mb={2} textAlign="center">
          Welcome to AnkiBrain
        </Heading>
        <Text color="gray" fontSize={14} mb={5} textAlign="center">
          Choose where the AI runs. You can switch modes any time.
        </Text>

        <Table size="sm" variant="simple" mb={6}>
          <Thead>
            <Tr>
              <Th border={0} px={0} py={1} />
              <Th border={0} px={2} py={1} fontSize={12}>
                Regular
              </Th>
              <Th border={0} px={2} py={1} fontSize={12}>
                Local
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {COMPARISON.map((row) => (
              <Tr key={row.aspect}>
                <Td px={0} py={2} fontSize={12} fontWeight="semibold" borderColor="inherit">
                  {row.aspect}
                </Td>
                <Td px={2} py={2} fontSize={12} borderColor="inherit">
                  {row.regular}
                </Td>
                <Td px={2} py={2} fontSize={12} borderColor="inherit">
                  {row.local}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>

        <Button
          variant="accent"
          height="auto"
          py={4}
          px={5}
          mb={4}
          whiteSpace="normal"
          textAlign="left"
          isLoading={busy}
          isDisabled={busy}
          onClick={() => selectUserMode("SERVER")}
        >
          <Flex direction="column" align="flex-start">
            <Text fontWeight="bold" fontSize="md" m={0}>
              Regular mode (recommended)
            </Text>
            <Text fontSize={13} m={0} mt={1} opacity={0.9}>
              Easiest and fastest. No setup, no downloads, works on every
              computer. AnkiBrain's servers run the AI for you.
            </Text>
            <Text fontSize={12} m={0} mt={2} opacity={0.75}>
              Recommended for everyone — choose this unless you know why you
              need Local mode.
            </Text>
          </Flex>
        </Button>

        <Button
          variant="outline"
          height="auto"
          py={4}
          px={5}
          whiteSpace="normal"
          textAlign="left"
          isDisabled={busy}
          onClick={() => setShowLocalConfirm(true)}
        >
          <Box>
            <Text fontWeight="bold" fontSize="md" m={0}>
              Local mode (advanced users only)
            </Text>
            <Text fontSize={13} m={0} mt={1}>
              Runs the AI engine on this computer with your own model: an
              OpenAI-compatible API key, or a locally-running server such as
              LM Studio or llama.cpp (no key needed).
            </Text>
          </Box>
        </Button>
      </Flex>

      <Modal
        isOpen={showLocalConfirm}
        isCentered
        onClose={() => {
          if (!busy) setShowLocalConfirm(false);
        }}
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Set up Local mode?</ModalHeader>
          <ModalBody>
            <Text mb={3}>
              Local mode keeps your data on this computer, but it is a real
              setup:
            </Text>
            <List spacing={1} fontSize={13} pl={4} styleType="disc">
              <ListItem>About 1.2 GB of engine files are downloaded.</ListItem>
              <ListItem>
                You bring your own model: an OpenAI-compatible API key (billed
                by your provider, not by AnkiBrain) or a locally-running server
                like LM Studio or llama.cpp, which needs no key.
              </ListItem>
              <ListItem>
                Setup can be difficult: machine-learning dependencies are
                installed, and a powerful computer gives decent speeds.
              </ListItem>
              <ListItem>
                Chats, cards and documents stay on this computer; nothing syncs
                to your other computers.
              </ListItem>
            </List>
            <Text mt={3} fontSize={12} color="gray">
              You can switch back to Regular mode at any time.
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="ghost"
              mr={3}
              isDisabled={busy}
              onClick={() => setShowLocalConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              colorScheme="red"
              isLoading={busy}
              isDisabled={busy}
              onClick={() => selectUserMode("LOCAL")}
            >
              Continue with local mode
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Flex>
  );
}
