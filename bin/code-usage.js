#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectAmp } from "../src/collectors/amp.js";
import { collectClaude } from "../src/collectors/claude.js";
import { collectCodex } from "../src/collectors/codex.js";
import { collectOpencode } from "../src/collectors/opencode.js";
import { collectPi } from "../src/collectors/pi.js";
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

// --- Detect available providers ---
const hasClaude = hasClaudeJsonlData(home);

let hasCodex = false;
const codexDirs = [join(home, ".codex", "sessions"), join(home, ".codex", "archived_sessions")];
for (const d of codexDirs) {
  if (existsSync(d) && findJsonl(d)) {
    hasCodex = true;
    break;
  }
}

const hasOpencode = existsSync(join(home, ".local", "share", "opencode", "opencode.db"));

const ampDataDir = process.env.AMP_DATA_DIR || join(home, ".local", "share", "amp", "threads");
const hasAmp = existsSync(ampDataDir) && findJson(ampDataDir);

const piDataDir = process.env.PI_AGENT_DIR || join(home, ".pi", "agent", "sessions");
const hasPi = existsSync(piDataDir) && findJsonl(piDataDir);

if (!hasClaude && !hasCodex && !hasOpencode && !hasAmp && !hasPi) {
  console.log("No usage data found for any supported AI coding tool.\n");
  console.log("Supported tools:");
  console.log("  Claude Code:  https://code.claude.com/docs/en/overview");
  console.log("  Codex CLI:    https://developers.openai.com/codex/cli/");
  console.log("  OpenCode:     https://opencode.ai");
  console.log("  Amp:          https://ampcode.com");
  console.log("  Pi-Agent:     https://github.com/anthropics/pi-agent\n");
  console.log("Install and use any of these tools, then run `code-usage` again.");
  process.exit(0);
}

// --- Collect usage data ---
// In --json mode, send progress to stderr so stdout is clean JSON
const log = flags.json ? process.stderr : process.stdout;

let claudeData = null;
if (hasClaude) {
  log.write("Collecting Claude data... ");
  claudeData = collectClaude();
  log.write(`${claudeData.summary.totalSessions} sessions\n`);
}

let codexData = null;
if (hasCodex) {
  log.write("Collecting Codex data...  ");
  codexData = collectCodex();
  log.write(`${codexData.summary.totalSessions} sessions\n`);
}

let opencodeData = null;
if (hasOpencode) {
  log.write("Collecting OpenCode data... ");
  opencodeData = collectOpencode();
  log.write(`${opencodeData.summary.totalSessions} sessions\n`);
}

let ampData = null;
if (hasAmp) {
  log.write("Collecting Amp data...    ");
  ampData = collectAmp();
  log.write(`${ampData.summary.totalSessions} sessions\n`);
}

let piData = null;
if (hasPi) {
  log.write("Collecting Pi-Agent data... ");
  piData = collectPi();
  log.write(`${piData.summary.totalSessions} sessions\n`);
}

// --- Apply range filter ---
if (flags.range && flags.range !== "all") {
  const days = parseInt(flags.range, 10);
  if (!Number.isNaN(days) && days > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    claudeData = filterByRange(claudeData, cutoffStr);
    codexData = filterByRange(codexData, cutoffStr);
    opencodeData = filterByRange(opencodeData, cutoffStr);
    ampData = filterByRange(ampData, cutoffStr);
    piData = filterByRange(piData, cutoffStr);
  }
}

// --- Determine default tab ---
const providers = [
  { key: "claude", has: hasClaude },
  { key: "codex", has: hasCodex },
  { key: "opencode", has: hasOpencode },
  { key: "amp", has: hasAmp },
  { key: "pi", has: hasPi },
];
const activeProviders = providers.filter((p) => p.has);
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
if (flags.noOpen) {
  console.log(`\nDashboard generated at:\n  file://${dashPath}`);
} else {
  console.log(`\nIf the dashboard didn't open, visit:\n  file://${dashPath}`);
}

// --- Helpers ---

function findJsonl(dir) {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".jsonl")) return true;
      if (entry.isDirectory() && findJsonl(join(dir, entry.name))) return true;
    }
  } catch {
    /* skip */
  }
  return false;
}

function findJson(dir) {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".json")) return true;
      if (entry.isDirectory() && findJson(join(dir, entry.name))) return true;
    }
  } catch {
    /* skip */
  }
  return false;
}

function hasClaudeJsonlData(homeDir) {
  const env = (process.env.CLAUDE_CONFIG_DIR || "").trim();
  const roots = env
    ? env
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
    : [join(homeDir, ".config", "claude"), join(homeDir, ".claude")];

  for (const root of roots) {
    const projectsDir = join(root, "projects");
    if (existsSync(projectsDir) && findJsonl(projectsDir)) return true;
  }
  return false;
}

function filterByRange(data, cutoffStr) {
  if (!data) return null;
  const filtered = { ...data };
  filtered.daily = data.daily.filter((d) => d.date >= cutoffStr);
  if (filtered.projects) {
    filtered.projects = data.projects.map((p) => ({
      ...p,
      daily: p.daily ? p.daily.filter((d) => d.date >= cutoffStr) : [],
    }));
  }
  // Recalculate summary from filtered daily
  let totalCost = 0;
  let totalSessions = 0;
  let totalMessages = 0;
  for (const d of filtered.daily) {
    totalCost += d.cost || 0;
    totalSessions += d.sessions || 0;
    totalMessages += d.messages || 0;
  }
  filtered.summary = {
    ...data.summary,
    totalCost,
    totalSessions,
    totalMessages,
  };
  return filtered;
}
