import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("open", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

const ORIG_HOME = process.env.HOME;
const ORIG_USERPROFILE = process.env.USERPROFILE;

function createTempHome() {
  return mkdtempSync(join(tmpdir(), "code-usage-auth-test-"));
}

async function loadAuthModule(tempHome) {
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
  vi.resetModules();
  return import("../../src/cloud/auth.js");
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.env.HOME = ORIG_HOME;
  process.env.USERPROFILE = ORIG_USERPROFILE;
});

describe("cloud auth installation id", () => {
  it("creates and reuses a persistent installation id", async () => {
    const tempHome = createTempHome();
    try {
      const auth = await loadAuthModule(tempHome);
      const id1 = auth.getOrCreateInstallationId();
      const id2 = auth.getOrCreateInstallationId();

      expect(id1).toBe(id2);
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

      const installationPath = join(tempHome, ".code-usage", "installation-id");
      expect(existsSync(installationPath)).toBe(true);
      expect(readFileSync(installationPath, "utf8").trim()).toBe(id1);
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it("sends installationId in pair/start payload during login", async () => {
    const tempHome = createTempHome();
    try {
      const auth = await loadAuthModule(tempHome);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              pairingId: "pair_1",
              verifyUrl: "https://aicodeusage.com/pair?id=pair_1",
              expiresAt,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              deviceId: "dev_1",
              deviceSecret: "secret_1",
              userId: "user_1",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );

      vi.stubGlobal("fetch", fetchMock);
      vi.useFakeTimers();

      const loginPromise = auth.login("https://aicodeusage.com");
      await vi.advanceTimersByTimeAsync(3000);
      await loginPromise;

      const startCall = fetchMock.mock.calls[0];
      expect(startCall[0]).toBe("https://aicodeusage.com/v0/device/pair/start");
      const startBody = JSON.parse(startCall[1].body);

      const installationPath = join(tempHome, ".code-usage", "installation-id");
      const installationId = readFileSync(installationPath, "utf8").trim();

      expect(startBody.installationId).toBe(installationId);
      expect(startBody.installationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
