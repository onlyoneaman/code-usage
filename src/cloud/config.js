import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

const CONFIG_DIR = join(homedir(), ".code-usage");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const DEFAULTS = {
  syncEnabled: true,
  syncIntervalMinutes: 60,
  apiBase: "https://aicodeusage.com",
};

const CONFIG_SCHEMA = [
  { key: "syncEnabled", label: "Sync enabled", type: "boolean", description: "Automatically sync usage data" },
  { key: "syncIntervalMinutes", label: "Sync interval (minutes)", type: "number", description: "How often to sync" },
  { key: "apiBase", label: "API base URL", type: "string", description: "Server to sync with" },
];

/** Read config from disk, merged with defaults. Never creates the file. */
export function readConfig() {
  if (!existsSync(CONFIG_PATH)) return { ...DEFAULTS };
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Read raw config from disk (only what user explicitly set). */
function readRawConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

/** Write config. Only creates file if there are non-default values. */
export function writeConfig(updates) {
  const raw = readRawConfig();
  const merged = { ...raw, ...updates };

  // Strip keys that match defaults — don't store what doesn't need storing
  for (const [key, value] of Object.entries(merged)) {
    if (key in DEFAULTS && value === DEFAULTS[key]) {
      delete merged[key];
    }
  }

  if (Object.keys(merged).length === 0) {
    // Nothing non-default — remove file if it exists
    if (existsSync(CONFIG_PATH)) unlinkSync(CONFIG_PATH);
    return { ...DEFAULTS };
  }

  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), "utf8");
  return { ...DEFAULTS, ...merged };
}

/** Resolve apiBase: CLI flag > config.json > auth.json > default. */
export function resolveApiBase(flagValue, auth) {
  if (flagValue) return flagValue;
  const config = readConfig();
  if (config.apiBase && config.apiBase !== DEFAULTS.apiBase) return config.apiBase;
  if (auth?.apiBase) return auth.apiBase;
  return DEFAULTS.apiBase;
}

/** Interactive config editor. */
export async function interactiveConfig() {
  const config = readConfig();
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log("code-usage config\n");
  console.log("Press Enter to keep current value, or type a new value.\n");

  const updates = {};

  try {
    for (const field of CONFIG_SCHEMA) {
      const current = config[field.key];
      const isDefault = !(field.key in readRawConfig());
      const suffix = isDefault ? " (default)" : "";

      let answer;
      if (field.type === "boolean") {
        answer = await rl.question(`  ${field.label} [${current ? "yes" : "no"}${suffix}] (yes/no): `);
        answer = answer.trim().toLowerCase();
        if (answer === "yes" || answer === "y" || answer === "true") {
          updates[field.key] = true;
        } else if (answer === "no" || answer === "n" || answer === "false") {
          updates[field.key] = false;
        }
        // empty = keep current
      } else if (field.type === "number") {
        answer = await rl.question(`  ${field.label} [${current}${suffix}]: `);
        answer = answer.trim();
        if (answer && /^\d+$/.test(answer)) {
          updates[field.key] = Number(answer);
        }
      } else {
        answer = await rl.question(`  ${field.label} [${current}${suffix}]: `);
        answer = answer.trim();
        if (answer) {
          updates[field.key] = answer;
        }
      }
    }
  } finally {
    rl.close();
  }

  if (Object.keys(updates).length === 0) {
    console.log("\nNo changes.");
    return;
  }

  const result = writeConfig(updates);
  console.log("\nConfig saved:\n");
  for (const field of CONFIG_SCHEMA) {
    const val = result[field.key];
    const isDefault = !(field.key in readRawConfig());
    console.log(
      `  ${field.label}: ${field.type === "boolean" ? (val ? "yes" : "no") : val}${isDefault ? " (default)" : ""}`,
    );
  }
}
