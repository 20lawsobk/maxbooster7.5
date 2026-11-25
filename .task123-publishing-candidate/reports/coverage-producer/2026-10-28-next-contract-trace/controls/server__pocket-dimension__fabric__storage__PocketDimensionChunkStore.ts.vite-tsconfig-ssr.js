__vite_ssr_exportName__("PocketDimensionChunkStore", () => { try { return PocketDimensionChunkStore } catch {} });
const __vite_ssr_import_0__ = await __vite_ssr_import__("node:crypto", {"importedNames":["createHash"]});
const __vite_ssr_import_1__ = await __vite_ssr_import__("../../../lib/pdimClient.js", {"importedNames":["getPdimClient"]});
const __vite_ssr_import_2__ = await __vite_ssr_import__("../../../logger.js", {"importedNames":["logger"]});



const CHUNK_KEY_PREFIX = "chunks";
const WRITE_IMMUTABLE = `
if redis.call('EXISTS',KEYS[2])==1 then return -1 end
local current=redis.call('GET',KEYS[1])
if current and current~=ARGV[1] then return -2 end
if not current then redis.call('SET',KEYS[1],ARGV[1]) end
return 1`;
const DELETE_IMMUTABLE = `
redis.call('SET',KEYS[2],'1')
redis.call('DEL',KEYS[1])
return 1`;
class PocketDimensionChunkStore {
  constructor(pocketName, owner = () => (0,__vite_ssr_import_1__.getPdimClient)()) {
    this.pocketName = pocketName;
    this.owner = owner;
    this.pocket = null;
    this.initPromise = null;
  }
  immutableKey(id) {
    if (!/^[a-f0-9]{64}\.[a-f0-9-]+$/.test(id)) return null;
    return `pdim:fabric-replica:v2:${(0,__vite_ssr_import_0__.createHash)("sha256").update(this.pocketName).digest("hex")}:${id}`;
  }
  async ensureOpen() {
    if (this.pocket) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      const { PocketDimensionManager } = await __vite_ssr_dynamic_import__("../../index.js");
      const manager = PocketDimensionManager?.getInstance("./pocket-dimensions");
      this.pocket = await manager?.openPocket(this.pocketName, {
        compressionLevel: 9,
        enableDeduplication: true,
        enableVersioning: false,
        chunkSize: 4 * 1024 * 1024
      });
      __vite_ssr_import_2__.logger.info(
        `[PocketDimensionChunkStore] Node bubble opened: ${this.pocketName}`
      );
    })().catch((error) => {
      this.initPromise = null;
      throw error;
    });
    return this.initPromise;
  }
  chunkKey(chunkId) {
    return `${CHUNK_KEY_PREFIX}/${chunkId?.slice(0, 2)}/${chunkId}`;
  }
  async putChunk(chunkId, data) {
    const key = this.immutableKey(chunkId);
    if (key) {
      const result = Number(await this.owner().eval(WRITE_IMMUTABLE, 2, key, `${key}:deleted`, data.toString("base64")));
      if (result === -1) throw Object.assign(new Error("Immutable fabric replica was permanently deleted"), { code: "FABRIC_REPLICA_RETIRED" });
      if (result === -2) throw Object.assign(new Error("Immutable fabric replica replacement refused"), { code: "FABRIC_REPLICA_CONFLICT" });
      if (result !== 1) throw new Error("Immutable fabric publication was not confirmed");
      return;
    };
    await this.ensureOpen();
    await this.pocket.refresh();
    await this.pocket.write(this.chunkKey(chunkId), data);
  }
  async getChunk(chunkId) {
    const key = this.immutableKey(chunkId);
    if (key) {
      const value = await this.owner().eval("return redis.call('GET',KEYS[1])", 1, key);
      if (value === null) throw new Error(`Immutable fabric replica not found: ${chunkId}`);
      return Buffer.from(value, "base64");
    };
    await this.ensureOpen();
    await this.pocket.refresh();
    const data = await this.pocket.read(this.chunkKey(chunkId));
    if (!data)
      throw new Error(
        `Chunk ${chunkId} not found in bubble ${this.pocketName}`
      );
    return Buffer?.isBuffer(data) ? data : Buffer?.from(data);
  }
  async deleteChunk(chunkId) {
    const key = this.immutableKey(chunkId);
    if (key) {
      const result = Number(await this.owner().eval(DELETE_IMMUTABLE, 2, key, `${key}:deleted`));
      if (result !== 1) throw new Error("Immutable fabric deletion was not confirmed");
      return;
    };
    await this.ensureOpen();
    await this.pocket.refresh();
    await this.pocket.delete(this.chunkKey(chunkId));
  }
  async hasChunk(chunkId) {
    const key = this.immutableKey(chunkId);
    if (key) return await this.owner().eval("return redis.call('GET',KEYS[1])", 1, key) !== null;
    await this.ensureOpen();
    await this.pocket.refresh();
    return this.pocket.exists(this.chunkKey(chunkId));
  }
}
