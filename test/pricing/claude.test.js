import { describe, expect, it } from "vitest";
import { getClaudePricing } from "../../src/pricing/claude.js";

describe("getClaudePricing", () => {
  it("returns exact pricing for known model ID", () => {
    const p = getClaudePricing("claude-sonnet-4-5-20250929");
    expect(p.input).toBe(3);
    expect(p.output).toBe(15);
    expect(p.cacheRead).toBe(0.3);
    expect(p.cacheWrite).toBe(3.75);
  });

  it("returns opus 4.5/4.6 pricing for opus models with 4-5 or 4-6", () => {
    const p = getClaudePricing("claude-opus-4-6");
    expect(p.input).toBe(5);
    expect(p.output).toBe(25);
  });

  it("returns haiku pricing for haiku models", () => {
    const p = getClaudePricing("claude-haiku-4-5-20251001");
    expect(p.input).toBe(1);
    expect(p.output).toBe(5);
  });

  it("returns haiku 3.5 pricing for the canonical anthropic id", () => {
    // Anthropic emits `claude-3-5-haiku-...`, not `claude-haiku-3-5-...`. LiteLLM has the
    // canonical form. Use a tolerance because LiteLLM stores per-token floats that round
    // to ~0.79999999 per MTok.
    const p = getClaudePricing("claude-3-5-haiku-20241022");
    expect(p.input).toBeCloseTo(0.8, 5);
    expect(p.output).toBe(4);
  });

  it("falls back gracefully for unknown model", () => {
    const p = getClaudePricing("totally-unknown-model-xyz");
    expect(p).toHaveProperty("input");
    expect(p).toHaveProperty("output");
    expect(p).toHaveProperty("cacheRead");
    expect(p).toHaveProperty("cacheWrite");
  });

  it("does not misroute hypothetical future opus IDs to the legacy tier", () => {
    // Regression: prior heuristic used `id.includes("4-1")` which matched 4-100, 4-15, etc.
    // Unknown Opus should default to the modern $5/$25 tier, not legacy $15/$75.
    const p = getClaudePricing("claude-opus-4-100-99999999");
    expect(p.input).toBe(5);
    expect(p.output).toBe(25);
  });
});
