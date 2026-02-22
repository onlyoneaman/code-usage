import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectClaude } from "../../src/collectors/claude.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, "..", "fixtures", "claude");

describe("collectClaude", () => {
  const origEnv = process.env.CLAUDE_CONFIG_DIR;

  beforeEach(() => {
    process.env.CLAUDE_CONFIG_DIR = fixtureDir;
  });

  afterEach(() => {
    if (origEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = origEnv;
  });

  it("returns correct provider metadata", () => {
    const result = collectClaude();
    expect(result.provider).toBe("claude");
    expect(result.badge).toBe("Claude Max");
    expect(result.accent).toBe("#D37356");
    expect(result.extra).toHaveProperty("linesAdded");
  });

  it("counts sessions and messages correctly", () => {
    const result = collectClaude();
    expect(result.summary.totalSessions).toBeGreaterThanOrEqual(1);
    expect(result.summary.totalMessages).toBe(2); // 2 user entries
  });

  it("aggregates tokens correctly", () => {
    const result = collectClaude();
    const tb = result.summary.tokenBreakdown;
    // input: 1000 + 2000 = 3000
    expect(tb.input).toBe(3000);
    // output: 500 + 800 = 1300
    expect(tb.output).toBe(1300);
    // cacheRead: 200 + 500 = 700
    expect(tb.cacheRead).toBe(700);
    // cacheWrite: 100 + 0 = 100
    expect(tb.cacheWrite).toBe(100);
  });

  it("produces daily entries with correct date", () => {
    const result = collectClaude();
    expect(result.daily.length).toBeGreaterThanOrEqual(1);
    const day = result.daily.find((d) => d.date === "2025-06-15");
    expect(day).toBeDefined();
    expect(day.sessions).toBeGreaterThanOrEqual(1);
    expect(day.messages).toBe(2);
  });

  it("aggregates models correctly", () => {
    const result = collectClaude();
    expect(result.models.length).toBeGreaterThanOrEqual(1);
    const sonnet = result.models.find((m) => m.id === "claude-sonnet-4-5-20250929");
    expect(sonnet).toBeDefined();
    expect(sonnet.cost).toBeGreaterThan(0);
    expect(sonnet.details.length).toBe(4); // Input, Output, Cache Read, Cache Write
  });

  it("returns sorted models by cost descending", () => {
    const result = collectClaude();
    for (let i = 1; i < result.models.length; i++) {
      expect(result.models[i - 1].cost).toBeGreaterThanOrEqual(result.models[i].cost);
    }
  });

  it("returns sorted daily by date ascending", () => {
    const result = collectClaude();
    for (let i = 1; i < result.daily.length; i++) {
      expect(result.daily[i - 1].date <= result.daily[i].date).toBe(true);
    }
  });

  it("computes totalCost as sum of model costs", () => {
    const result = collectClaude();
    const sumModelCost = result.models.reduce((s, m) => s + m.cost, 0);
    expect(result.summary.totalCost).toBeCloseTo(sumModelCost, 10);
  });

  it("has valid firstDate", () => {
    const result = collectClaude();
    expect(result.summary.firstDate).toBe("2025-06-15T00:00:00.000Z");
  });

  it("applies cutoffDate before aggregation", () => {
    const result = collectClaude({ cutoffDate: "2025-06-16" });
    expect(result.summary.totalCost).toBe(0);
    expect(result.summary.totalSessions).toBe(0);
    expect(result.summary.totalMessages).toBe(0);
    expect(result.models).toEqual([]);
    expect(result.daily).toEqual([]);
  });
});

describe("collectClaude with empty dir", () => {
  const origEnv = process.env.CLAUDE_CONFIG_DIR;

  beforeEach(() => {
    process.env.CLAUDE_CONFIG_DIR = "/tmp/nonexistent-claude-test-dir";
  });

  afterEach(() => {
    if (origEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = origEnv;
  });

  it("returns zero totals when no data", () => {
    const result = collectClaude();
    expect(result.summary.totalCost).toBe(0);
    expect(result.summary.totalSessions).toBe(0);
    expect(result.summary.totalMessages).toBe(0);
    expect(result.models).toEqual([]);
    expect(result.daily).toEqual([]);
  });
});
