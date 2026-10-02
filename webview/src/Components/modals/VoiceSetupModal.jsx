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
  Spinner,
  Text,
} from "@chakra-ui/react";
import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { closeSetupModal, refreshTtsStatus } from "../../api/tts";
import { pyTtsCancelInstall, pyTtsInstall } from "../../api/PythonBridge/senders/pyTtsInstall";
import { setTtsInstallActive } from "../../api/redux/slices/tts";

/**
 * Voice setup: one honest screen — what this is, what it costs (bytes), one
 * button. While the bootstrap runs on the python side, stage events stream in
 * (uv -> python -> venv -> engine -> spacy -> ja? -> model -> test). Nothing
 * is replayed after a successful install — the modal closes and the user
 * repeats the voice action (speak / generate audio).
 *
 * Two modes (state.tts.setupModalMode):
 *   default — first-use install or repair, with an optional ja checkbox.
 *   add_ja  — incremental Japanese pack for an already installed engine;
 *             runs only the ja sync + test, and Cancel never touches the
 *             existing core engine.
 *
 * The modal is deliberately not dismissable: no X, no Esc, no overlay
 * click. Hiding it would leave the install running in the background with
 * partial files on disk. The only exit is Cancel, which stops the bootstrap
 * (and, in default mode, deletes every file the attempt wrote) before the
 * modal closes. After a completed install the exit is Done (there is nothing
 * to undo).
 */

// The install pipeline, in order. The modal renders this as a static
// checklist: every runnable step is visible from the start as a to-do (empty
// checkbox) and flips to a checkmark as its stage event lands. The Japanese
// row only appears when it was requested.
const INSTALL_STEPS = [
  { stage: "uv", label: "Preparing installer (uv)" },
  { stage: "python", label: "Installing Python runtime" },
  { stage: "venv", label: "Creating voice environment" },
  { stage: "engine", label: "Installing engine packages (PyTorch)" },
  { stage: "spacy", label: "Installing English tokenizer" },
  { stage: "ja", label: "Installing Japanese voice pack", japanese: true },
  { stage: "model", label: "Fetching Kokoro-82M voice model" },
  { stage: "test", label: "Verifying synthesis" },
];

