import fs from 'fs';
import path from 'path';
import { logger } from '../logger.js';
import { PocketDimensionManager } from '../pocket-dimension/index.js';

const WEIGHTS_DIR = path.join(process.cwd(), 'ai_model', 'weights');
const POCKET_ID = 'ai-model-weights';

class ModelWeightStorage {
  private static instance: ModelWeightStorage;
  private pocket: any = null;
  private initialized = false;

  static getInstance(): ModelWeightStorage {
    if (!ModelWeightStorage.instance) {
      ModelWeightStorage.instance = new ModelWeightStorage();
    }
    return ModelWeightStorage.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    fs.mkdirSync(WEIGHTS_DIR, { recursive: true });
    try {
      const manager = PocketDimensionManager.getInstance('./pocket-dimensions');
      this.pocket = await manager.openPocket(POCKET_ID, {
        compressionLevel: 9,
        enableDeduplication: true,
        enableVersioning: false,
        chunkSize: 4 * 1024 * 1024,
      });
      logger.info('[WeightStorage] Pocket Dimension ai-model-weights opened (level-9 gzip, dedup)');
    } catch (err) {
      logger.warn('[WeightStorage] Could not open Pocket Dimension:', err instanceof Error ? err.message : String(err));
    }
    this.initialized = true;
  }

  private localPath(name: string): string {
    return path.join(WEIGHTS_DIR, `${name}.json`);
  }

  private pocketPath(name: string): string {
    return `weights/${name}.json`;
  }

  async exists(name: string): Promise<boolean> {
    await this.initialize();

    if (fs.existsSync(this.localPath(name))) return true;

    if (this.pocket) {
      try {
        const data = await this.pocket.read(this.pocketPath(name));
        if (data && data.length > 0) {
          this._writeLocalFile(name, data);
          logger.info(`[WeightStorage] Restored ${name} from Pocket Dimension → local cache`);
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
    const buf = Buffer.from(json, 'utf-8');

    this._writeLocalFile(name, buf);

    if (this.pocket) {
      try {
        await this.pocket.write(this.pocketPath(name), buf);
        logger.info(`[WeightStorage] ${name} stored in Pocket Dimension (${Math.round(buf.length / 1024)} KB uncompressed)`);
      } catch (err) {
        logger.warn(`[WeightStorage] Pocket Dimension write failed for ${name}:`, err instanceof Error ? err.message : String(err));
      }
    }
  }

  load(name: string): object | null {
    try {
      const p = this.localPath(name);
      if (!fs.existsSync(p)) return null;
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch {
      return null;
    }
  }

  private _writeLocalFile(name: string, buf: Buffer): void {
    fs.mkdirSync(WEIGHTS_DIR, { recursive: true });
    fs.writeFileSync(this.localPath(name), buf);
  }
}

export const modelWeightStorage = ModelWeightStorage.getInstance();
