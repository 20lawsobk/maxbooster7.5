/**
 * Max Booster — HNS Session Facade  (Build 3)
 *
 * Singleton entry-point for all Handshake operations.
 * Reads config from environment, constructs HnsClient + HnsAuctionManager.
 */

import { HnsClient, HnsConfig } from "./HnsClient.js";
import { HnsAuctionManager } from "./HnsAuction.js";

const cfg: HnsConfig = {
  host: process.env.HNS_HOST || "127.0.0.1",
  port: parseInt(process.env.HNS_PORT || "12037", 10),
  apiKey: process.env.HNS_API_KEY || "",
  wallet: process.env.HNS_WALLET || "primary",
  network: (process.env.HNS_NETWORK || "main") as HnsConfig["network"],
  timeout: parseInt(process.env.HNS_TIMEOUT || "10000", 10),
};

export const hnsClient = new HnsClient(cfg);
export const hnsManager = new HnsAuctionManager(hnsClient);

/**
 * Check if hsd is reachable. Returns false if not configured / unavailable.
 */
export async function hnsReady(): Promise<boolean> {
  if (!cfg?.apiKey) return false;
  return hnsClient?.isReady();
}

export { HnsClient, HnsAuctionManager };
export type {
  HnsConfig,
  HnsNameInfo,
  HnsBid,
  HnsTx,
  HnsResource,
} from "./HnsClient.js";
export type { AuctionRecord, AuctionState } from "./HnsAuction.js";
