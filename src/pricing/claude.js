// Claude model pricing — $/1M tokens
//
// Resolution order:
//   1. LiteLLM — first-class source, refreshed every 24h from BerriAI's repo.
//   2. Pinned table below — verified backup for known models when LiteLLM is unreachable
//      or has dropped/missed a key.
//   3. Family heuristic — last-resort guess for brand-new models LiteLLM hasn't shipped yet.
//   4. Hardcoded default.

import { litellmLookup } from "./litellm.js";

const OPUS_MODERN = { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 };
const OPUS_LEGACY = { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 };
const SONNET = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };
const HAIKU_4 = { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 };
const HAIKU_3_5 = { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1.0 };
const HAIKU_3 = { input: 0.25, output: 1.25, cacheRead: 0.03, cacheWrite: 0.3 };

const CLAUDE_PRICING = {
  // Opus — modern $5/$25 tier (4.5+)
  "claude-opus-4-7": OPUS_MODERN,
  "claude-opus-4-7-20260416": OPUS_MODERN,
  "claude-opus-4-6": OPUS_MODERN,
  "claude-opus-4-6-20260205": OPUS_MODERN,
  "claude-opus-4-5": OPUS_MODERN,
  "claude-opus-4-5-20251101": OPUS_MODERN,
  // Opus — legacy $15/$75 tier (4.1 and earlier)
  "claude-opus-4-1": OPUS_LEGACY,
  "claude-opus-4-1-20250805": OPUS_LEGACY,
  "claude-opus-4-20250514": OPUS_LEGACY,
  "claude-3-opus-20240229": OPUS_LEGACY,
  // Sonnet
  "claude-sonnet-4-6": SONNET,
  "claude-sonnet-4-5": SONNET,
  "claude-sonnet-4-5-20250929": SONNET,
  "claude-sonnet-4-20250514": SONNET,
  "claude-3-7-sonnet-20250219": SONNET,
  // Haiku
  "claude-haiku-4-5": HAIKU_4,
  "claude-haiku-4-5-20251001": HAIKU_4,
  "claude-3-5-haiku-20241022": HAIKU_3_5,
  "claude-3-haiku-20240307": HAIKU_3,
};

export function getClaudePricing(modelId) {
  // 1. LiteLLM — first-class source
  const lm = litellmLookup(modelId, ["anthropic/", "anthropic."]);
  if (lm) return lm;

  // 2. Pinned table — verified backup
  if (CLAUDE_PRICING[modelId]) return CLAUDE_PRICING[modelId];

  // 3. Family heuristic — last-resort guess for brand-new models. The pinned table covers
  //    every legacy Opus, so any Opus reaching this branch is unknown-and-newer; default to
  //    the modern $5/$25 tier rather than risk substring false positives on legacy detection.
  const id = modelId.toLowerCase();
  if (id.includes("opus")) return OPUS_MODERN;
  if (id.includes("sonnet")) return SONNET;
  if (id.includes("haiku")) return HAIKU_4;

  // 4. Final default
  return OPUS_MODERN;
}

export { CLAUDE_PRICING };
