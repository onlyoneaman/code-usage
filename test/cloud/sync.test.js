import { describe, expect, it } from "vitest";
import {
  buildEnvelopes,
  computeBatchId,
  normalizeToRecords,
  splitRecordsIntoChunks,
  summarizeProviders,
} from "../../src/cloud/sync.js";

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

  it("differs for different chunk indexes and defaults to index 0", () => {
    const records = [{ x: 1 }];
    const a = computeBatchId(records, "2025-01-01T00:00:00Z", "user1");
    const b = computeBatchId(records, "2025-01-01T00:00:00Z", "user1", 1);
    expect(a).toBe(computeBatchId(records, "2025-01-01T00:00:00Z", "user1", 0));
    expect(a).not.toBe(b);
  });
});

function makeRecord(i) {
  return {
    recordType: "provider_daily",
    provider: "claude",
    date: `2025-01-${String((i % 28) + 1).padStart(2, "0")}`,
    projectId: null,
    metrics: { sessions: i, messages: i * 3, costMicros: i * 1000, totalTokens: i * 100, outputTokens: i },
    tokenBreakdown: { input: i, output: i, cacheRead: 0, cacheWrite: 0, reasoning: 0, other: 0 },
    models: [{ id: "claude-opus-4-6", costMicros: i * 1000 }],
  };
}

function bodyBytes(base, records) {
  return Buffer.byteLength(JSON.stringify({ ...base, records }));
}

describe("splitRecordsIntoChunks", () => {
  it("returns no chunks for no records", () => {
    expect(splitRecordsIntoChunks([], 1000, 100)).toEqual([]);
  });

  it("keeps everything in one chunk when it fits", () => {
    const records = [makeRecord(1), makeRecord(2)];
    expect(splitRecordsIntoChunks(records, 100_000, 100)).toEqual([records]);
  });

  it("keeps every serialized envelope at or under maxBytes and preserves order", () => {
    const records = Array.from({ length: 200 }, (_, i) => makeRecord(i));
    const base = { batchId: "x".repeat(64), source: { a: 1 }, records: [] };
    const overhead = bodyBytes(base, []);
    const maxBytes = overhead + 1500;

    const chunks = splitRecordsIntoChunks(records, maxBytes, overhead);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(0);
      expect(bodyBytes(base, chunk)).toBeLessThanOrEqual(maxBytes);
    }
    expect(chunks.flat()).toEqual(records);
  });

  it("packs greedily: adding the next record to any chunk would exceed maxBytes", () => {
    const records = Array.from({ length: 50 }, (_, i) => makeRecord(i));
    const base = { records: [] };
    const overhead = bodyBytes(base, []);
    const maxBytes = overhead + 1000;

    const chunks = splitRecordsIntoChunks(records, maxBytes, overhead);
    for (let i = 0; i < chunks.length - 1; i++) {
      expect(bodyBytes(base, [...chunks[i], chunks[i + 1][0]])).toBeGreaterThan(maxBytes);
    }
  });

  it("never splits a single record even when it exceeds maxBytes", () => {
    const big = makeRecord(1);
    expect(splitRecordsIntoChunks([big, makeRecord(2)], 10, 5)).toEqual([[big], [makeRecord(2)]]);
  });
});

describe("summarizeProviders", () => {
  it("builds statuses and diagnostics keyed by provider", () => {
    const providers = [
      { key: "claude", status: "success", durationMs: 1200, error: null, diagnostics: { files: 10, skippedFiles: 1 } },
      { key: "codex", status: "failed", durationMs: 30000, error: "timed out after 30000ms" },
      { key: "amp" },
    ];
    expect(summarizeProviders(providers)).toEqual({
      providerStatuses: { claude: "success", codex: "failed", amp: "unknown" },
      providerDiagnostics: {
        claude: { status: "success", durationMs: 1200, error: null, files: 10, skippedFiles: 1 },
        codex: { status: "failed", durationMs: 30000, error: "timed out after 30000ms" },
        amp: { status: "unknown", durationMs: 0, error: null },
      },
    });
  });

  it("returns empty maps when metadata has no providers", () => {
    expect(summarizeProviders(undefined)).toEqual({ providerStatuses: {}, providerDiagnostics: {} });
  });
});

describe("buildEnvelopes", () => {
  const usageData = {
    metadata: {
      createdAt: "2025-03-01T00:00:00.000Z",
      providers: [{ key: "claude", status: "success", durationMs: 5, error: null, diagnostics: { files: 3 } }],
    },
  };

  it("produces one envelope when records fit", () => {
    const records = [makeRecord(1)];
    const envelopes = buildEnvelopes({ usageData, rawContent: "{}", records, policyVersion: 1, userId: "u1" });
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0].records).toEqual(records);
    expect(envelopes[0].policyVersion).toBe(1);
    expect(envelopes[0].batchId).toBe(computeBatchId(records, "2025-03-01T00:00:00.000Z", "u1", 0));
  });

  it("splits into size-bounded envelopes with distinct batch ids and shared source metadata", () => {
    const records = Array.from({ length: 300 }, (_, i) => makeRecord(i));
    const maxBytes = 4000;
    const envelopes = buildEnvelopes({
      usageData,
      rawContent: "{}",
      records,
      policyVersion: 2,
      userId: "u1",
      maxBytes,
    });

    expect(envelopes.length).toBeGreaterThan(1);
    expect(envelopes.flatMap((e) => e.records)).toEqual(records);
    expect(new Set(envelopes.map((e) => e.batchId)).size).toBe(envelopes.length);
    envelopes.forEach((envelope, index) => {
      expect(Buffer.byteLength(JSON.stringify(envelope))).toBeLessThanOrEqual(maxBytes);
      expect(envelope.batchId).toBe(computeBatchId(envelope.records, "2025-03-01T00:00:00.000Z", "u1", index));
      expect(envelope.source.datasetCreatedAt).toBe("2025-03-01T00:00:00.000Z");
      expect(envelope.source.providerStatuses).toEqual({ claude: "success" });
      expect(envelope.source.providerDiagnostics).toEqual({
        claude: { status: "success", durationMs: 5, error: null, files: 3 },
      });
    });
  });
});
