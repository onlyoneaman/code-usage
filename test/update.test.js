import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkForUpdate,
  detectPackageManager,
  fetchLatestVersion,
  maybeAutoUpdate,
  runSelfUpdate,
} from "../src/update.js";

const NPM_CLI_PATH = "/usr/local/lib/node_modules/code-usage/bin/code-usage.js";
const NO_NODE_BIN = "/nonexistent/node/bin/node";

describe("runSelfUpdate", () => {
  it("reports up to date without installing", () => {
    const calls = [];
    const stdout = createWritable();
    const stderr = createWritable();

    const status = runSelfUpdate({
      currentVersion: "1.2.3",
      packageName: "code-usage",
      spawnSync: (command, args, options) => {
        calls.push({ command, args, options });
        return { status: 0, stdout: "1.2.3\n", stderr: "" };
      },
      stdout,
      stderr,
    });

    expect(status).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(["view", "code-usage@latest", "version"]);
    expect(stdout.text).toContain("code-usage is already up to date.");
    expect(stderr.text).toBe("");
  });

  it("supports dry-run installs for newer versions", () => {
    const calls = [];
    const stdout = createWritable();

    const status = runSelfUpdate({
      currentVersion: "1.2.3",
      packageName: "code-usage",
      dryRun: true,
      cliPath: NPM_CLI_PATH,
      execPath: NO_NODE_BIN,
      spawnSync: (command, args, options) => {
        calls.push({ command, args, options });
        return { status: 0, stdout: "1.2.4\n", stderr: "" };
      },
      stdout,
      stderr: createWritable(),
    });

    expect(status).toBe(0);
    expect(calls).toHaveLength(1);
    expect(stdout.text).toContain("Latest code-usage: v1.2.4");
    expect(stdout.text).toContain("Dry run: npm install -g code-usage@latest");
  });

  it("does not install when the local version is newer than npm latest", () => {
    const calls = [];
    const stdout = createWritable();

    const status = runSelfUpdate({
      currentVersion: "1.2.4",
      packageName: "code-usage",
      spawnSync: (command, args, options) => {
        calls.push({ command, args, options });
        return { status: 0, stdout: "1.2.3\n", stderr: "" };
      },
      stdout,
      stderr: createWritable(),
    });

    expect(status).toBe(0);
    expect(calls).toHaveLength(1);
    expect(stdout.text).toContain("code-usage is newer than the latest published npm version.");
  });

  it("installs the latest package globally when outdated", () => {
    const calls = [];
    const stdout = createWritable();

    const status = runSelfUpdate({
      currentVersion: "1.2.3",
      packageName: "code-usage",
      cliPath: NPM_CLI_PATH,
      execPath: NO_NODE_BIN,
      spawnSync: (command, args, options) => {
        calls.push({ command, args, options });
        if (args[0] === "view") return { status: 0, stdout: "1.2.4\n", stderr: "" };
        return { status: 0 };
      },
      stdout,
      stderr: createWritable(),
    });

    expect(status).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls[1].command).toBe("npm");
    expect(calls[1].args).toEqual(["install", "-g", "code-usage@latest"]);
    expect(calls[1].options).toEqual({ stdio: "inherit" });
    expect(stdout.text).toContain("Updated code-usage to v1.2.4.");
  });

  it("returns failure when npm cannot check latest", () => {
    const stderr = createWritable();

    const status = runSelfUpdate({
      currentVersion: "1.2.3",
      packageName: "code-usage",
      spawnSync: () => ({ status: 1, stdout: "", stderr: "registry unavailable\n" }),
      stdout: createWritable(),
      stderr,
    });

    expect(status).toBe(1);
    expect(stderr.text).toContain("Could not check the latest code-usage version on npm.");
    expect(stderr.text).toContain("registry unavailable");
  });
});

