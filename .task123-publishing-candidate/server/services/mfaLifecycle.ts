import type { Request, Response } from "express";
import { generateSecret, generateURI } from "otplib";
import QRCode from "qrcode";
import { storage } from "../storage.js";
import { factorRepository } from "./factorRepository.js";
import { consumeTotp, verifiedTotpStep } from "./totpReplay.js";

type FactorSession = {
  userId?: string; twoFactorVerified?: boolean; authGeneration?: string;
  pendingFactor?: { secret: string; userId: string; expiresAt: number;
    expectedSecret: string | null; expectedEnabled: boolean };
};
const save = (req: Request) => new Promise<void>((resolve, reject) =>
  req.session.save(error => error ? reject(error) : resolve()));

/** Pending factor is session-bound and never replaces the active factor before proof. */
export function mfaLifecycle() {
  return {
    async setup(req: Request, res: Response) {
      if (!req.user) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(req.user.id);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const session = req.session as unknown as FactorSession;
      const recent = req.session as unknown as { reauthenticatedAt?: number; reauthenticatedUserId?: string };
      if (recent.reauthenticatedUserId !== user.id || typeof recent.reauthenticatedAt !== "number" ||
          recent.reauthenticatedAt > Date.now() || Date.now() - recent.reauthenticatedAt > 5 * 60_000) {
        return res.status(403).json({ message: "Please sign in again before setting up an authenticator",
          requiresReauthentication: true });
      }
      if (user.twoFactorEnabled && (!user.twoFactorSecret ||
          !/^\d{6}$/.test(req.body.currentCode ?? "") ||
          !await consumeTotp(user.id, user.twoFactorSecret, req.body.currentCode))) {
        return res.status(403).json({ message: "A new, unused current authenticator code is required" });
      }
      const secret = generateSecret();
      const otpauthUrl = generateURI({ label: user.email!, issuer: "MaxBooster", secret, strategy: "totp" });
      const qrCode = await QRCode.toDataURL(otpauthUrl, { width: 256, margin: 2 });
      session.pendingFactor = { secret, userId: user.id, expiresAt: Date.now() + 10 * 60_000,
        expectedSecret: user.twoFactorSecret ?? null, expectedEnabled: user.twoFactorEnabled === true };
      await save(req);
      return res.json({ secret, qrCode, otpauthUrl });
    },
    async verify(req: Request, res: Response) {
      if (!req.user) return res.status(401).json({ message: "Not authenticated" });
      const session = req.session as unknown as FactorSession;
      const pending = session.pendingFactor;
      if (!pending || pending.userId !== req.user.id || pending.expiresAt < Date.now()) {
        return res.status(400).json({ message: "2FA setup expired. Please run setup first." });
      }
      const step = verifiedTotpStep(pending.secret, req.body.code);
      if (step === null) {
        return res.status(400).json({ message: "Invalid verification code" });
      }
      const generation = await (await factorRepository()).replace(req.user.id,
        pending.expectedSecret, pending.expectedEnabled, pending.secret, true, step);
      delete session.pendingFactor;
      session.authGeneration = generation;
      session.twoFactorVerified = true;
      await save(req);
      return res.json({ success: true, message: "2FA enabled successfully" });
    },
  };
}