// The incremental add-on flow (mode "add_ja"): only the pack sync + a
// Japanese synthesis run — no venv rebuild, no core re-download.
const JA_INSTALL_STEPS = [
  { stage: "ja", label: "Installing Japanese voice pack" },
  { stage: "test", label: "Verifying Japanese synthesis" },
];
export function VoiceSetupModal() {
  const dispatch = useDispatch();
  const open = useSelector((state) => state.tts.setupModalOpen);
  const mode = useSelector((state) => state.tts.setupModalMode);
  const status = useSelector((state) => state.tts.status);
  const install = useSelector((state) => state.tts.install);
  const [includeJa, setIncludeJa] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const jaMode = mode === "add_ja";

  // Opening the install/repair prompt mirrors the engine's current state: a
  // repair of an engine that already has the ja pack keeps the checkbox
  // checked, so it reflects "what will be installed", not a stale default.
  // (Deps are deliberately just open/mode — the sync happens on open.)
  useEffect(() => {
    if (open && !jaMode) {
      setIncludeJa(!!(status && status.ja_pack));
    }
  }, [open, jaMode]);

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

  const stages = install.stages || {};
  const steps = jaMode
    ? JA_INSTALL_STEPS
    : INSTALL_STEPS.filter((s) => !s.japanese || includeJa);
  const currentStep = steps.find((s) => stages[s.stage] === "active");
  const failedStep = steps.find((s) => stages[s.stage] === "error");
  const heading = event.message || (currentStep ? currentStep.label : "Preparing…");

  const startInstall = () => {
    setCancelError(null);
    dispatch(setTtsInstallActive(true));
    pyTtsInstall(jaMode ? ["ja"] : includeJa ? ["core", "ja"] : ["core"]);
  };

  /**
   * The one exit. If nothing has been started (prompt / unsupported screen)
   * this only closes — in Repair mode an already installed engine is left
   * untouched. If an install is running or a previous attempt failed, it
   * stops the bootstrap and (default mode only) deletes the whole partial
   * tree on the python side before closing; ja mode preserves the installed
   * core engine. A cleanup failure (locked files) keeps the modal open so
   * the user can retry.
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
      res = await pyTtsCancelInstall({ preserveCore: jaMode });
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
                {jaMode
                  ? "Stopping the installer. The installed voice engine is not affected."
                  : "Stopping the installer and removing downloaded files."}
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
              {jaMode ? (
                <>
                  <Text mb={3}>
                    Add the Japanese language pack to the installed voice engine.
                  </Text>
                  <Text fontSize={13} color="gray.500" mb={4}>
                    Download ≈ {estimate.ja_extra_mb} MB · Japanese voices and
                    text-to-speech support.
                  </Text>
                  <Button
                    width="100%"
                    variant="accent"
                    colorScheme="purple"
                    mb={2}
                    onClick={startInstall}
                  >
                    Install Japanese pack
                  </Button>
                </>
              ) : (
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
                    Also install Japanese{" "}
                    <Text as="span" fontSize={12} color="gray.500">
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
                </>
              )}
              <Button width="100%" variant="ghost" onClick={handleCancel}>
                Cancel
              </Button>
            </>
          )}

          {!cancelling && !unsupported && active && (
            <Flex direction="column" py={2}>
              <Flex align="center" mb={2}>
                <Spinner size="sm" color="purple.400" mr={2} flexShrink={0} />
                {/* m={0}: Bootstrap's `p { margin-bottom: 1rem }` beats
                    Chakra's :where() reset, and flexbox centers the margin
                    box — leaving this margin makes the text ride high. */}
                <Text fontWeight="semibold" m={0}>
                  {heading}
                </Text>
              </Flex>
              {event.estimate_mb > 0 && (
                <Box width="100%" mb={3}>
                  <Progress value={pct} size="sm" colorScheme="purple" borderRadius="full" />
                  <Text fontSize={12} color="gray.500" textAlign="right">
                    {event.received_mb || 0} / ~{event.estimate_mb} MB
                  </Text>
                </Box>
              )}
              <List spacing={1} fontSize={13} width="100%" my={3}>
                {steps.map((s) => {
                  const st = stages[s.stage] || "todo";
                  return (
                    <ListItem key={s.stage}>
                      {/* One flex row per step: the icon column and the label
                          both vertically centered against each other. All
                          Text nodes need m={0} — Bootstrap's `p` bottom
                          margin otherwise offsets text from the centered
                          icon/spinner (flex centers the whole margin box). */}
                      <Flex align="center">
                        <Flex width="20px" mr={2} justify="center" align="center" flexShrink={0}>
                          {st === "done" ? (
                            <Text color="green.500" fontWeight="bold" m={0}>
                              ✓
                            </Text>
                          ) : st === "error" ? (
                            <Text color="red.500" fontWeight="bold" m={0}>
                              ✗
                            </Text>
                          ) : st === "active" ? (
                            <Spinner size="xs" color="purple.400" />
                          ) : (
                            <Text color="gray.400" m={0}>
                              ☐
                            </Text>
                          )}
                        </Flex>
                        <Text
                          m={0}
                          color={
                            st === "done"
                              ? "green.500"
                              : st === "error"
                              ? "red.500"
                              : st === "active"
                              ? "purple.400"
                              : "gray.500"
                          }
                          fontWeight={st === "active" ? "semibold" : "normal"}
                        >
                          {s.label}
                        </Text>
                      </Flex>
                    </ListItem>
                  );
                })}
              </List>
              <Button variant="ghost" onClick={handleCancel} alignSelf="center">
                Cancel
              </Button>
            </Flex>
          )}

          {!cancelling && !unsupported && done && done.ok && (
            <>
              <Text mb={4} color="green.500">
                {jaMode
                  ? "Japanese voice pack installed. Pick a Japanese voice from the Language menu in Settings."
                  : "Voice engine ready. Click the voice button again to use it."}
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
              {failedStep && (
                <Text fontSize={12} color="gray.500" mb={1}>
                  Failed at: {failedStep.label}
                </Text>
              )}
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