describe("detectPackageManager", () => {
  const opts = { platform: "linux", execPath: NO_NODE_BIN };

  it("maps the CLI install path to the package manager that owns it", () => {
    expect(
      detectPackageManager("/Users/me/Library/pnpm/global/5/node_modules/code-usage/bin/code-usage.js", opts),
    ).toEqual({ name: "pnpm", command: "pnpm", args: ["add", "-g", "code-usage@latest"] });
    expect(
      detectPackageManager("/Users/me/.bun/install/global/node_modules/code-usage/bin/code-usage.js", opts),
    ).toEqual({ name: "bun", command: "bun", args: ["add", "-g", "code-usage@latest"] });
    expect(
      detectPackageManager("/Users/me/.config/yarn/global/node_modules/code-usage/bin/code-usage.js", opts),
    ).toEqual({ name: "yarn", command: "yarn", args: ["global", "add", "code-usage@latest"] });
    expect(detectPackageManager(NPM_CLI_PATH, opts)).toEqual({
      name: "npm",
      command: "npm",
      args: ["install", "-g", "code-usage@latest"],
    });
  });

  it("uses npm.cmd on Windows and handles backslash paths", () => {
    const win = { platform: "win32", execPath: NO_NODE_BIN };
    expect(
      detectPackageManager("C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\code-usage\\bin\\code-usage.js", win),
    ).toMatchObject({ name: "npm", command: "npm.cmd" });
    expect(
      detectPackageManager(
        "C:\\Users\\me\\AppData\\Local\\pnpm\\global\\5\\node_modules\\code-usage\\bin\\code-usage.js",
        win,
      ),
    ).toMatchObject({ name: "pnpm", command: "pnpm.cmd" });
  });

  it("falls back to npm when no path is available", () => {
    expect(detectPackageManager(undefined, opts).name).toBe("npm");
  });

  it("prefers the npm that ships beside the running node so cron and launchd runs work without PATH", () => {
    const dir = mkdtempSync(join(tmpdir(), "code-usage-nodebin-"));
    try {
      writeFileSync(join(dir, "npm"), "");
      expect(detectPackageManager(NPM_CLI_PATH, { platform: "linux", execPath: join(dir, "node") }).command).toBe(
        join(dir, "npm"),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("resolves bun from the .bun home that owns the install", () => {
    const home = mkdtempSync(join(tmpdir(), "code-usage-bun-"));
    try {
      mkdirSync(join(home, ".bun", "bin"), { recursive: true });
      writeFileSync(join(home, ".bun", "bin", "bun"), "");
      const cliPath = join(home, ".bun", "install", "global", "node_modules", "code-usage", "bin", "code-usage.js");
      expect(detectPackageManager(cliPath, opts).command).toBe(join(home, ".bun", "bin", "bun"));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("fetchLatestVersion", () => {
  it("returns the version from the registry", async () => {
    const version = await fetchLatestVersion({ fetchImpl: mockFetch({ version: "2.0.0" }) });
    expect(version).toBe("2.0.0");
  });

  it("returns null on non-ok responses, malformed bodies, and network errors", async () => {
    expect(await fetchLatestVersion({ fetchImpl: mockFetch({ version: "2.0.0" }, 500) })).toBeNull();
    expect(await fetchLatestVersion({ fetchImpl: mockFetch({}) })).toBeNull();
    expect(
      await fetchLatestVersion({
        fetchImpl: async () => {
          throw new Error("offline");
        },
      }),
    ).toBeNull();
  });
});

describe("checkForUpdate", () => {
  let dir;
  let cachePath;
  const t0 = Date.parse("2026-01-01T00:00:00.000Z");
  const hour = 60 * 60 * 1000;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "code-usage-update-"));
    cachePath = join(dir, "cache", "update-check.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("hits the registry once and serves the cached answer within the TTL", async () => {
    const fetchImpl = countingFetch({ version: "1.3.0" });

    const first = await checkForUpdate({ currentVersion: "1.2.0", cachePath, now: t0, fetchImpl });
    expect(first).toEqual({ latestVersion: "1.3.0", updateAvailable: true });
    expect(fetchImpl.calls).toBe(1);
    expect(JSON.parse(readFileSync(cachePath, "utf8"))).toEqual({
      checkedAt: "2026-01-01T00:00:00.000Z",
      latestVersion: "1.3.0",
    });

    const second = await checkForUpdate({ currentVersion: "1.2.0", cachePath, now: t0 + 23 * hour, fetchImpl });
    expect(second).toEqual({ latestVersion: "1.3.0", updateAvailable: true });
    expect(fetchImpl.calls).toBe(1);
  });

  it("re-checks once the cache is older than the TTL", async () => {
    const fetchImpl = countingFetch({ version: "1.3.0" });
    await checkForUpdate({ currentVersion: "1.2.0", cachePath, now: t0, fetchImpl });
    await checkForUpdate({ currentVersion: "1.2.0", cachePath, now: t0 + 25 * hour, fetchImpl });
    expect(fetchImpl.calls).toBe(2);
    expect(JSON.parse(readFileSync(cachePath, "utf8")).checkedAt).toBe("2026-01-02T01:00:00.000Z");
  });

  it("reports no update when current is at or above latest", async () => {
    const fetchImpl = countingFetch({ version: "1.2.0" });
    expect(await checkForUpdate({ currentVersion: "1.2.0", cachePath, now: t0, fetchImpl })).toEqual({
      latestVersion: "1.2.0",
      updateAvailable: false,
    });
    expect(await checkForUpdate({ currentVersion: "1.9.0", cachePath, now: t0, fetchImpl })).toEqual({
      latestVersion: "1.2.0",
      updateAvailable: false,
    });
  });

  it("caches a failed lookup so the registry is not retried every run", async () => {
    const fetchImpl = countingFetch({}, 503);
    expect(await checkForUpdate({ currentVersion: "1.2.0", cachePath, now: t0, fetchImpl })).toEqual({
      latestVersion: null,
      updateAvailable: false,
    });
    await checkForUpdate({ currentVersion: "1.2.0", cachePath, now: t0 + hour, fetchImpl });
    expect(fetchImpl.calls).toBe(1);
  });

  it("ignores a corrupt cache file", async () => {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, "{not json");
    const fetchImpl = countingFetch({ version: "1.3.0" });
    const result = await checkForUpdate({ currentVersion: "1.2.0", cachePath, now: t0, fetchImpl });
    expect(result.updateAvailable).toBe(true);
    expect(fetchImpl.calls).toBe(1);
  });
});

describe("maybeAutoUpdate", () => {
  let dir;
  let cachePath;
  const t0 = Date.parse("2026-01-01T00:00:00.000Z");

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "code-usage-autoupdate-"));
    cachePath = join(dir, "update-check.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function run(overrides) {
    const calls = [];
    const stdout = createWritable();
    const stderr = createWritable();
    const spawnSync = (command, args, options) => {
      calls.push({ command, args, options });
      return overrides.installResult || { status: 0, stdout: "", stderr: "" };
    };
    const promise = maybeAutoUpdate({
      currentVersion: "1.2.0",
      config: {},
      cachePath,
      now: t0,
      cliPath: NPM_CLI_PATH,
      platform: "linux",
      execPath: NO_NODE_BIN,
      spawnSync,
      stdout,
      stderr,
      ...overrides,
    });
    return promise.then((result) => ({ result, calls, stdout, stderr }));
  }

  it("does nothing when autoUpdate is disabled and no minimum is required", async () => {
    const fetchImpl = countingFetch({ version: "9.9.9" });
    const { calls, stdout, stderr } = await run({ config: { autoUpdate: false }, fetchImpl });
    expect(calls).toHaveLength(0);
    expect(fetchImpl.calls).toBe(0);
    expect(stdout.text).toBe("");
    expect(stderr.text).toBe("");
  });

  it("warns instead of installing when autoUpdate is disabled but the server requires a newer version", async () => {
    const { calls, stderr } = await run({
      config: { autoUpdate: false },
      minVersion: "1.3.0",
      fetchImpl: countingFetch({ version: "1.3.0" }),
    });
    expect(calls).toHaveLength(0);
    expect(stderr.text).toContain("requires code-usage v1.3.0 or newer (you have v1.2.0)");
  });

  it("does not warn when autoUpdate is disabled and current already satisfies minVersion", async () => {
    const { calls, stderr } = await run({ config: { autoUpdate: false }, minVersion: "1.2.0" });
    expect(calls).toHaveLength(0);
    expect(stderr.text).toBe("");
  });

  it("installs immediately when minVersion is newer, bypassing a fresh cache", async () => {
    writeFileSync(cachePath, JSON.stringify({ checkedAt: new Date(t0).toISOString(), latestVersion: "1.2.0" }));
    const fetchImpl = countingFetch({ version: "1.4.0" });
    const { result, calls, stdout } = await run({ minVersion: "1.3.0", fetchImpl });
    expect(fetchImpl.calls).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe("npm");
    expect(calls[0].args).toEqual(["install", "-g", "code-usage@latest"]);
    expect(result).toEqual({ updated: true, latestVersion: "1.4.0" });
    expect(stdout.text).toContain("Updated code-usage to v1.4.0; takes effect on the next run.");
  });

  it("installs when the registry reports a newer version", async () => {
    const { calls, stdout } = await run({ fetchImpl: countingFetch({ version: "1.2.1" }) });
    expect(calls).toHaveLength(1);
    expect(stdout.text).toContain("Updating code-usage to v1.2.1...");
    expect(stdout.text).toContain("Updated code-usage to v1.2.1; takes effect on the next run.");
  });

  it("suppresses the progress line but not the result line when quiet", async () => {
    const { stdout } = await run({ quiet: true, fetchImpl: countingFetch({ version: "1.2.1" }) });
    expect(stdout.text).not.toContain("Updating code-usage");
    expect(stdout.text).toContain("Updated code-usage to v1.2.1; takes effect on the next run.");
  });

  it("skips the install when already up to date", async () => {
    const { result, calls, stdout } = await run({ fetchImpl: countingFetch({ version: "1.2.0" }) });
    expect(calls).toHaveLength(0);
    expect(result).toEqual({ updated: false });
    expect(stdout.text).toBe("");
  });

  it("uses the cached check and does not hit the registry again within the TTL", async () => {
    writeFileSync(cachePath, JSON.stringify({ checkedAt: new Date(t0).toISOString(), latestVersion: "1.2.0" }));
    const fetchImpl = countingFetch({ version: "5.0.0" });
    const { calls } = await run({ fetchImpl, now: t0 + 1000 });
    expect(fetchImpl.calls).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("reports install failures on one line and never throws", async () => {
    const { result, stderr } = await run({
      fetchImpl: countingFetch({ version: "1.2.1" }),
      installResult: { status: 243, stdout: "", stderr: "npm ERR! code EACCES\nnpm ERR! permission denied\n" },
    });
    expect(result).toEqual({ updated: false });
    expect(stderr.text).toBe(
      "Auto-update failed (npm ERR! permission denied). Run `npm install -g code-usage@latest` manually.\n",
    );
  });

  it("reports spawn errors and never throws", async () => {
    const { result, stderr } = await run({
      fetchImpl: countingFetch({ version: "1.2.1" }),
      installResult: { error: new Error("spawn npm ENOENT"), status: null },
    });
    expect(result).toEqual({ updated: false });
    expect(stderr.text).toContain("Auto-update failed (spawn npm ENOENT)");
  });
});

function mockFetch(body, status = 200) {
  return async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
}

function countingFetch(body, status = 200) {
  const inner = mockFetch(body, status);
  const fetchImpl = async (...args) => {
    fetchImpl.calls++;
    return inner(...args);
  };
  fetchImpl.calls = 0;
  return fetchImpl;
}

function createWritable() {
  return {
    text: "",
    write(value) {
      this.text += value;
    },
  };
}
