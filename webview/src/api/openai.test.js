import { expect, test } from "vitest";
import {
  OPENAI_BASE_URL_PRESET_GROUPS,
  OPENAI_BASE_URL_PRESETS,
  headersToText,
  parseHeadersText,
} from "./openai";

test("every preset has a label, a group and a unique base URL", () => {
  const urls = OPENAI_BASE_URL_PRESETS.map((p) => p.url);
  expect(urls.every((url) => typeof url === "string" && url.length > 0)).toBe(
    true
  );
  expect(new Set(urls).size).toBe(urls.length);
  expect(
    OPENAI_BASE_URL_PRESETS.every(
      (p) => typeof p.label === "string" && p.label && typeof p.group === "string"
    )
  ).toBe(true);
});

test("presets cover the gateways that need header routing", () => {
  // opencode Go refuses requests without x-opencode-session, and AnkiBrain now
  // sends that header for every provider, so the preset only has to exist.
  const urls = OPENAI_BASE_URL_PRESETS.map((p) => p.url);
  expect(urls).toContain("https://opencode.ai/zen/go/v1");
  expect(urls).toContain("https://opencode.ai/zen/v1");
});

test("grouping keeps every preset exactly once, in order", () => {
  const grouped = OPENAI_BASE_URL_PRESET_GROUPS.flatMap((g) =>
    g.presets.map((p) => p.url)
  );
  expect(grouped).toEqual(OPENAI_BASE_URL_PRESETS.map((p) => p.url));
  expect(OPENAI_BASE_URL_PRESET_GROUPS.map((g) => g.label)).toEqual([
    "Popular",
    "Model providers",
    "Inference clouds",
    "Gateways & aggregators",
    "Local",
  ]);
});

test("header text round-trips and blank means no headers", () => {
  const headers = { "x-opencode-session": "abc-123", "X-Org": "team" };
  expect(parseHeadersText(headersToText(headers))).toEqual(headers);
  expect(parseHeadersText("")).toEqual({});
  expect(parseHeadersText("   ")).toEqual({});
  expect(headersToText({})).toBe("");
  expect(headersToText(null)).toBe("");
});

test("malformed header text is rejected instead of sent", () => {
  expect(() => parseHeadersText("{not json}")).toThrow(/JSON object/);
  expect(() => parseHeadersText('["a", "b"]')).toThrow(/JSON object/);
  expect(() => parseHeadersText("null")).toThrow(/JSON object/);
  expect(() => parseHeadersText("42")).toThrow(/JSON object/);
});
