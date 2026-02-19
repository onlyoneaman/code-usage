// Amp model pricing — uses LiteLLM fallback (Amp primarily uses Anthropic models)
import { litellmLookup } from "./litellm.js";

const ZERO = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export function getAmpPricing(modelId) {
  const lm = litellmLookup(modelId, ["anthropic/", "anthropic."]);
  if (lm) return lm;
  return ZERO;
}
