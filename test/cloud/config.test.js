import { describe, expect, it } from "vitest";
import { resolveApiBase } from "../../src/cloud/config.js";

describe("resolveApiBase", () => {
  it("prefers CLI flag over everything", () => {
    const result = resolveApiBase("http://localhost:5173", { apiBase: "https://example.com" });
    expect(result).toBe("http://localhost:5173");
  });

  it("prefers CLI flag over null auth", () => {
    const result = resolveApiBase("http://my-api.com", null);
    expect(result).toBe("http://my-api.com");
  });

  it("returns a string when no flag and no auth", () => {
    // Can't assert exact value since local config may override default.
    // Just ensure it returns a valid URL string.
    const result = resolveApiBase(null, null);
    expect(typeof result).toBe("string");
    expect(result.startsWith("http")).toBe(true);
  });

  it("returns a string when no flag and auth has no apiBase", () => {
    const result = resolveApiBase(null, { deviceId: "dev_1" });
    expect(typeof result).toBe("string");
    expect(result.startsWith("http")).toBe(true);
  });
});
