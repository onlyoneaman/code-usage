import { describe, expect, it } from "vitest";
import { getAmpPricing } from "../../src/pricing/amp.js";

describe("getAmpPricing", () => {
  it("returns LiteLLM pricing for known anthropic model", () => {
    const p = getAmpPricing("claude-sonnet-4-5-20250929");
    expect(p.input).toBeGreaterThan(0);
    expect(p.output).toBeGreaterThan(0);
    expect(p).toHaveProperty("cacheRead");
    expect(p).toHaveProperty("cacheWrite");
  });

  it("returns zero pricing for completely unknown model", () => {
    const p = getAmpPricing("totally-unknown-xyz-999");
    expect(p.input).toBe(0);
    expect(p.output).toBe(0);
    expect(p.cacheRead).toBe(0);
    expect(p.cacheWrite).toBe(0);
  });

  it("handles empty string model ID", () => {
    const p = getAmpPricing("");
    expect(p).toHaveProperty("input");
    expect(p).toHaveProperty("output");
  });
});
