/** Read-only compatibility adapter for a pre-SQL HybridStorage ownership snapshot.
 * This verifies historical PDIM exports only. Current hybrid metadata lives in
 * PostgreSQL and requires a coordinated database + blob-store recovery.
 */
import { HybridStorageService } from "../server/services/hybridStorageService.js";
import { HybridStorageRepository, type HybridMetadataRow } from "../server/services/hybridStorageRepository.js";

class LegacySnapshotRepository extends HybridStorageRepository {
  private rows = new Map<string, HybridMetadataRow>();
  constructor() {
    super({
      async query() { throw new Error("Legacy snapshot verification cannot write SQL"); },
      async connect() { throw new Error("Legacy snapshot verification cannot open SQL"); },
    });
  }
  override async importLegacy(load: () => Promise<HybridMetadataRow[]>): Promise<void> {
    const parsed = await load(); // Strict production parser; invalid snapshots fail closed.
    this.rows = new Map(parsed.map(row => [row.entry.key, row]));
  }
  override async get(key: string): Promise<HybridMetadataRow | undefined> { return this.rows.get(key); }
  override async list(userId?: string, includePublic = false): Promise<HybridMetadataRow[]> {
    return [...this.rows.values()].filter(row => userId === undefined || row.entry.userId === userId || (includePublic && row.entry.isPublic));
  }
  // Reading a backup must not rewrite metadata or increment its source counters.
  override async touch(): Promise<void> {}
}

export function legacyHybridSnapshotReader(): HybridStorageService {
  return new HybridStorageService({ repository: new LegacySnapshotRepository() });
}
