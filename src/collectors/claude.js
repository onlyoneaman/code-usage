import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

export function collectClaude() {
  const home = homedir();
  const statsFile = join(home, '.claude', 'stats-cache.json');
  const sessionMetaDir = join(home, '.claude', 'usage-data', 'session-meta');
  const projectsDir = join(home, '.claude', 'projects');

  const stats = JSON.parse(readFileSync(statsFile, 'utf8'));
  const lastDate = stats.lastComputedDate || '1970-01-01';

  // Aggregate session-meta files
  let linesAdded = 0;
  let linesRemoved = 0;
  let filesModified = 0;
  let userMessages = 0;
  let recentSessions = 0;
  let recentUserMsgs = 0;
  let recentOutput = 0;
  const recentModels = new Set();

  if (existsSync(sessionMetaDir)) {
    for (const file of readdirSync(sessionMetaDir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const s = JSON.parse(readFileSync(join(sessionMetaDir, file), 'utf8'));
        linesAdded += s.lines_added || 0;
        linesRemoved += s.lines_removed || 0;
        filesModified += s.files_modified || 0;
        userMessages += s.user_message_count || 0;
        const start = (s.start_time || '').slice(0, 10);
        if (start > lastDate) {
          recentSessions++;
          recentUserMsgs += s.user_message_count || 0;
          recentOutput += s.output_tokens || 0;
          if (s.model) recentModels.add(s.model);
        }
      } catch { /* skip corrupt files */ }
    }
  }

  // If no recent sessions from meta, scan live transcripts
  if (recentSessions === 0 && existsSync(projectsDir)) {
    const seen = new Set();
    for (const projEntry of readdirSync(projectsDir, { withFileTypes: true })) {
      if (!projEntry.isDirectory()) continue;
      const projPath = join(projectsDir, projEntry.name);
      for (const file of readdirSync(projPath)) {
        if (!file.endsWith('.jsonl')) continue;
        try {
          const fpath = join(projPath, file);
          const mtime = statSync(fpath).mtime;
          const mtimeDate = mtime.toISOString().slice(0, 10);
          if (mtimeDate <= lastDate) continue;
          const sid = basename(file, '.jsonl');
          if (seen.has(sid)) continue;
          seen.add(sid);
          recentSessions++;
          const lines = readFileSync(fpath, 'utf8').split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const entry = JSON.parse(line);
              if (entry.type === 'user') recentUserMsgs++;
              if (entry.type === 'assistant') {
                const m = entry.message || {};
                if (m.model) recentModels.add(m.model);
                for (const block of (m.content || [])) {
                  if (block && typeof block === 'object' && block.type === 'text') {
                    recentOutput += Math.floor((block.text || '').length / 4);
                  }
                }
              }
            } catch { /* skip bad line */ }
          }
        } catch { /* skip unreadable file */ }
      }
    }
  }

  return {
    provider: 'claude',
    stats,
    extra: {
      linesAdded,
      linesRemoved,
      filesModified,
      userMessages,
      recentSessions,
      recentUserMessages: recentUserMsgs,
      recentOutputTokens: recentOutput,
      recentModels: [...recentModels].sort(),
      lastComputedDate: lastDate,
    },
  };
}
