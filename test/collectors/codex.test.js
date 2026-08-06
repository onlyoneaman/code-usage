import { describe, expect, it } from "vitest";
import { accumulateTurn, collectCodex, emptyBucket, turnUsage } from "../../src/collectors/codex.js";

describe("collectCodex", () => {
  // Codex reads from ~/.codex — we can't easily redirect it.
  // These tests verify the output shape and behavior with whatever data exists.

  it("returns correct provider metadata", () => {
    const result = collectCodex();
    expect(result.provider).toBe("codex");
    expect(result.badge).toBe("Codex Pro");
    expect(result.accent).toBe("#7385FE");
    expect(result.extra).toBeNull();
  });

  it("returns valid output shape", () => {
    const result = collectCodex();
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("models");
    expect(result).toHaveProperty("daily");
    expect(result).toHaveProperty("projects");
    expect(result.summary).toHaveProperty("totalCost");
    expect(result.summary).toHaveProperty("totalSessions");
    expect(result.summary).toHaveProperty("totalMessages");
    expect(result.summary).toHaveProperty("totalOutputTokens");
    expect(result.summary).toHaveProperty("totalTokens");
    expect(result.summary).toHaveProperty("tokenBreakdown");
    expect(result.summary).toHaveProperty("streak");
    expect(Array.isArray(result.models)).toBe(true);
    expect(Array.isArray(result.daily)).toBe(true);
    expect(Array.isArray(result.projects)).toBe(true);
  });

  it("returns sorted models by cost descending", () => {
    const result = collectCodex();
    for (let i = 1; i < result.models.length; i++) {
      expect(result.models[i - 1].cost).toBeGreaterThanOrEqual(result.models[i].cost);
    }
  });

  it("returns sorted daily by date ascending", () => {
    const result = collectCodex();
    for (let i = 1; i < result.daily.length; i++) {
      expect(result.daily[i - 1].date <= result.daily[i].date).toBe(true);
    }
  });

  it("has non-negative numeric totals", () => {
    const result = collectCodex();
    expect(result.summary.totalCost).toBeGreaterThanOrEqual(0);
    expect(result.summary.totalSessions).toBeGreaterThanOrEqual(0);
    expect(result.summary.totalMessages).toBeGreaterThanOrEqual(0);
    expect(result.summary.streak).toBeGreaterThanOrEqual(0);
  });

  it("applies cutoffDate before aggregation", () => {
    const result = collectCodex({ cutoffDate: "2999-01-01" });
    expect(result.summary.totalCost).toBe(0);
    expect(result.summary.totalSessions).toBe(0);
    expect(result.summary.totalMessages).toBe(0);
    expect(result.models).toEqual([]);
    expect(result.daily).toEqual([]);
  });
});

describe("codex turn accounting", () => {
  it("drops duplicate token_count events", () => {
    const total = { input_tokens: 100, output_tokens: 10, cached_input_tokens: 5 };
    const last = { input_tokens: 100, output_tokens: 10, cached_input_tokens: 5 };
    // Same totals as the previous event => duplicate, contributes nothing.
    expect(turnUsage({ total_token_usage: total, last_token_usage: last }, total)).toBeNull();
  });

  it("uses last_token_usage once the totals advance", () => {
    const prev = { input_tokens: 100, output_tokens: 10, cached_input_tokens: 5 };
    const total = { input_tokens: 250, output_tokens: 20, cached_input_tokens: 8 };
    const last = { input_tokens: 150, output_tokens: 10, cached_input_tokens: 3 };
    expect(turnUsage({ total_token_usage: total, last_token_usage: last }, prev)).toBe(last);
  });

  it("falls back to the delta of totals when last_token_usage is absent", () => {
    const prev = { input_tokens: 100, output_tokens: 10, cached_input_tokens: 5 };
    const total = { input_tokens: 250, output_tokens: 20, cached_input_tokens: 8 };
    expect(turnUsage({ total_token_usage: total }, prev)).toEqual({
      input_tokens: 150,
      output_tokens: 10,
      cached_input_tokens: 3,
    });
  });

  it("banks a turn as long-context only when its own input crosses the threshold", () => {
    const b = { standard: emptyBucket(), priority: emptyBucket() };
    accumulateTurn(b, { input_tokens: 300_000, output_tokens: 100 }, null);
    accumulateTurn(b, { input_tokens: 1_000, output_tokens: 100 }, null);
    expect(b.standard.input).toBe(301_000);
    expect(b.standard.longInput).toBe(300_000);
    expect(b.standard.longOutput).toBe(100);
  });

  it("routes turns to the tier active at that point in the session", () => {
    const b = { standard: emptyBucket(), priority: emptyBucket() };
    accumulateTurn(b, { input_tokens: 100 }, null);
    accumulateTurn(b, { input_tokens: 200 }, "priority");
    expect(b.standard.input).toBe(100);
    expect(b.priority.input).toBe(200);
  });
});
