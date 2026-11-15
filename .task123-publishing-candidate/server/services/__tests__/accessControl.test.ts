import { describe, it, expect, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import path from "node:path";
const state = vi.hoisted(() => ({ files: [] as any[] }));
vi.mock("../../db.js", () => ({
  db: { select: () => ({ from: () => ({ where: async () => state.files }) }) },
}));
vi.mock("../../../shared/schema.js", () => ({
  userStorageFiles: { fileKey: "key" }, taxTreatyRates: {},
}));
vi.mock("../../logger.js", () => ({ logger: { info() {}, warn() {} } }));
import { authorizeAudioSource, authorizedLocalAudioPath } from "../audioSourceAuthorization.js";
import { createSessionAuthority } from "../sessionAuthority.js";
import { enforceAssurance } from "../../middleware/authAssurance.js";
import { taxFormService } from "../taxFormService.js";

describe("object and account authorization", () => {
  it("checks ownership and deletion for URL, absolute URL, and bare storage keys", async () => {
    state.files = [{ userId: "owner", deletedAt: null }];
    const sources = ["users/owner/audio/a.wav", "/api/storage/file/users%2Fowner%2Faudio%2Fa.wav",
      "https://app.example/api/storage/file/users/owner/audio/a.wav"];
    for (const source of sources) {
      await expect(authorizeAudioSource(source, "owner")).resolves.toBeUndefined();
      await expect(authorizeAudioSource(source, "other")).rejects.toThrow();
    }
    for (const files of [[], [{ userId: "other" }], [{ userId: "owner", deletedAt: new Date() }]]) {
      state.files = files;
      await expect(authorizeAudioSource("legacy/a.wav", "owner")).rejects.toThrow();
    }
  });
  it("rejects traversal, private scratch, and symlink escapes while allowing public samples", async () => {
    await mkdir("samples", { recursive: true });
    const dir = await mkdtemp("samples/access-test-");
    const outside = await mkdtemp("/tmp/audio-access-test-");
    try {
      await writeFile(path.join(dir, "ok.wav"), "RIFF");
      await writeFile(path.join(outside, "secret.wav"), "RIFF");
      await symlink(path.join(outside, "secret.wav"), path.join(dir, "escape.wav"));
      await expect(authorizedLocalAudioPath(`/${dir}/ok.wav`, "owner")).resolves.toContain("ok.wav");
      for (const source of [`/${dir}/escape.wav`, "/samples/../secret.wav",
        "/uploads/media_temp/private.wav", "/attached_assets/private.wav", "/samples/%2e%2e/private.wav"]) {
        await expect(authorizedLocalAudioPath(source, "owner")).rejects.toThrow();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
  it("uses account status in both durable session issuance and validation", async () => {
    const query = vi.fn(async (sql: string) => {
      expect(sql).toContain("subscription_status IS DISTINCT FROM 'suspended'");
      expect(sql).toContain("subscription_status IS DISTINCT FROM 'banned'");
      return { rows: [] };
    });
    const authority = createSessionAuthority({ query });
    await expect(authority.issue("disabled")).rejects.toThrow();
    expect(await authority.validate("disabled", "1")).toBe(false);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("blocks disabled admins before MFA or administrative bypass", () => {
    for (const subscriptionStatus of ["banned", "suspended"]) {
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      expect(enforceAssurance({ user: { id: "admin", role: "admin", subscriptionStatus } } as any, res)).toBe(false);
      expect(res.status).toHaveBeenCalledWith(403);
    }
    expect(enforceAssurance({ user: { subscriptionStatus: "active" } } as any, {} as any)).toBe(true);
  });
  it("does not disclose, render, or sign another owner's cached tax form", () => {
    const form = { id: "test-tax", userId: "owner", status: "draft" };
    (taxFormService as any).taxForms.set(form.id, form);
    try {
      expect(taxFormService.getTaxForm(form.id, "other")).toBeUndefined();
      expect(() => taxFormService.signTaxForm(form.id, "signature", "other")).toThrow();
      for (const method of ["generateW9PDF", "generateW8BENPDF", "generate1099PDF"] as const) {
        expect(() => taxFormService[method](form.id, "other")).toThrow();
      }
      expect(form.status).toBe("draft");
      expect(taxFormService.getTaxForm(form.id, "owner")).toBe(form);
      expect(taxFormService.signTaxForm(form.id, "signature", "owner").status).toBe("signed");
    } finally { (taxFormService as any).taxForms.delete(form.id); }
  });
});