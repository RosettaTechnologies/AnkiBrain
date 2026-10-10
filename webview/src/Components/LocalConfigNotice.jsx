import { Alert, AlertDescription, AlertIcon, Button, Flex } from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { PATHS } from "../api/constants";
import { useLocalConfigGate } from "../api/localConfig";

/**
 * In-panel notice for the LOCAL-mode config gate: the AI stays blocked until a
 * key, a model and a verified endpoint exist (see localConfig.js). Renders
 * nothing once the gate passes — including in SERVER mode — so screens can
 * mount it unconditionally above their AI action.
 */
export function LocalConfigNotice() {
  const gate = useLocalConfigGate();
  const navigate = useNavigate();

  if (gate.ok) return null;

  return (
    <Alert status="warning" mb={2} borderRadius={"md"} alignItems={"start"}>
      <AlertIcon />
      <Flex direction={"column"} width={"100%"}>
        <AlertDescription fontSize={13}>{gate.reason}</AlertDescription>
        <Button
          size={"sm"}
          width={"fit-content"}
          mt={2}
          onClick={() => navigate(PATHS.SETTINGS)}
        >
          Open Settings
        </Button>
      </Flex>
    </Alert>
  );
}
