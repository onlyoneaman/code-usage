import { describe, expect, it } from "vitest";
import { getPiPricing } from "../../src/pricing/pi.js";

describe("getPiPricing", () => {
  it("returns pricing with LiteLLM fallback for known model", () => {
    const p = getPiPricing("claude-sonnet-4-5-20250929");
    expect(p).toHaveProperty("input");
    expect(p).toHaveProperty("output");
    expect(p).toHaveProperty("cacheRead");
    expect(p).toHaveProperty("cacheWrite");
  });

  it("returns fallback pricing for unknown model", () => {
    const p = getPiPricing("unknown-model-xyz");
    expect(p).toHaveProperty("input");
    expect(p).toHaveProperty("output");
  });

  it("handles empty string", () => {
    const p = getPiPricing("");
    expect(p).toHaveProperty("input");
    expect(p).toHaveProperty("output");
  });
});
