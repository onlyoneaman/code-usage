// Pi-Agent pricing — costs are pre-calculated in session data
// Falls back to LiteLLM for missing cost fields
import { litellmLookup } from "./litellm.js";

export function getPiPricing(modelId) {
  // Pi-Agent provides pre-calculated costs in usage.cost.total.
  // This fallback is only used when cost.total is missing.
  const lm = litellmLookup(modelId);
  if (lm) return lm;
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}
