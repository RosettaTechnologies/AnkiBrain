// Display-only retail cost of one unit of each AI action at the default model:
// what the user actually pays per unit. Flashcards reuse the published rate the
// server quotes too (CARD_COST_USD).
import { CARD_COST_USD } from "./subscriptions";

export const USAGE_UNIT_COSTS = [
  { id: "flashcards", label: "Flashcards", costUsd: CARD_COST_USD },
  { id: "occlusions", label: "Image occlusions", costUsd: 0.0045 },
  { id: "chatMessages", label: "Chat messages", costUsd: 0.0025 },
  { id: "explanations", label: "Topic explanations", costUsd: 0.004 },
];

// Reference amount the pay-as-you-go card quotes per tile.
export const PAYG_SAMPLE_USD = 1;

// Whole units a dollar amount buys at `unitCostUsd` each, rounded to the nearest
// unit; 0 for a missing/zero price so a bad constant can never render
// NaN/Infinity.
export function estimateUnits(unitCostUsd, usageUsd) {
  const unitCost = Number(unitCostUsd) || 0;
  if (unitCost <= 0) return 0;
  return Math.round((Number(usageUsd) || 0) / unitCost);
}
