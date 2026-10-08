import {
  Box,
  Button,
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
import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { closeLocalEngineModal, refreshLocalEngineStatus } from "../../api/localEngine";
import {
  pyLocalEngineCancelInstall,
  pyLocalEngineInstall,
  pyLocalEngineResetData,
  pyLocalEngineUninstall,
} from "../../api/PythonBridge/senders/pyLocalEngine";
import { setLocalEngineInstallActive } from "../../api/redux/slices/localEngine";
import { setUserModeSelectorOpen } from "../../api/redux/slices/userModeSelector";

/**
 * Local AI engine setup: one honest screen — what this is, what it costs
 * (bytes), one button. While the bootstrap runs on the python side, stage
 * events stream in (uv -> python -> venv -> packages -> verify). Nothing is
 * replayed after a successful install — the modal closes and the engine is
 * started by the python boot path.
 *
 * Three modes (state.localEngine.setupModalMode):
 *   default   — first-use install or repair of a failed/drifted engine.
 *   uninstall — confirm + run the runtime removal.
 *   reset     — confirm + run the documents & data reset.
 *
 * The modal is deliberately not dismissable: no X, no Esc, no overlay click.
 * Hiding it would leave the install running in the background with partial
 * files on disk. The only exit is Cancel, which stops the bootstrap before
 * the modal closes. After a completed install the exit is Done.
 *
 * The same surface serves two wrappers (the `gate` prop):
 *   gate=false — the Settings-driven modal: opened/closed via redux, all
 *                exits available.
 *   gate=true  — App.jsx's LOCAL-mode gate: rendered full-screen in place of
 *                the app shell while the engine is missing, always open and
 *                always the install/repair flow, with every Cancel exit
 *                suppressed. The ways out are install/retry, or "Choose a
 *                different mode", which hands the panel to the user-mode
 *                selector (it switches modes in-process).
 */

// The install pipeline, in order. The modal renders this as a static
// checklist: every runnable step is visible from the start as a to-do (empty
// checkbox) and flips to a checkmark as its stage event lands.
const INSTALL_STEPS = [
  { stage: "uv", label: "Preparing installer (uv)" },
  { stage: "python", label: "Installing Python runtime" },
  { stage: "venv", label: "Creating engine environment" },
  { stage: "packages", label: "Installing AI packages" },
  { stage: "verify", label: "Verifying the engine" },
];

export function LocalEngineSetupModal({ gate = false }) {
  const dispatch = useDispatch();
  const reduxOpen = useSelector((state) => state.localEngine.setupModalOpen);
  const reduxMode = useSelector((state) => state.localEngine.setupModalMode);
  // The gate is always open and always the install/repair flow; the redux
  // flags only drive the Settings-driven modal.
  const open = gate || reduxOpen;
  const mode = gate ? "default" : reduxMode;
  const status = useSelector((state) => state.localEngine.status);
  const install = useSelector((state) => state.localEngine.install);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const [actionWorking, setActionWorking] = useState(false);
  const [actionError, setActionError] = useState(null);

  if (!open) return null;

  const unsupported = status && status.status === "unsupported";
  const estimate = (status && status.estimate) || { download_mb: 400, disk_mb: 1200 };
  const installed = status && status.status === "supported-and-installed";
  const needsSync = status && status.status === "supported-and-needs-sync";
  const lastError = status && status.last_error;
  const active = install.active;
  const event = install.event || {};
  const done = install.done;

  const pct =
    event.estimate_mb > 0
      ? Math.min(100, Math.round((100 * (event.received_mb || 0)) / event.estimate_mb))
      : 0;

  const stages = install.stages || {};
  const currentStep = INSTALL_STEPS.find((s) => stages[s.stage] === "active");
  const failedStep = INSTALL_STEPS.find((s) => stages[s.stage] === "error");
  const heading = event.message || (currentStep ? currentStep.label : "Preparing…");

  const startInstall = () => {
    setCancelError(null);
    dispatch(setLocalEngineInstallActive(true));
    pyLocalEngineInstall();
  };

  // Without this the gate is a mode trap: the selector screen is the one
  // surface that can move the user out of LOCAL mode.
  const openModeSelector = () => dispatch(setUserModeSelectorOpen(true));

  /**
   * The one exit for the install/repair flow. If nothing has been started
   * (prompt / unsupported / confirm screen) this only closes — an already
   * installed engine is left untouched. If an install is running or a
   * previous attempt failed, it stops and cleans up the bootstrap before
   * closing. A cleanup failure (locked files) keeps the modal open so the
   * user can retry.
   */
  const handleCancel = async () => {
    if (cancelling || actionWorking) return;
    if (!active && !(done && !done.ok)) {
      closeLocalEngineModal();
      return;
    }
    setCancelling(true);
    setCancelError(null);
    let res = null;
    try {
      res = await pyLocalEngineCancelInstall();
    } catch (e) {
      res = { ok: false, error: String(e && e.message ? e.message : e) };
    }
    setCancelling(false);
    if (res && res.ok) {
      dispatch(setLocalEngineInstallActive(false));
      closeLocalEngineModal();
      refreshLocalEngineStatus();
    } else {
      setCancelError(
        String((res && res.error) || "Could not cancel the install.").slice(0, 300)
      );
    }
  };

  const runAction = async (fn, fallbackMessage) => {
    setActionWorking(true);
    setActionError(null);
    let res = null;
    try {
      res = await fn();
    } catch (e) {
      res = { ok: false, error: String(e && e.message ? e.message : e) };
    }
    setActionWorking(false);
    if (res && res.ok) {
      await refreshLocalEngineStatus();
      closeLocalEngineModal();
    } else {
      setActionError(
        String((res && res.error) || fallbackMessage).slice(0, 300)
      );
    }
  };

  const headline =
    lastError || installed
      ? "Repair engine"
      : needsSync
        ? "Update engine"
        : "Install engine";

  const body = (
    <>
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
              "This platform is not supported by the local AI engine."}
          </Text>
          {gate ? (
            <Button
              width="100%"
              variant="outline"
              onClick={openModeSelector}
            >
              Choose a different mode
            </Button>
          ) : (
            <Button width="100%" variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
          )}
        </>
      )}

      {!cancelling && !unsupported && mode === "uninstall" && (
        <>
          {actionWorking ? (
            <Flex direction="column" align="center" py={2}>
              <CircularProgress isIndeterminate size={10} color="red.400" mb={3} />
              <Text mb={0}>Removing the local AI engine…</Text>
            </Flex>
          ) : (
            <>
              <Text mb={4}>
                Remove the local AI engine runtime from this computer? Your
                conversations and imported documents are kept; the engine can
                be reinstalled with one click any time.
              </Text>
              <Button
                width="100%"
                colorScheme="red"
                mb={2}
                onClick={() =>
                  runAction(pyLocalEngineUninstall, "Could not remove the local AI engine.")
                }
              >
                Uninstall engine
              </Button>
              <Button width="100%" variant="ghost" onClick={handleCancel}>
                Cancel
              </Button>
            </>
          )}
        </>
      )}

      {!cancelling && !unsupported && mode === "reset" && (
        <>
          {actionWorking ? (
            <Flex direction="column" align="center" py={2}>
              <CircularProgress isIndeterminate size={10} color="red.400" mb={3} />
              <Text mb={0}>Resetting documents &amp; data…</Text>
            </Flex>
          ) : (
            <>
              <Text mb={4}>
                Reset Local-mode documents and data? This deletes the vector
                store, the imported document cache, temporary files, and the
                saved OpenAI API key. Your card backups are not affected.
              </Text>
              <Button
                width="100%"
                colorScheme="red"
                mb={2}
                onClick={() =>
                  runAction(pyLocalEngineResetData, "Could not reset local data.")
                }
              >
                Reset documents &amp; data
              </Button>
              <Button width="100%" variant="ghost" onClick={handleCancel}>
                Cancel
              </Button>
            </>
          )}
        </>
      )}

      {!cancelling && !unsupported && mode === "default" && !active && !done && (
        <>
          {gate && (
            <Text mb={3} fontSize={13} color="gray.500">
              Install the local AI engine to continue to AnkiBrain.
            </Text>
          )}
          {lastError && (
            <Box
              bg="red.50"
              borderWidth={1}
              borderColor="red.300"
              borderRadius="md"
              p={3}
              mb={3}
            >
              <Text fontWeight="semibold" color="red.500" fontSize={13} m={0} mb={1}>
                Engine error
              </Text>
              <Text fontSize={12} color="red.500" m={0}>
                {String(lastError.message || "").slice(0, 400)}
              </Text>
              {lastError.hint && (
                <Text fontSize={11} color="gray.600" m={0} mt={1}>
                  {lastError.hint}
                </Text>
              )}
            </Box>
          )}
          <Text mb={3}>
            {lastError
              ? "The local AI engine failed to start. Repair it to rebuild the environment."
              : installed
                ? "Reinstall or repair the local AI engine."
                : "The local AI engine powers chat and document search in AnkiBrain Local mode."}
          </Text>
          <Text fontSize={13} color="gray.500" mb={4}>
            Download ≈ {estimate.download_mb} MB · Disk ≈ {estimate.disk_mb} MB
          </Text>
          <Button
            width="100%"
            variant="accent"
            colorScheme="purple"
            mb={2}
            onClick={startInstall}
          >
            {headline}
          </Button>
          {gate && (
            <Button
              width="100%"
              variant="ghost"
              onClick={openModeSelector}
            >
              Choose a different mode
            </Button>
          )}
          {!gate && (
            <Button width="100%" variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
          )}
        </>
      )}

      {!cancelling && !unsupported && mode === "default" && active && (
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
            {INSTALL_STEPS.map((s) => {
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
          {!gate && (
            <Button variant="ghost" onClick={handleCancel} alignSelf="center">
              Cancel
            </Button>
          )}
        </Flex>
      )}

      {!cancelling && !unsupported && mode === "default" && done && done.ok && (
        <>
          <Text mb={4} color="green.500">
            Local AI engine ready. You can close this window and use chat and
            document search.
          </Text>
          <Button width="100%" onClick={closeLocalEngineModal} variant="accent" colorScheme="purple">
            Done
          </Button>
        </>
      )}

      {!cancelling && !unsupported && mode === "default" && done && !done.ok && (
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
            {done.error && done.error.message
              ? String(done.error.message).slice(0, 400)
              : "Unknown error"}
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
          {gate && (
            <Button
              width="100%"
              variant="ghost"
              onClick={openModeSelector}
            >
              Choose a different mode
            </Button>
          )}
          {!gate && (
            <Button width="100%" variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
          )}
        </>
      )}

      {cancelError && (
        <Text mt={3} fontSize={12} color="red.500">
          {cancelError}
        </Text>
      )}

      {actionError && (
        <Text mt={3} fontSize={12} color="red.500">
          {actionError}
        </Text>
      )}
    </>
  );

  if (gate) {
    return (
      <Flex
        height="100%"
        width="100%"
        direction="column"
        align="center"
        justify="center"
        p={6}
      >
        <Text fontWeight="bold" fontSize="lg" mb={4}>
          AnkiBrain Local Mode
        </Text>
        <Box width="100%" maxWidth="440px">
          {body}
        </Box>
      </Flex>
    );
  }

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
        <ModalHeader>AnkiBrain Local Mode</ModalHeader>
        <ModalBody pb={6}>{body}</ModalBody>
      </ModalContent>
    </Modal>
  );
}
