import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

export function collectCodex() {
  const home = homedir();
  const sessionsDir = join(home, '.codex', 'sessions');
  const archivedDir = join(home, '.codex', 'archived_sessions');
  const historyFile = join(home, '.codex', 'history.jsonl');

  // Gather all JSONL session files
  const files = [];
  if (existsSync(sessionsDir)) collectJsonlFiles(sessionsDir, files);
  if (existsSync(archivedDir)) collectJsonlFiles(archivedDir, files);
  files.sort();

  const modelUsage = {};
  const dailyActivity = {};
  const dailyModelTokens = {};

  let totalSessions = 0;
  let totalMessages = 0;
  let firstDate = null;

  for (const fpath of files) {
    let sessionInput = 0;
    let sessionOutput = 0;
    let sessionCached = 0;
    let sessionReasoning = 0;
    let sessionModel = null;
    let sessionDate = null;
    let sessionMessages = 0;
    let hasUsage = false;

    let lines;
    try {
      lines = readFileSync(fpath, 'utf8').split('\n');
    } catch { continue; }

    for (const line of lines) {
      if (!line.trim()) continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }

      const etype = entry.type;
      const payload = entry.payload || {};

      // session_meta → date, model
      if (etype === 'session_meta') {
        const ts = payload.timestamp || entry.timestamp || '';
        if (ts) sessionDate = ts.slice(0, 10);
        sessionModel = payload.model
          || (payload.collaboration_mode?.settings?.model)
          || null;
      }

      // event_msg → token usage (cumulative — take max)
      if (etype === 'event_msg' && payload && typeof payload === 'object') {
        const info = payload.info;
        if (info && typeof info === 'object') {
          const tu = info.total_token_usage;
          if (tu) {
            hasUsage = true;
            sessionInput = Math.max(sessionInput, tu.input_tokens || 0);
            sessionOutput = Math.max(sessionOutput, tu.output_tokens || 0);
            sessionCached = Math.max(sessionCached, tu.cached_input_tokens || 0);
            sessionReasoning = Math.max(sessionReasoning, tu.reasoning_output_tokens || 0);
          }
          const m = info.model || payload.model;
          if (m) sessionModel = m;
        }
        const cm = payload.collaboration_mode;
        if (cm?.settings?.model) sessionModel = cm.settings.model;
      }

      // Count user messages
      if (etype === 'response_item' && payload && typeof payload === 'object') {
        if (payload.role === 'user') {
          sessionMessages++;
        } else if (Array.isArray(payload.content)) {
          for (const c of payload.content) {
            if (c && typeof c === 'object' && c.role === 'user') {
              sessionMessages++;
              break;
            }
          }
        }
      }
    }

    // Fallback: extract date from filename (rollout-YYYY-MM-DDTHH-MM-SS-...)
    if (!sessionDate) {
      const bname = basename(fpath);
      const match = bname.match(/rollout-(\d{4}-\d{2}-\d{2})/);
      if (match) sessionDate = match[1];
    }
    if (!sessionDate) continue;

    if (!sessionModel) sessionModel = 'gpt-5.3-codex';

    totalSessions++;
    totalMessages += sessionMessages;

    if (!firstDate || sessionDate < firstDate) firstDate = sessionDate;

    // Daily activity
    if (!dailyActivity[sessionDate]) dailyActivity[sessionDate] = { sessions: 0, messages: 0 };
    dailyActivity[sessionDate].sessions++;
    dailyActivity[sessionDate].messages += sessionMessages;

    if (hasUsage) {
      // Model usage
      if (!modelUsage[sessionModel]) {
        modelUsage[sessionModel] = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningOutputTokens: 0 };
      }
      modelUsage[sessionModel].inputTokens += sessionInput;
      modelUsage[sessionModel].outputTokens += sessionOutput;
      modelUsage[sessionModel].cachedInputTokens += sessionCached;
      modelUsage[sessionModel].reasoningOutputTokens += sessionReasoning;

      // Daily model tokens
      if (!dailyModelTokens[sessionDate]) dailyModelTokens[sessionDate] = {};
      dailyModelTokens[sessionDate][sessionModel] = (dailyModelTokens[sessionDate][sessionModel] || 0) + sessionInput + sessionOutput;
    }
  }

  // Count history prompts
  if (existsSync(historyFile)) {
    try {
      const histLines = readFileSync(historyFile, 'utf8').split('\n');
      for (const line of histLines) {
        if (!line.trim()) continue;
        try { JSON.parse(line); totalMessages++; } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  // Build sorted arrays
  const dailyArr = Object.keys(dailyActivity).sort().map(date => ({
    date,
    messageCount: dailyActivity[date].messages,
    sessionCount: dailyActivity[date].sessions,
  }));

  const dmtArr = Object.keys(dailyModelTokens).sort().map(date => ({
    date,
    tokensByModel: dailyModelTokens[date],
  }));

  return {
    provider: 'codex',
    modelUsage,
    dailyActivity: dailyArr,
    dailyModelTokens: dmtArr,
    totalSessions,
    totalMessages,
    firstSessionDate: firstDate ? `${firstDate}T00:00:00.000Z` : null,
  };
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
