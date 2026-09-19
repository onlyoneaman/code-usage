import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  accumulateTurn,
  collectCodex,
  detectRewrittenBurst,
  emptyBucket,
  turnUsage,
} from "../../src/collectors/codex.js";
import { getCodexPricing } from "../../src/pricing/codex.js";
import { codexCost } from "../../src/pricing/cost.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/codex/", import.meta.url));
const LEGACY = join(FIXTURES, "sessions");
const MODERN = join(FIXTURES, "modern");
const UNKNOWN = join(FIXTURES, "unknown-model");

function bucket(turns) {
  const b = { standard: emptyBucket(), priority: emptyBucket() };
  for (const [turn, tier] of turns) accumulateTurn(b, turn, tier);
  return b;
}

describe("collectCodex", () => {
  it("returns provider metadata and output shape", async () => {
    const result = await collectCodex({ sessionDirs: [LEGACY] });
    expect(result.provider).toBe("codex");
    expect(result.badge).toBe("Codex Pro");
    expect(result.accent).toBe("#7385FE");
    expect(result.extra).toBeNull();
    expect(result.summary).toMatchObject({ totalCost: expect.any(Number), streak: expect.any(Number) });
    expect(result.summary.tokenBreakdown).toEqual(expect.objectContaining({ input: expect.any(Number) }));
    expect(Array.isArray(result.models)).toBe(true);
    expect(Array.isArray(result.daily)).toBe(true);
    expect(Array.isArray(result.projects)).toBe(true);
    expect(result.diagnostics).toEqual({ files: 1, skippedFiles: 0, unknownModelTurns: 0 });
  });

  it("still reads legacy rollouts whose model lives in session_meta", async () => {
    const result = await collectCodex({ sessionDirs: [LEGACY] });
    expect(result.models.map((m) => m.id)).toEqual(["gpt-5.1-codex"]);
    expect(result.daily).toHaveLength(1);
    expect(result.daily[0]).toMatchObject({ date: "2025-07-10", sessions: 1, messages: 2 });
    // Turn 1 is the first total (500 in / 200 out); turn 2 is the delta (700 in / 400 out).
    expect(result.daily[0].tokens).toEqual({ input: 900, output: 600, cached: 300, reasoning: 100, total: 1800 });
    expect(result.summary.totalTokens).toBe(1800);
    expect(result.summary.totalSessions).toBe(1);
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]).toMatchObject({ name: "project", path: "/home/user/project", sessions: 1, messages: 2 });
  });

  it("takes each turn's model from turn_context instead of defaulting", async () => {
    const result = await collectCodex({ sessionDirs: [MODERN] });
    expect(result.models.map((m) => m.id).sort()).toEqual(["gpt-5.6-sol", "gpt-6-astra"]);
    expect(result.diagnostics.unknownModelTurns).toBe(0);
  });

  it("dates every turn by its own timestamp, not the session start", async () => {
    const result = await collectCodex({ sessionDirs: [MODERN] });
    expect(result.daily.map((d) => d.date)).toEqual(["2026-09-15", "2026-09-16"]);
    const [d15, d16] = result.daily;
    expect(d15.tokens).toEqual({ input: 200, output: 100, cached: 800, reasoning: 40, total: 1100 });
    expect(d15.models).toEqual(["gpt-5.6-sol"]);
    expect(d15).toMatchObject({ sessions: 1, messages: 1 });
    // Duplicate token_count at 00:12:01 contributes nothing.
    expect(d16.tokens).toEqual({ input: 500, output: 250, cached: 2000, reasoning: 70, total: 2750 });
    expect(d16.models).toEqual(["gpt-6-astra"]);
    expect(d16).toMatchObject({ sessions: 1, messages: 1 });
    expect(result.summary.totalSessions).toBe(1);
    expect(result.summary.totalTokens).toBe(3850);
  });

  it("prices turns per model and applies the priority tier from thread settings", async () => {
    const result = await collectCodex({ sessionDirs: [MODERN] });
    const sol = getCodexPricing("gpt-5.6-sol");
    const astra = getCodexPricing("gpt-6-astra");
    const sol15 = bucket([[{ input_tokens: 1000, cached_input_tokens: 800, output_tokens: 100 }, null]]);
    const astra16 = bucket([
      [{ input_tokens: 2000, cached_input_tokens: 1600, output_tokens: 200 }, null],
      [{ input_tokens: 500, cached_input_tokens: 400, output_tokens: 50 }, "priority"],
    ]);
    const expected15 = codexCost(sol15.standard, sol, null);
    const expected16 = codexCost(astra16.standard, astra, null) + codexCost(astra16.priority, astra, "priority");
    expect(result.daily[0].cost).toBeCloseTo(expected15, 10);
    expect(result.daily[1].cost).toBeCloseTo(expected16, 10);
    expect(result.daily[1].modelCosts).toEqual({ "gpt-6-astra": expect.closeTo(expected16, 10) });
    expect(result.summary.totalCost).toBeCloseTo(expected15 + expected16, 10);
    const byId = Object.fromEntries(result.models.map((m) => [m.id, m]));
    expect(byId["gpt-5.6-sol"].cost).toBeCloseTo(expected15, 10);
    expect(byId["gpt-6-astra"].cost).toBeCloseTo(expected16, 10);
  });

  it("splits project usage by day as well", async () => {
    const result = await collectCodex({ sessionDirs: [MODERN] });
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].daily.map((d) => d.date)).toEqual(["2026-09-15", "2026-09-16"]);
    expect(result.projects[0].sessions).toBe(1);
  });

  it("labels turns with no model anywhere as unknown and counts them", async () => {
    const result = await collectCodex({ sessionDirs: [UNKNOWN] });
    expect(result.models.map((m) => m.id)).toEqual(["unknown"]);
    expect(result.diagnostics.unknownModelTurns).toBe(1);
    expect(result.summary.totalCost).toBeGreaterThan(0);
  });

  it("applies cutoffDate per turn", async () => {
    const result = await collectCodex({ sessionDirs: [MODERN], cutoffDate: "2026-09-16" });
    expect(result.daily.map((d) => d.date)).toEqual(["2026-09-16"]);
    expect(result.summary.totalTokens).toBe(2750);
    expect(result.summary.totalSessions).toBe(1);
  });

  it("returns an empty result when everything is before the cutoff", async () => {
    const result = await collectCodex({ sessionDirs: [MODERN, LEGACY], cutoffDate: "2999-01-01" });
    expect(result.summary.totalCost).toBe(0);
    expect(result.summary.totalSessions).toBe(0);
    expect(result.models).toEqual([]);
    expect(result.daily).toEqual([]);
  });

  it("scans several source directories and sorts models by cost", async () => {
    const result = await collectCodex({ sessionDirs: [MODERN, LEGACY, UNKNOWN] });
    expect(result.diagnostics.files).toBe(3);
    for (let i = 1; i < result.models.length; i++) {
      expect(result.models[i - 1].cost).toBeGreaterThanOrEqual(result.models[i].cost);
    }
    for (let i = 1; i < result.daily.length; i++) {
      expect(result.daily[i - 1].date <= result.daily[i].date).toBe(true);
    }
  });

  it("does not choke on a line longer than the default stream chunk", async () => {
    const dir = mkdtempSync(join(tmpdir(), "codex-long-"));
    const big = JSON.stringify({ type: "world_state", payload: { state: { text: "x".repeat(3 * 1024 * 1024) } } });
    const lines = [
      JSON.stringify({
        timestamp: "2026-09-02T10:00:00.000Z",
        type: "session_meta",
        payload: { timestamp: "2026-09-02T10:00:00.000Z", cwd: "/p" },
      }),
      big,
      JSON.stringify({
        timestamp: "2026-09-02T10:01:00.000Z",
        type: "turn_context",
        payload: { model: "gpt-5.6-sol" },
      }),
      JSON.stringify({
        timestamp: "2026-09-02T10:02:00.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: { input_tokens: 10, output_tokens: 5 },
            last_token_usage: { input_tokens: 10, output_tokens: 5 },
          },
        },
      }),
    ];
    writeFileSync(join(dir, "rollout-2026-09-02T10-00-00-big.jsonl"), `${lines.join("\n")}\n`);
    const result = await collectCodex({ sessionDirs: [dir] });
    expect(result.summary.totalTokens).toBe(15);
    expect(result.models.map((m) => m.id)).toEqual(["gpt-5.6-sol"]);
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
      reasoning_output_tokens: 0,
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

describe("detectRewrittenBurst", () => {
  const ev = (ts, hasUsage = true) => ({ ts, hasUsage });

  it("flags a file whose first two usage events are written back to back", () => {
    expect(detectRewrittenBurst([ev(1000), ev(1000), ev(20000)])).toBe(2000);
  });

  it("ignores a session that pauses between its first two turns", () => {
    expect(detectRewrittenBurst([ev(1000), ev(8000), ev(15000)])).toBeNull();
  });

  it("treats a burst straddling the pause boundary as replayed", () => {
    expect(detectRewrittenBurst([ev(1000), ev(1999)])).toBe(2000);
  });

  it("skips non-usage lines when locating the first two events", () => {
    expect(detectRewrittenBurst([ev(500, false), ev(1000), ev(1010)])).toBe(2000);
  });

  it("returns null when the file has fewer than two usage events", () => {
    expect(detectRewrittenBurst([ev(1000)])).toBeNull();
    expect(detectRewrittenBurst([])).toBeNull();
  });
});
