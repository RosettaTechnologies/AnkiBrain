import { useMemo } from "react";
import { useSelector } from "react-redux";

export const SETTINGS_POINTER =
  "Settings → Basic → OpenAI / OpenAI-compatible API";

/**
 * LOCAL-mode gate: AI requests stay blocked until a provider AND a model are
 * configured. "Configured" means (a) an API key is saved, (b) a model is set,
 * (c) the current endpoint was verified by a successful Test connection. The
 * verdict is persisted (settings.openaiTestResult), so a known-good setup is
 * not re-tested after every restart; it is only trusted while it still points
 * at the saved base URL. Non-LOCAL modes are never gated. Pure so it is
 * unit-testable.
 */
export function localConfigGate(userMode, ai) {
  if (userMode !== "LOCAL") return { ok: true, reason: "" };
  if (!ai.hasOpenaiApiKey) {
    return {
      ok: false,
      reason: `Add your OpenAI / OpenAI-compatible API key in ${SETTINGS_POINTER}.`,
    };
  }
  if (!String(ai.llmModel || "").trim()) {
    return { ok: false, reason: `Choose a model in ${SETTINGS_POINTER}.` };
  }
  const verified = ai.openaiTestResult;
  const configuredUrl = String(ai.openaiBaseUrl || "");
  if (!verified || !verified.ok || verified.baseUrl !== configuredUrl) {
    return {
      ok: false,
      reason: `Verify your endpoint once with Test connection in ${SETTINGS_POINTER}.`,
    };
  }
  return { ok: true, reason: "" };
}

export function useLocalConfigGate() {
  const userMode = useSelector((state) => state.userMode.value);
  const ai = useSelector((state) => state.appSettings.ai);
  return useMemo(() => localConfigGate(userMode, ai), [userMode, ai]);
}
