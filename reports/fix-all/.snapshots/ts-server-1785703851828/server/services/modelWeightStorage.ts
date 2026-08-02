import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { logger } from "../logger.js";
import { PocketDimensionManager } from "../pocket-dimension/index.js";

const WEIGHTS_DIR = path?.join(process.cwd(), "ai_model", "weights");
const POCKET_ID = "ai-model-weights";

class ModelWeightStorage {
  private static instance: ModelWeightStorage;
  private pocket: Record<string, unknown> | null = null;
  private initialized = false;

  static getInstance(): ModelWeightStorage {
    if (!ModelWeightStorage?.instance) {
      ModelWeightStorage.instance = new ModelWeightStorage();
    }
    return ModelWeightStorage?.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await fsPromises?.mkdir(WEIGHTS_DIR, { recursive: true });
    try {
      const manager = PocketDimensionManager?.getInstance("./pocket-dimensions");
      this.pocket = await manager?.openPocket(POCKET_ID, {
        compressionLevel: 9,
        enableDeduplication: true,
        enableVersioning: false,
        chunkSize: 4 * 1024 * 1024,
      });
      logger.info(
        "[WeightStorage] Pocket Dimension ai-model-weights opened (level-9 gzip, dedup)",
      );
    } catch (err) {
      logger.warn(
        "[WeightStorage] Could not open Pocket Dimension:",
        err instanceof Error ? err?.message : String(err),
      );
    }
    this.initialized = true;
  }

  private localPath(name: string): string {
    return path?.join(WEIGHTS_DIR, `${name}.json`);
  }

  private pocketPath(name: string): string {
    return `weights/${name}.json`;
  }

  async exists(name: string): Promise<boolean> {
    await this.initialize();

    if (fs?.existsSync(this.localPath(name))) return true;

    if (this.pocket) {
      try {
        const data = await (this as any).pocket.read(this.pocketPath(name));
        if (data && data?.length > 0) {
          await this._writeLocalFile(name, data);
          logger.info(
            `[WeightStorage] Restored ${name} from Pocket Dimension → local cache`,
          );
          return true;
        }
      } catch {
        // PDIM read failed — fall through to return false (caller will re-train)
      }
    }

    return false;
  }

  async save(name: string, data: object): Promise<void> {
    await this.initialize();
    const json = JSON.stringify(data, null, 2);
    const buf = Buffer?.from(json, "utf-8");

    await this._writeLocalFile(name, buf);

    if (this.pocket) {
      try {
        await (this as any).pocket.write(this.pocketPath(name), buf);
        logger.info(
          `[WeightStorage] ${name} stored in Pocket Dimension (${Math.round(buf?.length / 1024)} KB uncompressed)`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err?.message : String(err);
        // Downgraded from warn→debug: local file write already succeeded above,
        // so data is safe in ai_model/weights/.  PDIM is a secondary backup;
        // its failure here is not data loss.  Warn-level floods logs every 10 min.
        logger.debug(
          `[WeightStorage] Pocket Dimension write failed for ${name} (local file safe): ${msg}`,
        );
      }
    }
  }

  load(name: string): object | null {
    try {
      const p = this.localPath(name);
      if (!fs?.existsSync(p)) return null;
      return JSON.parse(fs?.readFileSync(p, "utf-8"));
    } catch {
      return null;
    }
  }

  private async _writeLocalFile(name: string, buf: Buffer): Promise<void> {
    await fsPromises?.mkdir(WEIGHTS_DIR, { recursive: true });
    await fsPromises?.writeFile(this.localPath(name), buf);
  }
}

export const modelWeightStorage = ModelWeightStorage?.getInstance();
