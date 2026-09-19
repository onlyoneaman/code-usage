import { spawnSync as defaultSpawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const PACKAGE_NAME = "code-usage";
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
const UPDATE_CHECK_CACHE_PATH = join(homedir(), ".code-usage", "cache", "update-check.json");
const UPDATE_CHECK_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
const INSTALL_TIMEOUT_MS = 180_000;

export function runSelfUpdate(options = {}) {
  const {
    currentVersion = "0.0.0",
    packageName = PACKAGE_NAME,
    dryRun = false,
    spawnSync = defaultSpawnSync,
    stdout = process.stdout,
    stderr = process.stderr,
    platform = process.platform,
    cliPath = process.argv[1],
    execPath = process.execPath,
  } = options;

  const npmCmd = platform === "win32" ? "npm.cmd" : "npm";
  const latestResult = spawnSync(npmCmd, ["view", `${packageName}@latest`, "version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  writeLine(stdout, `Current ${packageName}: v${currentVersion}`);

  if (latestResult.error) {
    writeLine(stderr, `Could not run npm: ${latestResult.error.message}`);
    return 1;
  }

  if (latestResult.status !== 0) {
    const detail = String(latestResult.stderr || "").trim();
    writeLine(stderr, `Could not check the latest ${packageName} version on npm.`);
    if (detail) writeLine(stderr, detail);
    return latestResult.status || 1;
  }

  const latestVersion = String(latestResult.stdout || "").trim();
  if (!latestVersion) {
    writeLine(stderr, `Could not determine the latest ${packageName} version on npm.`);
    return 1;
  }

  writeLine(stdout, `Latest ${packageName}: v${latestVersion}`);

  const versionOrder = compareVersions(currentVersion, latestVersion);
  if (versionOrder === 0) {
    writeLine(stdout, `${packageName} is already up to date.`);
    return 0;
  }

  if (versionOrder > 0) {
    writeLine(stdout, `${packageName} is newer than the latest published npm version.`);
    return 0;
  }

  const pm = detectPackageManager(cliPath, { packageName, platform, execPath });
  if (dryRun) {
    writeLine(stdout, `Dry run: ${formatCommand(pm.command, pm.args)}`);
    return 0;
  }

  writeLine(stdout, `Updating with: ${formatCommand(pm.command, pm.args)}`);
  const installResult = spawnSync(pm.command, pm.args, { stdio: "inherit" });

  if (installResult.error) {
    writeLine(stderr, `Update failed: ${installResult.error.message}`);
    return 1;
  }

  if (installResult.status !== 0) {
    writeLine(stderr, `Update failed with exit code ${installResult.status || 1}.`);
    writeLine(
      stderr,
      `If ${pm.name} needs elevated permissions, fix your global ${pm.name} prefix or rerun with the needed privileges.`,
    );
    return installResult.status || 1;
  }

  writeLine(stdout, `Updated ${packageName} to v${latestVersion}.`);
  writeLine(stdout, `Run \`${packageName} -v\` to verify the active command version.`);
  return 0;
}

/**
 * Scheduled runs (launchd/cron) get a minimal PATH, so the manager binary is
 * resolved from known install locations first and only then left to PATH.
 */
export function detectPackageManager(cliPath = process.argv[1], options = {}) {
  const { packageName = PACKAGE_NAME, platform = process.platform, execPath = process.execPath } = options;
  const path = String(cliPath || "").replace(/\\/g, "/");
  const spec = `${packageName}@latest`;
  const nodeBinDir = dirname(execPath);
  const homeOf = (marker) => path.slice(0, path.indexOf(marker) + marker.length);
  const resolve = (name, dirs) => {
    const file = platform === "win32" && name !== "bun" ? `${name}.cmd` : name;
    return dirs.map((dir) => join(dir, file)).find((candidate) => existsSync(candidate)) || file;
  };
  if (path.includes("/pnpm/")) {
    return { name: "pnpm", command: resolve("pnpm", [homeOf("/pnpm/"), nodeBinDir]), args: ["add", "-g", spec] };
  }
  if (path.includes("/.bun/")) {
    return { name: "bun", command: resolve("bun", [join(homeOf("/.bun/"), "bin")]), args: ["add", "-g", spec] };
  }
  if (path.includes("/yarn/")) {
    return { name: "yarn", command: resolve("yarn", [nodeBinDir]), args: ["global", "add", spec] };
  }
  return { name: "npm", command: resolve("npm", [nodeBinDir]), args: ["install", "-g", spec] };
}

export async function fetchLatestVersion(options = {}) {
  const { fetchImpl = fetch, timeoutMs = FETCH_TIMEOUT_MS } = options;
  try {
    const res = await fetchImpl(REGISTRY_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.version === "string" ? body.version : null;
  } catch {
    return null;
  }
}

export async function checkForUpdate(options = {}) {
  const {
    currentVersion = "0.0.0",
    cachePath = UPDATE_CHECK_CACHE_PATH,
    ttlMs = UPDATE_CHECK_TTL_MS,
    now = Date.now(),
    fetchImpl,
  } = options;

  const cached = readJson(cachePath);
  const cacheAgeMs = cached ? now - Date.parse(cached.checkedAt) : Number.POSITIVE_INFINITY;
  let latestVersion;
  if (Number.isFinite(cacheAgeMs) && cacheAgeMs >= 0 && cacheAgeMs < ttlMs) {
    latestVersion = cached.latestVersion ?? null;
  } else {
    latestVersion = await fetchLatestVersion({ fetchImpl });
    writeJson(cachePath, { checkedAt: new Date(now).toISOString(), latestVersion });
  }

  return {
    latestVersion,
    updateAvailable: !!latestVersion && compareVersions(currentVersion, latestVersion) < 0,
  };
}

/**
 * Runs after a sync so a replaced install never disturbs the current process.
 * A server-mandated minVersion bypasses the 24h check cache. Never throws.
 */
export async function maybeAutoUpdate(options = {}) {
  const {
    currentVersion = "0.0.0",
    minVersion = null,
    config = {},
    quiet = false,
    spawnSync = defaultSpawnSync,
    fetchImpl,
    cachePath,
    now,
    cliPath = process.argv[1],
    platform = process.platform,
    execPath = process.execPath,
    stdout = process.stdout,
    stderr = process.stderr,
  } = options;

  try {
    const belowMinimum = !!minVersion && compareVersions(currentVersion, minVersion) < 0;

    if (config.autoUpdate === false) {
      if (belowMinimum) {
        writeLine(
          stderr,
          `aicodeusage.com requires ${PACKAGE_NAME} v${minVersion} or newer (you have v${currentVersion}); run \`${PACKAGE_NAME} update\`.`,
        );
      }
      return { updated: false };
    }

    let latestVersion;
    if (belowMinimum) {
      latestVersion = await fetchLatestVersion({ fetchImpl });
    } else {
      const check = await checkForUpdate({ currentVersion, cachePath, now, fetchImpl });
      if (!check.updateAvailable) return { updated: false };
      latestVersion = check.latestVersion;
    }

    const versionLabel = latestVersion ? ` to v${latestVersion}` : "";
    if (!quiet) writeLine(stdout, `Updating ${PACKAGE_NAME}${versionLabel}...`);

    const pm = detectPackageManager(cliPath, { platform, execPath });
    const result = spawnSync(pm.command, pm.args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: INSTALL_TIMEOUT_MS,
    });
    const failure = result.error
      ? result.error.message
      : result.status !== 0
        ? lastLine(result.stderr) || `exit code ${result.status ?? "unknown"}`
        : null;
    if (failure) {
      writeLine(stderr, `Auto-update failed (${failure}). Run \`${formatCommand(pm.command, pm.args)}\` manually.`);
      return { updated: false };
    }

    writeLine(stdout, `Updated ${PACKAGE_NAME}${versionLabel}; takes effect on the next run.`);
    return { updated: true, latestVersion };
  } catch (err) {
    writeLine(stderr, `Auto-update failed: ${err instanceof Error ? err.message : String(err)}`);
    return { updated: false };
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(path, value) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(value), "utf8");
  } catch {
    // Cache is best-effort; the next run simply checks again.
  }
}

function lastLine(text) {
  return String(text || "")
    .trim()
    .split("\n")
    .pop();
}

function writeLine(stream, text) {
  stream.write(`${text}\n`);
}

function formatCommand(command, args) {
  return [command, ...args].join(" ");
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (let i = 0; i < Math.max(leftParts.length, rightParts.length); i++) {
    const leftValue = leftParts[i] || 0;
    const rightValue = rightParts[i] || 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }
  return 0;
}

function parseVersion(version) {
  return String(version || "")
    .trim()
    .replace(/^v/i, "")
    .split(/[+-]/)[0]
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}
