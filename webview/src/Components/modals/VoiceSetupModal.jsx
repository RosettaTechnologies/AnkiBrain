import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Flex,
  List,
  ListItem,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Progress,
  Text,
} from "@chakra-ui/react";
import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { closeSetupModal } from "../../api/tts";
import { pyTtsCancelInstall, pyTtsInstall } from "../../api/PythonBridge/senders/pyTtsInstall";
import { setTtsInstallActive } from "../../api/redux/slices/tts";

/**
 * First-use Voice setup: one honest screen — what this is, what it costs
 * (bytes), one button. While the bootstrap runs on the python side, stage
 * events stream in (uv -> python -> venv -> engine -> spacy -> ja? -> model
 * -> test); the text that opened the modal auto-replays on success (see
 * completeInstallFlow in the bridge).
 */
export function VoiceSetupModal() {
  const dispatch = useDispatch();
  const open = useSelector((state) => state.tts.setupModalOpen);
  const status = useSelector((state) => state.tts.status);
  const install = useSelector((state) => state.tts.install);
  const [includeJa, setIncludeJa] = useState(false);

  if (!open) return null;

  const unsupported = status && status.status === "unsupported";
  const estimate = (status && status.estimate) || { download_mb: 700, disk_mb: 1600, ja_extra_mb: 300 };
  const alreadyInstalled = status && (status.status === "supported-and-installed" || status.groups?.core);
  const active = install.active;
  const event = install.event || {};
  const done = install.done;

  const pct =
    event.estimate_mb > 0
      ? Math.min(100, Math.round((100 * (event.received_mb || 0)) / event.estimate_mb))
      : 0;

  const startInstall = () => {
    dispatch(setTtsInstallActive(true));
    pyTtsInstall(includeJa ? ["core", "ja"] : ["core"]);
  };

  return (
    <Modal isOpen={open} onClose={closeSetupModal} size="md">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>AnkiBrain Voice</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          {unsupported && (
            <Text mb={4}>
              {(status && status.reason) ||
                "This platform is not supported by the voice engine."}
            </Text>
          )}

          {!unsupported && !active && !done && (
            <>
              <Text mb={3}>
                {alreadyInstalled
                  ? "Reinstall or repair the Kokoro voice engine."
                  : "Free text-to-speech (TTS) with Kokoro voice engine."}
              </Text>
              <Text fontSize={13} color="gray.500" mb={1}>
                Download ≈ {estimate.download_mb} MB · Disk ≈ {estimate.disk_mb} MB
              </Text>
              <Text fontSize={13} color="gray.500" mb={4}>
                Languages: English, Spanish, French, Hindi, Italian, Portuguese,
                Chinese.
              </Text>
              <Checkbox
                mb={4}
                isChecked={includeJa}
                onChange={(e) => setIncludeJa(e.target.checked)}
              >
                Also install Japanese
                <Text fontSize={12} color="gray.500">
                  (+{estimate.ja_extra_mb} MB)
                </Text>
              </Checkbox>
              <Button
                width="100%"
                variant="accent"
                colorScheme="purple"
                onClick={startInstall}
              >
                {alreadyInstalled ? "Repair voice engine" : "Install voice engine"}
              </Button>
            </>
          )}

          {active && (
            <Flex direction="column" align="center" py={2}>
              <CircularProgress isIndeterminate size={10} color="purple.400" mb={3} />
              <Text mb={2}>{event.message || "Preparing…"}</Text>
              {event.estimate_mb > 0 && (
                <Box width="100%" mb={3}>
                  <Progress value={pct} size="sm" colorScheme="purple" borderRadius="full" />
                  <Text fontSize={12} color="gray.500" textAlign="right">
                    {event.received_mb || 0} / ~{event.estimate_mb} MB
                  </Text>
                </Box>
              )}
              <List spacing={0.5} fontSize={12} color="gray.500" width="100%" mb={3}>
                {(install.log || []).slice(-6).map((ev, i) => (
                  <ListItem key={i}>
                    {ev.status === "error" ? "✗" : ev.status === "done" ? "✓" : "•"}{" "}
                    {ev.message}
                  </ListItem>
                ))}
              </List>
              <Button variant="ghost" onClick={() => pyTtsCancelInstall()}>
                Cancel
              </Button>
            </Flex>
          )}

          {done && done.ok && (
            <>
              <Text mb={4} color="green.500">
                Voice engine ready. Your text will play now.
              </Text>
              <Button width="100%" onClick={closeSetupModal} variant="accent" colorScheme="purple">
                Done
              </Button>
            </>
          )}

          {done && !done.ok && (
            <>
              <Text mb={1} color="red.500" fontWeight="semibold">
                Install failed
              </Text>
              <Text fontSize={13} mb={1}>
                {done.error && done.error.message ? String(done.error.message).slice(0, 400) : "Unknown error"}
              </Text>
              {done.error && done.error.hint && (
                <Text fontSize={12} color="gray.500" mb={3}>
                  {done.error.hint}
                </Text>
              )}
              <Button width="100%" onClick={startInstall} variant="accent" colorScheme="purple">
                Retry
              </Button>
            </>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
