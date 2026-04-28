// Codex model pricing — $/1M tokens
//
// Resolution order:
//   1. LiteLLM — first-class source, refreshed every 24h from BerriAI's repo.
//   2. Pinned table below — verified backup for known models when LiteLLM is unreachable
//      or has dropped/missed a key.
//   3. Family heuristic — last-resort guess for brand-new models LiteLLM hasn't shipped yet.
//   4. Hardcoded default.

import { litellmLookup } from "./litellm.js";

const GPT5 = { input: 1.25, output: 10.0, cachedInput: 0.125, reasoning: 10.0 };
const GPT5_MID = { input: 1.75, output: 14.0, cachedInput: 0.175, reasoning: 14.0 };
const GPT5_4 = { input: 2.5, output: 15.0, cachedInput: 0.25, reasoning: 15.0 };
const GPT5_5 = { input: 5.0, output: 30.0, cachedInput: 0.5, reasoning: 30.0 };
const GPT5_MINI = { input: 0.25, output: 2.0, cachedInput: 0.025, reasoning: 2.0 };
const GPT5_4_MINI = { input: 0.75, output: 4.5, cachedInput: 0.075, reasoning: 4.5 };

const CODEX_PRICING = {
  // Codex variants
  "gpt-5.3-codex": GPT5_MID,
  "gpt-5.2-codex": GPT5_MID,
  "gpt-5.1-codex-max": GPT5,
  "gpt-5.1-codex-mini": GPT5_MINI,
  "gpt-5.1-codex": GPT5,
  "gpt-5-codex": GPT5,
  // Non-codex flagships (users may pass --model directly)
  "gpt-5.5": GPT5_5,
  "gpt-5.5-2026-04-23": GPT5_5,
  "gpt-5.4": GPT5_4,
  "gpt-5.4-2026-03-05": GPT5_4,
  "gpt-5.4-mini": GPT5_4_MINI,
  "gpt-5.4-mini-2026-03-17": GPT5_4_MINI,
  "gpt-5.2": GPT5_MID,
  "gpt-5.1": GPT5,
  "gpt-5": GPT5,
};

export function getCodexPricing(modelId) {
  // 1. LiteLLM — first-class source
  const lm = litellmLookup(modelId, ["openai/"]);
  if (lm) return { input: lm.input, output: lm.output, cachedInput: lm.cacheRead, reasoning: lm.output };

  // 2. Pinned table — verified backup
  if (CODEX_PRICING[modelId]) return CODEX_PRICING[modelId];

  // 3. Family heuristic — last-resort guess for brand-new models
  const id = modelId.toLowerCase();
  if (id.includes("5.3") || id.includes("5.2"))
    return { input: 1.75, output: 14.0, cachedInput: 0.175, reasoning: 14.0 };

  // 4. Final default
  return { input: 1.25, output: 10.0, cachedInput: 0.125, reasoning: 10.0 };
}

export { CODEX_PRICING };
