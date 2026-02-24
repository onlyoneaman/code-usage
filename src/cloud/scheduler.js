import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readConfig } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NODE_BIN = process.execPath;
const CLI_BIN = join(__dirname, "..", "..", "bin", "code-usage.js");
const HOME = homedir();
const LOG_PATH = join(HOME, ".code-usage", "sync.log");

// --- macOS: launchd ---

const LAUNCHD_LABEL = "com.aicodeusage.sync";
const PLIST_PATH = join(HOME, "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);

function buildPlist(intervalSeconds) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${LAUNCHD_LABEL}</string>
	<key>ProgramArguments</key>
	<array>
		<string>${NODE_BIN}</string>
		<string>${CLI_BIN}</string>
		<string>--no-open</string>
		<string>--quiet</string>
	</array>
	<key>StartInterval</key>
	<integer>${intervalSeconds}</integer>
	<key>RunAtLoad</key>
	<true/>
	<key>StandardOutPath</key>
	<string>${LOG_PATH}</string>
	<key>StandardErrorPath</key>
	<string>${LOG_PATH}</string>
</dict>
</plist>`;
}

function installDarwin(intervalMinutes) {
  const dir = dirname(PLIST_PATH);
  mkdirSync(dir, { recursive: true });
  mkdirSync(dirname(LOG_PATH), { recursive: true });

  // Unload first if already loaded (ignore errors)
  try {
    execFileSync("launchctl", ["unload", PLIST_PATH], { stdio: "ignore" });
  } catch {
    // Not loaded — fine
  }

  writeFileSync(PLIST_PATH, buildPlist(intervalMinutes * 60), "utf8");
  execFileSync("launchctl", ["load", PLIST_PATH], { stdio: "ignore" });
}

function uninstallDarwin() {
  try {
    execFileSync("launchctl", ["unload", PLIST_PATH], { stdio: "ignore" });
  } catch {
    // Already unloaded
  }
  if (existsSync(PLIST_PATH)) {
    unlinkSync(PLIST_PATH);
  }
}

function isInstalledDarwin() {
  try {
    execFileSync("launchctl", ["list", LAUNCHD_LABEL], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// --- Linux: crontab ---

const CRON_TAG_START = "# code-usage-sync-start";
const CRON_TAG_END = "# code-usage-sync-end";

function buildCronEntry(intervalMinutes) {
  const cronInterval = intervalMinutes >= 60 ? "0" : `*/${intervalMinutes}`;
  const cronHour = intervalMinutes >= 60 ? `*/${Math.floor(intervalMinutes / 60)}` : "*";
  return [
    CRON_TAG_START,
    `${cronInterval} ${cronHour} * * * "${NODE_BIN}" "${CLI_BIN}" --no-open --quiet >> "${LOG_PATH}" 2>&1`,
    CRON_TAG_END,
  ].join("\n");
}

function readCrontab() {
  try {
    return execFileSync("crontab", ["-l"], { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

function writeCrontab(content) {
  execFileSync("crontab", ["-"], { input: content, stdio: ["pipe", "ignore", "ignore"] });
}

function stripOurCronEntry(crontab) {
  const lines = crontab.split("\n");
  const result = [];
  let inside = false;
  for (const line of lines) {
    if (line.trim() === CRON_TAG_START) {
      inside = true;
      continue;
    }
    if (line.trim() === CRON_TAG_END) {
      inside = false;
      continue;
    }
    if (!inside) result.push(line);
  }
  return result.join("\n");
}

function installLinux(intervalMinutes) {
  mkdirSync(dirname(LOG_PATH), { recursive: true });
  const existing = stripOurCronEntry(readCrontab());
  const entry = buildCronEntry(intervalMinutes);
  const newCrontab = `${existing.trimEnd()}\n${entry}\n`;
  writeCrontab(newCrontab);
}

function uninstallLinux() {
  const existing = readCrontab();
  if (!existing.includes(CRON_TAG_START)) return;
  const cleaned = stripOurCronEntry(existing);
  writeCrontab(cleaned);
}

function isInstalledLinux() {
  const crontab = readCrontab();
  return crontab.includes(CRON_TAG_START);
}

// --- Windows: Task Scheduler ---

const TASK_NAME = "CodeUsageSync";

function installWindows(intervalMinutes) {
  mkdirSync(dirname(LOG_PATH), { recursive: true });
  execFileSync(
    "schtasks",
    [
      "/create",
      "/tn",
      TASK_NAME,
      "/tr",
      `"${NODE_BIN}" "${CLI_BIN}" --no-open --quiet`,
      "/sc",
      "minute",
      "/mo",
      String(intervalMinutes),
      "/st",
      "00:00",
      "/f",
    ],
    { stdio: "ignore" },
  );
}

function uninstallWindows() {
  try {
    execFileSync("schtasks", ["/delete", "/tn", TASK_NAME, "/f"], { stdio: "ignore" });
  } catch {
    // Task doesn't exist
  }
}

function isInstalledWindows() {
  try {
    execFileSync("schtasks", ["/query", "/tn", TASK_NAME], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// --- Public API ---

function getMechanism() {
  switch (process.platform) {
    case "darwin":
      return "launchd";
    case "win32":
      return "schtasks";
    default:
      return "crontab";
  }
}

export function install() {
  const config = readConfig();
  const intervalMinutes = Math.max(1, Math.floor(config.syncIntervalMinutes || 60));

  switch (process.platform) {
    case "darwin":
      installDarwin(intervalMinutes);
      break;
    case "win32":
      installWindows(intervalMinutes);
      break;
    default:
      installLinux(intervalMinutes);
      break;
  }

  return { mechanism: getMechanism(), intervalMinutes };
}

export function uninstall() {
  switch (process.platform) {
    case "darwin":
      uninstallDarwin();
      break;
    case "win32":
      uninstallWindows();
      break;
    default:
      uninstallLinux();
      break;
  }
}

export function isInstalled() {
  switch (process.platform) {
    case "darwin":
      return isInstalledDarwin();
    case "win32":
      return isInstalledWindows();
    default:
      return isInstalledLinux();
  }
}

export function getInfo() {
  const config = readConfig();
  return {
    installed: isInstalled(),
    mechanism: getMechanism(),
    intervalMinutes: config.syncIntervalMinutes || 60,
  };
}
