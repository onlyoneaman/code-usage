// Claude model pricing — $/1M tokens
import { litellmLookup } from './litellm.js';

const CLAUDE_PRICING = {
  'claude-opus-4-6':            { input: 5,   output: 25, cacheRead: 0.50, cacheWrite: 6.25  },
  'claude-opus-4-5-20251101':   { input: 5,   output: 25, cacheRead: 0.50, cacheWrite: 6.25  },
  'claude-opus-4-1-20250414':   { input: 15,  output: 75, cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-opus-4-20250514':     { input: 15,  output: 75, cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-sonnet-4-5-20250929': { input: 3,   output: 15, cacheRead: 0.30, cacheWrite: 3.75  },
  'claude-sonnet-4-20250514':   { input: 3,   output: 15, cacheRead: 0.30, cacheWrite: 3.75  },
  'claude-sonnet-3-7-20250219': { input: 3,   output: 15, cacheRead: 0.30, cacheWrite: 3.75  },
  'claude-haiku-4-5-20251001':  { input: 1,   output: 5,  cacheRead: 0.10, cacheWrite: 1.25  },
  'claude-haiku-3-5-20241022':  { input: 0.8, output: 4,  cacheRead: 0.08, cacheWrite: 1.00  },
};

export function getClaudePricing(modelId) {
  if (CLAUDE_PRICING[modelId]) return CLAUDE_PRICING[modelId];
  const id = modelId.toLowerCase();
  if (id.includes('opus') && (id.includes('4-6') || id.includes('4-5')))
    return { input: 5, output: 25, cacheRead: 0.50, cacheWrite: 6.25 };
  if (id.includes('opus'))
    return { input: 15, output: 75, cacheRead: 1.50, cacheWrite: 18.75 };
  if (id.includes('sonnet'))
    return { input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75 };
  if (id.includes('haiku') && id.includes('3'))
    return { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1.00 };
  if (id.includes('haiku'))
    return { input: 1, output: 5, cacheRead: 0.10, cacheWrite: 1.25 };
  // LiteLLM fallback for unknown Claude models
  const lm = litellmLookup(modelId, ['anthropic/']);
  if (lm) return lm;
  return { input: 5, output: 25, cacheRead: 0.50, cacheWrite: 6.25 };
}

export { CLAUDE_PRICING };
