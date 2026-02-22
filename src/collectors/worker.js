import { parentPort, workerData } from "node:worker_threads";
import { collectAmp } from "./amp.js";
import { collectClaude } from "./claude.js";
import { collectCodex } from "./codex.js";
import { collectOpencode } from "./opencode.js";
import { collectPi } from "./pi.js";

const COLLECTORS = {
  claude: collectClaude,
  codex: collectCodex,
  opencode: collectOpencode,
  amp: collectAmp,
  pi: collectPi,
};

try {
  const provider = workerData?.provider;
  const collector = COLLECTORS[provider];
  if (!collector) throw new Error(`Unsupported provider: ${String(provider)}`);
  const data = collector();
  parentPort?.postMessage({ ok: true, data });
} catch (err) {
  const message = err instanceof Error ? err.stack || err.message : String(err);
  parentPort?.postMessage({ ok: false, error: message });
}
