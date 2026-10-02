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
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Progress,
  Text,
} from "@chakra-ui/react";
import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { closeSetupModal, refreshTtsStatus } from "../../api/tts";
import { pyTtsCancelInstall, pyTtsInstall } from "../../api/PythonBridge/senders/pyTtsInstall";
import { setTtsInstallActive } from "../../api/redux/slices/tts";

/**
 * First-use Voice setup: one honest screen — what this is, what it costs
 * (bytes), one button. While the bootstrap runs on the python side, stage
 * events stream in (uv -> python -> venv -> engine -> spacy -> ja? -> model
 * -> test). Nothing is replayed after a successful install — the modal
 * closes and the user repeats the voice action (speak / generate audio).
 *
 * The modal is deliberately not dismissable: no X, no Esc, no overlay
 * click. Hiding it would leave the install running in the background with
 * partial files on disk. The only exit is Cancel, which stops the bootstrap
 * and deletes every file the attempt wrote before the modal closes. After a
 * completed install the exit is Done (there is nothing to undo).
 */
export function VoiceSetupModal() {
  const dispatch = useDispatch();
  const open = useSelector((state) => state.tts.setupModalOpen);
  const status = useSelector((state) => state.tts.status);
  const install = useSelector((state) => state.tts.install);
  const [includeJa, setIncludeJa] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);

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
    setCancelError(null);
    dispatch(setTtsInstallActive(true));
    pyTtsInstall(includeJa ? ["core", "ja"] : ["core"]);
  };

  /**
   * The one exit. If nothing has been started (prompt / unsupported screen)
   * this only closes — in Repair mode an already installed engine is left
   * untouched. If an install is running or a previous attempt failed, it
   * stops the bootstrap and deletes the whole partial tree on the python
   * side before closing; a cleanup failure (locked files) keeps the modal
   * open so the user can retry.
   */
  const handleCancel = async () => {
    if (cancelling) return;
    if (!active && !(done && !done.ok)) {
      closeSetupModal();
      return;
    }
    setCancelling(true);
    setCancelError(null);
    let res = null;
    try {
      res = await pyTtsCancelInstall();
    } catch (e) {
      res = { ok: false, error: String(e && e.message ? e.message : e) };
    }
    setCancelling(false);
    if (res && res.ok) {
      dispatch(setTtsInstallActive(false));
      closeSetupModal();
      refreshTtsStatus();
    } else {
      setCancelError(
        String((res && res.error) || "Could not cancel the install.").slice(0, 300)
      );
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={handleCancel}
      size="md"
      closeOnOverlayClick={false}
      closeOnEsc={false}
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>AnkiBrain Voice</ModalHeader>
        <ModalBody pb={6}>
          {cancelling && (
            <Flex direction="column" align="center" py={2}>
              <CircularProgress isIndeterminate size={10} color="purple.400" mb={3} />
              <Text mb={2}>Cancelling…</Text>
              <Text fontSize={12} color="gray.500" textAlign="center">
                Stopping the installer and removing downloaded files.
              </Text>
            </Flex>
          )}

          {!cancelling && unsupported && (
            <>
              <Text mb={4}>
                {(status && status.reason) ||
                  "This platform is not supported by the voice engine."}
              </Text>
              <Button width="100%" variant="ghost" onClick={handleCancel}>
                Cancel
              </Button>
            </>
          )}

          {!cancelling && !unsupported && !active && !done && (
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
                mb={2}
                onClick={startInstall}
              >
                {alreadyInstalled ? "Repair voice engine" : "Install voice engine"}
              </Button>
              <Button width="100%" variant="ghost" onClick={handleCancel}>
                Cancel
              </Button>
            </>
          )}

          {!cancelling && !unsupported && active && (
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
              <Button variant="ghost" onClick={handleCancel}>
                Cancel
              </Button>
            </Flex>
          )}

          {!cancelling && !unsupported && done && done.ok && (
            <>
              <Text mb={4} color="green.500">
                Voice engine ready. Click the voice button again to use it.
              </Text>
              <Button width="100%" onClick={closeSetupModal} variant="accent" colorScheme="purple">
                Done
              </Button>
            </>
          )}

          {!cancelling && !unsupported && done && !done.ok && (
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
              <Button
                width="100%"
                onClick={startInstall}
                variant="accent"
                colorScheme="purple"
                mb={2}
              >
                Retry
              </Button>
              <Button width="100%" variant="ghost" onClick={handleCancel}>
                Cancel
              </Button>
            </>
          )}

          {cancelError && (
            <Text mt={3} fontSize={12} color="red.500">
              {cancelError}
            </Text>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
