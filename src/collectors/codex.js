import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { getCodexPricing } from '../pricing/codex.js';

export function collectCodex() {
  const home = homedir();
  const sessionsDir = join(home, '.codex', 'sessions');
  const archivedDir = join(home, '.codex', 'archived_sessions');

  const files = [];
  if (existsSync(sessionsDir)) collectJsonlFiles(sessionsDir, files);
  if (existsSync(archivedDir)) collectJsonlFiles(archivedDir, files);
  files.sort();

  // Per-model aggregates
  const modelAgg = {};   // model → {input, output, cached, reasoning, cost}
  // Per-day aggregates
  const dayAgg = {};     // date → {cost, sessions, messages, models: Set, modelCosts: {}}

  let totalSessions = 0;
  let totalMessages = 0;
  let firstDate = null;
  const projAgg = {}; // path → { name, daily: { date → {sessions, messages, cost} } }

  for (const fpath of files) {
    const session = parseSession(fpath);
    if (!session) continue;         // no date → skip
    if (!session.hasUsage) continue; // no token data → skip entirely

    const { date, model, input, output, cached, reasoning, messages, cwd } = session;
    totalSessions++;
    totalMessages += messages;
    if (!firstDate || date < firstDate) firstDate = date;

    // Compute exact cost for this session
    const p = getCodexPricing(model);
    const m = 1e6;
    const uncached = Math.max(0, input - cached);
    const cost = uncached / m * p.input + cached / m * p.cachedInput + output / m * p.output + reasoning / m * p.reasoning;

    // Accumulate into model
    if (!modelAgg[model]) modelAgg[model] = { input: 0, output: 0, cached: 0, reasoning: 0, cost: 0 };
    modelAgg[model].input += input;
    modelAgg[model].output += output;
    modelAgg[model].cached += cached;
    modelAgg[model].reasoning += reasoning;
    modelAgg[model].cost += cost;

    // Accumulate into day
    if (!dayAgg[date]) dayAgg[date] = { cost: 0, sessions: 0, messages: 0, models: new Set(), modelCosts: {} };
    dayAgg[date].cost += cost;
    dayAgg[date].sessions++;
    dayAgg[date].messages += messages;
    dayAgg[date].models.add(model);
    dayAgg[date].modelCosts[model] = (dayAgg[date].modelCosts[model] || 0) + cost;

    // Project aggregation
    if (cwd) {
      const projName = cwd.split('/').filter(Boolean).pop() || cwd;
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
    const iC = uncached / m * p.input;
    const ciC = a.cached / m * p.cachedInput;
    const oC = a.output / m * p.output;
    const rC = a.reasoning / m * p.reasoning;
    totalCost += a.cost;
    models.push({
      id,
      cost: a.cost,
      details: [
        { label: 'Input', tokens: uncached, cost: iC },
        { label: 'Cached', tokens: a.cached, cost: ciC },
        { label: 'Output', tokens: a.output, cost: oC },
        { label: 'Reasoning', tokens: a.reasoning, cost: rC },
      ],
    });
  }

  const dailyArr = Object.keys(dayAgg).sort().map(date => ({
    date,
    cost: dayAgg[date].cost,
    sessions: dayAgg[date].sessions,
    messages: dayAgg[date].messages,
    models: [...dayAgg[date].models],
    modelCosts: dayAgg[date].modelCosts,
  }));

  // Streak
  const activeDates = new Set(Object.keys(dayAgg));
  let streak = 0;
  const now = new Date();
  const check = new Date(now);
  while (activeDates.has(localDateStr(check))) { streak++; check.setDate(check.getDate() - 1); }

  let totalOutputTokens = 0;
  for (const a of Object.values(modelAgg)) totalOutputTokens += a.output;

  // Build projects array
  const projects = Object.entries(projAgg).map(([path, p]) => {
    const daily = Object.entries(p.daily).sort(([a],[b]) => a.localeCompare(b)).map(([date, d]) => ({ date, sessions: d.sessions, messages: d.messages, cost: d.cost }));
    const sessions = daily.reduce((s, d) => s + d.sessions, 0);
    const messages = daily.reduce((s, d) => s + d.messages, 0);
    const cost = daily.reduce((s, d) => s + d.cost, 0);
    return { name: p.name, path, sessions, messages, cost, daily };
  }).sort((a, b) => b.cost - a.cost);

  return {
    provider: 'codex',
    badge: 'Codex Pro',
    accent: '#7385FE',
    pricingNote: 'Pricing (per MTok): gpt-5.3-codex: In $1.75, Out $14, Cached $0.175 | gpt-5.1-codex: In $1.25, Out $10, Cached $0.125. If on Codex Pro subscription, you pay a flat monthly rate.',
    summary: {
      totalCost,
      totalSessions,
      totalMessages,
      totalOutputTokens,
      firstDate: firstDate ? `${firstDate}T00:00:00.000Z` : null,
      streak,
    },
    models,
    daily: dailyArr,
    projects,
    extra: null,
  };
}

function parseSession(fpath) {
  let lines;
  try { lines = readFileSync(fpath, 'utf8').split('\n'); } catch { return null; }

  let date = null, model = null, messages = 0, hasUsage = false, cwd = null;
  let input = 0, output = 0, cached = 0, reasoning = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }

    const type = entry.type;
    const payload = entry.payload || {};

    if (type === 'session_meta') {
      const ts = payload.timestamp || entry.timestamp || '';
      if (ts) date = ts.slice(0, 10);
      model = payload.model || payload.collaboration_mode?.settings?.model || null;
      if (payload.cwd) cwd = payload.cwd;
    }

    if (type === 'event_msg' && payload && typeof payload === 'object') {
      const info = payload.info;
      if (info && typeof info === 'object') {
        const tu = info.total_token_usage;
        if (tu) {
          hasUsage = true;
          input = Math.max(input, tu.input_tokens || 0);
          output = Math.max(output, tu.output_tokens || 0);
          cached = Math.max(cached, tu.cached_input_tokens || 0);
          reasoning = Math.max(reasoning, tu.reasoning_output_tokens || 0);
        }
        if (info.model || payload.model) model = info.model || payload.model;
      }
      if (payload.collaboration_mode?.settings?.model) model = payload.collaboration_mode.settings.model;
    }

    if (type === 'response_item' && payload?.role === 'user') messages++;
  }

  // Fallback date from filename
  if (!date) {
    const match = basename(fpath).match(/rollout-(\d{4}-\d{2}-\d{2})/);
    if (match) date = match[1];
  }
  if (!date) return null;
  if (!model) model = 'gpt-5.3-codex';

  return { date, model, input, output, cached, reasoning, messages, hasUsage, cwd };
}

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function collectJsonlFiles(dir, out) {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith('.jsonl')) out.push(full);
      else if (entry.isDirectory()) collectJsonlFiles(full, out);
    }
  } catch { /* skip unreadable */ }
}
