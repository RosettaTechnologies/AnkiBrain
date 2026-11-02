import { expect, test } from "vitest";
import { getCardGenChunkSize } from "./batching";

test("GPT-5.6 and GPT-6 models get the large card-generation batch", () => {
  expect(getCardGenChunkSize("gpt-5.6-luna")).toBe(6000);
  expect(getCardGenChunkSize("gpt-6-luna")).toBe(6000);
  expect(getCardGenChunkSize("gpt-6.1-terra")).toBe(6000);
  expect(getCardGenChunkSize("gpt-4")).toBe(3000);
});
