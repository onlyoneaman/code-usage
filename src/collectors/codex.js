import { createReadStream, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { createInterface } from "node:readline";
import { CODEX_LONG_CONTEXT_THRESHOLD, getCodexPricing } from "../pricing/codex.js";
import { codexCost } from "../pricing/cost.js";
import { computeCurrentStreakFromDates, normalizeCutoffDate } from "./utils.js";

export const UNKNOWN_MODEL = "unknown";

function defaultSessionDirs() {
  const home = homedir();
  return [join(home, ".codex", "sessions"), join(home, ".codex", "archived_sessions")];
}

export async function collectCodex(options = {}) {
  const cutoffDate = normalizeCutoffDate(options.cutoffDate);
  const files = [];
  for (const dir of options.sessionDirs || defaultSessionDirs()) collectJsonlFiles(dir, files);
  files.sort();

  const modelAgg = {}; // model → {input, output, cached, reasoning, cost}
  const dayAgg = {}; // date → {cost, sessions:Set, messages, models:Set, modelCosts, input, output, cached, reasoning}
  const projAgg = {}; // cwd → { name, daily: { date → {sessions:Set, messages, cost} } }
  const allSessions = new Set();
  let totalMessages = 0;
  let firstDate = null;
  const diagnostics = { files: files.length, skippedFiles: 0, unknownModelTurns: 0 };

  const ensureDay = (date) => {
    if (!dayAgg[date])
      dayAgg[date] = {
        cost: 0,
        sessions: new Set(),
        messages: 0,
        models: new Set(),
        modelCosts: {},
        input: 0,
        output: 0,
        cached: 0,
        reasoning: 0,
      };
    if (!firstDate || date < firstDate) firstDate = date;
    return dayAgg[date];
  };
  const ensureProjectDay = (cwd, date) => {
    if (!cwd) return null;
    if (!projAgg[cwd]) projAgg[cwd] = { name: cwd.split("/").filter(Boolean).pop() || cwd, daily: {} };
    if (!projAgg[cwd].daily[date]) projAgg[cwd].daily[date] = { sessions: new Set(), messages: 0, cost: 0 };
    return projAgg[cwd].daily[date];
  };

  for (const fpath of files) {
    if (cutoffDate && lastWriteDate(fpath) < cutoffDate) continue;
    let session;
    try {
      session = await parseSession(fpath);
    } catch {
      diagnostics.skippedFiles++;
      continue;
    }
    if (!session) continue;

    const turns = cutoffDate ? session.turns.filter((t) => t.date >= cutoffDate) : session.turns;
    if (turns.length === 0) continue;
    allSessions.add(fpath);
    diagnostics.unknownModelTurns += turns.filter((t) => t.model === UNKNOWN_MODEL).length;

    // Price per (date, model) so a session spanning days or switching models
    // lands each turn where it was spent.
    const buckets = new Map();
    for (const turn of turns) {
      const key = `${turn.date}\u0000${turn.model}`;
      let b = buckets.get(key);
      if (!b) {
        b = { date: turn.date, model: turn.model, standard: emptyBucket(), priority: emptyBucket() };
        buckets.set(key, b);
      }
      accumulateTurn(b, turn.usage, turn.tier);
    }

    for (const b of buckets.values()) {
      const p = getCodexPricing(b.model);
      const cost = codexCost(b.standard, p, null) + codexCost(b.priority, p, "priority");
      const input = b.standard.input + b.priority.input;
      const output = b.standard.output + b.priority.output;
      const cached = b.standard.cached + b.priority.cached;
      const reasoning = b.standard.reasoning + b.priority.reasoning;

      if (!modelAgg[b.model]) modelAgg[b.model] = { input: 0, output: 0, cached: 0, reasoning: 0, cost: 0 };
      modelAgg[b.model].input += input;
      modelAgg[b.model].output += output;
      modelAgg[b.model].cached += cached;
      modelAgg[b.model].reasoning += reasoning;
      modelAgg[b.model].cost += cost;

      const day = ensureDay(b.date);
      day.cost += cost;
      day.sessions.add(fpath);
      day.input += input;
      day.output += output;
      day.cached += cached;
      day.reasoning += reasoning;
      day.models.add(b.model);
      day.modelCosts[b.model] = (day.modelCosts[b.model] || 0) + cost;

      const projectDay = ensureProjectDay(session.cwd, b.date);
      if (projectDay) {
        projectDay.sessions.add(fpath);
        projectDay.cost += cost;
      }
    }

    for (const date of session.messageDates) {
      if (cutoffDate && date < cutoffDate) continue;
      totalMessages++;
      const day = ensureDay(date);
      day.messages++;
      day.sessions.add(fpath);
      const projectDay = ensureProjectDay(session.cwd, date);
      if (projectDay) {
        projectDay.messages++;
        projectDay.sessions.add(fpath);
      }
    }
  }

  let totalCost = 0;
  const models = [];
  for (const [id, a] of Object.entries(modelAgg)) {
    const p = getCodexPricing(id);
    const m = 1e6;
    const uncached = Math.max(0, a.input - a.cached);
    totalCost += a.cost;
    models.push({
      id,
      cost: a.cost,
      details: [
        { label: "Input", tokens: uncached, cost: (uncached / m) * p.input },
        { label: "Cached", tokens: a.cached, cost: (a.cached / m) * p.cachedInput },
        { label: "Output", tokens: a.output, cost: (a.output / m) * p.output },
        // Reasoning tokens are a subset of output and already billed there.
        { label: "Reasoning (incl. in output)", tokens: a.reasoning, cost: 0 },
      ],
    });
  }
  models.sort((a, b) => b.cost - a.cost);

  const dailyArr = Object.keys(dayAgg)
    .sort()
    .map((date) => {
      const d = dayAgg[date];
      const uncached = Math.max(0, d.input - d.cached);
      return {
        date,
        cost: d.cost,
        sessions: d.sessions.size,
        messages: d.messages,
        models: [...d.models],
        modelCosts: d.modelCosts,
        tokens: {
          input: uncached,
          output: d.output,
          cached: d.cached,
          reasoning: d.reasoning,
          total: uncached + d.cached + d.output,
        },
      };
    });

  const streak = computeCurrentStreakFromDates(new Set(Object.keys(dayAgg)));

  let totalInput = 0;
  let totalOutputTokens = 0;
  let totalCached = 0;
  let totalReasoning = 0;
  for (const a of Object.values(modelAgg)) {
    totalInput += Math.max(0, a.input - a.cached);
    totalOutputTokens += a.output;
    totalCached += a.cached;
    totalReasoning += a.reasoning;
  }
  const totalTokens = totalInput + totalCached + totalOutputTokens;

  const projects = Object.entries(projAgg)
    .map(([path, p]) => {
      const daily = Object.entries(p.daily)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => ({ date, sessions: d.sessions.size, messages: d.messages, cost: d.cost }));
      const sessions = new Set(Object.values(p.daily).flatMap((d) => [...d.sessions])).size;
      const messages = daily.reduce((s, d) => s + d.messages, 0);
      const cost = daily.reduce((s, d) => s + d.cost, 0);
      return { name: p.name, path, sessions, messages, cost, daily };
    })
    .sort((a, b) => b.cost - a.cost);

  return {
    provider: "codex",
    badge: "Codex Pro",
    accent: "#7385FE",
    pricingNote:
      "Per-model list prices from LiteLLM, refreshed daily. Turns run in priority (fast) mode are priced at OpenAI's 2x priority rates. On a Codex subscription you pay a flat monthly rate instead.",
    summary: {
      totalCost,
      totalSessions: allSessions.size,
      totalMessages,
      totalOutputTokens,
      totalTokens,
      tokenBreakdown: { input: totalInput, output: totalOutputTokens, cached: totalCached, reasoning: totalReasoning },
      firstDate: firstDate ? `${firstDate}T00:00:00.000Z` : null,
      streak,
    },
    models,
    daily: dailyArr,
    projects,
    extra: null,
    diagnostics,
  };
}

