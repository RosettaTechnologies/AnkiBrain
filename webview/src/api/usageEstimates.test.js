import { SUBSCRIPTION_PLANS } from "./subscriptions";
import {
  PAYG_SAMPLE_USD,
  USAGE_UNIT_COSTS,
  estimateUnits,
} from "./usageEstimates";

const byId = Object.fromEntries(USAGE_UNIT_COSTS.map((unit) => [unit.id, unit]));

test("every billable AI feature has a unit price", () => {
  expect(USAGE_UNIT_COSTS.map((unit) => unit.id)).toEqual([
    "flashcards",
    "occlusions",
    "chatMessages",
    "explanations",
  ]);
  expect(byId.flashcards.costUsd).toBeCloseTo(0.0003);
  expect(byId.occlusions.costUsd).toBeCloseTo(0.0045);
  expect(byId.chatMessages.costUsd).toBeCloseTo(0.0025);
  expect(byId.explanations.costUsd).toBeCloseTo(0.004);
});

test("a plan's monthly credit converts to whole units per feature", () => {
  for (const plan of SUBSCRIPTION_PLANS) {
    const usage = plan.includedUsage;
    expect(estimateUnits(byId.flashcards.costUsd, usage)).toBe(
      Math.round(usage / 0.0003)
    );
  }
  // Max: $65 of credit.
  expect(estimateUnits(byId.flashcards.costUsd, 65)).toBe(216667);
  expect(estimateUnits(byId.occlusions.costUsd, 65)).toBe(14444);
  expect(estimateUnits(byId.chatMessages.costUsd, 65)).toBe(26000);
  expect(estimateUnits(byId.explanations.costUsd, 65)).toBe(16250);
});

test("the pay-as-you-go sample is $1.00", () => {
  expect(PAYG_SAMPLE_USD).toBe(1);
  expect(estimateUnits(byId.flashcards.costUsd, PAYG_SAMPLE_USD)).toBe(3333);
  expect(estimateUnits(byId.occlusions.costUsd, PAYG_SAMPLE_USD)).toBe(222);
  expect(estimateUnits(byId.chatMessages.costUsd, PAYG_SAMPLE_USD)).toBe(400);
  expect(estimateUnits(byId.explanations.costUsd, PAYG_SAMPLE_USD)).toBe(250);
});

test("a missing or zero unit price renders zero instead of NaN", () => {
  expect(estimateUnits(0, 65)).toBe(0);
  expect(estimateUnits(undefined, 65)).toBe(0);
});
