import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collectPi } from "../../src/collectors/pi.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, "..", "fixtures", "pi", "sessions");

describe("collectPi", () => {
  it("returns correct provider metadata", () => {
    const result = collectPi(fixtureDir);
    expect(result.provider).toBe("pi");
    expect(result.badge).toBe("Pi-Agent");
    expect(result.accent).toBe("#6C5CE7");
    expect(result.extra).toBeNull();
  });

  it("counts sessions and messages correctly", () => {
    const result = collectPi(fixtureDir);
    expect(result.summary.totalSessions).toBeGreaterThanOrEqual(1);
    expect(result.summary.totalMessages).toBe(2); // 2 user messages
  });

  it("aggregates tokens correctly", () => {
    const result = collectPi(fixtureDir);
    const tb = result.summary.tokenBreakdown;
    // input: 500 + 800 = 1300
    expect(tb.input).toBe(1300);
    // output: 200 + 300 = 500
    expect(tb.output).toBe(500);
    // cacheRead: 100 + 200 = 300
    expect(tb.cacheRead).toBe(300);
    // cacheWrite: 50 + 0 = 50
    expect(tb.cacheWrite).toBe(50);
  });

  it("uses pre-calculated costs", () => {
    const result = collectPi(fixtureDir);
    // cost: 0.012 + 0.018 = 0.030
    expect(result.summary.totalCost).toBeCloseTo(0.03, 6);
  });

  it("produces daily entries with correct date", () => {
    const result = collectPi(fixtureDir);
    expect(result.daily.length).toBeGreaterThanOrEqual(1);
    const day = result.daily.find((d) => d.date === "2025-09-01");
    expect(day).toBeDefined();
    expect(day.sessions).toBeGreaterThanOrEqual(1);
  });

  it("aggregates models correctly", () => {
    const result = collectPi(fixtureDir);
    expect(result.models.length).toBeGreaterThanOrEqual(1);
    const sonnet = result.models.find((m) => m.id === "claude-sonnet-4-5-20250929");
    expect(sonnet).toBeDefined();
    expect(sonnet.details.length).toBe(4);
  });

  it("extracts project from directory structure", () => {
    const result = collectPi(fixtureDir);
    const proj = result.projects.find((p) => p.name === "myproject");
    expect(proj).toBeDefined();
    expect(proj.cost).toBeGreaterThan(0);
  });

  it("has valid firstDate", () => {
    const result = collectPi(fixtureDir);
    expect(result.summary.firstDate).toBe("2025-09-01T00:00:00.000Z");
  });

  it("returns sorted models by cost descending", () => {
    const result = collectPi(fixtureDir);
    for (let i = 1; i < result.models.length; i++) {
      expect(result.models[i - 1].cost).toBeGreaterThanOrEqual(result.models[i].cost);
    }
  });
});

describe("collectPi with empty dir", () => {
  it("returns zero totals when no data", () => {
    const result = collectPi("/tmp/nonexistent-pi-test-dir");
    expect(result.summary.totalCost).toBe(0);
    expect(result.summary.totalSessions).toBe(0);
    expect(result.summary.totalMessages).toBe(0);
    expect(result.models).toEqual([]);
    expect(result.daily).toEqual([]);
  });
});
