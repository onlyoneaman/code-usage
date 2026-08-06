import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: ".",
    // Collector tests run against the developer's real ~/.claude and ~/.codex
    // history, which grows without bound; the 5s default times out on a
    // long-lived install rather than signalling a regression.
    testTimeout: 30_000,
  },
});
