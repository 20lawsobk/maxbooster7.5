'use strict';async (__vite_ssr_exports__,__vite_ssr_import_meta__,__vite_ssr_import__,__vite_ssr_dynamic_import__,__vite_ssr_exportAll__,__vite_ssr_exportName__,__filename,__dirname,module,exports,require)=>{{__vite_ssr_exportName__("PocketDimensionChunkStore", () => { try { return PocketDimensionChunkStore } catch {} });
const __vite_ssr_import_0__ = await __vite_ssr_import__("node:crypto", {"importedNames":["createHash"]});
const __vite_ssr_import_1__ = await __vite_ssr_import__("/server/lib/pdimClient.ts", {"importedNames":["getPdimClient"]});
const __vite_ssr_import_2__ = await __vite_ssr_import__("/server/logger.ts", {"importedNames":["logger"]});



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
      const { PocketDimensionManager } = await __vite_ssr_dynamic_import__("/server/pocket-dimension/index.ts");
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
//# sourceURL=/workspace/maxbooster7.5/server/pocket-dimension/fabric/storage/PocketDimensionChunkStore.ts
//# sourceMappingSource=vite-generated
//# sourceMappingURL=data:application/json;base64,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QUFDO0FBQzNELFFBQUksQ0FBQztBQUNILFlBQU0sSUFBSTtBQUFBLFFBQ1IsU0FBUyxPQUFPLHdCQUF3QixLQUFLLFVBQVU7QUFBQSxNQUN6RDtBQUNGLFdBQU8sUUFBUSxTQUFTLElBQUksSUFBSSxPQUFPLFFBQVEsS0FBSyxJQUFJO0FBQUEsRUFDMUQ7QUFBQSxFQUVBLE1BQU0sWUFBWSxTQUFpQztBQUNqRCxVQUFNLE1BQU0sS0FBSyxhQUFhLE9BQU87QUFDckMsUUFBSSxLQUFLO0FBSVAsWUFBTSxTQUFTLE9BQU8sTUFBTSxLQUFLLE1BQU0sRUFBRSxLQUFLLGtCQUFrQixHQUFHLEtBQUssR0FBRyxHQUFHLFVBQVUsQ0FBQztBQUN6RixVQUFJLFdBQVcsRUFBRyxPQUFNLElBQUksTUFBTSw2Q0FBNkM7QUFDL0U7QUFBQSxJQUNGO0FBQ0EsVUFBTSxLQUFLLFdBQVc7QUFDdEIsVUFBTSxLQUFLLE9BQVEsUUFBUTtBQUMzQixVQUFNLEtBQUssT0FBUSxPQUFPLEtBQUssU0FBUyxPQUFPLENBQUM7QUFBQSxFQUNsRDtBQUFBLEVBRUEsTUFBTSxTQUFTLFNBQW9DO0FBQ2pELFVBQU0sTUFBTSxLQUFLLGFBQWEsT0FBTztBQUNyQyxRQUFJLElBQUssUUFBTyxNQUFNLEtBQUssTUFBTSxFQUFFLEtBQUssb0NBQW9DLEdBQUcsR0FBRyxNQUFNO0FBQ3hGLFVBQU0sS0FBSyxXQUFXO0FBQ3RCLFVBQU0sS0FBSyxPQUFRLFFBQVE7QUFDM0IsV0FBTyxLQUFLLE9BQVEsT0FBTyxLQUFLLFNBQVMsT0FBTyxDQUFDO0FBQUEsRUFDbkQ7QUFDRiIsIm5hbWVzIjpbXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZXMiOlsiUG9ja2V0RGltZW5zaW9uQ2h1bmtTdG9yZS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBjcmVhdGVIYXNoIH0gZnJvbSBcIm5vZGU6Y3J5cHRvXCI7XG5pbXBvcnQgeyBnZXRQZGltQ2xpZW50IH0gZnJvbSBcIi4uLy4uLy4uL2xpYi9wZGltQ2xpZW50LmpzXCI7XG5pbXBvcnQgdHlwZSB7IENodW5rU3RvcmUgfSBmcm9tIFwiLi9DaHVua1N0b3JlLmpzXCI7XG5pbXBvcnQgdHlwZSB7IENodW5rSWQgfSBmcm9tIFwiLi4vdHlwZXMuanNcIjtcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gXCIuLi8uLi8uLi9sb2dnZXIuanNcIjtcbmltcG9ydCB0eXBlIHsgUG9ja2V0RGltZW5zaW9uIH0gZnJvbSBcIi4uLy4uL2luZGV4LmpzXCI7XG5cbmNvbnN0IENIVU5LX0tFWV9QUkVGSVggPSBcImNodW5rc1wiO1xuY29uc3QgV1JJVEVfSU1NVVRBQkxFID0gYFxuaWYgcmVkaXMuY2FsbCgnRVhJU1RTJyxLRVlTWzJdKT09MSB0aGVuIHJldHVybiAtMSBlbmRcbmxvY2FsIGN1cnJlbnQ9cmVkaXMuY2FsbCgnR0VUJyxLRVlTWzFdKVxuaWYgY3VycmVudCBhbmQgY3VycmVudH49QVJHVlsxXSB0aGVuIHJldHVybiAtMiBlbmRcbmlmIG5vdCBjdXJyZW50IHRoZW4gcmVkaXMuY2FsbCgnU0VUJyxLRVlTWzFdLEFSR1ZbMV0pIGVuZFxucmV0dXJuIDFgO1xuY29uc3QgREVMRVRFX0lNTVVUQUJMRSA9IGBcbnJlZGlzLmNhbGwoJ1NFVCcsS0VZU1syXSwnMScpXG5yZWRpcy5jYWxsKCdERUwnLEtFWVNbMV0pXG5yZXR1cm4gMWA7XG5cbmV4cG9ydCBjbGFzcyBQb2NrZXREaW1lbnNpb25DaHVua1N0b3JlIGltcGxlbWVudHMgQ2h1bmtTdG9yZSB7XG4gIHByaXZhdGUgcG9ja2V0OiBQb2NrZXREaW1lbnNpb24gfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBpbml0UHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IG51bGwgPSBudWxsO1xuXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgcG9ja2V0TmFtZTogc3RyaW5nLCBwcml2YXRlIHJlYWRvbmx5IG93bmVyID0gKCkgPT4gZ2V0UGRpbUNsaWVudCgpKSB7fVxuXG4gIHByaXZhdGUgaW1tdXRhYmxlS2V5KGlkOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgICBpZiAoIS9eW2EtZjAtOV17NjR9XFwuW2EtZjAtOS1dKyQvLnRlc3QoaWQpKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gYHBkaW06ZmFicmljLXJlcGxpY2E6djI6JHtjcmVhdGVIYXNoKFwic2hhMjU2XCIpLnVwZGF0ZSh0aGlzLnBvY2tldE5hbWUpLmRpZ2VzdChcImhleFwiKX06JHtpZH1gO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBlbnN1cmVPcGVuKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLnBvY2tldCkgcmV0dXJuO1xuICAgIGlmICh0aGlzLmluaXRQcm9taXNlKSByZXR1cm4gdGhpcy5pbml0UHJvbWlzZTtcblxuICAgIHRoaXMuaW5pdFByb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgeyBQb2NrZXREaW1lbnNpb25NYW5hZ2VyIH0gPSBhd2FpdCBpbXBvcnQoXCIuLi8uLi9pbmRleC5qc1wiKTtcbiAgICAgIGNvbnN0IG1hbmFnZXIgPSBQb2NrZXREaW1lbnNpb25NYW5hZ2VyPy5nZXRJbnN0YW5jZShcIi4vcG9ja2V0LWRpbWVuc2lvbnNcIik7XG4gICAgICB0aGlzLnBvY2tldCA9IGF3YWl0IG1hbmFnZXI/Lm9wZW5Qb2NrZXQodGhpcy5wb2NrZXROYW1lLCB7XG4gICAgICAgIGNvbXByZXNzaW9uTGV2ZWw6IDksXG4gICAgICAgIGVuYWJsZURlZHVwbGljYXRpb246IHRydWUsXG4gICAgICAgIGVuYWJsZVZlcnNpb25pbmc6IGZhbHNlLFxuICAgICAgICBjaHVua1NpemU6IDQgKiAxMDI0ICogMTAyNCxcbiAgICAgIH0pO1xuICAgICAgbG9nZ2VyLmluZm8oXG4gICAgICAgIGBbUG9ja2V0RGltZW5zaW9uQ2h1bmtTdG9yZV0gTm9kZSBidWJibGUgb3BlbmVkOiAke3RoaXMucG9ja2V0TmFtZX1gLFxuICAgICAgKTtcbiAgICB9KSgpLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgdGhpcy5pbml0UHJvbWlzZSA9IG51bGw7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9KTtcblxuICAgIHJldHVybiB0aGlzLmluaXRQcm9taXNlO1xuICB9XG5cbiAgcHJpdmF0ZSBjaHVua0tleShjaHVua0lkOiBDaHVua0lkKTogc3RyaW5nIHtcbiAgICByZXR1cm4gYCR7Q0hVTktfS0VZX1BSRUZJWH0vJHtjaHVua0lkPy5zbGljZSgwLCAyKX0vJHtjaHVua0lkfWA7XG4gIH1cblxuICBhc3luYyBwdXRDaHVuayhjaHVua0lkOiBDaHVua0lkLCBkYXRhOiBCdWZmZXIpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBrZXkgPSB0aGlzLmltbXV0YWJsZUtleShjaHVua0lkKTtcbiAgICBpZiAoa2V5KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBOdW1iZXIoYXdhaXQgdGhpcy5vd25lcigpLmV2YWwoV1JJVEVfSU1NVVRBQkxFLCAyLCBrZXksIGAke2tleX06ZGVsZXRlZGAsIGRhdGEudG9TdHJpbmcoXCJiYXNlNjRcIikpKTtcbiAgICAgIGlmIChyZXN1bHQgPT09IC0xKSB0aHJvdyBPYmplY3QuYXNzaWduKG5ldyBFcnJvcihcIkltbXV0YWJsZSBmYWJyaWMgcmVwbGljYSB3YXMgcGVybWFuZW50bHkgZGVsZXRlZFwiKSwgeyBjb2RlOiBcIkZBQlJJQ19SRVBMSUNBX1JFVElSRURcIiB9KTtcbiAgICAgIGlmIChyZXN1bHQgPT09IC0yKSB0aHJvdyBPYmplY3QuYXNzaWduKG5ldyBFcnJvcihcIkltbXV0YWJsZSBmYWJyaWMgcmVwbGljYSByZXBsYWNlbWVudCByZWZ1c2VkXCIpLCB7IGNvZGU6IFwiRkFCUklDX1JFUExJQ0FfQ09ORkxJQ1RcIiB9KTtcbiAgICAgIGlmIChyZXN1bHQgIT09IDEpIHRocm93IG5ldyBFcnJvcihcIkltbXV0YWJsZSBmYWJyaWMgcHVibGljYXRpb24gd2FzIG5vdCBjb25maXJtZWRcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGF3YWl0IHRoaXMuZW5zdXJlT3BlbigpO1xuICAgIGF3YWl0IHRoaXMucG9ja2V0IS5yZWZyZXNoKCk7XG4gICAgYXdhaXQgdGhpcy5wb2NrZXQhLndyaXRlKHRoaXMuY2h1bmtLZXkoY2h1bmtJZCksIGRhdGEpO1xuICB9XG5cbiAgYXN5bmMgZ2V0Q2h1bmsoY2h1bmtJZDogQ2h1bmtJZCk6IFByb21pc2U8QnVmZmVyPiB7XG4gICAgY29uc3Qga2V5ID0gdGhpcy5pbW11dGFibGVLZXkoY2h1bmtJZCk7XG4gICAgaWYgKGtleSkge1xuICAgICAgLy8gSW50ZWdyaXR5IGNoZWNrcyBtdXN0IHJlYWNoIHRoZSBhdXRob3JpdHksIG5ldmVyIFBESU0ncyBzdGFsZS1vbi1lcnJvclxuICAgICAgLy8gR0VUIGNhY2hlLiBFVkFMIGFsc28gcHJlc2VydmVzIG9yZGVyaW5nIHdpdGggcHVibGljYXRpb24vZGVsZXRpb24uXG4gICAgICBjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMub3duZXIoKS5ldmFsKFwicmV0dXJuIHJlZGlzLmNhbGwoJ0dFVCcsS0VZU1sxXSlcIiwgMSwga2V5KSBhcyBzdHJpbmcgfCBudWxsO1xuICAgICAgaWYgKHZhbHVlID09PSBudWxsKSB0aHJvdyBuZXcgRXJyb3IoYEltbXV0YWJsZSBmYWJyaWMgcmVwbGljYSBub3QgZm91bmQ6ICR7Y2h1bmtJZH1gKTtcbiAgICAgIHJldHVybiBCdWZmZXIuZnJvbSh2YWx1ZSwgXCJiYXNlNjRcIik7XG4gICAgfVxuICAgIGF3YWl0IHRoaXMuZW5zdXJlT3BlbigpO1xuICAgIGF3YWl0IHRoaXMucG9ja2V0IS5yZWZyZXNoKCk7XG4gICAgY29uc3QgZGF0YSA9IGF3YWl0IHRoaXMucG9ja2V0IS5yZWFkKHRoaXMuY2h1bmtLZXkoY2h1bmtJZCkpO1xuICAgIGlmICghZGF0YSlcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYENodW5rICR7Y2h1bmtJZH0gbm90IGZvdW5kIGluIGJ1YmJsZSAke3RoaXMucG9ja2V0TmFtZX1gLFxuICAgICAgKTtcbiAgICByZXR1cm4gQnVmZmVyPy5pc0J1ZmZlcihkYXRhKSA/IGRhdGEgOiBCdWZmZXI/LmZyb20oZGF0YSk7XG4gIH1cblxuICBhc3luYyBkZWxldGVDaHVuayhjaHVua0lkOiBDaHVua0lkKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qga2V5ID0gdGhpcy5pbW11dGFibGVLZXkoY2h1bmtJZCk7XG4gICAgaWYgKGtleSkge1xuICAgICAgLy8gS2VlcCB0aGlzIHNtYWxsIHRvbWJzdG9uZSBwZXJtYW5lbnRseS4gUmVtb3ZpbmcvZXhwaXJpbmcgaXQgcGVybWl0cyBhXG4gICAgICAvLyBkZWxheWVkIHdyaXRlIGZyb20gYSBmZW5jZWQtb3V0IG93bmVyIHRvIHJlc3VycmVjdCByZWNsYWltZWQgYnl0ZXMuXG4gICAgICAvLyBJdCBpcyBjb250cm9sIG1ldGFkYXRhLCBub3QgYSBsaXZlIGNvbnRlbnQgcmVwbGljYS9jYXBhY2l0eSBjaGFyZ2UuXG4gICAgICBjb25zdCByZXN1bHQgPSBOdW1iZXIoYXdhaXQgdGhpcy5vd25lcigpLmV2YWwoREVMRVRFX0lNTVVUQUJMRSwgMiwga2V5LCBgJHtrZXl9OmRlbGV0ZWRgKSk7XG4gICAgICBpZiAocmVzdWx0ICE9PSAxKSB0aHJvdyBuZXcgRXJyb3IoXCJJbW11dGFibGUgZmFicmljIGRlbGV0aW9uIHdhcyBub3QgY29uZmlybWVkXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLmVuc3VyZU9wZW4oKTtcbiAgICBhd2FpdCB0aGlzLnBvY2tldCEucmVmcmVzaCgpO1xuICAgIGF3YWl0IHRoaXMucG9ja2V0IS5kZWxldGUodGhpcy5jaHVua0tleShjaHVua0lkKSk7XG4gIH1cblxuICBhc3luYyBoYXNDaHVuayhjaHVua0lkOiBDaHVua0lkKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3Qga2V5ID0gdGhpcy5pbW11dGFibGVLZXkoY2h1bmtJZCk7XG4gICAgaWYgKGtleSkgcmV0dXJuIGF3YWl0IHRoaXMub3duZXIoKS5ldmFsKFwicmV0dXJuIHJlZGlzLmNhbGwoJ0dFVCcsS0VZU1sxXSlcIiwgMSwga2V5KSAhPT0gbnVsbDtcbiAgICBhd2FpdCB0aGlzLmVuc3VyZU9wZW4oKTtcbiAgICBhd2FpdCB0aGlzLnBvY2tldCEucmVmcmVzaCgpO1xuICAgIHJldHVybiB0aGlzLnBvY2tldCEuZXhpc3RzKHRoaXMuY2h1bmtLZXkoY2h1bmtJZCkpO1xuICB9XG59XG4iXSwiZmlsZSI6Ii9zZXJ2ZXIvcG9ja2V0LWRpbWVuc2lvbi9mYWJyaWMvc3RvcmFnZS9Qb2NrZXREaW1lbnNpb25DaHVua1N0b3JlLnRzIn0=

}}