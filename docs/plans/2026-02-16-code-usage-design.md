# code-usage — Unified AI Coding Tool Usage Dashboard

## Problem
Developers using Claude Code and Codex CLI have no unified way to see their usage across tools. Claude has a custom `claude-usage` script; Codex has nothing. Both store rich session data locally but there's no tool to aggregate, visualize, and estimate costs.

## Solution
An npm package (`code-usage`) that reads local session data from Claude Code and Codex CLI, calculates estimated API-equivalent costs, and opens a browser dashboard with tabs.

## Architecture

```
code-usage/
  bin/code-usage.js              # CLI entry (#!/usr/bin/env node)
  src/
    collectors/
      claude.js                  # ~/.claude → normalized JSON
      codex.js                   # ~/.codex → normalized JSON
    pricing/
      claude.js                  # Claude model pricing per MTok
      codex.js                   # Codex model pricing per MTok
    dashboard.js                 # Inject data → HTML → open browser
  templates/
    dashboard.html               # Unified tabbed HTML dashboard
  package.json
  LICENSE
```

### Dependencies
- `open` — cross-platform browser opening (only runtime dep)

## Data Flow

```
CLI entry
  → detect data sources (~/.claude, ~/.codex)
  → if neither found: print install message, exit
  → collect Claude data (collectors/claude.js)
  → collect Codex data (collectors/codex.js)
  → determine default tab (All if both, else whichever exists)
  → inject into HTML template
  → write to /tmp/code-usage-dashboard.html
  → open in browser via 'open' package
```

## Tabs

Three tabs: **All** | **Claude** | **Codex**

| Scenario | Default Tab | Other Tabs |
|---|---|---|
| Both found | All | Claude + Codex with data |
| Only Claude | Claude | All same as Claude, Codex shows "no data" |
| Only Codex | Codex | All same as Codex, Claude shows "no data" |

### "All" (Combined) Tab
- Merges stats: total sessions, total messages, total cost, daily activity
- Daily activity chart shows stacked bars (purple=Claude, green=Codex)
- Model cost cards show all models from both tools
- Weekly chart shows combined cost

### Per-Tool Tabs
- Identical layout to each other for consistency
- Claude uses purple accent (#8b5cf6)
- Codex uses green accent (#10b981)

## Data Normalization

Both collectors return the same shape:
```js
{
  provider: "claude" | "codex",
  modelUsage: { [modelId]: { inputTokens, outputTokens, cacheTokens, cacheWriteTokens?, reasoningTokens? } },
  dailyActivity: [{ date, messageCount, sessionCount }],
  dailyModelTokens: [{ date, tokensByModel: { [model]: totalTokens } }],
  totalSessions: number,
  totalMessages: number,
  firstSessionDate: string (ISO)
}
```

### Claude Collector
Reads: `~/.claude/stats-cache.json` + `~/.claude/usage-data/session-meta/*.json` + live `.jsonl` transcripts
Token fields: inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens

### Codex Collector
Reads: `~/.codex/sessions/**/*.jsonl` + `~/.codex/archived_sessions/*.jsonl` + `~/.codex/history.jsonl`
Token fields: input_tokens, output_tokens, cached_input_tokens, reasoning_output_tokens
Note: total_token_usage in event_msg entries is cumulative — take max per session.

## Pricing

### Claude (per 1M tokens)
| Model | Input | Output | Cache Read | Cache Write |
|---|---|---|---|---|
| Opus 4.5/4.6 | $5 | $25 | $0.50 | $6.25 |
| Sonnet 4.5 | $3 | $15 | $0.30 | $3.75 |
| Haiku 4.5 | $1 | $5 | $0.10 | $1.25 |

### Codex (per 1M tokens)
| Model | Input | Output | Cached Input | Reasoning |
|---|---|---|---|---|
| gpt-5.3-codex | $1.75 | $14.00 | $0.175 | $14.00 |
| gpt-5.2-codex | $1.75 | $14.00 | $0.175 | $14.00 |
| gpt-5.1-codex | $1.25 | $10.00 | $0.125 | $10.00 |
| gpt-5-codex | $1.25 | $10.00 | $0.125 | $10.00 |

## Dashboard Layout (per tab)

1. **Stat cards** (4-col grid): Total Est. Cost, Cost/Day, Cost/Session, Streak, Messages, Output Tokens
2. **Daily Activity** bar chart (full date range, tooltips with cost + sessions)
3. **Cost Breakdown by Model** cards (token breakdown + per-category cost)
4. **Weekly Usage** bar chart (cost per week)
5. **Daily Cost** table (date, tokens, models, est. cost)
6. **Pricing note** with rates + "If on subscription, you pay a flat monthly rate"

## Verification
1. `npm link` and run `code-usage` — both tabs render
2. Tab switching works, URL hash updates
3. Cost calculations match manual spot-checks
4. Test with only Claude data (rename ~/.codex temporarily)
5. Test with only Codex data (rename ~/.claude temporarily)
6. Test with neither — prints install message
