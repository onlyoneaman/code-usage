import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { deleteAuth, isLoggedIn, readAuth } from "./auth.js";
import { getInfo, uninstall } from "./scheduler.js";
import { signRequest } from "./signing.js";

const SYNC_STATE_PATH = join(homedir(), ".code-usage", "sync-state.json");

export function status() {
  if (!isLoggedIn()) {
    console.log("Status: not paired");
    console.log("\nRun `code-usage login` to pair this device.");
    return;
  }

  const auth = readAuth();
  console.log("Status: paired");
  console.log(`  Device ID:  ${auth.deviceId}`);
  console.log(`  API Base:   ${auth.apiBase}`);
  console.log(`  Paired at:  ${auth.pairedAt}`);

  // Check sync state
  if (existsSync(SYNC_STATE_PATH)) {
    try {
      const state = JSON.parse(readFileSync(SYNC_STATE_PATH, "utf8"));
      if (state.lastSyncAt) {
        console.log(`  Last sync:  ${state.lastSyncAt}`);
      }
      if (state.cachedPolicy) {
        const p = state.cachedPolicy;
        const paused = p.accountPaused || p.devicePaused;
        console.log(`  Sync:       ${paused ? "paused" : "enabled"}`);
      }
    } catch {
      // Ignore corrupt sync state
    }
  } else {
    console.log("  Last sync:  never");
  }

  // Show background sync scheduler state
  try {
    const info = getInfo();
    if (info.installed) {
      console.log(`  Background: active (${info.mechanism}, every ${info.intervalMinutes}m)`);
    } else {
      console.log("  Background: not scheduled");
    }
  } catch {
    // Scheduler check failed — not critical
  }
}

export async function logout() {
  if (!isLoggedIn()) {
    console.log("Not currently paired. Nothing to do.");
    return;
  }

  // Remove background scheduler before deleting auth
  try {
    uninstall();
  } catch {
    // Non-fatal — continue with logout
  }

  // Revoke device on server so it doesn't show as active
  const auth = readAuth();
  if (auth?.deviceId && auth?.deviceSecret && auth?.apiBase) {
    try {
      const path = "/v0/device/self";
      const headers = signRequest("DELETE", path, "", auth.deviceId, auth.deviceSecret);
      await fetch(`${auth.apiBase}${path}`, { method: "DELETE", headers });
    } catch {
      // Network failure — still proceed with local logout
    }
  }

  deleteAuth();
  console.log("Logged out. Device revoked and credentials removed.");
}
