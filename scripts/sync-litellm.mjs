#!/usr/bin/env node
// Fetch LiteLLM pricing from GitHub and create a minified bundle
// Usage: node scripts/sync-litellm.mjs

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { slim as slimEntries } from "../src/pricing/litellm.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "pricing", "litellm-data.json");
const URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

console.log("Fetching LiteLLM pricing...");
const res = await fetch(URL);
if (!res.ok) {
  console.error(`Fetch failed: ${res.status}`);
  process.exit(1);
}
const data = await res.json();

const slim = slimEntries(data);
const total = Object.keys(data).length;
const kept = Object.keys(slim).length;

const out = JSON.stringify(slim);
writeFileSync(OUT, out);

console.log(`Models: ${total} total, ${kept} with pricing`);
console.log(`Size: ${(out.length / 1024).toFixed(0)} KB`);
console.log(`Wrote ${OUT}`);
