import { test } from "node:test";
import assert from "node:assert/strict";
import { createAppLogger, logger } from "./logger.js";
import { sanitizeLogValue, sanitizeLogText } from "./logSanitizer.js";
import { logPrivacyEvent } from "./privacyEvents.js";

test("nested provider secrets and PII are redacted without mutating source", () => {
  const source = { email: "person@example.org", deep: { data: { access_token: "opaque", username: "private-handle", ip: "2001:db8::1" } } };
  const clean = JSON.stringify(sanitizeLogValue(source));
  for (const value of ["person@example.org", "opaque", "private-handle", "2001:db8::1"]) assert.ok(!clean.includes(value));
  assert.equal(source.deep.data.access_token, "opaque");
});

test("cycles, accessors, binary and errors remain bounded and diagnostic", () => {
  const value: Record<string, unknown> = { err: new Error("connect 192.0.2.3 failed for person@example.org") };
  value.self = value;
  Object.defineProperty(value, "getter", { get() { throw new Error("must not run"); } });
  value.buffer = Buffer.from("private");
  const clean = JSON.stringify(sanitizeLogValue(value));
  assert.match(clean, /Circular/);
  assert.match(clean, /ACCESSOR/);
  assert.match(clean, /BINARY/);
  assert.match(clean, /connect/);
  assert.ok(!clean.includes("person@example.org"));
});

test("production JSON emission covers interpolated messages, errors and child bindings", () => {
  const lines: string[] = [];
  const log = createAppLogger({ write: value => { lines.push(value); } });
  log.info({ user: { email: "person@example.org" }, accessToken: "private-token" }, "login %s@%s from %s", "person", "example.org", "192.0.2.3");
  log.child({ username: "private-handle", context: { refresh_token: "refresh-value" } }).warn(
    { err: new Error("Bearer token-value rejected"), status: 401 }, "OAuth failed");
  assert.equal(lines.length, 2);
  const output = lines.join("");
  for (const value of ["person@example.org", "192.0.2.3", "private-token", "private-handle", "refresh-value", "token-value"]) assert.ok(!output.includes(value), value);
  assert.equal(JSON.parse(lines[1]).status, 401);
  assert.match(JSON.parse(lines[1]).err.message, /rejected/);
  const child = log.child({ requestId: "request-123" }).child({ email: "child@example.org" });
  child.setBindings({ client_ip: "192.0.2.1", username: "binding-handle" });
  child.error(new Error("Failure for child@example.org"));
  assert.equal(JSON.parse(lines[2]).requestId, "request-123");
  for (const value of ["child@example.org", "192.0.2.1", "binding-handle"]) assert.ok(!lines[2].includes(value));
});

test("text masks IPv4/IPv6 and credentials, keeps useful nonpersonal diagnostics", () => {
  const text = sanitizeLogText("connect [2001:db8::abcd] ::ffff:192.0.2.3 api_key=opaque Bearer abc.xyz failed HTTP 503");
  for (const value of ["2001:db8::abcd", "192.0.2.3", "opaque", "abc.xyz"]) assert.ok(!text.includes(value));
  assert.match(text, /HTTP 503/);
});

test("typed event runtime boundary rejects raw personal fields and unknown provider errors", () => {
  assert.throws(() => logPrivacyEvent("oauth.connected", { outcome: "success", email: "person@example.org" } as never), /Unsupported/);
  assert.throws(() => logPrivacyEvent("oauth.exchange.failed", { outcome: "failure", actorId: "person@example.org" }), /opaque IDs/);
  assert.throws(() => logPrivacyEvent("provider response" as never, { outcome: "failure" }), /Unknown/);
});

test("valid typed events use the real logger consumer and retain opaque correlation", () => {
  const original = logger.info;
  const captured: unknown[][] = [];
  logger.info = ((...args: unknown[]) => { captured.push(args); }) as typeof logger.info;
  try {
    logPrivacyEvent("oauth.connected", { outcome: "success", actorId: "user-123" });
    assert.deepEqual(captured, [[{ event: "oauth.connected", outcome: "success", actorId: "user-123" }, "oauth.connected"]]);
  } finally {
    logger.info = original;
  }
});