import { spawnSync as defaultSpawnSync } from "node:child_process";

export function runSelfUpdate(options = {}) {
  const {
    currentVersion = "0.0.0",
    packageName = "code-usage",
    dryRun = false,
    spawnSync = defaultSpawnSync,
    stdout = process.stdout,
    stderr = process.stderr,
    platform = process.platform,
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

  const installArgs = ["install", "-g", `${packageName}@latest`];
  if (dryRun) {
    writeLine(stdout, `Dry run: ${formatCommand(npmCmd, installArgs)}`);
    return 0;
  }

  writeLine(stdout, `Updating with: ${formatCommand(npmCmd, installArgs)}`);
  const installResult = spawnSync(npmCmd, installArgs, { stdio: "inherit" });

  if (installResult.error) {
    writeLine(stderr, `Update failed: ${installResult.error.message}`);
    return 1;
  }

  if (installResult.status !== 0) {
    writeLine(stderr, `Update failed with exit code ${installResult.status || 1}.`);
    writeLine(
      stderr,
      "If npm needs elevated permissions, fix your global npm prefix or rerun with the needed privileges.",
    );
    return installResult.status || 1;
  }

  writeLine(stdout, `Updated ${packageName} to v${latestVersion}.`);
  writeLine(stdout, `Run \`${packageName} -v\` to verify the active command version.`);
  return 0;
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
