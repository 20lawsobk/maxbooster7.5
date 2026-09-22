import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  sheet: {} as any, revisions: [] as any[], assents: [] as any[],
  tail: Promise.resolve() as Promise<any>, locks: 0,
}));
vi.mock("drizzle-orm", () => ({
  eq: (...args: any[]) => args, and: (...args: any[]) => args,
  sql: (strings: TemplateStringsArray, ...values: any[]) => ({ text: strings.join("?"), values }),
}));
vi.mock("@shared/schema", () => ({ splitSheets: { id: "id" } }));
vi.mock("../../server/db", () => {
  const execute = async ({ text, values: v }: any) => {
    if (text.includes("SELECT * FROM growth_split_revisions")) return { rows: state.revisions.slice(-1) };
    if (text.includes("INSERT INTO growth_split_revisions")) {
      state.revisions.push({ sheet_id: v[0], revision: v[1], content: JSON.parse(v[2]), content_hash: v[3] });
    } else if (text.includes("INSERT INTO growth_split_assents")) {
      if (!state.assents.some(a => a.revision === v[1] && a.user_id === v[2]))
        state.assents.push({ revision: v[1], user_id: v[2], signature_hash: v[3], signed_at: new Date() });
    } else if (text.includes("SELECT user_id")) {
      return { rows: state.assents.filter(a => a.revision === v[1]) };
    }
    return { rows: [] };
  };
  const tx = {
    execute,
    select: () => ({ from: () => ({ where: () => ({
      for: async (mode: string) => {
        if (mode !== "update") throw new Error("Missing serialization lock");
        state.locks++;
        return [structuredClone(state.sheet)];
      },
    }) }) }),
    update: () => ({ set: (changes: any) => ({ where: () => ({ returning: async () => {
      state.sheet = { ...state.sheet, ...changes }; return [structuredClone(state.sheet)];
    } }) }) }),
  };
  return { db: { execute, transaction: (fn: any) => {
    const operation = state.tail.then(() => fn(tx));
    state.tail = operation.catch(() => {});
    return operation;
  } } };
});
import { mutateSplitAgreement } from "../../server/services/splitAgreementRepository";
const member = (id: string, splitPercentage: number) => ({
  userId: id, name: id, role: "writer", email: `${id}@example.test`, splitPercentage,
});
beforeEach(() => {
  state.sheet = { id: "sheet", creatorId: "a", contractName: "Song", releaseId: "release",
    effectiveDate: new Date("2026-01-01"), participants: [member("a", 50), member("b", 50)],
    signatures: [{ userId: "a", signatureHash: "legacy-unverified" }], status: "pending_signature" };
  state.revisions = []; state.assents = []; state.tail = Promise.resolve(); state.locks = 0;
});
describe("serialized normalized split repository (mock transaction boundary)", () => {
  it("archives legacy evidence but does not count it as current assent", async () => {
    const result = await mutateSplitAgreement("sheet", "b", { type: "sign", revision: 0, signature: "B" });
    expect(result.status).toBe("pending_signature");
    expect(result.signatures.find((s: any) => s.userId === "a").signedAt).toBeUndefined();
    expect(state.revisions[0].content.historicalUnverifiedSignatures[0].signatureHash).toBe("legacy-unverified");
  });
  it("retains concurrent signers of the same revision without a lost update", async () => {
    await mutateSplitAgreement("sheet", "a", { type: "amend", revision: 0, participants: state.sheet.participants });
    await Promise.all([
      mutateSplitAgreement("sheet", "a", { type: "sign", revision: 1, signature: "A" }),
      mutateSplitAgreement("sheet", "b", { type: "sign", revision: 1, signature: "B" }),
    ]);
    expect(state.sheet.status).toBe("active");
    expect(state.assents).toHaveLength(2);
    expect(state.locks).toBe(3);
  });
  it("new terms invalidate active assent while preserving old normalized records", async () => {
    await mutateSplitAgreement("sheet", "a", { type: "sign", revision: 0, signature: "A" });
    const amended = await mutateSplitAgreement("sheet", "a", {
      type: "amend", revision: 1, participants: [member("a", 60), member("b", 40)],
    });
    expect(amended.revision).toBe(2);
    expect(amended.signatures.every((s: any) => !s.signedAt)).toBe(true);
    expect(state.assents).toHaveLength(1);
    await expect(mutateSplitAgreement("sheet", "b", { type: "sign", revision: 1, signature: "B" }))
      .rejects.toMatchObject({ status: 409 });
  });
  it("rejects overallocated amendment before a revision is committed", async () => {
    await expect(mutateSplitAgreement("sheet", "a", {
      type: "amend", revision: 0, participants: [...state.sheet.participants, member("c", 10)],
    })).rejects.toMatchObject({ status: 400 });
    expect(state.revisions).toHaveLength(0);
  });
  it("requires actual participant identity and explicit assent", async () => {
    await expect(mutateSplitAgreement("sheet", "other", { type: "sign", revision: 0, signature: "X" }))
      .rejects.toMatchObject({ status: 403 });
    await expect(mutateSplitAgreement("sheet", "a", { type: "sign", revision: 0, signature: "" }))
      .rejects.toMatchObject({ status: 400 });
  });
});