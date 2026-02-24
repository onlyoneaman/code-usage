import { createHash, createHmac } from "node:crypto";

/**
 * Sign a request for device authentication.
 * Returns headers: { 'X-Device-Id', 'X-Timestamp', 'X-Signature' }
 */
export function signRequest(method, path, body, deviceId, deviceSecret) {
  const timestamp = new Date().toISOString();
  const bodyHash = createHash("sha256")
    .update(body || "")
    .digest("hex");
  const message = `${method.toUpperCase()}\n${path}\n${timestamp}\n${bodyHash}`;
  const signature = createHmac("sha256", deviceSecret).update(message).digest("hex");

  return {
    "X-Device-Id": deviceId,
    "X-Timestamp": timestamp,
    "X-Signature": signature,
  };
}
