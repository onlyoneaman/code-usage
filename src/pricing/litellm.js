// Shared LiteLLM pricing fallback — bundled, no network calls
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let cache = null;

function loadData() {
  if (cache !== null) return cache;
  try {
    cache = JSON.parse(readFileSync(join(__dirname, 'litellm-data.json'), 'utf8'));
  } catch {
    cache = {};
  }
  return cache;
}

/**
 * Look up a model in LiteLLM bundled pricing.
 * Returns per-MTok pricing { input, output, cacheRead, cacheWrite } or null.
 */
export function litellmLookup(modelId, prefixes) {
  const db = loadData();
  prefixes = prefixes || ['anthropic/', 'anthropic.', 'openai/', 'openai.', 'azure/', 'azure.'];

  const keys = new Set([modelId]);
  for (const prefix of prefixes) {
    keys.add(prefix + modelId);
    if (prefix.endsWith('/')) keys.add(`${prefix.slice(0, -1)}.${modelId}`);
    if (prefix.endsWith('.')) keys.add(`${prefix.slice(0, -1)}/${modelId}`);
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