export function emptyBucket() {
  return { input: 0, cached: 0, output: 0, reasoning: 0, longInput: 0, longCached: 0, longOutput: 0 };
}

// Longest pause tolerated inside a burst of replayed usage. Codex writes a
// forked session's inherited history in one go, so the burst is dense while the
// child's own first turn follows a real pause. Measured locally: burst gaps are
// 0-1ms, the following pause is 3-16s.
const REWRITTEN_BURST_PAUSE_MS = 1000;

/**
 * Timestamp at which a file's replayed-history burst ends, or null.
 *
 * Forking a Codex session copies the parent's entire conversation — including
 * its `token_count` events — into the child's rollout file. Those tokens were
 * already billed against the parent, so counting them again multiplies a long
 * session's cost by the number of times it was forked. A file whose first two
 * usage events are written back to back replayed a history it did not spend;
 * one that pauses between them was recording its own turns from the start.
 * Mirrors ccusage's `detect_rewritten_burst` (adapters/codex/src/parser.rs).
 */
export function detectRewrittenBurst(entries) {
  let first = null;
  for (const { ts, hasUsage } of entries) {
    if (!hasUsage || ts === null) continue;
    if (first === null) {
      first = ts;
      continue;
    }
    return ts - first <= REWRITTEN_BURST_PAUSE_MS ? first + REWRITTEN_BURST_PAUSE_MS : null;
  }
  return null;
}

