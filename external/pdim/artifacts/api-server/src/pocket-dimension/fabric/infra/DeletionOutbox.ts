import { sql } from "drizzle-orm";
import { db, withFabricChunkLock } from "../../../lib/db.js";
import { DurableDeletionOutbox } from "../../../../../../lib/db/src/fabricDeletion.js";

export class DeletionOutbox extends DurableDeletionOutbox<ReturnType<typeof sql>> {
  constructor() { super(db, withFabricChunkLock, sql); }
}
