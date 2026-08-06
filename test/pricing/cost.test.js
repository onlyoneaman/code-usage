import { describe, expect, it } from "vitest";
import { cacheWriteSplit, codexCost, costFromUsage, tieredCost } from "../../src/pricing/cost.js";

const OPUS = { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25, cacheWrite1h: 10 };

describe("cacheWriteSplit", () => {
  it("reads the ephemeral 5m/1h breakdown when present", () => {
    const u = {
      cache_creation_input_tokens: 300,
      cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 200 },
    };
    expect(cacheWriteSplit(u)).toEqual([100, 200]);
  });

  it("treats records without a breakdown as all-5m", () => {
    expect(cacheWriteSplit({ cache_creation_input_tokens: 300 })).toEqual([300, 0]);
  });

  it("returns zeros for an empty record", () => {
    expect(cacheWriteSplit({})).toEqual([0, 0]);
  });
});

describe("tieredCost", () => {
  it("bills marginally above the threshold", () => {
    expect(tieredCost(300_000, 3, 6)).toBe(200_000 * 3 + 100_000 * 6);
  });

  it("bills at the base rate below the threshold", () => {
    expect(tieredCost(100_000, 3, 6)).toBe(100_000 * 3);
  });

  it("ignores the tier when the model has no above rate", () => {
    expect(tieredCost(300_000, 3, null)).toBe(300_000 * 3);
  });

  it("returns zero for zero tokens", () => {
    expect(tieredCost(0, 3, 6)).toBe(0);
  });
});

describe("costFromUsage", () => {
  it("bills 1h cache writes at the 1h rate", () => {
    const u = { cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 1e6 } };
    expect(costFromUsage(u, OPUS)).toBeCloseTo(10, 6);
  });

  it("bills 5m cache writes at the 5m rate", () => {
    const u = { cache_creation: { ephemeral_5m_input_tokens: 1e6, ephemeral_1h_input_tokens: 0 } };
    expect(costFromUsage(u, OPUS)).toBeCloseTo(6.25, 6);
  });

  it("bills legacy records without a breakdown at the 5m rate", () => {
    expect(costFromUsage({ cache_creation_input_tokens: 1e6 }, OPUS)).toBeCloseTo(6.25, 6);
  });

  it("derives the 1h rate as 2x input when the provider omits it", () => {
    const noRate = { ...OPUS, cacheWrite1h: null };
    const u = { cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 1e6 } };
    expect(costFromUsage(u, noRate)).toBeCloseTo(10, 6);
  });

  it("sums input, output and cache reads", () => {
    const u = { input_tokens: 1e6, output_tokens: 1e6, cache_read_input_tokens: 1e6 };
    expect(costFromUsage(u, OPUS)).toBeCloseTo(5 + 25 + 0.5, 6);
  });

  it("applies long-context rates above the threshold", () => {
    const sonnet = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75, inputAbove200k: 6 };
    const u = { input_tokens: 300_000 };
    expect(costFromUsage(u, sonnet)).toBeCloseTo((200_000 * 3 + 100_000 * 6) / 1e6, 6);
  });
});

describe("codexCost", () => {
  const GPT = { input: 1.75, output: 14, cachedInput: 0.175, priorityMultiplier: 2 };

  it("never prices reasoning tokens separately", () => {
    const withReasoning = codexCost({ input: 1e6, cached: 0, output: 1e6, reasoning: 5e5 }, GPT);
    const without = codexCost({ input: 1e6, cached: 0, output: 1e6 }, GPT);
    expect(withReasoning).toBe(without);
  });

  it("bills cached input at the cached rate", () => {
    const c = codexCost({ input: 1e6, cached: 1e6, output: 0 }, GPT);
    expect(c).toBeCloseTo(0.175, 6);
  });

  it("doubles the whole session on the priority tier", () => {
    const std = codexCost({ input: 1e6, cached: 0, output: 1e6 }, GPT, "standard");
    const pri = codexCost({ input: 1e6, cached: 0, output: 1e6 }, GPT, "priority");
    expect(pri).toBeCloseTo(std * 2, 6);
  });

  it("treats the legacy 'fast' spelling as priority", () => {
    const a = codexCost({ input: 1e6, output: 0 }, GPT, "fast");
    const b = codexCost({ input: 1e6, output: 0 }, GPT, "priority");
    expect(a).toBe(b);
  });

  it("bills long-context turns entirely at the above rates", () => {
    const p = { ...GPT, inputAbove: 3.5, outputAbove: 28 };
    const all = codexCost({ input: 1e6, cached: 0, output: 1e6, longInput: 1e6, longOutput: 1e6 }, p);
    expect(all).toBeCloseTo(3.5 + 28, 6);
  });

  it("prices mixed short and long turns as two buckets", () => {
    const p = { ...GPT, inputAbove: 3.5, outputAbove: 28 };
    const mixed = codexCost({ input: 2e6, cached: 0, output: 0, longInput: 1e6 }, p);
    expect(mixed).toBeCloseTo(1.75 + 3.5, 6);
  });
});