function sameUsage(a, b) {
  return (
    !!a &&
    !!b &&
    (a.input_tokens || 0) === (b.input_tokens || 0) &&
    (a.output_tokens || 0) === (b.output_tokens || 0) &&
    (a.cached_input_tokens || 0) === (b.cached_input_tokens || 0)
  );
}

/**
 * Per-turn usage from one `token_count` event, or null when there is none.
 *
 * Codex re-emits identical `token_count` events (~23% of them in long
 * sessions), so `last_token_usage` is only trusted when the running totals
 * actually advanced; otherwise the turn is a duplicate and contributes
 * nothing. Falls back to the delta of the totals when `last_token_usage` is
 * absent. Mirrors ccusage (adapters/codex/src/parser.rs).
 */
export function turnUsage(info, prevTotals) {
  const total = info.total_token_usage;
  const advanced = !total || !prevTotals || !sameUsage(total, prevTotals);
  if (!advanced) return null;
  const last = info.last_token_usage;
  if (last) return last;
  if (!total) return null;
  const delta = {
    input_tokens: (total.input_tokens || 0) - (prevTotals?.input_tokens || 0),
    output_tokens: (total.output_tokens || 0) - (prevTotals?.output_tokens || 0),
    cached_input_tokens: (total.cached_input_tokens || 0) - (prevTotals?.cached_input_tokens || 0),
    reasoning_output_tokens: (total.reasoning_output_tokens || 0) - (prevTotals?.reasoning_output_tokens || 0),
  };
  return delta.input_tokens > 0 || delta.output_tokens > 0 ? delta : null;
}

export function accumulateTurn(buckets, turn, serviceTier) {
  const isPriority = serviceTier === "priority" || serviceTier === "fast";
  const b = isPriority ? buckets.priority : buckets.standard;
  const inp = turn.input_tokens || 0;
  const cch = turn.cached_input_tokens || 0;
  const out = turn.output_tokens || 0;
  b.input += inp;
  b.cached += cch;
  b.output += out;
  b.reasoning += turn.reasoning_output_tokens || 0;
  // A turn whose own input crosses the threshold bills entirely at the
  // long-context rates. `input_tokens` is the full request context, history
  // included, so this is the right quantity to test.
  if (inp > CODEX_LONG_CONTEXT_THRESHOLD) {
    b.longInput += inp;
    b.longCached += cch;
    b.longOutput += out;
  }
}

const PARSED_TYPES = new Set(["session_meta", "turn_context", "event_msg", "response_item"]);
const EVENT_MSG_HINTS = ['"info"', '"service_tier"', '"model"'];

// Top-level `type` without parsing the line: rollouts write it before
// `payload`, so the first occurrence is the entry's own.
function lineType(line) {
  const at = line.indexOf('"type":"');
  if (at === -1) return null;
  const start = at + 8;
  const end = line.indexOf('"', start);
  return end === -1 ? null : line.slice(start, end);
}

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function modelOf(payload) {
  return payload.model || payload.collaboration_mode?.settings?.model || null;
}

