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
  quiet: args.includes("--quiet"),
  verbose: args.includes("--verbose"),
  range: null,
  providers: null,
  timeoutMs: 30000,
};
const rangeIdx = args.indexOf("--range");
if (rangeIdx !== -1) {
  const value = args[rangeIdx + 1];
  if (!value || value.startsWith("-")) {
    console.error("Missing value for --range. Use: 7d, 30d, 90d, or all.");
    process.exit(1);
  }
  flags.range = value;
}
const providersIdx = args.indexOf("--providers");
if (providersIdx !== -1) {
  const value = args[providersIdx + 1];
  if (!value || value.startsWith("-")) {
    console.error("Missing value for --providers. Example: --providers claude,codex");
    process.exit(1);
  }
  flags.providers = value;
}
const timeoutIdx = args.indexOf("--timeout-ms");
if (timeoutIdx !== -1) {
  const value = args[timeoutIdx + 1];
  if (!value || value.startsWith("-")) {
    console.error("Missing value for --timeout-ms. Example: --timeout-ms 30000");
    process.exit(1);
  }
  const parsedTimeout = Number.parseInt(value, 10);
  if (!Number.isFinite(parsedTimeout) || parsedTimeout <= 0) {
    console.error("Invalid --timeout-ms value. Provide a positive integer in milliseconds.");
    process.exit(1);
  }
  flags.timeoutMs = parsedTimeout;
}

