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

  it("returns haiku 3.5 pricing for haiku-3 models", () => {
    const p = getClaudePricing("claude-haiku-3-5-20241022");
    expect(p.input).toBe(0.8);
    expect(p.output).toBe(4);
  });

  it("falls back gracefully for unknown model", () => {
    const p = getClaudePricing("totally-unknown-model-xyz");
    expect(p).toHaveProperty("input");
    expect(p).toHaveProperty("output");
    expect(p).toHaveProperty("cacheRead");
    expect(p).toHaveProperty("cacheWrite");
  });
});
