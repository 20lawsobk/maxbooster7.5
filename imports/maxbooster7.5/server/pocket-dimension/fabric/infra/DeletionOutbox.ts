import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
import { db, pool } from "../../../db.js";
import { DurableDeletionOutbox } from "../../../../external/pdim/lib/db/src/fabricDeletion.js";
import { createFabricChunkFence } from "../../../../external/pdim/lib/db/src/fabricChunkFence.js";

const fence = createFabricChunkFence(pool);
const generations = new AsyncLocalStorage<string>();
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export function currentFabricGeneration(): string {
  const generation = generations.getStore();
  if (!generation) throw new Error("Fabric catalog mutation has no generation fence");
  return generation;
}

export async function withFabricCatalogTransaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
  const generation = currentFabricGeneration();
  return db.transaction(async tx => {
    const row = (await tx.execute(sql`SELECT generation::text AS generation FROM fabric_catalog_fence WHERE id='root-catalog' FOR UPDATE`)).rows[0];
    if (!row || row.generation !== generation) throw new Error("Stale fabric catalog generation; retry through the current owner");
    return work(tx);
  });
}
const catalogDatabase = {
  execute: (query: ReturnType<typeof sql>) => withFabricCatalogTransaction(tx => tx.execute(query)),
  transaction: withFabricCatalogTransaction,
};

// Allocating the generation commits on the normal query pool while the separate
// advisory transaction remains held. Every metadata transaction locks/checks
// this row, so an old owner cannot commit after its successor starts cleanup.
export const withFabricCatalogLock = <T>(work: () => Promise<T>): Promise<T> => fence("root-catalog", async () => {
  const row = (await db.execute(sql`UPDATE fabric_catalog_fence SET generation=generation+1 WHERE id='root-catalog' RETURNING generation::text AS generation`)).rows[0];
  if (!row) throw new Error("Fabric migration 0096 is required before serving storage");
  return generations.run(String(row.generation), work);
});

export class DeletionOutbox extends DurableDeletionOutbox<ReturnType<typeof sql>> {
  constructor() { super(catalogDatabase, (_id, work) => withFabricCatalogLock(work), sql, { textUsage: true, segments: false }); }

  async claim(objectId: string): Promise<{ id: string; chunkIds: string[] } | null> {
    await withFabricCatalogTransaction(async tx => {
      if (!(await tx.execute(sql`SELECT id FROM fabric_objects WHERE id=${objectId}`)).rows.length) return;
      const dependencies = await tx.execute(sql`SELECT object_id FROM fabric_object_dependencies WHERE base_object_id=${objectId} LIMIT 1`);
      const legacy = await tx.execute(sql`SELECT id FROM fabric_objects WHERE id<>${objectId} AND dependencies_indexed=false LIMIT 1`);
      if (dependencies.rows.length || legacy.rows.length) {
        const error = new Error(dependencies.rows.length
          ? "Object is retained by a live delta-dependent version; delete dependent versions first"
          : "Object is retained until existing version dependencies are verified");
        Object.assign(error, { statusCode: 409, code: "FABRIC_DEPENDENCY_IN_USE" });
        throw error;
      }
    });
    return super.claim(objectId);
  }

  async beginWrite(objectId: string): Promise<void> {
    await this.initialize();
    await catalogDatabase.execute(sql`INSERT INTO fabric_deletion_objects (object_id,object_data)
      VALUES (${objectId},${JSON.stringify({ id: objectId, chunk_ids: [], pending_write: true })}::jsonb)`);
  }

  async stageWriteChunk(objectId: string, ordinal: number, chunkId: string, nodeIds: string[], size: number, physicalKeys: Record<string, string>): Promise<void> {
    await withFabricCatalogTransaction(async tx => {
      await tx.execute(sql`INSERT INTO fabric_deletion_chunks (object_id,ordinal,chunk_id,state,location)
        VALUES (${objectId},${ordinal},${chunkId},'released',${JSON.stringify({ node_ids: nodeIds, size_bytes: size, accounted_nodes: [], physical_keys: physicalKeys })}::jsonb)`);
      await tx.execute(sql`UPDATE fabric_deletion_objects SET object_data=jsonb_set(object_data,'{chunk_ids}',
        (object_data->'chunk_ids') || ${JSON.stringify([chunkId])}::jsonb) WHERE object_id=${objectId}`);
    });
  }

  async creditWriteNode(objectId: string, ordinal: number, nodeId: string, size: number): Promise<void> {
    await withFabricCatalogTransaction(async tx => {
      const result = await tx.execute(sql`UPDATE fabric_storage_nodes SET used_bytes=(used_bytes::bigint+${size})::text WHERE id=${nodeId} RETURNING id`);
      if (result.rows.length !== 1) throw new Error(`Fabric write node accounting unavailable: ${nodeId}`);
      await tx.execute(sql`UPDATE fabric_deletion_chunks SET location=jsonb_set(location,'{accounted_nodes}',
        (location->'accounted_nodes') || ${JSON.stringify([nodeId])}::jsonb) WHERE object_id=${objectId} AND ordinal=${ordinal}`);
    });
  }
}
