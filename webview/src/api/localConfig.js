import { useMemo } from "react";
import { useSelector } from "react-redux";

export const SETTINGS_POINTER =
  "Settings → Basic → OpenAI / OpenAI-compatible API";

/**
 * LOCAL-mode gate: AI requests stay blocked until a provider AND a model are
 * configured. "Configured" means (a) an API key is saved, (b) a model is set,
 * (c) the endpoint answered once (Test connection loaded its model list).
 * Non-LOCAL modes are never gated. Pure so it is unit-testable.
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
  if (!(ai.openaiModels || []).length) {
    return {
      ok: false,
      reason: `Verify your endpoint once with Test connection in ${SETTINGS_POINTER} — it loads the endpoint's model list.`,
    };
  }
  return { ok: true, reason: "" };
}

export function useLocalConfigGate() {
  const userMode = useSelector((state) => state.userMode.value);
  const ai = useSelector((state) => state.appSettings.ai);
  return useMemo(() => localConfigGate(userMode, ai), [userMode, ai]);
}
