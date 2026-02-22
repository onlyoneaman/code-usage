import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectAmp } from "../../src/collectors/amp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, "..", "fixtures", "amp", "threads");

describe("collectAmp", () => {
  const origEnv = process.env.AMP_DATA_DIR;

  beforeEach(() => {
    process.env.AMP_DATA_DIR = fixtureDir;
  });

  afterEach(() => {
    if (origEnv === undefined) delete process.env.AMP_DATA_DIR;
    else process.env.AMP_DATA_DIR = origEnv;
  });

  it("returns correct provider metadata", () => {
    const result = collectAmp();
    expect(result.provider).toBe("amp");
    expect(result.badge).toBe("Amp");
    expect(result.accent).toBe("#E8430B");
    expect(result.extra).toBeNull();
  });

  it("counts sessions and messages correctly", () => {
    const result = collectAmp();
    expect(result.summary.totalSessions).toBe(1); // 1 thread
    expect(result.summary.totalMessages).toBe(2); // 2 user messages
  });

  it("aggregates tokens correctly", () => {
    const result = collectAmp();
    const tb = result.summary.tokenBreakdown;
    // input: 100 + 200 = 300
    expect(tb.input).toBe(300);
    // output: 50 + 100 = 150
    expect(tb.output).toBe(150);
    // cacheRead: 200 (msg id=1) + 600 (msg id=3) = 800
    expect(tb.cacheRead).toBe(800);
    // cacheWrite: 500 (msg id=1) + 0 (msg id=3) = 500
    expect(tb.cacheWrite).toBe(500);
  });

  it("computes cost from credits (1:1)", () => {
    const result = collectAmp();
    // credits: 1.5 + 2.0 = 3.5 (1 credit = $1)
    expect(result.summary.totalCost).toBeCloseTo(3.5, 6);
  });

  it("produces daily entries with correct date", () => {
    const result = collectAmp();
    expect(result.daily.length).toBe(1);
    expect(result.daily[0].date).toBe("2025-08-20");
    expect(result.daily[0].sessions).toBe(1);
    expect(result.daily[0].messages).toBe(2);
  });

  it("aggregates models correctly", () => {
    const result = collectAmp();
    expect(result.models.length).toBe(1);
    expect(result.models[0].id).toBe("claude-haiku-4-5-20251001");
    expect(result.models[0].details.length).toBe(4);
  });

  it("returns sorted models by cost descending", () => {
    const result = collectAmp();
    for (let i = 1; i < result.models.length; i++) {
      expect(result.models[i - 1].cost).toBeGreaterThanOrEqual(result.models[i].cost);
    }
  });

  it("has valid firstDate", () => {
    const result = collectAmp();
    expect(result.summary.firstDate).toBe("2025-08-20T00:00:00.000Z");
  });

  it("applies cutoffDate before aggregation", () => {
    const result = collectAmp(fixtureDir, { cutoffDate: "2025-08-21" });
    expect(result.summary.totalCost).toBe(0);
    expect(result.summary.totalSessions).toBe(0);
    expect(result.summary.totalMessages).toBe(0);
    expect(result.models).toEqual([]);
    expect(result.daily).toEqual([]);
  });
});

describe("collectAmp with empty dir", () => {
  const origEnv = process.env.AMP_DATA_DIR;

  beforeEach(() => {
    process.env.AMP_DATA_DIR = "/tmp/nonexistent-amp-test-dir";
  });

  afterEach(() => {
    if (origEnv === undefined) delete process.env.AMP_DATA_DIR;
    else process.env.AMP_DATA_DIR = origEnv;
  });

  it("returns zero totals when no data", () => {
    const result = collectAmp();
    expect(result.summary.totalCost).toBe(0);
    expect(result.summary.totalSessions).toBe(0);
    expect(result.summary.totalMessages).toBe(0);
    expect(result.models).toEqual([]);
    expect(result.daily).toEqual([]);
  });
});
