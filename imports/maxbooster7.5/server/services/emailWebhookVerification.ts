import { createPublicKey, verify, createHmac, timingSafeEqual } from "node:crypto";

function freshTimestamp(timestamp: string, nowSeconds: number): boolean {
  return /^\d+$/.test(timestamp) && Math.abs(nowSeconds - Number(timestamp)) <= 300;
}

/** SendGrid Event Webhook uses ECDSA/SHA-256, NOT Ed25519. */
export function verifySendGridEvent(
  raw: Buffer, signature: string, timestamp: string, publicKey: string,
  nowSeconds = Date.now() / 1000,
): boolean {
  if (!Buffer.isBuffer(raw) || !signature || !publicKey || !freshTimestamp(timestamp, nowSeconds)) return false;
  try {
    const key = publicKey.includes("-----BEGIN")
      ? createPublicKey(publicKey)
      : createPublicKey({ key: Buffer.from(publicKey, "base64"), format: "der", type: "spki" });
    if (key.asymmetricKeyType !== "ec") return false;
    return verify("sha256", Buffer.concat([Buffer.from(timestamp, "utf8"), raw]),
      { key, dsaEncoding: "der" }, Buffer.from(signature, "base64"));
  } catch { return false; }
}

/** Resend's Svix delivery signature: HMAC-SHA256(id.timestamp.exact-body-bytes). */
export function verifyResendEvent(
  raw: Buffer, id: string, timestamp: string, signatures: string, secret: string,
  nowSeconds = Date.now() / 1000,
): boolean {
  if (!Buffer.isBuffer(raw) || !id || !signatures || !secret.startsWith("whsec_") ||
      !freshTimestamp(timestamp, nowSeconds)) return false;
  try {
    const key = Buffer.from(secret.slice(6), "base64");
    if (!key.length) return false;
    const expected = createHmac("sha256", key)
      .update(Buffer.from(`${id}.${timestamp}.`, "utf8")).update(raw).digest();
    return signatures.split(/\s+/).some(candidate => {
      const [version, encoded] = candidate.split(",");
      if (version !== "v1" || !encoded) return false;
      const actual = Buffer.from(encoded, "base64");
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    });
  } catch { return false; }
}

export function fanMailEventFromResend(payload: unknown, deliveryId: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid Resend webhook payload");
  const value = payload as { type?: string; created_at?: string; data?: { email_id?: string } };
  const types = { "email.delivered": "delivered", "email.bounced": "bounced", "email.complained": "complained" } as const;
  const type = types[value.type as keyof typeof types];
  if (!type) return null;
  const occurredAt = new Date(value.created_at || "");
  if (typeof value.data?.email_id !== "string" || !value.data.email_id || !deliveryId ||
      !Number.isFinite(occurredAt.getTime())) throw new Error("Invalid Resend email event fields");
  return { eventId: `resend:${deliveryId}`, providerMessageId: value.data.email_id, type, occurredAt };
}