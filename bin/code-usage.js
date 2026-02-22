#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { APP_CONFIG } from "../src/config.js";
import { buildAndOpen } from "../src/dashboard.js";

const home = homedir();
const __dirname = dirname(fileURLToPath(import.meta.url));

const pkgPath = join(__dirname, "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

// --- CLI flag parsing ---
const args = process.argv.slice(2);
const flags = {
  version: args.includes("-v") || args.includes("--version"),
  help: args.includes("-h") || args.includes("--help"),
  json: args.includes("--json"),
  noOpen: args.includes("--no-open"),
  range: null,
};
const rangeIdx = args.indexOf("--range");
if (rangeIdx !== -1 && args[rangeIdx + 1]) {
  flags.range = args[rangeIdx + 1];
}

if (flags.version) {
  console.log(pkg.version);
  process.exit(0);
}

if (flags.help) {
  console.log(`code-usage v${pkg.version}

See how much your AI coding actually costs.

Usage: code-usage [options]

Options:
  --json         Print aggregated JSON to stdout
  --no-open      Generate dashboard without opening browser
  --range <r>    Filter data by range: 7d, 30d, 90d, all (default: all)
  -v, --version  Show version
  -h, --help     Show this help`);
  process.exit(0);
}

const appMeta = {
  name: pkg.name || "code-usage",
  version: pkg.version || "0.0.0",
  authorName: APP_CONFIG.authorName,
  authorUrl: APP_CONFIG.authorUrl,
  repoUrl: APP_CONFIG.repoUrl,
  packageUrl: APP_CONFIG.packageUrl || `https://www.npmjs.com/package/${encodeURIComponent(pkg.name || "code-usage")}`,
  assetBase: join(__dirname, "..", "templates", "assets"),
};

const providers = [
  { key: "claude", label: "Claude" },
  { key: "codex", label: "Codex" },
  { key: "opencode", label: "OpenCode" },
  { key: "amp", label: "Amp" },
  { key: "pi", label: "Pi-Agent" },
];

// --- Collect usage data ---
// In --json mode, send progress to stderr so stdout is clean JSON
const log = flags.json ? process.stderr : process.stdout;
const cutoffDate = resolveCutoffDate(flags.range);

log.write(`Collecting data from ${providers.length} providers in parallel...\n`);

const collectedData = {};
let failedProviders = 0;
const subtleStatus = createSubtleStatusFormatter(log);
const collectorTasks = providers.map((provider) =>
  collectProviderInWorker(provider.key, { cutoffDate })
    .then((data) => {
      if (hasProviderData(data)) {
        collectedData[provider.key] = data;
        log.write(`${provider.label}: ${data.summary.totalSessions} sessions\n`);
      } else {
        collectedData[provider.key] = null;
        log.write(subtleStatus(`${provider.label}: no local data found\n`));
      }
    })
    .catch((err) => {
      failedProviders++;
      collectedData[provider.key] = null;
      log.write(`${provider.label}: failed (${formatCollectorError(err)})\n`);
    }),
);

await Promise.all(collectorTasks);

const providersWithData = providers.filter((provider) => !!collectedData[provider.key]);
if (providersWithData.length === 0) {
  if (failedProviders > 0) {
    console.error("No usage data collected; one or more providers failed.");
    process.exit(1);
  }
  printNoDataMessage();
  process.exit(0);
}

const claudeData = collectedData.claude || null;
const codexData = collectedData.codex || null;
const opencodeData = collectedData.opencode || null;
const ampData = collectedData.amp || null;
const piData = collectedData.pi || null;

// --- Determine default tab ---
const activeProviders = providersWithData;
let defaultTab = "all";
if (activeProviders.length === 1) {
  defaultTab = activeProviders[0].key;
}

// --- JSON output mode ---
if (flags.json) {
  const data = {
    metadata: {
      createdAt: new Date().toISOString(),
      createdBy: "code-usage",
      version: pkg.version,
      repo: APP_CONFIG.repoUrl,
      author: APP_CONFIG.authorName,
      authorUrl: APP_CONFIG.authorUrl,
      packageUrl: APP_CONFIG.packageUrl,
    },
    claude: claudeData || null,
    codex: codexData || null,
    opencode: opencodeData || null,
    amp: ampData || null,
    pi: piData || null,
  };
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

// --- Build dashboard ---
process.stdout.write("Building dashboard... ");
await buildAndOpen({ claudeData, codexData, opencodeData, ampData, piData, defaultTab, appMeta, noOpen: flags.noOpen });
console.log("done");

const dashPath = join(home, ".code-usage", "current", "code-usage-dashboard.html");
const rawJsonPath = join(home, ".code-usage", "current", "openusage-data.json");
if (flags.noOpen) {
  console.log(`\nDashboard generated at:\n  file://${dashPath}`);
  console.log(`Raw data JSON:\n  file://${rawJsonPath}`);
} else {
  console.log(`\nIf the dashboard didn't open, visit:\n  file://${dashPath}`);
  console.log(`Raw data JSON:\n  file://${rawJsonPath}`);
}

// --- Helpers ---

function collectProviderInWorker(provider, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(new URL("../src/collectors/worker.js", import.meta.url), {
      type: "module",
      workerData: { provider, options },
    });

    worker.once("message", (message) => {
      if (settled) return;
      settled = true;
      if (message?.ok) resolve(message.data);
      else reject(new Error(message?.error || `Collector failed for ${provider}`));
    });

    worker.once("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    worker.once("exit", (code) => {
      if (settled) return;
      settled = true;
      reject(new Error(`Collector worker exited with code ${code} for ${provider}`));
    });
  });
}

function formatCollectorError(err) {
  const message = err instanceof Error ? err.message : String(err);
  return message.split("\n")[0] || "unknown error";
}

function resolveCutoffDate(range) {
  if (!range || range === "all") return null;
  const days = Number.parseInt(range, 10);
  if (!Number.isFinite(days) || days <= 0) return null;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff.toISOString().slice(0, 10);
}

function hasProviderData(data) {
  if (!data || typeof data !== "object") return false;
  const summary = data.summary || {};
  if ((summary.totalSessions || 0) > 0) return true;
  if ((summary.totalMessages || 0) > 0) return true;
  if ((summary.totalTokens || 0) > 0) return true;
  if (Array.isArray(data.models) && data.models.length > 0) return true;
  if (Array.isArray(data.daily) && data.daily.length > 0) return true;
  if (Array.isArray(data.projects) && data.projects.length > 0) return true;
  return false;
}

function printNoDataMessage() {
  console.log("No usage data found for any supported AI coding tool.\n");
  console.log("Supported tools:");
  console.log("  Claude Code:  https://code.claude.com/docs/en/overview");
  console.log("  Codex CLI:    https://developers.openai.com/codex/cli/");
  console.log("  OpenCode:     https://opencode.ai");
  console.log("  Amp:          https://ampcode.com");
  console.log("  Pi-Agent:     https://github.com/anthropics/pi-agent\n");
  console.log("Install and use any of these tools, then run `code-usage` again.");
}

function createSubtleStatusFormatter(stream) {
  const isTty = !!stream?.isTTY;
  const noColor = !!process.env.NO_COLOR;
  const isDumbTerm = process.env.TERM === "dumb";
  if (!isTty || noColor || isDumbTerm) {
    return (text) => text;
  }
  return (text) => `\x1b[2m${text}\x1b[0m`;
}
