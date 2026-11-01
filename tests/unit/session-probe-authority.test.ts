import { expect, it, vi } from "vitest";
import { probeSession, SessionProbeUnavailable } from "../../client/src/lib/sessionProbe";

it.each([401, 200])("accepts only authoritative anonymous responses (%s)", async status => {
  const request = vi.fn().mockResolvedValue(new Response("null", { status }));
  expect(await probeSession(request)).toBeNull();
});

it("retains identity uncertainty and honors Retry-After on throttling", async () => {
  const request = vi.fn().mockResolvedValue(new Response("{}", { status: 429, headers: { "Retry-After": "47" } }));
  const error = await probeSession(request).catch(error => error);
  expect(error).toBeInstanceOf(SessionProbeUnavailable);
  expect(error.retryAfterMs).toBe(47_000);
});

it.each([500, 503])("never converts an upstream failure (%s) into sign-out", async status => {
  await expect(probeSession(vi.fn().mockResolvedValue(new Response("private upstream details", { status }))))
    .rejects.toBeInstanceOf(SessionProbeUnavailable);
});

it("fails explicitly on network errors and malformed successful responses", async () => {
  await expect(probeSession(vi.fn().mockRejectedValue(new Error("network failed")))).rejects.toBeInstanceOf(SessionProbeUnavailable);
  await expect(probeSession(vi.fn().mockResolvedValue(new Response("{}")))).rejects.toBeInstanceOf(SessionProbeUnavailable);
});

it("returns a verified identity while bypassing legacy URL caches", async () => {
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "owner" })));
  expect(await probeSession(request)).toEqual({ id: "owner" });
  expect(request.mock.calls[0][1]).toMatchObject({ credentials: "include", cache: "no-store" });
});
