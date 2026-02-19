// OpenCode model pricing
// Chain: 1) ~/.cache/opencode/models.json → 2) LiteLLM → 3) $0
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { litellmLookup } from "./litellm.js";

const MODEL_ALIASES = {
  "gemini-3-pro-high": "gemini-3-pro-preview",
};

let modelsCache = null;

function loadModelsCache() {
  if (modelsCache) return modelsCache;
  const cachePath = join(homedir(), ".cache", "opencode", "models.json");
  if (!existsSync(cachePath)) {
    modelsCache = {};
    return modelsCache;
  }
  try {
    const raw = JSON.parse(readFileSync(cachePath, "utf8"));
    const flat = {};
    for (const provider of Object.values(raw)) {
      for (const [id, m] of Object.entries(provider.models || {})) {
        if (m.cost) flat[id] = m.cost;
      }
    }
    modelsCache = flat;
  } catch {
    modelsCache = {};
  }
  return modelsCache;
}

const ZERO = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 };

export function getOpencodePricing(modelId) {
  const resolved = MODEL_ALIASES[modelId] || modelId;

  // 1. OpenCode models.json — authoritative
  const cache = loadModelsCache();
  const c = cache[resolved];
  if (c) {
    return {
      input: c.input || 0,
      output: c.output || 0,
      cacheRead: c.cache_read || 0,
      cacheWrite: c.cache_write || 0,
      reasoning: c.reasoning || c.output || 0,
    };
  }

  // 2. LiteLLM fallback
  const lm = litellmLookup(resolved);
  if (lm) return { ...lm, reasoning: lm.output || 0 };

  return ZERO;
}
