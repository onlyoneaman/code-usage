// Codex model pricing — $/1M tokens
import { litellmLookup } from "./litellm.js";

const CODEX_PRICING = {
  "gpt-5.3-codex": { input: 1.75, output: 14.0, cachedInput: 0.175, reasoning: 14.0 },
  "gpt-5.2-codex": { input: 1.75, output: 14.0, cachedInput: 0.175, reasoning: 14.0 },
  "gpt-5.1-codex-max": { input: 1.25, output: 10.0, cachedInput: 0.125, reasoning: 10.0 },
  "gpt-5.1-codex": { input: 1.25, output: 10.0, cachedInput: 0.125, reasoning: 10.0 },
  "gpt-5-codex": { input: 1.25, output: 10.0, cachedInput: 0.125, reasoning: 10.0 },
};

export function getCodexPricing(modelId) {
  if (CODEX_PRICING[modelId]) return CODEX_PRICING[modelId];
  const id = modelId.toLowerCase();
  if (id.includes("5.3") || id.includes("5.2"))
    return { input: 1.75, output: 14.0, cachedInput: 0.175, reasoning: 14.0 };
  // LiteLLM fallback for unknown Codex/OpenAI models
  const lm = litellmLookup(modelId, ["openai/"]);
  if (lm) return { input: lm.input, output: lm.output, cachedInput: lm.cacheRead, reasoning: lm.output };
  return { input: 1.25, output: 10.0, cachedInput: 0.125, reasoning: 10.0 };
}

export { CODEX_PRICING };