function tierOf(payload) {
  const tier = payload.thread_settings?.service_tier ?? payload.service_tier;
  return typeof tier === "string" ? tier : null;
}

/**
 * Reads one rollout as a stream. Rollouts grow for as long as a session stays
 * open (multi-GB files are routine), so nothing here holds the whole file.
 * Only the entries that carry usage, model, tier or user messages are parsed;
 * `world_state` and tool output are skipped on the raw line.
 */
async function parseSession(fpath) {
  const rl = createInterface({
    input: createReadStream(fpath, { encoding: "utf8" }),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  let sessionDate = null;
  let cwd = null;
  let model = null;
  let serviceTier = null;
  const usageEvents = [];
  const messageDates = [];

  for await (const line of rl) {
    const type = lineType(line);
    if (!PARSED_TYPES.has(type)) continue;

    if (type === "response_item") {
      if (!line.includes('"role":"user"')) continue;
      const entry = parseLine(line);
      if (entry?.type !== "response_item" || entry.payload?.role !== "user") continue;
      messageDates.push(entry.timestamp ? entry.timestamp.slice(0, 10) : null);
      continue;
    }

    if (type === "event_msg" && !EVENT_MSG_HINTS.some((hint) => line.includes(hint))) continue;
    const entry = parseLine(line);
    if (!entry || entry.type !== type) continue;
    const payload = entry.payload || {};

    if (type === "session_meta") {
      const ts = payload.timestamp || entry.timestamp || "";
      if (ts && !sessionDate) sessionDate = ts.slice(0, 10);
      model = modelOf(payload) || model;
      if (payload.cwd && !cwd) cwd = payload.cwd;
      continue;
    }

    // Codex records the service tier on thread settings; "priority" (legacy
    // "fast") bills at ~2x standard. A session can switch mid-run, so the
    // value is tracked as it moves and applied to the turns that follow.
    serviceTier = tierOf(payload) ?? serviceTier;

    if (type === "turn_context") {
      model = modelOf(payload) || model;
      if (payload.cwd && !cwd) cwd = payload.cwd;
      continue;
    }

    const info = payload.info;
    if (info && typeof info === "object") {
      model = info.model || payload.model || model;
      usageEvents.push({
        ts: entry.timestamp ? Date.parse(entry.timestamp) : null,
        date: entry.timestamp ? entry.timestamp.slice(0, 10) : null,
        info,
        model,
        tier: serviceTier,
        hasUsage: true,
      });
    }
    model = modelOf(payload) || model;
  }

  if (!sessionDate) {
    const match = basename(fpath).match(/rollout-(\d{4}-\d{2}-\d{2})/);
    if (match) sessionDate = match[1];
  }

  // A forked session opens with its parent's replayed history; those tokens
  // were billed against the parent, so skip past the burst before counting.
  const burstEnd = detectRewrittenBurst(usageEvents);
  let prevTotals = null;
  const turns = [];
  for (const event of usageEvents) {
    const inReplayedBurst = burstEnd !== null && event.ts !== null && event.ts <= burstEnd;
    const usage = inReplayedBurst ? null : turnUsage(event.info, prevTotals);
    // Advance the running totals through the burst too, so the child's
    // first real turn is measured against where the parent left off.
    if (event.info.total_token_usage) prevTotals = event.info.total_token_usage;
    const date = event.date || sessionDate;
    if (usage && date) turns.push({ date, model: event.model, tier: event.tier, usage });
  }
  if (turns.length === 0) return null;

  // Old rollouts only name the model in session_meta, and a turn can precede
  // its first turn_context; borrow the first model the file names anywhere.
  const fallbackModel = turns.find((t) => t.model)?.model || model || UNKNOWN_MODEL;
  for (const turn of turns) if (!turn.model) turn.model = fallbackModel;

  return {
    cwd,
    turns,
    messageDates: messageDates.map((d) => d || sessionDate).filter(Boolean),
  };
}

function lastWriteDate(fpath) {
  try {
    return statSync(fpath).mtime.toISOString().slice(0, 10);
  } catch {
    return "9999-12-31";
  }
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
