import { describe, expect, it } from "vitest";
import { litellmLookup } from "../../src/pricing/litellm.js";

describe("litellmLookup", () => {
  it("returns pricing for a known Claude model", () => {
    const p = litellmLookup("claude-sonnet-4-5-20250929", ["anthropic/"]);
    expect(p).not.toBeNull();
    expect(p.input).toBeGreaterThan(0);
    expect(p.output).toBeGreaterThan(0);
  });

  it("returns null for completely unknown model", () => {
    const p = litellmLookup("nonexistent-model-abc-123", []);
    expect(p).toBeNull();
  });

  it("tries multiple prefix variations", () => {
    // Should find via anthropic/ prefix
    const p = litellmLookup("claude-sonnet-4-5-20250929", ["anthropic/", "openai/"]);
    expect(p).not.toBeNull();
  });

  it("returns object with expected fields when found", () => {
    const p = litellmLookup("claude-haiku-4-5-20251001", ["anthropic/"]);
    expect(p).not.toBeNull();
    expect(p).toHaveProperty("input");
    expect(p).toHaveProperty("output");
    expect(p).toHaveProperty("cacheRead");
    expect(p).toHaveProperty("cacheWrite");
  });
});
