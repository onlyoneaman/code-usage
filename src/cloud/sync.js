import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deleteAuth, readAuth } from "./auth.js";
import { uninstall as uninstallScheduler } from "./scheduler.js";
import { signRequest } from "./signing.js";

const HOME = homedir();
const USAGE_DATA_PATH = join(HOME, ".code-usage", "current", "openusage-data.json");
const SYNC_STATE_PATH = join(HOME, ".code-usage", "sync-state.json");

function getPackageVersion() {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Execute one sync cycle: preflight → read data → normalize → ingest.
 * The openusage-data.json file is the single source of truth —
 * we normalize it to records and upload to D1.
 */
export async function sync(options = {}) {
  const auth = readAuth();
  if (!auth || !auth.deviceId || !auth.deviceSecret || !auth.userId) {
    console.log("Not paired. Run `code-usage login` first.");
    return;
  }

  const apiBase = options.apiBase || auth.apiBase || "https://aicodeusage.com";
  const log = options.quiet ? () => {} : (msg) => console.log(msg);

  // Step 1: Preflight
  log("Checking policy...");
  const policy = await fetchPreflight(apiBase, auth);
  if (!policy) return;

  if (policy.effectivePolicy.accountPaused || policy.effectivePolicy.devicePaused) {
    log("Sync is paused by server policy. Skipping.");
    updateSyncState({ cachedPolicy: policy.effectivePolicy, lastPolicyFetchAt: new Date().toISOString() });
    return;
  }

  // Step 2: Read usage data (single source of truth)
  log("Reading usage data...");
  if (options.force && !existsSync(USAGE_DATA_PATH)) {
    log("No usage data found. Run `code-usage` first to collect data, then `code-usage sync`.");
    return;
  }

  let rawContent;
  let usageData;
  try {
    rawContent = readFileSync(USAGE_DATA_PATH, "utf8");
    usageData = JSON.parse(rawContent);
  } catch {
    log("Could not read usage data. Run `code-usage` first to collect data.");
    return;
  }

  // Step 3: Normalize to records
  log("Normalizing records...");
  const records = normalizeToRecords(usageData);
  if (records.length === 0) {
    log("No records to sync.");
    return;
  }

  // Step 4: Build envelope
  const datasetCreatedAt = usageData.metadata?.createdAt || new Date().toISOString();
  const datasetHash = sha256(rawContent);
  const batchId = computeBatchId(records, datasetCreatedAt, auth.userId);

  const providerStatuses = {};
  for (const p of usageData.metadata?.providers || []) {
    providerStatuses[p.key] = p.status || "unknown";
  }

  const envelope = {
    contractVersion: "1",
    normalizationVersion: "1",
    pricingVersion: getPackageVersion(),
    batchId,
    policyVersion: policy.policyVersion,
    source: {
      datasetCreatedAt,
      datasetHash,
      providerStatuses,
    },
    records,
  };

  // Step 5: POST ingest
  log(`Uploading ${records.length} records...`);
  const result = await postIngest(apiBase, auth, envelope);

  if (!result) return;

  if (result.duplicate) {
    log("Data already synced (no changes since last sync).");
  } else {
    log(`Synced ${result.recordsProcessed} records.`);
  }

  updateSyncState({
    lastSyncAt: new Date().toISOString(),
    lastBatchId: batchId,
    lastPolicyFetchAt: new Date().toISOString(),
    cachedPolicy: policy.effectivePolicy,
  });
}

/** Terminal state: device gone or revoked. Clean up everything. */
function cleanupTerminalState() {
  try {
    uninstallScheduler();
  } catch {
    /* non-fatal */
  }
  deleteAuth();
}

async function fetchPreflight(apiBase, auth) {
  const path = "/v0/policy/preflight";
  const headers = signRequest("GET", path, "", auth.deviceId, auth.deviceSecret);

  let res;
  try {
    res = await fetch(`${apiBase}${path}`, { method: "GET", headers });
  } catch (err) {
    console.error(`Network error during preflight: ${err.message}`);
    return null;
  }

  if (res.status === 410) {
    console.log("Device or account no longer exists. Removing credentials.");
    cleanupTerminalState();
    return null;
  }

  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    if (body.error === "device_revoked") {
      console.log("Device has been revoked. Removing credentials.");
      cleanupTerminalState();
    } else {
      console.error("Authentication failed. Try `code-usage logout` then `code-usage login`.");
    }
    return null;
  }

  if (!res.ok) {
    console.error(`Preflight failed: ${res.status} ${res.statusText}`);
    return null;
  }

  return res.json();
}

