import { describe, expect, it } from "vitest";
import { modelAuthHeaders, modelOwnedBody } from "../../external/maxcore/artifacts/api-server/src/config/model-auth.js";

describe("Node to Python private MaxCore channel", () => {
  it("forwards owner identity only with a loopback-authenticated private channel", () => {
    const forged = { "x-maxcore-user-id": "victim" };
    for (const credential of [
      { authorization: "Bearer public-key" },
      { "x-admin-key": "public-admin" },
      { "x-api-key": "public-api" },
    ]) {
      const auth = modelAuthHeaders({ ...forged, ...credential }, "127.0.0.1", "private-key")!;
      expect(auth["X-MaxCore-User-Id"]).toBeUndefined();
      expect(modelOwnedBody({ owner_id: "victim", user_id: "victim", trusted_owner: "victim", text: "music" }, auth))
        .toEqual({ text: "music" });
    }
    const auth = modelAuthHeaders({ ...forged, authorization: "Bearer private-key" }, "::1", "private-key")!;
    expect(auth["X-MaxCore-User-Id"]).toBe("victim");
    expect(modelOwnedBody({ owner_id: "spoof", userId: "spoof" }, auth))
      .toEqual({ owner_id: "victim", user_id: "victim", userId: "victim" });
    expect(modelAuthHeaders({ ...forged, authorization: "Bearer private-key" }, "203.0.113.1", "private-key"))
      .toBeNull();
    for (const owner of ["bad\nowner", "", ["one", "two"]]) {
      expect(modelAuthHeaders({ authorization: "Bearer private-key", "x-maxcore-user-id": owner }, "::1", "private-key"))
        .toBeNull();
    }
  });
  it("forwards the inherited token as generation Bearer, never an admin header", () => {
    expect(modelAuthHeaders({ authorization: "Bearer private-key" }, "127.0.0.1", "private-key"))
      .toEqual({ Authorization: "Bearer private-key" });
    expect(modelAuthHeaders({ "x-api-key": "private-key" }, "::1", "private-key"))
      .toEqual({ Authorization: "Bearer private-key" });
  });

  it("does not authorize missing credentials or forged forwarded identities", () => {
    expect(modelAuthHeaders({ "x-forwarded-for": "127.0.0.1", "x-maxcore-user-id": "admin" }, "127.0.0.1", "private-key"))
      .toBeNull();
    expect(modelAuthHeaders({ authorization: "Bearer private-key", "x-forwarded-for": "127.0.0.1" }, "203.0.113.1", "private-key"))
      .toBeNull();
  });

  it("never upgrades generation to admin and rejects ambiguous mixed schemes", () => {
    expect(modelAuthHeaders({ "x-admin-key": "private-key" }, "127.0.0.1", "private-key")).toBeNull();
    expect(modelAuthHeaders({ authorization: "Bearer private-key", "x-admin-key": "admin-key" }, "127.0.0.1", "private-key"))
      .toBeNull();
    expect(modelAuthHeaders({ "x-admin-key": "admin-key" }, "127.0.0.1", "private-key"))
      .toEqual({ "X-Admin-Key": "admin-key" });
  });

  it("preserves explicit remote credentials for upstream verification without substituting keys", () => {
    expect(modelAuthHeaders({ authorization: "Bearer external-key" }, "127.0.0.1", "private-key"))
      .toEqual({ Authorization: "Bearer external-key" });
  });
});