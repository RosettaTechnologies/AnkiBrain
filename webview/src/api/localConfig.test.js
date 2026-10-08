import { expect, test } from "vitest";
import { localConfigGate, SETTINGS_POINTER } from "./localConfig";

// The LOCAL-mode AI gate: key + model + a verified endpoint, or the request is
// refused with a message pointing at the exact Settings section.
const configured = {
  hasOpenaiApiKey: true,
  llmModel: "gpt-5.6-luna",
  openaiModels: ["gpt-5.6-luna", "gpt-5.6-mini"],
};

test("SERVER mode is never gated, configured or not", () => {
  expect(
    localConfigGate("SERVER", {
      hasOpenaiApiKey: false,
      llmModel: "",
      openaiModels: [],
    })
  ).toEqual({ ok: true, reason: "" });
});

test("a missing user mode is not gated", () => {
  expect(
    localConfigGate(null, {
      hasOpenaiApiKey: false,
      llmModel: "",
      openaiModels: [],
    }).ok
  ).toBe(true);
});

test("LOCAL mode with key, model and a verified endpoint passes", () => {
  expect(localConfigGate("LOCAL", configured)).toEqual({ ok: true, reason: "" });
});

test("LOCAL mode without a key is blocked and names the key", () => {
  const gate = localConfigGate("LOCAL", {
    ...configured,
    hasOpenaiApiKey: false,
  });

  expect(gate.ok).toBe(false);
  expect(gate.reason).toContain("API key");
  expect(gate.reason).toContain(SETTINGS_POINTER);
});

test("LOCAL mode with a key but no model is blocked and says so", () => {
  const gate = localConfigGate("LOCAL", { ...configured, llmModel: "   " });

  expect(gate.ok).toBe(false);
  expect(gate.reason).toContain("Choose a model");
  expect(gate.reason).toContain(SETTINGS_POINTER);
});

test("LOCAL mode with no verified endpoint asks for Test connection", () => {
  const gate = localConfigGate("LOCAL", { ...configured, openaiModels: [] });

  expect(gate.ok).toBe(false);
  expect(gate.reason).toContain("Test connection");
  expect(gate.reason).toContain(SETTINGS_POINTER);
});
