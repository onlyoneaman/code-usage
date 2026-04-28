// Shared LiteLLM pricing — bundled snapshot + opportunistic 24h refresh.
//
// Resolution order on read:
//   1. ~/.code-usage/cache/litellm.json (refreshed in the background)
//   2. Bundled snapshot at src/pricing/litellm-data.json
//
// Refresh is triggered explicitly via ensureFresh() from the CLI entry point;
// importing this module performs no network I/O.

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLED_PATH = join(__dirname, "litellm-data.json");
const CACHE_DIR = join(homedir(), ".code-usage", "cache");
const CACHE_PATH = join(CACHE_DIR, "litellm.json");
const SOURCE_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const COST_KEYS = [
  "input_cost_per_token",
  "output_cost_per_token",
  "cache_read_input_token_cost",
  "cache_creation_input_token_cost",
];
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FETCH_TIMEOUT_MS = 3000;

let cache = null;
let freshPromise = null;

function loadData() {
  if (cache !== null) return cache;
  for (const path of [CACHE_PATH, BUNDLED_PATH]) {
    try {
      cache = JSON.parse(readFileSync(path, "utf8"));
      return cache;
    } catch {
      // try next source
    }
  }
  cache = {};
  return cache;
}

/**
 * Look up a model in LiteLLM pricing data.
 * Returns per-MTok pricing { input, output, cacheRead, cacheWrite } or null.
 *
 * BerriAI drops the bare key for older Anthropic models (e.g. claude-3-5-haiku-20241022)
 * and only retains the Bedrock-style `anthropic.<id>-v1:0`. We probe that shape too.
 */
export function litellmLookup(modelId, prefixes) {
  const db = loadData();
  prefixes = prefixes || ["anthropic/", "anthropic.", "openai/", "openai.", "azure/", "azure."];

  const keys = new Set([modelId]);
  for (const prefix of prefixes) {
    keys.add(prefix + modelId);
    if (prefix.endsWith("/")) keys.add(`${prefix.slice(0, -1)}.${modelId}`);
    if (prefix.endsWith(".")) keys.add(`${prefix.slice(0, -1)}/${modelId}`);
    // Bedrock notation for Anthropic legacy models: `anthropic.<id>-v1:0`
    if (prefix === "anthropic.") {
      keys.add(`${prefix}${modelId}-v1:0`);
      keys.add(`bedrock/${prefix}${modelId}-v1:0`);
      keys.add(`us.${prefix}${modelId}-v1:0`);
    }
  }
  for (const key of keys) {
    if (db[key]) return toMTok(db[key]);
  }

  return null;
}

function toMTok(entry) {
  if (!entry) return null;
  const M = 1e6;
  return {
    input: (entry.input_cost_per_token || 0) * M,
    output: (entry.output_cost_per_token || 0) * M,
    cacheRead: (entry.cache_read_input_token_cost || 0) * M,
    cacheWrite: (entry.cache_creation_input_token_cost || 0) * M,
  };
}

function isFresh(path, ttlMs) {
  try {
    return Date.now() - statSync(path).mtimeMs < ttlMs;
  } catch {
    return false;
  }
}

function slim(raw) {
  const out = {};
  for (const [model, info] of Object.entries(raw)) {
    if (!info || typeof info !== "object") continue;
    const entry = {};
    let has = false;
    for (const k of COST_KEYS) {
      if (info[k]) {
        entry[k] = info[k];
        has = true;
      }
    }
    if (has) out[model] = entry;
  }
  return out;
}

/**
 * Refresh the LiteLLM pricing cache from BerriAI's repo if older than `ttlMs`.
 * Always resolves; never throws. Returns true if a refresh actually wrote new data.
 *
 * Safe to call from multiple code paths — the in-flight fetch is memoized.
 */
export async function ensureFresh({
  ttlMs = DEFAULT_TTL_MS,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  log = () => {},
} = {}) {
  if (freshPromise) return freshPromise;
  if (isFresh(CACHE_PATH, ttlMs)) return false;
  freshPromise = doRefresh({ timeoutMs, log }).finally(() => {
    freshPromise = null;
  });
  return freshPromise;
}

async function doRefresh({ timeoutMs, log }) {
  try {
    const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const compact = slim(raw);
    const count = Object.keys(compact).length;
    if (count === 0) throw new Error("empty response");

    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    const tmp = `${CACHE_PATH}.tmp.${process.pid}`;
    writeFileSync(tmp, JSON.stringify(compact));
    renameSync(tmp, CACHE_PATH);
    cache = null; // force re-read on next lookup
    log(`Refreshed LiteLLM pricing (${count} models)\n`);
    return true;
  } catch (err) {
    log(`LiteLLM refresh skipped: ${err.message}\n`);
    return false;
  }
}
