import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureFresh, litellmLookup } from "../../src/pricing/litellm.js";

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

describe("ensureFresh", () => {
  let originalFetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("never throws on network failure and reports the skip via log", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline"));
    const log = vi.fn();
    // ttlMs:0 forces a refresh attempt even if a cache file already exists.
    const refreshed = await ensureFresh({ ttlMs: 0, timeoutMs: 100, log });
    expect(refreshed).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/skipped/));
  });

  it("rejects empty responses without writing the cache", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    const log = vi.fn();
    const refreshed = await ensureFresh({ ttlMs: 0, timeoutMs: 100, log });
    expect(refreshed).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/empty response/));
  });
});
