// Codex model pricing — $/1M tokens
//
// Resolution order:
//   1. LiteLLM — first-class source, refreshed every 24h from BerriAI's repo.
//   2. Pinned table below — verified backup for known models when LiteLLM is unreachable
//      or has dropped/missed a key.
//   3. Family heuristic — last-resort guess for brand-new models LiteLLM hasn't shipped yet.
//   4. Hardcoded default.

import { litellmLookup } from "./litellm.js";

// OpenAI prices cached input at 10% of input across the gpt-5 line.
const tier = (input, output) => ({ input, output, cachedInput: input * 0.1, reasoning: output });

const GPT5 = tier(1.25, 10.0);
const GPT5_MID = tier(1.75, 14.0);
const GPT5_4 = tier(2.5, 15.0);
const GPT5_5 = tier(5.0, 30.0); // also gpt-5.6 / gpt-5.6-sol
const GPT5_6_TERRA = tier(2.0, 12.0);
const GPT5_6_LUNA = tier(0.2, 1.2);
const GPT5_MINI = tier(0.25, 2.0);
const GPT5_4_MINI = tier(0.75, 4.5);
const GPT5_NANO = tier(0.05, 0.4);
const GPT5_4_NANO = tier(0.2, 1.25);
const GPT5_PRO = tier(15.0, 120.0);
const GPT5_2_PRO = tier(21.0, 168.0);
const GPT5_4_PRO = tier(30.0, 180.0); // also gpt-5.5-pro

const CODEX_PRICING = {
  // Codex variants
  "gpt-5.3-codex": GPT5_MID,
  "gpt-5.2-codex": GPT5_MID,
  "gpt-5.1-codex-max": GPT5,
  "gpt-5.1-codex-mini": GPT5_MINI,
  "gpt-5.1-codex": GPT5,
  "gpt-5-codex": GPT5,
  // Non-codex flagships (users may pass --model directly)
  "gpt-5.6": GPT5_5,
  "gpt-5.6-sol": GPT5_5,
  "gpt-5.6-terra": GPT5_6_TERRA,
  "gpt-5.6-luna": GPT5_6_LUNA,
  "gpt-5.5": GPT5_5,
  "gpt-5.5-2026-04-23": GPT5_5,
  "gpt-5.4": GPT5_4,
  "gpt-5.4-2026-03-05": GPT5_4,
  "gpt-5.4-mini": GPT5_4_MINI,
  "gpt-5.4-mini-2026-03-17": GPT5_4_MINI,
  "gpt-5.4-nano": GPT5_4_NANO,
  "gpt-5.4-nano-2026-03-17": GPT5_4_NANO,
  "gpt-5.2": GPT5_MID,
  "gpt-5.2-2025-12-11": GPT5_MID,
  "gpt-5.1": GPT5,
  "gpt-5.1-2025-11-13": GPT5,
  "gpt-5": GPT5,
  "gpt-5-2025-08-07": GPT5,
  "gpt-5-mini": GPT5_MINI,
  "gpt-5-mini-2025-08-07": GPT5_MINI,
  "gpt-5-nano": GPT5_NANO,
  "gpt-5-nano-2025-08-07": GPT5_NANO,
  // Pro tiers — an order of magnitude above the flagships, so a wrong
  // fallback here is the most expensive miss in the table.
  "gpt-5.5-pro": GPT5_4_PRO,
  "gpt-5.5-pro-2026-04-23": GPT5_4_PRO,
  "gpt-5.4-pro": GPT5_4_PRO,
  "gpt-5.4-pro-2026-03-05": GPT5_4_PRO,
  "gpt-5.2-pro": GPT5_2_PRO,
  "gpt-5.2-pro-2025-12-11": GPT5_2_PRO,
  "gpt-5-pro": GPT5_PRO,
  "gpt-5-pro-2025-10-06": GPT5_PRO,
};

// OpenAI switches to long-context rates above 272K input tokens, and bills the
// entire request at those rates rather than only the excess. LiteLLM files the
// rates under its generic `*_above_200k_tokens` keys regardless.
export const CODEX_LONG_CONTEXT_THRESHOLD = 272_000;

// Codex sessions can run on OpenAI's priority service tier, recorded as
// `thread_settings.service_tier` (legacy spelling: "fast"). Priority bills at
// 2x standard across every gpt-5.x model; derive the ratio from LiteLLM's
// explicit priority rates when present so it tracks future changes.
export const CODEX_PRIORITY_MULTIPLIER = 2;

export function getCodexPricing(modelId) {
  // 1. LiteLLM — first-class source
  const lm = litellmLookup(modelId, ["openai/"]);
  if (lm)
    return {
      input: lm.input,
      output: lm.output,
      cachedInput: lm.cacheRead,
      reasoning: lm.output,
      inputAbove: lm.inputAbove200k,
      outputAbove: lm.outputAbove200k,
      cachedInputAbove: lm.cacheReadAbove200k,
      longContextThreshold: CODEX_LONG_CONTEXT_THRESHOLD,
      priorityMultiplier: lm.inputPriority && lm.input ? lm.inputPriority / lm.input : CODEX_PRIORITY_MULTIPLIER,
    };

  // 2. Pinned table — verified backup
  if (CODEX_PRICING[modelId]) return CODEX_PRICING[modelId];

  // 3. Family heuristic — last-resort guess for brand-new models. Size class
  //    dominates generation, so check pro/mini/nano before version numbers.
  const id = modelId.toLowerCase();
  if (id.includes("pro")) return GPT5_4_PRO;
  if (id.includes("nano")) return GPT5_4_NANO;
  if (id.includes("mini")) return GPT5_4_MINI;
  if (id.includes("5.6") || id.includes("5.5")) return GPT5_5;
  if (id.includes("5.4")) return GPT5_4;
  if (id.includes("5.3") || id.includes("5.2")) return GPT5_MID;

  // 4. Final default — newer unknown flagships have trended up, so assume the
  //    current flagship tier rather than the original gpt-5 rate.
  return GPT5_5;
}

export { CODEX_PRICING };
