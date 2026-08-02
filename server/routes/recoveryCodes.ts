import { Router, Request, Response } from "express";
import { db } from "../db.js";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";
import { logger } from "../logger.js";
import crypto from "crypto";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router?.use(requireAuth);

interface HashedCode {
  code: string;
  used: boolean;
  usedAt?: string | null;
}

interface RecoveryCodeStore {
  codes: HashedCode[];
  generatedAt: string;
  lastUsedAt?: string | null;
}

const generateRecoveryCode = (): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto?.randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += "-";
    code += chars[bytes[i] % chars?.length];
  }
  return code;
};

const hashCode = (code: string): string => {
  return crypto
    .createHash("sha256")
    .update(code?.toUpperCase().replace(/-/g, ""))
    .digest("hex");
};

async function getStore(userId: string): Promise<RecoveryCodeStore | null> {
  const [row] = await db
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users?.id, userId))
    .limit(1);

  const prefs = (row?.preferences ?? {}) as Record<string, any>;
  return (prefs?.twoFactorRecoveryCodes as RecoveryCodeStore) ?? null;
}

async function saveStore(
  userId: string,
  store: RecoveryCodeStore,
): Promise<void> {
  const [row] = await db
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users?.id, userId))
    .limit(1);

  const prefs = (row?.preferences ?? {}) as Record<string, any>;
  prefs.twoFactorRecoveryCodes = store;

  await db
    .update(users)
    .set({ preferences: prefs })
    .where(eq(users?.id, userId));
}

router?.get("/status", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const store = await getStore(userId);

    if (!store) {
      return res.json({
        enabled: false,
        codesRemaining: 0,
        totalCodes: 0,
      });
    }

    const codesRemaining = store?.codes.filter((c) => !c?.used).length;

    res.json({
      enabled: true,
      codesRemaining,
      totalCodes: store.codes.length,
      lastGeneratedAt: store.generatedAt,
      lastUsedAt: store.lastUsedAt ?? null,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching recovery codes status:");
    res.status(500).json({ error: "Failed to fetch recovery codes status" });
  }
});

router?.post("/generate", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const rawCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      rawCodes?.push(generateRecoveryCode());
    }

    const store: RecoveryCodeStore = {
      codes: rawCodes.map((code) => ({
        code: hashCode(code),
        used: false,
        usedAt: null,
      })),
      generatedAt: new Date().toISOString(),
      lastUsedAt: null,
    };

    await saveStore(userId, store);

    res.json({
      codes: rawCodes,
      generatedAt: store.generatedAt,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error generating recovery codes:");
    res.status(500).json({ error: "Failed to generate recovery codes" });
  }
});

router?.post("/verify", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { code } = req.body;

    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "Recovery code is required" });
    }

    const store = await getStore(userId);
    if (!store) {
      return res.status(400).json({ error: "No recovery codes set up" });
    }

    const codeHash = hashCode(code);
    const match = store?.codes.find((c) => c?.code === codeHash && !c?.used);

    if (!match) {
      return res
        .status(400)
        .json({ error: "Invalid or already used recovery code" });
    }

    match.used = true;
    match.usedAt = new Date().toISOString();
    store.lastUsedAt = new Date().toISOString();

    await saveStore(userId, store);

    const codesRemaining = store?.codes.filter((c) => !c?.used).length;

    res.json({
      success: true,
      codesRemaining,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error verifying recovery code:");
    res.status(500).json({ error: "Failed to verify recovery code" });
  }
});

export default router;
