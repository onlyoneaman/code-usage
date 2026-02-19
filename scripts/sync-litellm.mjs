#!/usr/bin/env node
// Fetch LiteLLM pricing from GitHub and create a minified bundle
// Usage: node scripts/sync-litellm.mjs

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "pricing", "litellm-data.json");
const URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const COST_KEYS = [
  "input_cost_per_token",
  "output_cost_per_token",
  "cache_read_input_token_cost",
  "cache_creation_input_token_cost",
];

console.log("Fetching LiteLLM pricing...");
const res = await fetch(URL);
if (!res.ok) {
  console.error(`Fetch failed: ${res.status}`);
  process.exit(1);
}
const data = await res.json();

const slim = {};
let total = 0,
  kept = 0;
for (const [model, info] of Object.entries(data)) {
  if (typeof info !== "object" || !info) continue;
  total++;
  const entry = {};
  let has = false;
  for (const k of COST_KEYS) {
    if (info[k]) {
      entry[k] = info[k];
      has = true;
    }
  }
  if (has) {
    slim[model] = entry;
    kept++;
  }
}

const out = JSON.stringify(slim);
writeFileSync(OUT, out);

console.log(`Models: ${total} total, ${kept} with pricing`);
console.log(`Size: ${(out.length / 1024).toFixed(0)} KB`);
console.log(`Wrote ${OUT}`);
