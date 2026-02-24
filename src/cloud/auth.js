import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { arch, homedir, hostname, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import open from "open";

const AUTH_DIR = join(homedir(), ".code-usage");
const AUTH_PATH = join(AUTH_DIR, "auth.json");

function getPackageVersion() {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function readAuth() {
  try {
    return JSON.parse(readFileSync(AUTH_PATH, "utf8"));
  } catch {
    return null;
  }
}

export function writeAuth(data) {
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(AUTH_PATH, JSON.stringify(data, null, 2), "utf8");
}

export function deleteAuth() {
  try {
    unlinkSync(AUTH_PATH);
  } catch {
    // File may not exist
  }
}

export function isLoggedIn() {
  return existsSync(AUTH_PATH);
}

/**
 * Execute device pairing flow:
 * 1. POST pair/start to get pairingId + verifyUrl
 * 2. Open browser at verifyUrl
 * 3. Poll pair/confirm every 3s until confirmed, expired, or timeout
 */
export async function login(apiBase) {
  const clientVersion = getPackageVersion();

  // Stash old credentials so we can revoke after successful re-pair
  const previousAuth = readAuth();

  console.log("Starting device pairing...\n");

  // Step 1: Request pairing
  let startRes;
  try {
    startRes = await fetch(`${apiBase}/v0/device/pair/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        platform: platform(),
        arch: arch(),
        label: hostname(),
        clientVersion,
      }),
    });
  } catch (err) {
    console.error(`Failed to connect to ${apiBase}: ${err.message}`);
    process.exit(1);
  }

  if (!startRes.ok) {
    const body = await startRes.json().catch(() => ({}));
    console.error(`Pairing request failed: ${body.error || startRes.statusText}`);
    process.exit(1);
  }

  const { pairingId, verifyUrl, expiresAt } = await startRes.json();

  const expiresMs = new Date(expiresAt).getTime();
  const expiresInMin = Math.ceil((expiresMs - Date.now()) / 60000);

  console.log("Open this URL in your browser to confirm:");
  console.log(`  ${verifyUrl}`);
  console.log(`  (expires in ${expiresInMin} minutes)\n`);

  // Try to open browser
  try {
    await open(verifyUrl);
    console.log("(Browser opened automatically)");
  } catch {
    console.log("(Could not open browser automatically — open the URL above manually)");
  }

  console.log("\nWaiting for confirmation... (Ctrl+C to cancel)");

  // Step 2: Poll for confirmation
  const deadline = expiresMs;
  const POLL_INTERVAL_MS = 3000;

  // AbortController lets Ctrl+C immediately cancel sleep + fetch
  const abort = new AbortController();
  const onSigint = () => abort.abort();
  process.on("SIGINT", onSigint);

  try {
    while (!abort.signal.aborted) {
      const remaining = Math.ceil((deadline - Date.now()) / 1000);
      if (remaining <= 0) {
        console.log("\nPairing timed out. Run `code-usage login` again.");
        process.exit(1);
      }

      await sleep(POLL_INTERVAL_MS, abort.signal);
      if (abort.signal.aborted) break;

      let confirmRes;
      try {
        confirmRes = await fetch(`${apiBase}/v0/device/pair/confirm`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pairingId }),
          signal: abort.signal,
        });
      } catch {
        if (abort.signal.aborted) break;
        // Network error — retry silently
        continue;
      }

      if (confirmRes.status === 410) {
        console.log("\nPairing expired. Run `code-usage login` again.");
        process.exit(1);
      }

      if (confirmRes.status === 202) {
        // Still pending
        continue;
      }

      if (confirmRes.status === 429) {
        // Rate limited — back off and retry
        const body = await confirmRes.json().catch(() => ({}));
        const retryAfter = body.retryAfterSeconds || 10;
        await sleep(retryAfter * 1000, abort.signal);
        continue;
      }

      if (confirmRes.ok) {
        const { deviceId, deviceSecret, userId } = await confirmRes.json();

        writeAuth({
          deviceId,
          deviceSecret,
          userId,
          apiBase,
          pairedAt: new Date().toISOString(),
        });

        // Revoke old device now that new pairing succeeded
        if (previousAuth?.deviceId && previousAuth?.deviceSecret && previousAuth.deviceId !== deviceId) {
          try {
            const { signRequest } = await import("./signing.js");
            const path = "/v0/device/self";
            const base = previousAuth.apiBase || apiBase;
            const headers = signRequest("DELETE", path, "", previousAuth.deviceId, previousAuth.deviceSecret);
            await fetch(`${base}${path}`, { method: "DELETE", headers });
          } catch {
            // Best-effort — old device can be removed from UI
          }
        }

        console.log(`\nDevice paired successfully!`);
        console.log(`  Device ID: ${deviceId}`);
        console.log(`  Credentials saved to ~/.code-usage/auth.json`);
        return;
      }

      // Unexpected status — log but don't die, keep polling
      const body = await confirmRes.json().catch(() => ({}));
      if (confirmRes.status >= 500) {
        // Server error — retry
        continue;
      }
      console.error(
        `\nUnexpected response (${confirmRes.status}): ${body.error || body.message || confirmRes.statusText}`,
      );
      process.exit(1);
    }

    console.log("\nPairing cancelled.");
    process.exit(0);
  } finally {
    process.removeListener("SIGINT", onSigint);
  }
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
