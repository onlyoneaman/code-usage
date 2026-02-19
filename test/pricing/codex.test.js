import { describe, expect, it } from "vitest";
import { getCodexPricing } from "../../src/pricing/codex.js";

describe("getCodexPricing", () => {
  it("returns exact pricing for gpt-5.1-codex", () => {
    const p = getCodexPricing("gpt-5.1-codex");
    expect(p.input).toBe(1.25);
    expect(p.output).toBe(10.0);
    expect(p.cachedInput).toBe(0.125);
    expect(p.reasoning).toBe(10.0);
  });

  it("returns exact pricing for gpt-5.3-codex", () => {
    const p = getCodexPricing("gpt-5.3-codex");
    expect(p.input).toBe(1.75);
    expect(p.output).toBe(14.0);
  });

  it("falls back for 5.3 substring match", () => {
    const p = getCodexPricing("some-5.3-variant");
    expect(p.input).toBe(1.75);
    expect(p.output).toBe(14.0);
  });

  it("falls back gracefully for unknown model", () => {
    const p = getCodexPricing("unknown-model");
    expect(p).toHaveProperty("input");
    expect(p).toHaveProperty("output");
    expect(p).toHaveProperty("cachedInput");
    expect(p).toHaveProperty("reasoning");
  });
});
