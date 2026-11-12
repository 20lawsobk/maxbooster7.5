import { timingSafeEqual } from "node:crypto";

/**
 * Compare an internal service bearer credential without exposing its value or
 * allowing length-dependent timing comparisons.
 */
export function hasBearerSecret(
  authorization: string | undefined,
  expectedSecret: string | undefined,
): boolean {
  if (!authorization || !expectedSecret) return false;
  const match = /^Bearer[ \t]+([^\s]+)$/i.exec(authorization);
  if (!match) return false;

  const supplied = Buffer.from(match[1], "utf8");
  const expected = Buffer.from(expectedSecret, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
