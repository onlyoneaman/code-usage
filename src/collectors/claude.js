import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { getClaudePricing } from "../pricing/claude.js";
import { computeCurrentStreakFromDates, normalizeCutoffDate } from "./utils.js";

export function collectClaude(options = {}) {
  const cutoffDate = normalizeCutoffDate(options.cutoffDate);
  const home = homedir();
  const claudeRoots = getClaudeRoots(home);
  const files = [];
  for (const root of claudeRoots) {
    const projectsDir = join(root, "projects");
    if (existsSync(projectsDir)) collectJsonlFiles(projectsDir, files);
  }
  files.sort();

  // Per-model and per-day aggregation from raw JSONL events (ccusage-like)
  const modelAgg = {}; // model -> { input, output, cacheRead, cacheWrite, cost }
  const dayAgg = {}; // date -> { cost, sessions:Set, messages, models:Set, modelCosts:{} }
  const projAgg = {}; // path -> { name, daily: { date -> {sessions:Set, messages, cost} } }

  const seen = new Set(); // dedupe by message.id + requestId
  const allSessions = new Set();
  let totalMessages = 0;
  let firstDate = null;

  for (const fpath of files) {
    const fallbackSessionId = basename(fpath, ".jsonl");
    const fallbackProjectPath = extractProjectPathFromFile(fpath);

    let lines;
    try {
      lines = readFileSync(fpath, "utf8").split("\n");
    } catch {
      continue;
    }

    for (const line of lines) {
      if (!line.trim()) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      const ts = typeof entry.timestamp === "string" ? entry.timestamp : null;
      if (!ts) continue;
      const date = ts.slice(0, 10);
      if (!date) continue;
      if (cutoffDate && date < cutoffDate) continue;
      if (!firstDate || date < firstDate) firstDate = date;

      const msg = entry.message || {};
      const reqId = entry.requestId || null;
      const msgId = msg.id || null;
      if (msgId && reqId) {
        const key = `${msgId}:${reqId}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }

      const sessionId = entry.sessionId || fallbackSessionId;
      const projectPath = entry.cwd || fallbackProjectPath || "";
      const sessionKey = `${projectPath || "<unknown>"}::${sessionId}`;

      if (!dayAgg[date])
        dayAgg[date] = { cost: 0, sessions: new Set(), messages: 0, models: new Set(), modelCosts: {} };
      dayAgg[date].sessions.add(sessionKey);
      allSessions.add(sessionKey);

      if (projectPath) {
        const projName = projectPath.split("/").filter(Boolean).pop() || projectPath;
        if (!projAgg[projectPath]) projAgg[projectPath] = { name: projName, daily: {} };
        if (!projAgg[projectPath].daily[date])
          projAgg[projectPath].daily[date] = { sessions: new Set(), messages: 0, cost: 0 };
        projAgg[projectPath].daily[date].sessions.add(sessionKey);
      }

      if (entry.type === "user") {
        totalMessages++;
        dayAgg[date].messages++;
        if (projectPath) projAgg[projectPath].daily[date].messages++;
      }

      const usage = msg.usage || null;
      if (!usage || typeof usage !== "object") continue;

      const input = usage.input_tokens || 0;
      const output = usage.output_tokens || 0;
      const cacheRead = usage.cache_read_input_tokens || 0;
      const cacheWrite = usage.cache_creation_input_tokens || 0;
      const model = msg.model || "<unknown>";
      const tokenSum = input + output + cacheRead + cacheWrite;

      // Claude emits synthetic assistant rows (rate-limit/no-op) with zero usage.
      // Keep session/message accounting, but exclude them from model/cost stats.
      if (model === "<synthetic>" && tokenSum === 0) continue;

      let cost = Number.isFinite(entry.costUSD) ? entry.costUSD : null;
      if (cost === null) {
        if (model === "<unknown>") cost = 0;
        else {
          const p = getClaudePricing(model);
          const m = 1e6;
          cost =
            (input / m) * p.input +
            (output / m) * p.output +
            (cacheRead / m) * p.cacheRead +
            (cacheWrite / m) * p.cacheWrite;
        }
      }

      if (!modelAgg[model]) modelAgg[model] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
      modelAgg[model].input += input;
      modelAgg[model].output += output;
      modelAgg[model].cacheRead += cacheRead;
      modelAgg[model].cacheWrite += cacheWrite;
      modelAgg[model].cost += cost;

      dayAgg[date].cost += cost;
      dayAgg[date].models.add(model);
      dayAgg[date].modelCosts[model] = (dayAgg[date].modelCosts[model] || 0) + cost;

      if (projectPath) projAgg[projectPath].daily[date].cost += cost;
    }
  }

  // Build model output
  let totalCost = 0;
  const models = [];
  for (const [id, a] of Object.entries(modelAgg)) {
    const p = id === "<unknown>" ? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } : getClaudePricing(id);
    const m = 1e6;
    const iC = (a.input / m) * p.input;
    const oC = (a.output / m) * p.output;
    const crC = (a.cacheRead / m) * p.cacheRead;
    const cwC = (a.cacheWrite / m) * p.cacheWrite;
    totalCost += a.cost;
    models.push({
      id,
      cost: a.cost,
      details: [
        { label: "Input", tokens: a.input, cost: iC },
        { label: "Output", tokens: a.output, cost: oC },
        { label: "Cache Read", tokens: a.cacheRead, cost: crC },
        { label: "Cache Write", tokens: a.cacheWrite, cost: cwC },
      ],
    });
  }
  models.sort((a, b) => b.cost - a.cost);

  // Build daily output
  const dailyArr = Object.keys(dayAgg)
    .sort()
    .map((date) => ({
      date,
      cost: dayAgg[date].cost,
      sessions: dayAgg[date].sessions.size,
      messages: dayAgg[date].messages,
      models: [...dayAgg[date].models],
      modelCosts: dayAgg[date].modelCosts,
    }));

  // Streak
  const activeDates = new Set(dailyArr.filter((d) => d.sessions > 0).map((d) => d.date));
  const streak = computeCurrentStreakFromDates(activeDates);

  // Token totals
  let totalInputTokens = 0,
    totalOutputTokens = 0,
    totalCacheRead = 0,
    totalCacheWrite = 0,
    totalTokens = 0;
  for (const a of Object.values(modelAgg)) {
    totalInputTokens += a.input;
    totalOutputTokens += a.output;
    totalCacheRead += a.cacheRead;
    totalCacheWrite += a.cacheWrite;
    totalTokens += a.input + a.output + a.cacheRead + a.cacheWrite;
  }

  // Build projects output
  const projects = Object.entries(projAgg)
    .map(([path, p]) => {
      const daily = Object.entries(p.daily)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => ({ date, sessions: d.sessions.size, messages: d.messages, cost: d.cost }));
      const sessions = daily.reduce((s, d) => s + d.sessions, 0);
      const messages = daily.reduce((s, d) => s + d.messages, 0);
      const cost = daily.reduce((s, d) => s + d.cost, 0);
      return { name: p.name, path, sessions, messages, cost, daily };
    })
    .sort((a, b) => b.cost - a.cost);

  const extra = collectSessionMetaExtras(claudeRoots);

  return {
    provider: "claude",
    badge: "Claude Max",
    accent: "#D37356",
    pricingNote:
      "Pricing (per MTok): Opus 4.5/4.6: In $5, Out $25, CR $0.50, CW $6.25 | Sonnet 4.5: In $3, Out $15, CR $0.30, CW $3.75 | Haiku 4.5: In $1, Out $5, CR $0.10, CW $1.25. If on Claude Max, you pay a flat monthly rate.",
    summary: {
      totalCost,
      totalSessions: allSessions.size,
      totalMessages,
      totalOutputTokens,
      totalTokens,
      tokenBreakdown: {
        input: totalInputTokens,
        output: totalOutputTokens,
        cacheRead: totalCacheRead,
        cacheWrite: totalCacheWrite,
      },
      firstDate: firstDate ? `${firstDate}T00:00:00.000Z` : null,
      streak,
    },
    models,
    daily: dailyArr,
    projects,
    extra,
  };
}

function getClaudeRoots(home) {
  const env = (process.env.CLAUDE_CONFIG_DIR || "").trim();
  const roots = [];
  const seen = new Set();

  const addRoot = (root) => {
    if (!root) return;
    if (seen.has(root)) return;
    if (!existsSync(join(root, "projects"))) return;
    seen.add(root);
    roots.push(root);
  };

  if (env) {
    for (const raw of env.split(",")) addRoot(raw.trim());
    return roots;
  }

  addRoot(join(home, ".config", "claude"));
  addRoot(join(home, ".claude"));
  return roots;
}

function collectJsonlFiles(dir, out) {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push(full);
      else if (entry.isDirectory()) collectJsonlFiles(full, out);
    }
  } catch {
    /* skip unreadable */
  }
}

function extractProjectPathFromFile(fpath) {
  const normalized = fpath.replace(/\\/g, "/");
  const marker = "/projects/";
  const idx = normalized.lastIndexOf(marker);
  if (idx === -1) return "";
  const rest = normalized.slice(idx + marker.length);
  const parts = rest.split("/").filter(Boolean);
  if (parts.length === 0) return "";
  return parts[0];
}

function collectSessionMetaExtras(claudeRoots) {
  let linesAdded = 0;
  let linesRemoved = 0;
  let filesModified = 0;

  for (const root of claudeRoots) {
    const dir = join(root, "usage-data", "session-meta");
    if (!existsSync(dir)) continue;
    let files;
    try {
      files = readdirSync(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const s = JSON.parse(readFileSync(join(dir, file), "utf8"));
        linesAdded += s.lines_added || 0;
        linesRemoved += s.lines_removed || 0;
        filesModified += s.files_modified || 0;
      } catch {
        /* skip */
      }
    }
  }

  return { linesAdded, linesRemoved, filesModified };
}
