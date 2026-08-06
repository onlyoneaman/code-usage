// Token cost arithmetic for Anthropic-shaped usage records.
//
// Semantics follow ccusage (ccusage-core/src/cost.rs), the reference
// implementation for Claude Code cost reconstruction:
//   - Cache writes carry a TTL. The 1-hour TTL bills at 2x the base input
//     rate; the 5-minute TTL bills at the provider's cache-creation rate.
//     Records without a `cache_creation` breakdown are treated as all-5m.
//   - LiteLLM `*_above_200k_tokens` rates are marginal: tokens up to the
//     threshold bill at the base rate, the remainder at the above rate.

const LONG_CONTEXT_THRESHOLD_TOKENS = 200_000;
const CACHE_CREATE_1H_INPUT_MULTIPLIER = 2.0;

export function tieredCost(tokens, base, above, threshold = LONG_CONTEXT_THRESHOLD_TOKENS) {
  if (!tokens) return 0;
  if (above && tokens > threshold) {
    return threshold * base + (tokens - threshold) * above;
  }
  return tokens * base;
}

/** Split a usage record's cache-creation tokens into [5m, 1h]. */
export function cacheWriteSplit(usage) {
  const b = usage?.cache_creation;
  if (b && typeof b === "object") {
    return [b.ephemeral_5m_input_tokens || 0, b.ephemeral_1h_input_tokens || 0];
  }
  return [usage?.cache_creation_input_tokens || 0, 0];
}

/**
 * Cost in dollars for one usage record, given per-MTok pricing.
 * `pricing` may carry optional `cacheWrite1h`, `*Above200k` and `fastMultiplier`.
 *
 * Fast mode (`usage.speed === "fast"`) bills the whole record at the model's
 * fast rate; records omitting `speed` are standard.
 */
export function costFromUsage(usage, pricing) {
  const M = 1e6;
  const [write5m, write1h] = cacheWriteSplit(usage);
  const base =
    (tieredCost(usage.input_tokens || 0, pricing.input, pricing.inputAbove200k) +
      tieredCost(usage.output_tokens || 0, pricing.output, pricing.outputAbove200k) +
      tieredCost(usage.cache_read_input_tokens || 0, pricing.cacheRead, pricing.cacheReadAbove200k) +
      cacheWriteCost(write5m, write1h, pricing) * M) /
    M;
  return base * fastMultiplier(usage, pricing);
}

/** Fast-mode price multiplier for a usage record. 1 when standard or unsupported. */
export function fastMultiplier(usage, pricing) {
  return usage?.speed === "fast" ? pricing.fastMultiplier || 1 : 1;
}

/** Dollars per MTok-scale cost for a 5m/1h cache-write token split. */
export function cacheWriteCost(write5m, write1h, pricing) {
  const rate1h = pricing.cacheWrite1h || pricing.input * CACHE_CREATE_1H_INPUT_MULTIPLIER;
  const rate1hAbove = pricing.inputAbove200k ? pricing.inputAbove200k * CACHE_CREATE_1H_INPUT_MULTIPLIER : null;
  return (
    (tieredCost(write5m, pricing.cacheWrite, pricing.cacheWriteAbove200k) + tieredCost(write1h, rate1h, rate1hAbove)) /
    1e6
  );
}

/**
 * Cost in dollars for a Codex usage bucket.
 *
 * Two OpenAI-specific rules, both mirroring ccusage
 * (ccusage/adapters/codex/src/report.rs :: calculate_codex_bucket_cost):
 *   - `reasoning_output_tokens` is a subset of `output_tokens`, not an
 *     additional bucket, so it is never priced on its own.
 *   - Long-context is a whole-request switch: every token of a request whose
 *     input exceeds the threshold bills at the long-context rates, so the
 *     aggregate is priced as two independent buckets rather than marginally.
 */
export function codexCost(b, pricing, serviceTier) {
  const M = 1e6;
  const priority = serviceTier === "priority" || serviceTier === "fast";
  const multiplier = priority ? pricing.priorityMultiplier || 2 : 1;
  const cachedRate = pricing.cachedInput || pricing.input;
  const longInputRate = pricing.inputAbove || pricing.input;
  const longOutputRate = pricing.outputAbove || pricing.output;
  const longCachedRate = pricing.cachedInputAbove || cachedRate;

  const longInput = Math.min(b.longInput || 0, b.input || 0);
  const longCached = Math.min(b.longCached || 0, b.cached || 0, longInput);
  const longOutput = Math.min(b.longOutput || 0, b.output || 0);

  const shortNonCached = Math.max(0, (b.input || 0) - longInput - ((b.cached || 0) - longCached));
  const longNonCached = longInput - longCached;

  return (
    ((shortNonCached * pricing.input +
      ((b.cached || 0) - longCached) * cachedRate +
      ((b.output || 0) - longOutput) * pricing.output +
      longNonCached * longInputRate +
      longCached * longCachedRate +
      longOutput * longOutputRate) *
      multiplier) /
    M
  );
}

export { LONG_CONTEXT_THRESHOLD_TOKENS, CACHE_CREATE_1H_INPUT_MULTIPLIER };
