# code-usage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship an npm package `code-usage` that opens a browser dashboard showing Claude Code + Codex CLI usage with estimated API costs.

**Architecture:** Node.js CLI with collectors per tool, pricing modules, and a self-contained HTML template with tab UI. Single runtime dep (`open`).

**Tech Stack:** Node.js (ESM), `open` package, vanilla HTML/CSS/JS dashboard.

---

### Task 1: Scaffold npm package

**Files:**
- Create: `package.json`
- Create: `bin/code-usage.js`
- Create: `LICENSE`
- Create: `.gitignore`

**Step 1: Initialize package.json**

```json
{
  "name": "code-usage",
  "version": "0.1.0",
  "description": "Unified usage dashboard for AI coding tools (Claude Code, Codex CLI)",
  "type": "module",
  "bin": { "code-usage": "./bin/code-usage.js" },
  "files": ["bin", "src", "templates"],
  "author": "Aman Kumar (https://amankumar.ai)",
  "license": "MIT",
  "repository": { "type": "git", "url": "git+https://github.com/onlyoneaman/code-usage.git" },
  "keywords": ["claude", "codex", "usage", "dashboard", "ai", "coding", "tokens", "cost"],
  "engines": { "node": ">=18" },
  "dependencies": { "open": "^10.0.0" }
}
```

**Step 2: Create bin/code-usage.js stub**

```js
#!/usr/bin/env node
console.log('code-usage: coming soon');
```

**Step 3: Create .gitignore + LICENSE**

**Step 4: git init + initial commit**

```bash
git init && git add -A && git commit -m "chore: scaffold npm package"
```

---

### Task 2: Create pricing modules

**Files:**
- Create: `src/pricing/claude.js`
- Create: `src/pricing/codex.js`

**Step 1: Write Claude pricing**

Per-model lookup with fuzzy fallback matching. Prices in $/1M tokens.

**Step 2: Write Codex pricing**

Same structure. gpt-5.3-codex, gpt-5.2-codex, gpt-5.1-codex, gpt-5-codex.

**Step 3: Commit**

```bash
git add src/pricing && git commit -m "feat: add pricing modules for Claude and Codex"
```

---

### Task 3: Create Claude collector

**Files:**
- Create: `src/collectors/claude.js`

**Step 1: Write collector**

Reads:
1. `~/.claude/stats-cache.json` → modelUsage, dailyActivity, dailyModelTokens, totals
2. `~/.claude/usage-data/session-meta/*.json` → linesAdded, linesRemoved, filesModified, userMessages
3. Live `.jsonl` transcripts in `~/.claude/projects/` → recent sessions not yet in stats-cache

Returns normalized shape: `{ provider, modelUsage, dailyActivity, dailyModelTokens, totalSessions, totalMessages, firstSessionDate, extra }`

**Step 2: Commit**

```bash
git add src/collectors/claude.js && git commit -m "feat: add Claude Code data collector"
```

---

### Task 4: Create Codex collector

**Files:**
- Create: `src/collectors/codex.js`

**Step 1: Write collector**

Reads:
1. `~/.codex/sessions/**/*.jsonl` + `~/.codex/archived_sessions/*.jsonl`
2. Per session: parse `session_meta` (date, model, cwd), `event_msg` (total_token_usage — take max), `response_item` (count user messages)
3. `~/.codex/history.jsonl` for additional message counts
4. Aggregate by date → dailyActivity, dailyModelTokens
5. Aggregate by model → modelUsage

**Key:** `total_token_usage` in `event_msg.info` is cumulative per session — use `Math.max()` not sum.

Returns same normalized shape as Claude collector.

**Step 2: Commit**

```bash
git add src/collectors/codex.js && git commit -m "feat: add Codex CLI data collector"
```

---

### Task 5: Create dashboard builder

**Files:**
- Create: `src/dashboard.js`

**Step 1: Write dashboard.js**

1. Read `templates/dashboard.html`
2. Replace `// DATA_PLACEHOLDER` with injected variables:
   - `CLAUDE_DATA` / `CLAUDE_EXTRA` (or null)
   - `CODEX_DATA` (or null)
   - `DEFAULT_TAB`
3. Write to `/tmp/code-usage-dashboard.html`
4. Open with `open` package

**Step 2: Commit**

```bash
git add src/dashboard.js && git commit -m "feat: add dashboard builder with data injection"
```

---

### Task 6: Create HTML dashboard template

**Files:**
- Create: `templates/dashboard.html`

**Step 1: Write unified template**

Structure:
- Header: "Code Usage Dashboard"
- Tab bar: [All] [Claude] [Codex] — pill-style segment control
- Three content panels (show/hide based on active tab)
- Each panel: stat cards, daily chart, cost cards, weekly chart, daily table, pricing note
- "All" panel merges data from both tools
- No-data state per panel
- Accent colors: All = blue (#3b82f6), Claude = purple (#8b5cf6), Codex = green (#10b981)

Reuse all working CSS + JS patterns from existing claude dashboard. Port `render()`, `fmt()`, `fmtUSD()`, `el()`, `createStatCard()`, `createModelTag()`, chart builders.

Add:
- `renderAll(claudeData, codexData)` — merged view
- `renderClaude(data, extra)` — existing logic, purple
- `renderCodex(data)` — same structure, green accent, codex pricing
- Tab switching via hash + click handlers
- Model tags: Claude models get purple/blue, Codex models get green/teal

**Step 2: Commit**

```bash
git add templates/ && git commit -m "feat: add unified HTML dashboard template with tabs"
```

---

### Task 7: Wire CLI entry point

**Files:**
- Modify: `bin/code-usage.js`

**Step 1: Wire up the CLI**

1. Import collectors + dashboard
2. Detect data: check if `~/.claude/stats-cache.json` exists, check if `~/.codex/sessions/` has .jsonl files
3. If neither → print install message → exit
4. Run collectors (only for detected sources)
5. Call dashboard builder

**Step 2: npm link and test**

```bash
npm install && npm link && code-usage
```

**Step 3: Commit**

```bash
git add bin/ && git commit -m "feat: wire CLI entry point"
```

---

### Task 8: Create GitHub repo and push

**Step 1: Create repo**

```bash
gh repo create onlyoneaman/code-usage --public --description "Unified usage dashboard for AI coding tools (Claude Code, Codex CLI)" --source . --push
```

**Step 2: Verify**

```bash
gh repo view onlyoneaman/code-usage --web
```

---

### Task 9: Verify end-to-end

**Step 1:** Run `code-usage` — verify dashboard opens with both Claude and Codex tabs populated
**Step 2:** Click each tab — verify content switches correctly
**Step 3:** Spot-check costs against manual calculations from earlier research
**Step 4:** Verify "All" tab shows combined stats
