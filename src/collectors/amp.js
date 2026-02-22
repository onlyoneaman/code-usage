import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { getAmpPricing } from "../pricing/amp.js";
import { computeCurrentStreakFromDates, normalizeCutoffDate } from "./utils.js";

export function collectAmp(basePath, options = {}) {
  if (basePath && typeof basePath === "object" && !Array.isArray(basePath)) {
    options = basePath;
    basePath = undefined;
  }
  const cutoffDate = normalizeCutoffDate(options.cutoffDate);
  const home = homedir();
  const threadsDir =
    basePath || (process.env.AMP_DATA_DIR || "").trim() || join(home, ".local", "share", "amp", "threads");
  const files = [];
  if (existsSync(threadsDir)) collectJsonFiles(threadsDir, files);
  files.sort();

  const modelAgg = {}; // model -> { input, output, cacheRead, cacheWrite, cost }
  const dayAgg = {}; // date -> { cost, sessions: Set, messages, models: Set, modelCosts: {} }
  const projAgg = {}; // project -> { name, daily: { date -> {sessions:Set, messages, cost} } }
  const allSessions = new Set();
  let totalMessages = 0;
  let firstDate = null;

  for (const fpath of files) {
    let thread;
    try {
      thread = JSON.parse(readFileSync(fpath, "utf8"));
    } catch {
      continue;
    }

    const sessionId = thread.id || basename(fpath, ".json");
    const projectPath = extractProjectPath(fpath, threadsDir) || thread.title || "";
    const projName = projectPath ? projectPath.split("/").filter(Boolean).pop() || projectPath : "";

    const events = extractUsageEvents(thread);
    const filteredEvents = cutoffDate ? events.filter((evt) => evt.timestamp.slice(0, 10) >= cutoffDate) : events;
    if (filteredEvents.length === 0) continue;

    allSessions.add(sessionId);

    // Count user messages
    const messages = thread.messages || [];
    const userMsgCount = messages.filter((m) => m.role === "user").length;
    totalMessages += userMsgCount;

    for (const evt of filteredEvents) {
      const date = evt.timestamp.slice(0, 10);
      if (!date) continue;
      if (!firstDate || date < firstDate) firstDate = date;

      const model = evt.model || "<unknown>";
      const input = evt.inputTokens || 0;
      const output = evt.outputTokens || 0;
      const cacheRead = evt.cacheReadInputTokens || 0;
      const cacheWrite = evt.cacheCreationInputTokens || 0;

      // Cost: use credits if available (1 credit ≈ $1), otherwise calculate from pricing
      let cost;
      if (evt.credits > 0) {
        cost = evt.credits;
      } else {
        const p = getAmpPricing(model);
        const m = 1e6;
        cost =
          (input / m) * p.input +
          (output / m) * p.output +
          (cacheRead / m) * p.cacheRead +
          (cacheWrite / m) * p.cacheWrite;
      }

      // Model aggregation
      if (!modelAgg[model]) modelAgg[model] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
      modelAgg[model].input += input;
      modelAgg[model].output += output;
      modelAgg[model].cacheRead += cacheRead;
      modelAgg[model].cacheWrite += cacheWrite;
      modelAgg[model].cost += cost;

      // Day aggregation
      if (!dayAgg[date])
        dayAgg[date] = { cost: 0, sessions: new Set(), messages: 0, models: new Set(), modelCosts: {} };
      dayAgg[date].cost += cost;
      dayAgg[date].sessions.add(sessionId);
      dayAgg[date].models.add(model);
      dayAgg[date].modelCosts[model] = (dayAgg[date].modelCosts[model] || 0) + cost;

      // Project aggregation
      if (projectPath) {
        if (!projAgg[projectPath]) projAgg[projectPath] = { name: projName, daily: {} };
        if (!projAgg[projectPath].daily[date])
          projAgg[projectPath].daily[date] = { sessions: new Set(), messages: 0, cost: 0 };
        projAgg[projectPath].daily[date].sessions.add(sessionId);
        projAgg[projectPath].daily[date].cost += cost;
      }
    }

    // Attribute user messages to the first event date for this thread
    const firstEvtDate = filteredEvents[0].timestamp.slice(0, 10);
    if (firstEvtDate) {
      if (!dayAgg[firstEvtDate])
        dayAgg[firstEvtDate] = { cost: 0, sessions: new Set(), messages: 0, models: new Set(), modelCosts: {} };
      dayAgg[firstEvtDate].messages += userMsgCount;

      if (projectPath) {
        if (!projAgg[projectPath]) projAgg[projectPath] = { name: projName, daily: {} };
        if (!projAgg[projectPath].daily[firstEvtDate])
          projAgg[projectPath].daily[firstEvtDate] = { sessions: new Set(), messages: 0, cost: 0 };
        projAgg[projectPath].daily[firstEvtDate].messages += userMsgCount;
      }
    }
  }

  // Build model output
  let totalCost = 0;
  const models = [];
  for (const [id, a] of Object.entries(modelAgg)) {
    const p = getAmpPricing(id);
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
    provider: "amp",
    badge: "Amp",
    accent: "#E8430B",
    pricingNote: "Costs estimated via LiteLLM pricing. Amp subscription users pay a flat rate.",
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

/**
 * Extract usage events from a thread, preferring modern usageLedger format,
 * falling back to legacy messages[] format.
 */
function extractUsageEvents(thread) {
  const ledgerEvents = thread.usageLedger?.events;
  if (Array.isArray(ledgerEvents) && ledgerEvents.length > 0) {
    return extractFromLedger(thread, ledgerEvents);
  }

  const messages = thread.messages;
  if (Array.isArray(messages) && messages.length > 0) {
    return extractFromLegacyMessages(messages, thread.createdAt);
  }

  return [];
}

/**
 * Modern format: usageLedger.events[] with cache token enrichment from messages
 */
function extractFromLedger(thread, ledgerEvents) {
  const messages = thread.messages || [];
  // Build lookup by message id for cache token extraction
  const msgById = {};
  for (const msg of messages) {
    const mid = msg.id ?? msg.messageId;
    if (mid != null) msgById[mid] = msg;
  }

  const events = [];
  for (const evt of ledgerEvents) {
    if (!evt.timestamp || !evt.model) continue;

    const inputTokens = evt.tokens?.input || 0;
    const outputTokens = evt.tokens?.output || 0;

    // Enrich with cache tokens from the corresponding assistant message
    let cacheCreationInputTokens = 0;
    let cacheReadInputTokens = 0;
    if (evt.toMessageId != null && msgById[evt.toMessageId]) {
      const targetUsage = msgById[evt.toMessageId].usage || {};
      cacheCreationInputTokens = targetUsage.cacheCreationInputTokens || 0;
      cacheReadInputTokens = targetUsage.cacheReadInputTokens || 0;
    }

    events.push({
      timestamp: evt.timestamp,
      model: evt.model,
      credits: evt.credits || 0,
      inputTokens,
      outputTokens,
      cacheCreationInputTokens,
      cacheReadInputTokens,
    });
  }

  return events;
}

/**
 * Legacy format: messages[] with usage on assistant messages
 */
function extractFromLegacyMessages(messages, threadCreatedAt) {
  const events = [];
  for (const msg of messages) {
    if (msg.role !== "assistant" || !msg.usage) continue;
    const u = msg.usage;
    if (!u.model) continue;

    const ts = msg.timestamp || msg.createdAt || threadCreatedAt || null;
    if (!ts) continue;

    events.push({
      timestamp: ts,
      model: u.model,
      credits: u.credits || 0,
      inputTokens: u.inputTokens || 0,
      outputTokens: u.outputTokens || 0,
      cacheCreationInputTokens: u.cacheCreationInputTokens || 0,
      cacheReadInputTokens: u.cacheReadInputTokens || 0,
    });
  }
  return events;
}

function extractProjectPath(fpath, threadsDir) {
  const rel = fpath.slice(threadsDir.length).replace(/^[/\\]+/, "");
  const parts = rel.split(/[/\\]/);
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

function collectJsonFiles(dir, out) {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(".json")) out.push(full);
      else if (entry.isDirectory()) collectJsonFiles(full, out);
    }
  } catch {
    /* skip unreadable */
  }
}
