import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { CODEX_LONG_CONTEXT_THRESHOLD, getCodexPricing } from "../pricing/codex.js";
import { codexCost } from "../pricing/cost.js";
import { computeCurrentStreakFromDates, normalizeCutoffDate } from "./utils.js";

export function collectCodex(options = {}) {
  const cutoffDate = normalizeCutoffDate(options.cutoffDate);
  const home = homedir();
  const sessionsDir = join(home, ".codex", "sessions");
  const archivedDir = join(home, ".codex", "archived_sessions");

  const files = [];
  if (existsSync(sessionsDir)) collectJsonlFiles(sessionsDir, files);
  if (existsSync(archivedDir)) collectJsonlFiles(archivedDir, files);
  files.sort();

  // Per-model aggregates
  const modelAgg = {}; // model → {input, output, cached, reasoning, cost}
  // Per-day aggregates
  const dayAgg = {}; // date → {cost, sessions, messages, models: Set, modelCosts: {}}

  let totalSessions = 0;
  let totalMessages = 0;
  let firstDate = null;
  const projAgg = {}; // path → { name, daily: { date → {sessions, messages, cost} } }

  for (const fpath of files) {
    const session = parseSession(fpath);
    if (!session) continue; // no date → skip
    if (cutoffDate && session.date < cutoffDate) continue;
    if (!session.hasUsage) continue; // no token data → skip entirely

    const { date, model, input, output, cached, reasoning, messages, cwd } = session;
    totalSessions++;
    totalMessages += messages;
    if (!firstDate || date < firstDate) firstDate = date;

    // Compute exact cost for this session. `reasoning` is a subset of `output`,
    // so it is tracked for display but never priced separately.
    const p = getCodexPricing(model);
    const cost = codexCost(session.buckets.standard, p, null) + codexCost(session.buckets.priority, p, "priority");

    // Accumulate into model
    if (!modelAgg[model]) modelAgg[model] = { input: 0, output: 0, cached: 0, reasoning: 0, cost: 0 };
    modelAgg[model].input += input;
    modelAgg[model].output += output;
    modelAgg[model].cached += cached;
    modelAgg[model].reasoning += reasoning;
    modelAgg[model].cost += cost;

    // Accumulate into day
    if (!dayAgg[date])
      dayAgg[date] = {
        cost: 0,
        sessions: 0,
        messages: 0,
        models: new Set(),
        modelCosts: {},
        input: 0,
        output: 0,
        cached: 0,
        reasoning: 0,
      };
    dayAgg[date].cost += cost;
    dayAgg[date].sessions++;
    dayAgg[date].messages += messages;
    dayAgg[date].input += input;
    dayAgg[date].output += output;
    dayAgg[date].cached += cached;
    dayAgg[date].reasoning += reasoning;
    dayAgg[date].models.add(model);
    dayAgg[date].modelCosts[model] = (dayAgg[date].modelCosts[model] || 0) + cost;

    // Project aggregation
    if (cwd) {
      const projName = cwd.split("/").filter(Boolean).pop() || cwd;
      if (!projAgg[cwd]) projAgg[cwd] = { name: projName, daily: {} };
      if (!projAgg[cwd].daily[date]) projAgg[cwd].daily[date] = { sessions: 0, messages: 0, cost: 0 };
      projAgg[cwd].daily[date].sessions++;
      projAgg[cwd].daily[date].messages += messages;
      projAgg[cwd].daily[date].cost += cost;
    }
  }

  // --- Build output ---
  let totalCost = 0;
  const models = [];
  for (const [id, a] of Object.entries(modelAgg)) {
    const p = getCodexPricing(id);
    const m = 1e6;
    const uncached = Math.max(0, a.input - a.cached);
    const iC = (uncached / m) * p.input;
    const ciC = (a.cached / m) * p.cachedInput;
    const oC = (a.output / m) * p.output;
    totalCost += a.cost;
    models.push({
      id,
      cost: a.cost,
      details: [
        { label: "Input", tokens: uncached, cost: iC },
        { label: "Cached", tokens: a.cached, cost: ciC },
        { label: "Output", tokens: a.output, cost: oC },
        // Reasoning tokens are a subset of output and already billed there.
        { label: "Reasoning (incl. in output)", tokens: a.reasoning, cost: 0 },
      ],
    });
  }

  const dailyArr = Object.keys(dayAgg)
    .sort()
    .map((date) => ({
      date,
      cost: dayAgg[date].cost,
      sessions: dayAgg[date].sessions,
      messages: dayAgg[date].messages,
      models: [...dayAgg[date].models],
      modelCosts: dayAgg[date].modelCosts,
      tokens: {
        input: dayAgg[date].input,
        output: dayAgg[date].output,
        cached: dayAgg[date].cached,
        reasoning: dayAgg[date].reasoning,
        total: dayAgg[date].input + dayAgg[date].output + dayAgg[date].cached + dayAgg[date].reasoning,
      },
    }));

  // Streak
  const activeDates = new Set(Object.keys(dayAgg));
  const streak = computeCurrentStreakFromDates(activeDates);

  let totalOutputTokens = 0;
  let totalTokens = 0;
  let totalInput = 0,
    totalCached = 0,
    totalReasoning = 0;
  for (const a of Object.values(modelAgg)) {
    totalInput += a.input;
    totalOutputTokens += a.output;
    totalCached += a.cached;
    totalReasoning += a.reasoning;
    totalTokens += a.input + a.output + a.cached + a.reasoning;
  }

  // Build projects array
  const projects = Object.entries(projAgg)
    .map(([path, p]) => {
      const daily = Object.entries(p.daily)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => ({ date, sessions: d.sessions, messages: d.messages, cost: d.cost }));
      const sessions = daily.reduce((s, d) => s + d.sessions, 0);
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
      "Pricing (per MTok): gpt-5.3-codex: In $1.75, Out $14, Cached $0.175 | gpt-5.1-codex: In $1.25, Out $10, Cached $0.125. If on Codex Pro subscription, you pay a flat monthly rate.",
    summary: {
      totalCost,
      totalSessions,
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
  };
}

export function emptyBucket() {
  return { input: 0, cached: 0, output: 0, longInput: 0, longCached: 0, longOutput: 0 };
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
  // A turn whose own input crosses the threshold bills entirely at the
  // long-context rates. `input_tokens` is the full request context, history
  // included, so this is the right quantity to test.
  if (inp > CODEX_LONG_CONTEXT_THRESHOLD) {
    b.longInput += inp;
    b.longCached += cch;
    b.longOutput += out;
  }
}

function parseSession(fpath) {
  let lines;
  try {
    lines = readFileSync(fpath, "utf8").split("\n");
  } catch {
    return null;
  }

  let date = null,
    model = null,
    messages = 0,
    hasUsage = false,
    cwd = null;
  let input = 0,
    output = 0,
    cached = 0,
    reasoning = 0,
    serviceTier = null,
    prevTotals = null;
  const buckets = { standard: emptyBucket(), priority: emptyBucket() };

  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const type = entry.type;
    const payload = entry.payload || {};

    if (type === "session_meta") {
      const ts = payload.timestamp || entry.timestamp || "";
      if (ts) date = ts.slice(0, 10);
      model = payload.model || payload.collaboration_mode?.settings?.model || null;
      if (payload.cwd) cwd = payload.cwd;
    }

    // Codex records the service tier on thread settings; "priority" (legacy
    // "fast") bills at ~2x standard. A session can switch mid-run, so the
    // value is tracked as it moves and applied to the turns that follow.
    const tier = payload.thread_settings?.service_tier ?? payload.service_tier;
    if (typeof tier === "string") serviceTier = tier;

    if (type === "event_msg" && payload && typeof payload === "object") {
      const info = payload.info;
      if (info && typeof info === "object") {
        const tu = info.total_token_usage;
        if (tu) {
          hasUsage = true;
          input = Math.max(input, tu.input_tokens || 0);
          output = Math.max(output, tu.output_tokens || 0);
          cached = Math.max(cached, tu.cached_input_tokens || 0);
          reasoning = Math.max(reasoning, tu.reasoning_output_tokens || 0);
        }
        const turn = turnUsage(info, prevTotals);
        if (tu) prevTotals = tu;
        if (turn) accumulateTurn(buckets, turn, serviceTier);
        if (info.model || payload.model) model = info.model || payload.model;
      }
      if (payload.collaboration_mode?.settings?.model) model = payload.collaboration_mode.settings.model;
    }

    if (type === "response_item" && payload?.role === "user") messages++;
  }

  // Fallback date from filename
  if (!date) {
    const match = basename(fpath).match(/rollout-(\d{4}-\d{2}-\d{2})/);
    if (match) date = match[1];
  }
  if (!date) return null;
  if (!model) model = "gpt-5.3-codex";

  return { date, model, input, output, cached, reasoning, messages, hasUsage, cwd, buckets };
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
