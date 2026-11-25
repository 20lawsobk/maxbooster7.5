import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ identity: { owner: "owner-a" as string | null, epoch: 0 } }));
vi.mock("../../client/src/lib/offline/identity", () => ({
  offlineIdentity: () => ({ ...state.identity }),
  assertOfflineIdentity: (expected: typeof state.identity) => {
    if (!state.identity.owner || expected.owner !== state.identity.owner || expected.epoch !== state.identity.epoch) throw new Error("Account changed");
  },
}));
import { bootstrapUserData } from "../../client/src/lib/prefetch";
import type { QueryClient } from "@tanstack/react-query";
afterEach(() => vi.unstubAllGlobals());
const cache = () => ({ setQueryData: vi.fn() });

it("bypasses HTTP caches, binds data to the account, and never replaces verified authentication", async () => {
  state.identity = { owner: "owner-a", epoch: 1 };
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { id: "owner-a", role: "stale-role" }, projects: [{ id: "project-a" }] })));
  vi.stubGlobal("fetch", fetcher);
  const qc = cache(); await bootstrapUserData(qc as unknown as QueryClient);
  expect(fetcher.mock.calls[0][0]).toMatch(/^\/api\/bootstrap\?account-check=/);
  expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: "include", cache: "no-store" });
  expect(qc.setQueryData.mock.calls.some(call => call[0][0] === "/api/auth/me")).toBe(false);
  expect(qc.setQueryData).toHaveBeenCalledWith(["/api/projects"], { data: [{ id: "project-a" }] }, expect.anything());
});

it("discards a pending response after an account transition and allows the new account bootstrap", async () => {
  state.identity = { owner: "owner-a", epoch: 2 };
  let respond: (response: Response) => void = () => {};
  const fetcher = vi.fn().mockReturnValueOnce(new Promise<Response>(resolve => { respond = resolve; }));
  vi.stubGlobal("fetch", fetcher);
  const qc = cache(); const pending = bootstrapUserData(qc as unknown as QueryClient);
  state.identity = { owner: "owner-b", epoch: 3 };
  respond(new Response(JSON.stringify({ user: { id: "owner-a" }, projects: [{ id: "private-a" }] })));
  await pending; expect(qc.setQueryData).not.toHaveBeenCalled();
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: "owner-b" }, projects: [{ id: "private-b" }] })));
  await bootstrapUserData(qc as unknown as QueryClient);
  expect(qc.setQueryData).toHaveBeenCalledWith(["/api/projects"], { data: [{ id: "private-b" }] }, expect.anything());
});

it("rejects a mismatched account receipt even if the active account did not change", async () => {
  state.identity = { owner: "owner-b", epoch: 4 };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { id: "owner-a" }, notifications: [{ id: "private-a" }] }))));
  const qc = cache(); await bootstrapUserData(qc as unknown as QueryClient);
  expect(qc.setQueryData).not.toHaveBeenCalled();
});
