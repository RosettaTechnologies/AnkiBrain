import {
  Button,
  Code,
  List,
  ListItem,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
} from "@chakra-ui/react";
import React from "react";
import { manualInstallGuide } from "../../api/manualInstall";

/**
 * "Manual install instructions" for technical users: the exact terminal
 * commands that reproduce what the LOCAL-mode bootstrap does, for the platform
 * the python status payload reported, with the pinned versions from that same
 * payload. Opened from the setup modal (install + failure screens) and from
 * Settings, since a boxed install failure is exactly when a user wants to
 * finish the job by hand.
 *
 * Every value here is read, never re-derived in JS: the guide degrades to the
 * platform `reason` when this platform has no engine build.
 */
export function ManualInstallModal({
  isOpen,
  onClose,
  platformKey,
  uvVersion,
  pythonVersion,
  engineRoot,
  reason,
}) {
  const guide = manualInstallGuide({
    platformKey,
    engineRoot,
    uvVersion,
    pythonVersion,
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Manual install instructions</ModalHeader>
        <ModalBody pb={6}>
          {!guide.supported ? (
            <>
              <Text fontSize={13} color="gray.500" mb={4}>
                {reason ||
                  `AnkiBrain has no local AI engine build for "${platformKey}".`}
              </Text>
              <Button width="100%" variant="ghost" onClick={onClose}>
                Close
              </Button>
            </>
          ) : (
            <>
              <Text fontSize={13} color="gray.500" mb={3}>
                For technical users: run these in a terminal on this computer to
                install or repair the engine by hand.
              </Text>
              <List spacing={4}>
                {guide.steps.map((step, i) => (
                  <ListItem key={step.title}>
                    <Text fontWeight="semibold" fontSize={13} mb={1}>
                      {`${i + 1}. ${step.title}`}
                    </Text>
                    <Text fontSize={12} color="gray.500" mb={2}>
                      {step.detail}
                    </Text>
                    <Code
                      display="block"
                      whiteSpace="pre"
                      overflowX="auto"
                      p={3}
                      fontSize={12}
                    >
                      {step.code}
                    </Code>
                  </ListItem>
                ))}
              </List>
              <Text fontSize={12} color="gray.500" mt={4} mb={4}>
                The add-on folder on this computer: <Code>{guide.addonDir}</Code>
              </Text>
              <Button width="100%" variant="ghost" onClick={onClose}>
                Close
              </Button>
            </>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
