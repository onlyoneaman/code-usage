import { describe, expect, it } from "vitest";
import { runSelfUpdate } from "../src/update.js";

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

function createWritable() {
  return {
    text: "",
    write(value) {
      this.text += value;
    },
  };
}