if (flags.quiet && flags.verbose) {
  console.error("Use either --quiet or --verbose, not both.");
  process.exit(1);
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
  --providers <p> Run only specific providers: claude,codex,opencode,amp,pi
  --timeout-ms <n> Per-provider worker timeout in ms (default: 30000)
  --quiet        Suppress progress logs
  --verbose      Print detailed collector diagnostics
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

const allProviders = [
  { key: "claude", label: "Claude" },
  { key: "codex", label: "Codex" },
  { key: "opencode", label: "OpenCode" },
  { key: "amp", label: "Amp" },
  { key: "pi", label: "Pi-Agent" },
];
const providerFilter = parseProviderFilter(flags.providers, allProviders);
if (providerFilter.error) {
  console.error(providerFilter.error);
  process.exit(1);
}
const providers = allProviders.filter((provider) => providerFilter.selected.has(provider.key));

// --- Collect usage data ---
// In --json mode, send progress to stderr so stdout is clean JSON
const log = flags.json ? process.stderr : process.stdout;
const infoLog = createInfoLogger(log, flags.quiet);
const verboseLog = createVerboseLogger(log, flags.verbose, flags.quiet);
const cutoffDate = resolveCutoffDate(flags.range);

infoLog(`Collecting data from ${providers.length} providers in parallel...\n`);
verboseLog(`Selected providers: ${providers.map((p) => p.key).join(", ")}\n`);
verboseLog(`Worker timeout: ${flags.timeoutMs}ms\n`);
verboseLog(`Cutoff date: ${cutoffDate || "none"}\n`);
for (const provider of providers) {
  verboseLog(`${provider.label} sources: ${getProviderSourceHints(provider.key, home).join(", ")}\n`);
}

const collectedData = {};
let failedProviders = 0;
const subtleStatus = createSubtleStatusFormatter(log);
const providerRunMeta = Object.fromEntries(
  allProviders.map((provider) => [
    provider.key,
    {
      key: provider.key,
      label: provider.label,
      status: providerFilter.selected.has(provider.key) ? "pending" : "skipped_by_filter",
      durationMs: 0,
      error: null,
      sessions: 0,
    },
  ]),
);
const collectorTasks = providers.map((provider) => {
  const startedAt = Date.now();
  return collectProviderInWorker(provider.key, { cutoffDate }, { timeoutMs: flags.timeoutMs })
    .then((data) => {
      const durationMs = Date.now() - startedAt;
      providerRunMeta[provider.key].durationMs = durationMs;
      if (hasProviderData(data)) {
        collectedData[provider.key] = data;
        providerRunMeta[provider.key].status = "success";
        providerRunMeta[provider.key].sessions = data.summary.totalSessions || 0;
        infoLog(
          `${provider.label}: ${data.summary.totalSessions} sessions${formatDurationSuffix(durationMs, flags.verbose)}\n`,
        );
      } else {
        collectedData[provider.key] = null;
        providerRunMeta[provider.key].status = "no_data";
        infoLog(
          subtleStatus(`${provider.label}: no local data found${formatDurationSuffix(durationMs, flags.verbose)}\n`),
        );
      }
    })
    .catch((err) => {
      const durationMs = Date.now() - startedAt;
      failedProviders++;
      collectedData[provider.key] = null;
      providerRunMeta[provider.key].status = "failed";
      providerRunMeta[provider.key].durationMs = durationMs;
      providerRunMeta[provider.key].error = formatCollectorError(err);
      infoLog(
        `${provider.label}: failed (${providerRunMeta[provider.key].error})${formatDurationSuffix(durationMs, flags.verbose)}\n`,
      );
    });
});

await Promise.all(collectorTasks);
for (const provider of providers) {
  if (providerRunMeta[provider.key].status === "pending") {
    providerRunMeta[provider.key].status = "failed";
    providerRunMeta[provider.key].error = "collector did not report status";
  }
}

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
      providers: Object.values(providerRunMeta),
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
if (!flags.quiet) process.stdout.write("Building dashboard... ");
await buildAndOpen({
  claudeData,
  codexData,
  opencodeData,
  ampData,
  piData,
  defaultTab,
  appMeta,
  noOpen: flags.noOpen,
  providerStatuses: Object.values(providerRunMeta),
});
if (!flags.quiet) console.log("done");

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

function collectProviderInWorker(provider, options = {}, runtime = {}) {
  const timeoutMs = Number.isFinite(runtime.timeoutMs) ? runtime.timeoutMs : 30000;
  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(new URL("../src/collectors/worker.js", import.meta.url), {
      type: "module",
      workerData: { provider, options },
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      void worker.terminate().catch(() => {
        /* ignore */
      });
      reject(new Error(`timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    worker.once("message", (message) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (message?.ok) resolve(message.data);
      else reject(new Error(message?.error || `Collector failed for ${provider}`));
    });

    worker.once("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    worker.once("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
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

function createInfoLogger(stream, quiet) {
  if (quiet) return (_text) => {};
  return (text) => stream.write(text);
}

function createVerboseLogger(stream, verbose, quiet) {
  if (!verbose || quiet) return (_text) => {};
  return (text) => stream.write(text);
}

function formatDurationSuffix(durationMs, verbose) {
  return verbose ? ` (${durationMs}ms)` : "";
}

function parseProviderFilter(value, providers) {
  const aliasMap = {
    claude: "claude",
    codex: "codex",
    opencode: "opencode",
    "open-code": "opencode",
    amp: "amp",
    pi: "pi",
    piagent: "pi",
    "pi-agent": "pi",
  };
  const allowed = new Set(providers.map((provider) => provider.key));
  if (!value) return { selected: allowed };
  const requested = value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (requested.length === 0) {
    return { error: "Invalid --providers value. Example: --providers claude,codex" };
  }
  const selected = new Set();
  const invalid = [];
  for (const raw of requested) {
    const normalized = aliasMap[raw] || raw;
    if (!allowed.has(normalized)) {
      invalid.push(raw);
      continue;
    }
    selected.add(normalized);
  }
  if (invalid.length > 0) {
    const validText = [...allowed].join(",");
    return { error: `Unknown provider(s): ${invalid.join(", ")}. Valid values: ${validText}` };
  }
  return { selected };
}

function getProviderSourceHints(provider, homeDir) {
  if (provider === "claude") {
    const env = (process.env.CLAUDE_CONFIG_DIR || "").trim();
    const roots = env
      ? env
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
      : [join(homeDir, ".config", "claude"), join(homeDir, ".claude")];
    return roots.map((root) => join(root, "projects"));
  }
  if (provider === "codex") {
    return [join(homeDir, ".codex", "sessions"), join(homeDir, ".codex", "archived_sessions")];
  }
  if (provider === "opencode") {
    return [join(homeDir, ".local", "share", "opencode", "opencode.db")];
  }
  if (provider === "amp") {
    return [(process.env.AMP_DATA_DIR || "").trim() || join(homeDir, ".local", "share", "amp", "threads")];
  }
  if (provider === "pi") {
    return [(process.env.PI_AGENT_DIR || "").trim() || join(homeDir, ".pi", "agent", "sessions")];
  }
  return [];
}
