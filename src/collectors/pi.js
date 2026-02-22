import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { getPiPricing } from "../pricing/pi.js";
import { computeCurrentStreakFromDates, normalizeCutoffDate } from "./utils.js";

export function collectPi(basePath, options = {}) {
  if (basePath && typeof basePath === "object" && !Array.isArray(basePath)) {
    options = basePath;
    basePath = undefined;
  }
  const cutoffDate = normalizeCutoffDate(options.cutoffDate);
  const sessionsDir = basePath || getPiSessionsDir();
  const files = [];
  if (sessionsDir && existsSync(sessionsDir)) collectJsonlFiles(sessionsDir, files);
  files.sort();

  const modelAgg = {}; // model -> { input, output, cacheRead, cacheWrite, cost }
  const dayAgg = {}; // date -> { cost, sessions:Set, messages, models:Set, modelCosts:{} }
  const projAgg = {}; // project -> { name, daily: { date -> {sessions:Set, messages, cost} } }

  const seen = new Set(); // dedupe by timestamp:totalTokens
  const allSessions = new Set();
  let totalMessages = 0;
  let firstDate = null;

  for (const fpath of files) {
    const sessionId = extractSessionId(fpath);
    const project = extractProject(fpath, sessionsDir);

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
      const sessionKey = `${project || "<unknown>"}::${sessionId}`;

      if (!dayAgg[date])
        dayAgg[date] = { cost: 0, sessions: new Set(), messages: 0, models: new Set(), modelCosts: {} };
      dayAgg[date].sessions.add(sessionKey);
      allSessions.add(sessionKey);

      if (project) {
        if (!projAgg[project]) projAgg[project] = { name: project, daily: {} };
        if (!projAgg[project].daily[date]) projAgg[project].daily[date] = { sessions: new Set(), messages: 0, cost: 0 };
        projAgg[project].daily[date].sessions.add(sessionKey);
      }

      // Count user messages
      if (msg.role === "user") {
        totalMessages++;
        dayAgg[date].messages++;
        if (project) projAgg[project].daily[date].messages++;
      }

      // Only process usage from assistant entries
      const type = entry.type;
      if (type != null && type !== "message") continue;
      if (msg.role !== "assistant") continue;

      const usage = msg.usage || null;
      if (!usage || typeof usage.input !== "number" || typeof usage.output !== "number") continue;

      const input = usage.input || 0;
      const output = usage.output || 0;
      const cacheRead = usage.cacheRead || 0;
      const cacheWrite = usage.cacheWrite || 0;
      const totalTokens = input + output + cacheRead + cacheWrite;
      const model = msg.model || "<unknown>";

      // Deduplicate by timestamp:totalTokens
      const dedupeKey = `${ts}:${totalTokens}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      // Cost: prefer pre-calculated, fall back to pricing lookup
      let cost = null;
      if (usage.cost && typeof usage.cost.total === "number" && Number.isFinite(usage.cost.total)) {
        cost = usage.cost.total;
      }
      if (cost === null) {
        if (model === "<unknown>") cost = 0;
        else {
          const p = getPiPricing(model);
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

      if (project) projAgg[project].daily[date].cost += cost;
    }
  }

  // Build model output
  let totalCost = 0;
  const models = [];
  for (const [id, a] of Object.entries(modelAgg)) {
    const p = id === "<unknown>" ? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } : getPiPricing(id);
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

  return {
    provider: "pi",
    badge: "Pi-Agent",
    accent: "#6C5CE7",
    pricingNote: "Costs from Pi-Agent session data. LiteLLM fallback for missing cost fields.",
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
    extra: null,
  };
}

function getPiSessionsDir() {
  const env = (process.env.PI_AGENT_DIR || "").trim();
  if (env) {
    if (existsSync(env)) return env;
    return null;
  }
  const defaultPath = join(homedir(), ".pi", "agent", "sessions");
  if (existsSync(defaultPath)) return defaultPath;
  return null;
}

function extractSessionId(fpath) {
  const filename = basename(fpath, ".jsonl");
  const idx = filename.indexOf("_");
  return idx !== -1 ? filename.slice(idx + 1) : filename;
}

function extractProject(fpath, sessionsDir) {
  // Project is the first directory under the sessions base path
  const rel = fpath.slice(sessionsDir.length).replace(/^[/\\]+/, "");
  const parts = rel.split(/[/\\]/);
  return parts.length > 1 ? parts[0] : "";
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
