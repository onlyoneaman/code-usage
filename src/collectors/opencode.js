import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { getOpencodePricing } from '../pricing/opencode.js';

export function collectOpencode() {
  const home = homedir();
  const storageDir = join(home, '.local', 'share', 'opencode', 'storage');
  const dbPath = join(home, '.local', 'share', 'opencode', 'opencode.db');

  // Try storage (JSON files) first, fall back to SQLite
  let sessions, messages, projects;
  const storageResult = tryStorage(storageDir, dbPath);
  if (storageResult) {
    ({ sessions, messages, projects } = storageResult);
  } else {
    ({ sessions, messages, projects } = queryDb(dbPath));
  }

  // Build session lookup: id → { directory, project_id, date }
  const sessionMap = {};
  for (const s of sessions) {
    const date = new Date(s.time_created).toISOString().slice(0, 10);
    sessionMap[s.id] = { directory: s.directory || '', projectId: s.project_id || '', date };
  }

  // Build project lookup: id → worktree
  const projectMap = {};
  for (const p of projects) {
    projectMap[p.id] = p.worktree || '';
  }

  // Per-model, per-day, per-project aggregation
  const modelAgg = {};
  const dayAgg = {};
  const projAgg = {};
  let totalSessions = sessions.length;
  let totalMessages = 0;
  let firstDate = null;

  // Track which sessions had assistant messages
  const sessionsWithMessages = new Set();

  for (const msg of messages) {
    let data;
    try { data = JSON.parse(msg.data); } catch { continue; }
    if (data.role !== 'assistant') {
      if (data.role === 'user') totalMessages++;
      continue;
    }

    const tokens = data.tokens;
    if (!tokens) continue;

    const model = data.modelID || 'unknown';
    const sessionId = msg.session_id;
    const sess = sessionMap[sessionId];
    const date = sess ? sess.date : new Date(msg.time_created).toISOString().slice(0, 10);

    sessionsWithMessages.add(sessionId);
    if (!firstDate || date < firstDate) firstDate = date;

    const input = tokens.input || 0;
    const output = tokens.output || 0;
    const reasoning = tokens.reasoning || 0;
    const cacheRead = (tokens.cache && tokens.cache.read) || 0;
    const cacheWrite = (tokens.cache && tokens.cache.write) || 0;

    // Use pre-computed cost from data if available, otherwise calculate
    let cost = data.cost || 0;
    if (!cost) {
      const p = getOpencodePricing(model);
      const m = 1e6;
      const uncached = Math.max(0, input - cacheRead);
      cost = uncached / m * p.input + cacheRead / m * p.cacheRead + cacheWrite / m * p.cacheWrite + output / m * p.output + reasoning / m * p.reasoning;
    }

    // Model aggregation
    if (!modelAgg[model]) modelAgg[model] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, cost: 0 };
    modelAgg[model].input += input;
    modelAgg[model].output += output;
    modelAgg[model].cacheRead += cacheRead;
    modelAgg[model].cacheWrite += cacheWrite;
    modelAgg[model].reasoning += reasoning;
    modelAgg[model].cost += cost;

    // Day aggregation
    if (!dayAgg[date]) dayAgg[date] = { cost: 0, sessions: 0, messages: 0, models: new Set(), modelCosts: {} };
    dayAgg[date].cost += cost;
    dayAgg[date].messages++;
    dayAgg[date].models.add(model);
    dayAgg[date].modelCosts[model] = (dayAgg[date].modelCosts[model] || 0) + cost;

    // Project aggregation
    const cwd = data.path && data.path.cwd ? data.path.cwd : (sess ? sess.directory : '');
    if (cwd) {
      const projName = cwd.split('/').filter(Boolean).pop() || cwd;
      if (!projAgg[cwd]) projAgg[cwd] = { name: projName, daily: {} };
      if (!projAgg[cwd].daily[date]) projAgg[cwd].daily[date] = { sessions: 0, messages: 0, cost: 0 };
      projAgg[cwd].daily[date].messages++;
      projAgg[cwd].daily[date].cost += cost;
    }
  }

  // Count sessions per day and per project from sessionMap
  for (const [sid, sess] of Object.entries(sessionMap)) {
    const date = sess.date;
    if (!dayAgg[date]) dayAgg[date] = { cost: 0, sessions: 0, messages: 0, models: new Set(), modelCosts: {} };
    dayAgg[date].sessions++;

    const cwd = sess.directory;
    if (cwd) {
      const projName = cwd.split('/').filter(Boolean).pop() || cwd;
      if (!projAgg[cwd]) projAgg[cwd] = { name: projName, daily: {} };
      if (!projAgg[cwd].daily[date]) projAgg[cwd].daily[date] = { sessions: 0, messages: 0, cost: 0 };
      projAgg[cwd].daily[date].sessions++;
    }
  }

  // Build output
  let totalCost = 0;
  const models = [];
  for (const [id, a] of Object.entries(modelAgg)) {
    const p = getOpencodePricing(id);
    const m = 1e6;
    const uncached = Math.max(0, a.input - a.cacheRead);
    const iC = uncached / m * p.input;
    const crC = a.cacheRead / m * p.cacheRead;
    const cwC = a.cacheWrite / m * p.cacheWrite;
    const oC = a.output / m * p.output;
    const rC = a.reasoning / m * p.reasoning;
    totalCost += a.cost;
    models.push({
      id,
      cost: a.cost,
      details: [
        { label: 'Input', tokens: uncached, cost: iC },
        { label: 'Cache Read', tokens: a.cacheRead, cost: crC },
        { label: 'Cache Write', tokens: a.cacheWrite, cost: cwC },
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

  let totalOutputTokens = 0, totalTokens = 0, totalInput = 0, totalCacheRead = 0, totalCacheWrite = 0, totalReasoning = 0;
  for (const a of Object.values(modelAgg)) {
    totalInput += a.input;
    totalOutputTokens += a.output;
    totalCacheRead += a.cacheRead;
    totalCacheWrite += a.cacheWrite;
    totalReasoning += a.reasoning;
    totalTokens += a.input + a.output + a.cacheRead + a.cacheWrite + a.reasoning;
  }

  // Build projects array
  const projectsArr = Object.entries(projAgg).map(([path, p]) => {
    const daily = Object.entries(p.daily).sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({ date, sessions: d.sessions, messages: d.messages, cost: d.cost }));
    const sess = daily.reduce((s, d) => s + d.sessions, 0);
    const msgs = daily.reduce((s, d) => s + d.messages, 0);
    const cost = daily.reduce((s, d) => s + d.cost, 0);
    return { name: p.name, path, sessions: sess, messages: msgs, cost, daily };
  }).sort((a, b) => b.cost - a.cost);

  return {
    provider: 'opencode',
    badge: 'OpenCode',
    accent: '#10b981',
    pricingNote: 'Pricing loaded dynamically from ~/.cache/opencode/models.json. Costs are API-equivalent estimates.',
    summary: {
      totalCost,
      totalSessions,
      totalMessages,
      totalOutputTokens,
      totalTokens,
      tokenBreakdown: { input: totalInput, output: totalOutputTokens, cacheRead: totalCacheRead, cacheWrite: totalCacheWrite, reasoning: totalReasoning },
      firstDate: firstDate ? `${firstDate}T00:00:00.000Z` : null,
      streak,
    },
    models,
    daily: dailyArr,
    projects: projectsArr,
    extra: null,
  };
}

// Try reading from storage JSON files first
function tryStorage(storageDir, dbPath) {
  const sessionDiffDir = join(storageDir, 'session_diff');
  if (!existsSync(sessionDiffDir)) return null;

  let files;
  try { files = readdirSync(sessionDiffDir).filter(f => f.endsWith('.json')); } catch { return null; }
  if (files.length === 0) return null;

  // Storage has session_diff files but they only contain file diffs, not token data.
  // We still need the DB for messages/tokens. But we can use storage to detect sessions
  // and only query the DB for message data if storage exists.
  if (!existsSync(dbPath)) return null;

  // Storage exists but we need DB for full data — return null to use DB path
  // which will read both sessions and messages from the DB.
  return null;
}

function queryDb(dbPath) {
  if (!existsSync(dbPath)) return { sessions: [], messages: [], projects: [] };

  try {
    const sessionsRaw = execFileSync('sqlite3', ['-json', dbPath, 'SELECT id, project_id, directory, time_created FROM session'], { encoding: 'utf8', timeout: 10000 });
    const sessions = JSON.parse(sessionsRaw || '[]');

    const messagesRaw = execFileSync('sqlite3', ['-json', dbPath, 'SELECT id, session_id, time_created, data FROM message'], { encoding: 'utf8', timeout: 10000 });
    const messages = JSON.parse(messagesRaw || '[]');

    const projectsRaw = execFileSync('sqlite3', ['-json', dbPath, 'SELECT id, worktree FROM project'], { encoding: 'utf8', timeout: 10000 });
    const projects = JSON.parse(projectsRaw || '[]');

    return { sessions, messages, projects };
  } catch {
    return { sessions: [], messages: [], projects: [] };
  }
}

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
