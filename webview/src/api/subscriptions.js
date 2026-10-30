// Keep in sync with ankibrain-server/subscriptions.js
//
// Prices and `includedUsage` are authoritative on the server; they are repeated
// here only for display. `valueMultiplier` is floor(includedUsage / price * 100)
// / 100 and `extras` are display-only marketing copy (no feature is gated by
// them).

export const SUBSCRIPTION_PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 1,
    includedUsage: 2,
    valueMultiplier: 2,
    extras: [],
  },
  {
    id: "plus",
    name: "Plus",
    price: 4.99,
    includedUsage: 15,
    valueMultiplier: 3,
    extras: ["Priority email support"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 9.99,
    includedUsage: 30,
    valueMultiplier: 3,
    extras: ["Priority email support", "Early access to new features"],
  },
  {
    id: "max",
    name: "Max",
    price: 19.99,
    includedUsage: 65,
    valueMultiplier: 3.25,
    extras: ["Priority email support", "Early access to new features"],
  },
];

// Existing marketing estimate: 100 flashcards for $0.03.
const CARD_COST_USD = 0.0003;

export function getPlan(tierId) {
  return SUBSCRIPTION_PLANS.find((plan) => plan.id === tierId) || null;
}

export function planRank(tierId) {
  const index = SUBSCRIPTION_PLANS.findIndex((plan) => plan.id === tierId);
  return index === -1 ? 0 : index + 1;
}

export function isUpgrade(fromTierId, toTierId) {
  const from = planRank(fromTierId);
  const to = planRank(toTierId);
  return from > 0 && to > from;
}

// Accepts either a plan object or a raw dollar amount of usage.
export function estimatedFlashcards(planOrUsage) {
  const usage =
    planOrUsage && typeof planOrUsage === "object"
      ? Number(planOrUsage.includedUsage) || 0
      : Number(planOrUsage) || 0;
  return Math.round(usage / CARD_COST_USD);
}

export function formatUsd(value) {
  const amount = Number(value) || 0;
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

export function formatMultiplier(value) {
  const multiplier = Number(value) || 0;
  return `${Number.isInteger(multiplier) ? multiplier : multiplier.toFixed(2)}×`;
}
