import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "social:v1:";
function key(): Buffer {
  const value = process.env.SOCIAL_CREDENTIAL_ENCRYPTION_KEY;
  if (!value || !/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("SOCIAL_CREDENTIAL_ENCRYPTION_KEY must be a persistent externally managed 32-byte hex key");
  }
  return Buffer.from(value, "hex");
}
export function encryptSocialCredential(value: string, context: string): string {
  if (!value) throw new Error("Cannot encrypt an empty social credential");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}
/** Legacy plaintext/old-format values remain readable during the coordinated migration. */
export function decryptSocialCredential(value: string | null | undefined, context: string): string | null {
  if (!value) return null;
  if (!value.startsWith("social:")) return value;
  if (!value.startsWith(PREFIX)) throw new Error("Unsupported social credential envelope version");
  const [iv, tag, encrypted, extra] = value.slice(PREFIX.length).split(":");
  if (!iv || !tag || !encrypted || extra) throw new Error("Malformed social credential envelope");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}