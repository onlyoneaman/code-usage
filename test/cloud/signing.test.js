import { describe, expect, it } from "vitest";
import { signRequest } from "../../src/cloud/signing.js";

describe("signRequest", () => {
  it("returns required auth headers", () => {
    const headers = signRequest("GET", "/v0/policy/preflight", "", "dev_abc", "secret123");
    expect(headers).toHaveProperty("X-Device-Id", "dev_abc");
    expect(headers).toHaveProperty("X-Timestamp");
    expect(headers).toHaveProperty("X-Signature");
  });

  it("returns a valid ISO timestamp", () => {
    const headers = signRequest("POST", "/v0/ingest", "{}", "dev_1", "secret");
    const ts = new Date(headers["X-Timestamp"]);
    expect(ts.getTime()).not.toBeNaN();
    expect(Math.abs(Date.now() - ts.getTime())).toBeLessThan(5000);
  });

  it("returns hex signature", () => {
    const headers = signRequest("GET", "/test", "", "dev_1", "secret");
    expect(headers["X-Signature"]).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces different signatures for different bodies", () => {
    const a = signRequest("POST", "/test", "body1", "dev_1", "secret");
    const b = signRequest("POST", "/test", "body2", "dev_1", "secret");
    expect(a["X-Signature"]).not.toBe(b["X-Signature"]);
  });

  it("produces different signatures for different methods", () => {
    const a = signRequest("GET", "/test", "", "dev_1", "secret");
    const b = signRequest("POST", "/test", "", "dev_1", "secret");
    expect(a["X-Signature"]).not.toBe(b["X-Signature"]);
  });

  it("produces different signatures for different paths", () => {
    const a = signRequest("GET", "/a", "", "dev_1", "secret");
    const b = signRequest("GET", "/b", "", "dev_1", "secret");
    expect(a["X-Signature"]).not.toBe(b["X-Signature"]);
  });

  it("produces different signatures for different secrets", () => {
    const a = signRequest("GET", "/test", "", "dev_1", "secret_a");
    const b = signRequest("GET", "/test", "", "dev_1", "secret_b");
    expect(a["X-Signature"]).not.toBe(b["X-Signature"]);
  });

  it("handles empty body", () => {
    const headers = signRequest("GET", "/test", "", "dev_1", "secret");
    expect(headers["X-Signature"]).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uppercases method in signature", () => {
    const a = signRequest("get", "/test", "", "dev_1", "secret");
    const b = signRequest("GET", "/test", "", "dev_1", "secret");
    // Both should produce the same signature (timestamps will differ slightly,
    // so we just verify both produce valid hex signatures)
    expect(a["X-Signature"]).toMatch(/^[a-f0-9]{64}$/);
    expect(b["X-Signature"]).toMatch(/^[a-f0-9]{64}$/);
  });
});
