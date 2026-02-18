import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { getClaudePricing } from '../pricing/claude.js';

export function collectClaude() {
  const home = homedir();
  const statsFile = join(home, '.claude', 'stats-cache.json');
  const sessionMetaDir = join(home, '.claude', 'usage-data', 'session-meta');

  const stats = JSON.parse(readFileSync(statsFile, 'utf8'));
  const mu = stats.modelUsage || {};
  const daily = stats.dailyActivity || [];
  const dmt = stats.dailyModelTokens || [];
  const lastDate = stats.lastComputedDate || '1970-01-01';

  // --- Per-model cost breakdown (exact) ---
  const models = [];
  let totalCost = 0;
  const modelTotalTokens = {};
  const modelCost = {};

  for (const [id, u] of Object.entries(mu)) {
    const p = getClaudePricing(id);
    const m = 1e6;
    const iC = (u.inputTokens || 0) / m * p.input;
    const oC = (u.outputTokens || 0) / m * p.output;
    const crC = (u.cacheReadInputTokens || 0) / m * p.cacheRead;
    const cwC = (u.cacheCreationInputTokens || 0) / m * p.cacheWrite;
    const cost = iC + oC + crC + cwC;

    modelCost[id] = cost;
    totalCost += cost;
    modelTotalTokens[id] = 0;
    dmt.forEach(d => { modelTotalTokens[id] += (d.tokensByModel || {})[id] || 0; });

    models.push({
      id, cost,
      details: [
        { label: 'Input', tokens: u.inputTokens || 0, cost: iC },
        { label: 'Output', tokens: u.outputTokens || 0, cost: oC },
        { label: 'Cache Read', tokens: u.cacheReadInputTokens || 0, cost: crC },
        { label: 'Cache Write', tokens: u.cacheCreationInputTokens || 0, cost: cwC },
      ],
    });
  }

  // --- Daily costs (proportional from model totals) ---
  const dailyByDate = {};
  daily.forEach(d => { dailyByDate[d.date] = d; });

  const dailyArr = dmt.map(d => {
    let cost = 0;
    const dayModels = Object.keys(d.tokensByModel || {});
    const modelCosts = {};
    for (const mid of dayModels) {
      const dayTok = (d.tokensByModel || {})[mid] || 0;
      const totalTok = modelTotalTokens[mid] || 0;
      if (totalTok > 0) {
        const dayCost = modelCost[mid] * (dayTok / totalTok);
        cost += dayCost;
        modelCosts[mid] = dayCost;
      }
    }
    const act = dailyByDate[d.date];
    return {
      date: d.date, cost,
      sessions: act ? act.sessionCount || 0 : 0,
      messages: act ? act.messageCount || 0 : 0,
      models: dayModels,
      modelCosts,
    };
  });

  // --- Session-meta: extras + recent sessions beyond lastComputedDate ---
  let linesAdded = 0, linesRemoved = 0, filesModified = 0, userMessages = 0;
  const recentByDate = {}; // date → {sessions, messages, outputTokens, models}
  let recentTotalSessions = 0;
  // Per-project per-day aggregation
  const projAgg = {}; // path → { name, sessions, messages, outputTokens, daily: { date → {sessions, messages, outputTokens} } }
  let globalOutputTokens = 0;

  if (existsSync(sessionMetaDir)) {
    for (const file of readdirSync(sessionMetaDir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const s = JSON.parse(readFileSync(join(sessionMetaDir, file), 'utf8'));
        linesAdded += s.lines_added || 0;
        linesRemoved += s.lines_removed || 0;
        filesModified += s.files_modified || 0;
        userMessages += s.user_message_count || 0;

        // Project aggregation
        const projPath = s.project_path || '';
        const startDate = (s.start_time || '').slice(0, 10);
        const outTok = s.output_tokens || 0;
        globalOutputTokens += outTok;
        if (projPath && startDate) {
          const projName = projPath.split('/').filter(Boolean).pop() || projPath;
          if (!projAgg[projPath]) projAgg[projPath] = { name: projName, sessions: 0, messages: 0, outputTokens: 0, daily: {} };
          projAgg[projPath].sessions++;
          projAgg[projPath].messages += s.user_message_count || 0;
          projAgg[projPath].outputTokens += outTok;
          if (!projAgg[projPath].daily[startDate]) projAgg[projPath].daily[startDate] = { sessions: 0, messages: 0, outputTokens: 0 };
          projAgg[projPath].daily[startDate].sessions++;
          projAgg[projPath].daily[startDate].messages += s.user_message_count || 0;
          projAgg[projPath].daily[startDate].outputTokens += outTok;
        }

        // Check if this session is beyond the cached data
        if (startDate > lastDate) {
          recentTotalSessions++;
          if (!recentByDate[startDate]) recentByDate[startDate] = { sessions: 0, messages: 0, outputTokens: 0, models: new Set() };
          recentByDate[startDate].sessions++;
          recentByDate[startDate].messages += s.user_message_count || 0;
          recentByDate[startDate].outputTokens += outTok;
          if (s.model) recentByDate[startDate].models.add(s.model);
        }
      } catch { /* skip */ }
    }
  }

  // Also scan live transcripts for sessions not yet in session-meta (still active today)
  const projectsDir = join(home, '.claude', 'projects');
  if (existsSync(projectsDir)) {
    const seen = new Set();
    for (const projEntry of readdirSync(projectsDir, { withFileTypes: true })) {
      if (!projEntry.isDirectory()) continue;
      const projPath = join(projectsDir, projEntry.name);
      try {
        for (const file of readdirSync(projPath)) {
          if (!file.endsWith('.jsonl')) continue;
          const fpath = join(projPath, file);
          const mdate = statSync(fpath).mtime.toISOString().slice(0, 10);
          if (mdate <= lastDate) continue;
          const sid = basename(file, '.jsonl');
          if (seen.has(sid)) continue;
          seen.add(sid);
          if (!recentByDate[mdate]) recentByDate[mdate] = { sessions: 0, messages: 0, outputTokens: 0, models: new Set() };
          recentByDate[mdate].sessions++;
          recentTotalSessions++;
          // Parse transcript for model + output estimate
          try {
            const lines = readFileSync(fpath, 'utf8').split('\n');
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const entry = JSON.parse(line);
                if (entry.type === 'user') recentByDate[mdate].messages++;
                if (entry.type === 'assistant') {
                  const msg = entry.message || {};
                  if (msg.model) recentByDate[mdate].models.add(msg.model);
                  for (const block of (msg.content || [])) {
                    if (block && block.type === 'text' && block.text) {
                      recentByDate[mdate].outputTokens += Math.ceil(block.text.length / 4);
                    }
                  }
                }
              } catch { /* skip bad line */ }
            }
          } catch { /* skip unreadable */ }
        }
      } catch { /* skip */ }
    }
  }

  // Add recent days to dailyArr
  let recentCost = 0;
  for (const [date, r] of Object.entries(recentByDate)) {
    // Estimate cost from output tokens using the dominant model's output price
    const model = r.models.size > 0 ? [...r.models][0] : Object.keys(mu)[0] || 'claude-opus-4-6';
    const p = getClaudePricing(model);
    const estCost = (r.outputTokens / 1e6) * p.output;
    recentCost += estCost;
    const modelCosts = {};
    modelCosts[model] = estCost;
    dailyArr.push({
      date, cost: estCost,
      sessions: r.sessions, messages: r.messages,
      models: [...r.models],
      modelCosts,
    });
  }
  totalCost += recentCost;
  dailyArr.sort((a, b) => a.date.localeCompare(b.date));

  // --- Streak (from all daily dates including recent) ---
  const activeDates = new Set(dailyArr.filter(d => d.sessions > 0).map(d => d.date));
  let streak = 0;
  const now = new Date();
  const check = new Date(now);
  while (activeDates.has(localDateStr(check))) { streak++; check.setDate(check.getDate() - 1); }

  // --- Token totals ---
  let totalOutputTokens = 0;
  let totalTokens = 0;
  let totalInputTokens = 0, totalCacheRead = 0, totalCacheWrite = 0;
  for (const u of Object.values(mu)) {
    totalInputTokens += u.inputTokens || 0;
    totalOutputTokens += u.outputTokens || 0;
    totalCacheRead += u.cacheReadInputTokens || 0;
    totalCacheWrite += u.cacheCreationInputTokens || 0;
    totalTokens += (u.inputTokens || 0) + (u.outputTokens || 0) + (u.cacheReadInputTokens || 0) + (u.cacheCreationInputTokens || 0);
  }

  const totalSessions = (stats.totalSessions || 0) + recentTotalSessions;

  // Build projects array with cost distributed proportionally by outputTokens
  const projects = Object.entries(projAgg).map(([path, p]) => {
    const daily = Object.entries(p.daily).sort(([a],[b]) => a.localeCompare(b)).map(([date, d]) => {
      const dayCost = globalOutputTokens > 0 ? totalCost * (d.outputTokens / globalOutputTokens) : 0;
      return { date, sessions: d.sessions, messages: d.messages, cost: dayCost };
    });
    const sessions = daily.reduce((s, d) => s + d.sessions, 0);
    const messages = daily.reduce((s, d) => s + d.messages, 0);
    const cost = daily.reduce((s, d) => s + d.cost, 0);
    return { name: p.name, path, sessions, messages, cost, daily };
  }).sort((a, b) => b.cost - a.cost);

  return {
    provider: 'claude',
    badge: 'Claude Max',
    accent: '#D37356',
    pricingNote: 'Pricing (per MTok): Opus 4.5/4.6: In $5, Out $25, CR $0.50, CW $6.25 | Sonnet 4.5: In $3, Out $15, CR $0.30, CW $3.75 | Haiku 4.5: In $1, Out $5, CR $0.10, CW $1.25. If on Claude Max, you pay a flat monthly rate.',
    summary: {
      totalCost,
      totalSessions: totalSessions,
      totalMessages: userMessages || stats.totalMessages || 0,
      totalOutputTokens,
      totalTokens,
      tokenBreakdown: { input: totalInputTokens, output: totalOutputTokens, cacheRead: totalCacheRead, cacheWrite: totalCacheWrite },
      firstDate: stats.firstSessionDate || null,
      streak,
    },
    models,
    daily: dailyArr,
    projects,
    extra: { linesAdded, linesRemoved, filesModified },
  };
}

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
