import { describe, expect, it } from "vitest";
import { computeBatchId, normalizeToRecords } from "../../src/cloud/sync.js";

describe("normalizeToRecords", () => {
  it("returns empty array for empty data", () => {
    expect(normalizeToRecords({})).toEqual([]);
  });

  it("returns empty array when providers have no daily data", () => {
    const data = { claude: { daily: [] }, codex: {} };
    expect(normalizeToRecords(data)).toEqual([]);
  });

  it("produces provider_daily records from daily data", () => {
    const data = {
      claude: {
        daily: [
          {
            date: "2025-02-20T00:00:00.000Z",
            sessions: 3,
            messages: 12,
            cost: 1.5,
            tokens: { input: 1000, output: 500, cacheRead: 200, cacheWrite: 100, reasoning: 50 },
            modelCosts: { "claude-opus-4-6": 1.2, "claude-sonnet-4-6": 0.3 },
          },
        ],
      },
    };

    const records = normalizeToRecords(data);
    expect(records).toHaveLength(1);

    const r = records[0];
    expect(r.recordType).toBe("provider_daily");
    expect(r.provider).toBe("claude");
    expect(r.date).toBe("2025-02-20");
    expect(r.projectId).toBeNull();
    expect(r.metrics.sessions).toBe(3);
    expect(r.metrics.messages).toBe(12);
    expect(r.metrics.costMicros).toBe(1_500_000);
    expect(r.metrics.totalTokens).toBe(1850); // 1000+500+200+100+50
    expect(r.metrics.outputTokens).toBe(500);
    expect(r.tokenBreakdown.input).toBe(1000);
    expect(r.tokenBreakdown.output).toBe(500);
    expect(r.tokenBreakdown.cacheRead).toBe(200); // cacheRead + cached(0)
    expect(r.tokenBreakdown.cacheWrite).toBe(100);
    expect(r.tokenBreakdown.reasoning).toBe(50);
    expect(r.models).toHaveLength(2);
    expect(r.models[0].id).toBe("claude-opus-4-6");
    expect(r.models[0].costMicros).toBe(1_200_000);
  });

  it("produces project_daily records from project data", () => {
    const data = {
      codex: {
        daily: [],
        projects: [
          {
            path: "/home/user/my-project",
            name: "my-project",
            daily: [{ date: "2025-02-21", sessions: 2, messages: 5, cost: 0.75 }],
          },
        ],
      },
    };

    const records = normalizeToRecords(data);
    expect(records).toHaveLength(1);

    const r = records[0];
    expect(r.recordType).toBe("project_daily");
    expect(r.provider).toBe("codex");
    expect(r.date).toBe("2025-02-21");
    expect(r.projectId).toBe("my-project");
    expect(r.projectName).toBe("my-project");
    expect(r.metrics.sessions).toBe(2);
    expect(r.metrics.messages).toBe(5);
    expect(r.metrics.costMicros).toBe(750_000);
  });

  it("skips entries without date", () => {
    const data = {
      claude: {
        daily: [
          { sessions: 1, messages: 1, cost: 0 },
          { date: "2025-01-01", sessions: 1, messages: 1, cost: 0 },
        ],
      },
    };

    const records = normalizeToRecords(data);
    expect(records).toHaveLength(1);
    expect(records[0].date).toBe("2025-01-01");
  });

  it("skips projects without path", () => {
    const data = {
      amp: {
        projects: [
          { daily: [{ date: "2025-01-01", sessions: 1, messages: 1, cost: 0 }] },
          { path: "/foo/bar", daily: [{ date: "2025-01-01", sessions: 1, messages: 1, cost: 0 }] },
        ],
      },
    };

    const records = normalizeToRecords(data);
    expect(records).toHaveLength(1);
    expect(records[0].projectId).toBe("bar");
  });

  it("handles all supported providers", () => {
    const data = {};
    for (const provider of ["claude", "codex", "opencode", "amp", "pi"]) {
      data[provider] = {
        daily: [{ date: "2025-01-01", sessions: 1, messages: 1, cost: 0.1 }],
      };
    }

    const records = normalizeToRecords(data);
    expect(records).toHaveLength(5);
    const providers = records.map((r) => r.provider);
    expect(providers).toContain("claude");
    expect(providers).toContain("codex");
    expect(providers).toContain("opencode");
    expect(providers).toContain("amp");
    expect(providers).toContain("pi");
  });

  it("ignores unknown providers", () => {
    const data = {
      unknown_tool: {
        daily: [{ date: "2025-01-01", sessions: 1, messages: 1, cost: 0 }],
      },
    };

    expect(normalizeToRecords(data)).toEqual([]);
  });

  it("truncates date to YYYY-MM-DD", () => {
    const data = {
      claude: {
        daily: [{ date: "2025-06-15T14:30:00.000Z", sessions: 1, messages: 1, cost: 0 }],
      },
    };

    const records = normalizeToRecords(data);
    expect(records[0].date).toBe("2025-06-15");
  });

  it("truncates long project names to 128 chars", () => {
    const longName = "a".repeat(200);
    const data = {
      claude: {
        projects: [
          {
            path: `/foo/${longName}`,
            name: longName,
            daily: [{ date: "2025-01-01", sessions: 1, messages: 1, cost: 0 }],
          },
        ],
      },
    };

    const records = normalizeToRecords(data);
    expect(records[0].projectId.length).toBe(128);
  });

  it("merges cached into cacheRead in tokenBreakdown", () => {
    const data = {
      claude: {
        daily: [
          {
            date: "2025-01-01",
            sessions: 1,
            messages: 1,
            cost: 0,
            tokens: { input: 100, output: 50, cacheRead: 30, cached: 20 },
          },
        ],
      },
    };

    const records = normalizeToRecords(data);
    expect(records[0].tokenBreakdown.cacheRead).toBe(50); // 30 + 20
  });

  it("uses total from tokens if provided", () => {
    const data = {
      claude: {
        daily: [
          {
            date: "2025-01-01",
            sessions: 1,
            messages: 1,
            cost: 0,
            tokens: { input: 100, output: 50, total: 999 },
          },
        ],
      },
    };

    const records = normalizeToRecords(data);
    expect(records[0].metrics.totalTokens).toBe(999);
  });
});

describe("computeBatchId", () => {
  it("returns a hex string", () => {
    const id = computeBatchId([], "2025-01-01T00:00:00Z", "user123");
    expect(id).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic for same inputs", () => {
    const records = [{ recordType: "provider_daily", provider: "claude", date: "2025-01-01" }];
    const a = computeBatchId(records, "2025-01-01T00:00:00Z", "user1");
    const b = computeBatchId(records, "2025-01-01T00:00:00Z", "user1");
    expect(a).toBe(b);
  });

  it("differs for different users", () => {
    const records = [{ recordType: "provider_daily" }];
    const a = computeBatchId(records, "2025-01-01T00:00:00Z", "user1");
    const b = computeBatchId(records, "2025-01-01T00:00:00Z", "user2");
    expect(a).not.toBe(b);
  });

  it("differs for different records", () => {
    const a = computeBatchId([{ x: 1 }], "2025-01-01T00:00:00Z", "user1");
    const b = computeBatchId([{ x: 2 }], "2025-01-01T00:00:00Z", "user1");
    expect(a).not.toBe(b);
  });

  it("differs for different timestamps", () => {
    const records = [{ x: 1 }];
    const a = computeBatchId(records, "2025-01-01T00:00:00Z", "user1");
    const b = computeBatchId(records, "2025-01-02T00:00:00Z", "user1");
    expect(a).not.toBe(b);
  });
});
