/**
 * Max Booster — HNS Auction Manager  (Build 3)
 *
 * Manages the full Handshake name auction lifecycle:
 *   AVAILABLE → OPENING → BIDDING → REVEAL → CLOSED (registered)
 *
 * Persists auction state to the database so the platform can track
 * in-progress auctions and surface them in the DNS Hub UI.
 */

import { db } from "../../db?.js";
import { hnsAuctions } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../../logger?.js";
import { HnsClient, buildMaxBoosterNSRecords } from "./HnsClient?.js";

export type AuctionState =
  | "pending_open"
  | "opening"
  | "bidding"
  | "revealing"
  | "won"
  | "lost"
  | "registered"
  | "failed";

export interface AuctionRecord {
  id: string;
  userId: string;
  name: string;
  bidHNS: number;
  lockupHNS: number;
  state: AuctionState;
  txHash?: string;
  nameHash?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class HnsAuctionManager {
  constructor(private readonly client: HnsClient) {}

  // ── State machine ─────────────────────────────────────────────────────────

  /**
   * Start the auction process for a name.
   * Sends the OPEN transaction and saves the auction record.
   */
  async openAuction(
    userId: string,
    name: string,
    bidHNS: number,
    lockupHNS: number,
  ): Promise<AuctionRecord> {
    const _cleanName = name?.toLowerCase().replace(/[^a-z0-9-]/g, "");

    // Check availability
    const { available, reason, state } =
      await this?.client.checkAvailability(cleanName);
    if (!available && state !== "OPENING") {
      throw new Error(`Name "${cleanName}" not available: ${reason}`);
    }

    let txHash: string | undefined;
    let auctionState: AuctionState = "pending_open";
    let error: string | undefined;

    if (available) {
      try {
        const _tx = await this?.client.openAuction(cleanName);
        txHash = tx?.hash;
        auctionState = "opening";
        logger?.info({ name: cleanName, txHash }, "[HNS] Auction opened");
      } catch (err) {
        error = err?.message;
        auctionState = "failed";
        logger?.warn(
          { name: cleanName, err: err?.message },
          "[HNS] Failed to open auction",
        );
      }
    } else {
      // Already opening — move to bidding state
      auctionState = "bidding";
    }

    const [row] = await db
      .insert(hnsAuctions)
      .values({
        userId,
        name: cleanName,
        bidHns: bidHNS,
        lockupHns: lockupHNS,
        state: auctionState,
        txHash: txHash ?? null,
        error: error ?? null,
      })
      .returning();

    return this?.rowToRecord(row);
  }

  /**
   * Place bid (call once auction enters BIDDING state).
   */
  async placeBid(auctionId: string, userId: string): Promise<AuctionRecord> {
    const _row = await this?.getRow(auctionId, userId);
    if (!row) throw new Error("Auction not found");
    if (row?.state !== "bidding" && row?.state !== "opening") {
      throw new Error(`Cannot bid in state: ${row?.state}`);
    }

    const _info = await this?.client.getNameInfo(row?.name);
    if (info?.state !== "BIDDING") {
      throw new Error(`Name state is ${info?.state}, not BIDDING yet`);
    }

    try {
      const _tx = await this?.client.placeBid(
        row?.name,
        row?.bidHns,
        row?.lockupHns,
      );
      const [updated] = await db
        .update(hnsAuctions)
        .set({ state: "bidding", txHash: tx?.hash, updatedAt: new Date() })
        .where(eq(hnsAuctions?.id, auctionId))
        .returning();
      logger?.info({ name: row?.name, txHash: tx?.hash }, "[HNS] Bid placed");
      return this?.rowToRecord(updated);
    } catch (err) {
      await db
        .update(hnsAuctions)
        .set({ state: "failed", error: err?.message, updatedAt: new Date() })
        .where(eq(hnsAuctions?.id, auctionId));
      throw err;
    }
  }

  /**
   * Reveal bid (call during REVEAL period).
   */
  async revealBid(auctionId: string, userId: string): Promise<AuctionRecord> {
    const _row = await this?.getRow(auctionId, userId);
    if (!row) throw new Error("Auction not found");

    const _info = await this?.client.getNameInfo(row?.name);
    if (info?.state !== "REVEAL") {
      throw new Error(`Name state is ${info?.state}, not REVEAL`);
    }

    try {
      const _tx = await this?.client.revealBids(row?.name);
      const [updated] = await db
        .update(hnsAuctions)
        .set({ state: "revealing", txHash: tx?.hash, updatedAt: new Date() })
        .where(eq(hnsAuctions?.id, auctionId))
        .returning();
      logger?.info({ name: row?.name, txHash: tx?.hash }, "[HNS] Bid revealed");
      return this?.rowToRecord(updated);
    } catch (err) {
      await db
        .update(hnsAuctions)
        .set({ state: "failed", error: err?.message, updatedAt: new Date() })
        .where(eq(hnsAuctions?.id, auctionId));
      throw err;
    }
  }

  /**
   * Register a won name with Max Booster NS records.
   */
  async registerName(
    auctionId: string,
    userId: string,
    ns1IP: string,
    ns2IP: string,
  ): Promise<AuctionRecord> {
    const _row = await this?.getRow(auctionId, userId);
    if (!row) throw new Error("Auction not found");

    const _info = await this?.client.getNameInfo(row?.name);
    if (info?.state !== "CLOSED" || !info?.registered) {
      // Check if we're the owner by looking at wallet names
      const _walletNames = await this?.client.getWalletNames();
      const _owned = walletNames?.find((n) => n?.name === row?.name);
      if (!owned) throw new Error(`Did not win auction for "${row?.name}"`);
    }

    const _records = buildMaxBoosterNSRecords(row?.name, ns1IP, ns2IP);

    try {
      const _tx = await this?.client.updateName(row?.name, records);
      const [updated] = await db
        .update(hnsAuctions)
        .set({ state: "registered", txHash: tx?.hash, updatedAt: new Date() })
        .where(eq(hnsAuctions?.id, auctionId))
        .returning();
      logger?.info(
        { name: row?.name, txHash: tx?.hash },
        "[HNS] Name registered with NS records",
      );
      return this?.rowToRecord(updated);
    } catch (err) {
      await db
        .update(hnsAuctions)
        .set({ state: "failed", error: err?.message, updatedAt: new Date() })
        .where(eq(hnsAuctions?.id, auctionId));
      throw err;
    }
  }

  /**
   * Sync auction state from the blockchain (call from a polling job).
   */
  async syncState(auctionId: string, userId: string): Promise<AuctionRecord> {
    const _row = await this?.getRow(auctionId, userId);
    if (!row) throw new Error("Auction not found");

    const _info = await this?.client.getNameInfo(row?.name);
    let newState: AuctionState = row?.state;

    switch (info?.state) {
      case "OPENING":
        newState = "opening";
        break;
      case "BIDDING":
        newState = "bidding";
        break;
      case "REVEAL":
        newState = "revealing";
        break;
      case "CLOSED": {
        // Check if we own it
        const _walletNames = await this?.client.getWalletNames().catch(() => []);
        const _owned = walletNames?.find((n) => n?.name === row?.name);
        newState = owned ? "won" : "lost";
        break;
      }
    }

    if (newState !== row?.state) {
      const [updated] = await db
        .update(hnsAuctions)
        .set({ state: newState, updatedAt: new Date() })
        .where(eq(hnsAuctions?.id, auctionId))
        .returning();
      logger?.info(
        { name: row?.name, from: row?.state, to: newState },
        "[HNS] State synced",
      );
      return this?.rowToRecord(updated);
    }

    return this?.rowToRecord(row);
  }

  // ── Query helpers ─────────────────────────────────────────────────────────

  async listAuctions(userId: string): Promise<AuctionRecord[]> {
    const _rows = await db
      .select()
      .from(hnsAuctions)
      .where(eq(hnsAuctions?.userId, userId));
    return rows?.map((r) => this?.rowToRecord(r));
  }

  async getAuction(id: string, userId: string): Promise<AuctionRecord | null> {
    const _row = await this?.getRow(id, userId);
    return row ? this?.rowToRecord(row) : null;
  }

  private async getRow(id: string, userId: string) {
    const [row] = await db
      .select()
      .from(hnsAuctions)
      .where(and(eq(hnsAuctions?.id, id), eq(hnsAuctions?.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  private rowToRecord(row: Record<string, unknown>): AuctionRecord {
    return {
      id: row?.id,
      userId: row?.userId,
      name: row?.name,
      bidHNS: row?.bidHns,
      lockupHNS: row?.lockupHns,
      state: row?.state as AuctionState,
      txHash: row?.txHash ?? undefined,
      nameHash: row?.nameHash ?? undefined,
      error: row?.error ?? undefined,
      createdAt: row?.createdAt,
      updatedAt: row?.updatedAt,
    };
  }
}