async function postIngest(apiBase, auth, envelope) {
  const path = "/v0/ingest/aggregates";
  const body = JSON.stringify(envelope);
  const headers = {
    ...signRequest("POST", path, body, auth.deviceId, auth.deviceSecret),
    "content-type": "application/json",
  };

  let res;
  try {
    res = await fetch(`${apiBase}${path}`, { method: "POST", headers, body });
  } catch (err) {
    console.error(`Network error during ingest: ${err.message}`);
    return null;
  }

  if (res.status === 409) {
    return { duplicate: true, ...(await res.json().catch(() => ({}))) };
  }

  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    if (body.error === "policy_mismatch") {
      console.log("Policy version mismatch. Retrying with fresh policy...");
      const freshPolicy = await fetchPreflight(apiBase, auth);
      if (!freshPolicy) return null;

      envelope.policyVersion = freshPolicy.policyVersion;
      return postIngest(apiBase, auth, envelope);
    }
    console.error(`Ingest forbidden: ${body.error || res.statusText}`);
    return null;
  }

  if (res.status === 410) {
    console.log("Device or account no longer exists. Removing credentials.");
    cleanupTerminalState();
    return null;
  }

  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    if (body.error === "device_revoked") {
      console.log("Device has been revoked. Removing credentials.");
      cleanupTerminalState();
    } else {
      console.error("Authentication failed during ingest.");
    }
    return null;
  }

  if (res.status === 413) {
    console.error("Payload too large. Skipping this batch.");
    return null;
  }

  if (!res.ok) {
    console.error(`Ingest failed: ${res.status} ${res.statusText}`);
    return null;
  }

  return res.json();
}

/**
 * Convert openusage-data.json format to contract records.
 * Produces provider_daily and project_daily records.
 */
export function normalizeToRecords(usageData) {
  const records = [];
  const providers = ["claude", "codex", "opencode", "amp", "pi"];

  for (const providerKey of providers) {
    const providerData = usageData[providerKey];
    if (!providerData) continue;

    // Provider daily records
    if (Array.isArray(providerData.daily)) {
      for (const day of providerData.daily) {
        if (!day.date) continue;
        const date = day.date.slice(0, 10); // YYYY-MM-DD

        const models = [];
        if (day.modelCosts && typeof day.modelCosts === "object") {
          for (const [modelId, modelCost] of Object.entries(day.modelCosts)) {
            models.push({
              id: modelId,
              costMicros: Math.round((Number(modelCost) || 0) * 1_000_000),
            });
          }
        }

        // Read actual per-day token data from collectors
        const t = day.tokens || {};
        const dayInput = t.input || 0;
        const dayOutput = t.output || 0;
        const dayCacheRead = t.cacheRead || 0;
        const dayCacheWrite = t.cacheWrite || 0;
        const dayReasoning = t.reasoning || 0;
        const dayCached = t.cached || 0;
        const dayTotal = t.total || dayInput + dayOutput + dayCacheRead + dayCacheWrite + dayReasoning + dayCached;

        records.push({
          recordType: "provider_daily",
          provider: providerKey,
          date,
          projectId: null,
          metrics: {
            sessions: day.sessions || 0,
            messages: day.messages || 0,
            costMicros: Math.round((day.cost || 0) * 1_000_000),
            totalTokens: dayTotal,
            outputTokens: dayOutput,
          },
          tokenBreakdown: {
            input: dayInput,
            output: dayOutput,
            cacheRead: dayCacheRead + dayCached,
            cacheWrite: dayCacheWrite,
            reasoning: dayReasoning,
            other: 0,
          },
          models,
        });
      }
    }

    // Project daily records
    if (Array.isArray(providerData.projects)) {
      for (const project of providerData.projects) {
        if (!project.path) continue;
        // Use the directory name as-is — no hashing
        const projectName = project.name || project.path.split("/").filter(Boolean).pop() || project.path;
        const projectId = projectName.slice(0, 128);

        if (Array.isArray(project.daily)) {
          for (const day of project.daily) {
            if (!day.date) continue;
            const date = day.date.slice(0, 10);

            records.push({
              recordType: "project_daily",
              provider: providerKey,
              date,
              projectId,
              projectName,
              metrics: {
                sessions: day.sessions || 0,
                messages: day.messages || 0,
                costMicros: Math.round((day.cost || 0) * 1_000_000),
                totalTokens: 0,
                outputTokens: 0,
              },
              tokenBreakdown: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                reasoning: 0,
                other: 0,
              },
              models: [],
            });
          }
        }
      }
    }
  }

  return records;
}

export function computeBatchId(records, datasetCreatedAt, userId) {
  const canonical = JSON.stringify(records) + datasetCreatedAt + userId;
  return sha256(canonical);
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function updateSyncState(updates) {
  let state = {};
  if (existsSync(SYNC_STATE_PATH)) {
    try {
      state = JSON.parse(readFileSync(SYNC_STATE_PATH, "utf8"));
    } catch {
      // Reset corrupt state
    }
  }
  Object.assign(state, updates);
  mkdirSync(dirname(SYNC_STATE_PATH), { recursive: true });
  writeFileSync(SYNC_STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}
