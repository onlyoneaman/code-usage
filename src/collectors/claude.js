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
  const primarySessions = new Set();
  const subagentParentSessions = new Set();
  const subagentRuns = new Set();
  const subagentCompactRuns = new Set();
  let totalMessages = 0;
  let primaryMessages = 0;
  let subagentMessages = 0;
  let firstDate = null;

  const scopeAgg = {
    primary: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    subagent: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
  };

  const ensureDay = (date) => {
    if (!dayAgg[date])
      dayAgg[date] = {
        cost: 0,
        sessions: new Set(),
        primarySessions: new Set(),
        subagentParentSessions: new Set(),
        subagentRuns: new Set(),
        subagentCompactRuns: new Set(),
        messages: 0,
        primaryMessages: 0,
        subagentMessages: 0,
        models: new Set(),
        modelCosts: {},
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        primaryCost: 0,
        subagentCost: 0,
        primaryTokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        subagentTokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      };
    return dayAgg[date];
  };

  const ensureProjectDaily = (projectPath, date) => {
    if (!projectPath) return null;
    const projName = projectPath.split("/").filter(Boolean).pop() || projectPath;
    if (!projAgg[projectPath]) projAgg[projectPath] = { name: projName, daily: {} };
    if (!projAgg[projectPath].daily[date])
      projAgg[projectPath].daily[date] = {
        sessions: new Set(),
        primarySessions: new Set(),
        subagentParentSessions: new Set(),
        subagentRuns: new Set(),
        subagentCompactRuns: new Set(),
        messages: 0,
        primaryMessages: 0,
        subagentMessages: 0,
        cost: 0,
        primaryCost: 0,
        subagentCost: 0,
      };
    return projAgg[projectPath].daily[date];
  };

  for (const fpath of files) {
    const fallbackSessionId = basename(fpath, ".jsonl");
    const fallbackProjectPath = extractProjectPathFromFile(fpath);
    const fileMeta = getClaudeFileMeta(fpath);

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
      const isSubagent = isSubagentEntry(entry, fileMeta);
      const subagentRunKey = isSubagent ? `${sessionKey}::${fileMeta.agentId || fallbackSessionId}` : null;

      if (entry.type === "user") {
        const day = ensureDay(date);
        const projectDay = ensureProjectDaily(projectPath, date);
        totalMessages++;
        if (!firstDate || date < firstDate) firstDate = date;
        day.messages++;
        if (isSubagent) {
          subagentMessages++;
          day.subagentMessages++;
          if (projectDay) projectDay.subagentMessages++;
        } else {
          primaryMessages++;
          day.primaryMessages++;
          if (projectDay) projectDay.primaryMessages++;
        }
        if (projectDay) projectDay.messages++;
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

      const day = ensureDay(date);
      const projectDay = ensureProjectDaily(projectPath, date);
      day.sessions.add(sessionKey);
      allSessions.add(sessionKey);
      if (projectDay) projectDay.sessions.add(sessionKey);
      if (!firstDate || date < firstDate) firstDate = date;

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

      day.cost += cost;
      day.input += input;
      day.output += output;
      day.cacheRead += cacheRead;
      day.cacheWrite += cacheWrite;
      day.models.add(model);
      day.modelCosts[model] = (day.modelCosts[model] || 0) + cost;

      const scope = isSubagent ? "subagent" : "primary";
      scopeAgg[scope].input += input;
      scopeAgg[scope].output += output;
      scopeAgg[scope].cacheRead += cacheRead;
      scopeAgg[scope].cacheWrite += cacheWrite;
      scopeAgg[scope].cost += cost;

      if (isSubagent) {
        subagentParentSessions.add(sessionKey);
        day.subagentParentSessions.add(sessionKey);
        if (subagentRunKey) {
          subagentRuns.add(subagentRunKey);
          day.subagentRuns.add(subagentRunKey);
          if (fileMeta.isCompactSubagent) {
            subagentCompactRuns.add(subagentRunKey);
            day.subagentCompactRuns.add(subagentRunKey);
          }
        }
        day.subagentCost += cost;
        day.subagentTokens.input += input;
        day.subagentTokens.output += output;
        day.subagentTokens.cacheRead += cacheRead;
        day.subagentTokens.cacheWrite += cacheWrite;
        if (projectDay) {
          projectDay.subagentParentSessions.add(sessionKey);
          if (subagentRunKey) {
            projectDay.subagentRuns.add(subagentRunKey);
            if (fileMeta.isCompactSubagent) projectDay.subagentCompactRuns.add(subagentRunKey);
          }
          projectDay.subagentCost += cost;
        }
      } else {
        primarySessions.add(sessionKey);
        day.primarySessions.add(sessionKey);
        day.primaryCost += cost;
        day.primaryTokens.input += input;
        day.primaryTokens.output += output;
        day.primaryTokens.cacheRead += cacheRead;
        day.primaryTokens.cacheWrite += cacheWrite;
        if (projectDay) {
          projectDay.primarySessions.add(sessionKey);
          projectDay.primaryCost += cost;
        }
      }

      if (projectDay) projectDay.cost += cost;
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
      primarySessions: dayAgg[date].primarySessions.size,
      subagentParentSessions: dayAgg[date].subagentParentSessions.size,
      subagentRuns: dayAgg[date].subagentRuns.size,
      subagentCompactRuns: dayAgg[date].subagentCompactRuns.size,
      messages: dayAgg[date].messages,
      primaryMessages: dayAgg[date].primaryMessages,
      subagentMessages: dayAgg[date].subagentMessages,
      primaryCost: dayAgg[date].primaryCost,
      subagentCost: dayAgg[date].subagentCost,
      models: [...dayAgg[date].models],
      modelCosts: dayAgg[date].modelCosts,
      tokens: {
        input: dayAgg[date].input,
        output: dayAgg[date].output,
        cacheRead: dayAgg[date].cacheRead,
        cacheWrite: dayAgg[date].cacheWrite,
        total: dayAgg[date].input + dayAgg[date].output + dayAgg[date].cacheRead + dayAgg[date].cacheWrite,
      },
      primaryTokens: {
        ...dayAgg[date].primaryTokens,
        total:
          dayAgg[date].primaryTokens.input +
          dayAgg[date].primaryTokens.output +
          dayAgg[date].primaryTokens.cacheRead +
          dayAgg[date].primaryTokens.cacheWrite,
      },
      subagentTokens: {
        ...dayAgg[date].subagentTokens,
        total:
          dayAgg[date].subagentTokens.input +
          dayAgg[date].subagentTokens.output +
          dayAgg[date].subagentTokens.cacheRead +
          dayAgg[date].subagentTokens.cacheWrite,
      },
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
        .map(([date, d]) => ({
          date,
          sessions: d.sessions.size,
          primarySessions: d.primarySessions.size,
          subagentParentSessions: d.subagentParentSessions.size,
          subagentRuns: d.subagentRuns.size,
          subagentCompactRuns: d.subagentCompactRuns.size,
          messages: d.messages,
          primaryMessages: d.primaryMessages,
          subagentMessages: d.subagentMessages,
          cost: d.cost,
          primaryCost: d.primaryCost,
          subagentCost: d.subagentCost,
        }));
      const sessions = daily.reduce((s, d) => s + d.sessions, 0);
      const primarySess = daily.reduce((s, d) => s + d.primarySessions, 0);
      const subagentParentSess = daily.reduce((s, d) => s + d.subagentParentSessions, 0);
      const subagentRunCount = daily.reduce((s, d) => s + d.subagentRuns, 0);
      const subagentCompactRunCount = daily.reduce((s, d) => s + d.subagentCompactRuns, 0);
      const messages = daily.reduce((s, d) => s + d.messages, 0);
      const primaryMsgs = daily.reduce((s, d) => s + d.primaryMessages, 0);
      const subagentMsgs = daily.reduce((s, d) => s + d.subagentMessages, 0);
      const cost = daily.reduce((s, d) => s + d.cost, 0);
      const primaryCost = daily.reduce((s, d) => s + d.primaryCost, 0);
      const subagentCost = daily.reduce((s, d) => s + d.subagentCost, 0);
      return {
        name: p.name,
        path,
        sessions,
        primarySessions: primarySess,
        subagentParentSessions: subagentParentSess,
        subagentRuns: subagentRunCount,
        subagentCompactRuns: subagentCompactRunCount,
        messages,
        primaryMessages: primaryMsgs,
        subagentMessages: subagentMsgs,
        cost,
        primaryCost,
        subagentCost,
        daily,
      };
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
      primarySessions: primarySessions.size,
      subagentParentSessions: subagentParentSessions.size,
      subagentRuns: subagentRuns.size,
      subagentCompactRuns: subagentCompactRuns.size,
      primaryCost: scopeAgg.primary.cost,
      subagentCost: scopeAgg.subagent.cost,
      totalMessages,
      primaryMessages,
      subagentMessages,
      totalOutputTokens,
      totalTokens,
      tokenBreakdown: {
        input: totalInputTokens,
        output: totalOutputTokens,
        cacheRead: totalCacheRead,
        cacheWrite: totalCacheWrite,
      },
      primaryTokenBreakdown: {
        input: scopeAgg.primary.input,
        output: scopeAgg.primary.output,
        cacheRead: scopeAgg.primary.cacheRead,
        cacheWrite: scopeAgg.primary.cacheWrite,
        total:
          scopeAgg.primary.input + scopeAgg.primary.output + scopeAgg.primary.cacheRead + scopeAgg.primary.cacheWrite,
      },
      subagentTokenBreakdown: {
        input: scopeAgg.subagent.input,
        output: scopeAgg.subagent.output,
        cacheRead: scopeAgg.subagent.cacheRead,
        cacheWrite: scopeAgg.subagent.cacheWrite,
        total:
          scopeAgg.subagent.input +
          scopeAgg.subagent.output +
          scopeAgg.subagent.cacheRead +
          scopeAgg.subagent.cacheWrite,
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

function getClaudeFileMeta(fpath) {
  const normalized = fpath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const isSubagentFile = parts.includes("subagents");
  const agentId = isSubagentFile ? basename(fpath, ".jsonl") : null;
  return {
    isSubagentFile,
    agentId,
    isCompactSubagent: Boolean(agentId?.startsWith("agent-acompact-")),
  };
}

function isSubagentEntry(entry, fileMeta) {
  return fileMeta.isSubagentFile || entry.isSidechain === true || entry.isSidechain === "true";
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
