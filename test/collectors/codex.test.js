import { describe, expect, it } from "vitest";
import { collectCodex } from "../../src/collectors/codex.js";

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
});
