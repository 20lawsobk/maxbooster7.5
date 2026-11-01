import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const OUTPUT_PATH = path.join(
  process.cwd(),
  "..",
  "attached_assets",
  "patent_blawz_music_llc.pdf",
);

const doc = new PDFDocument({
  size: "LETTER",
  margins: { top: 72, bottom: 72, left: 90, right: 72 },
  info: {
    Title: "US Patent Application — Hierarchical Distributed Storage System",
    Author: "B-Lawz Music LLC",
    Subject: "Patent Application",
    Keywords:
      "distributed storage, content-addressed, chunking, WebAssembly, Lua, key-value store",
    Creator: "B-Lawz Music LLC",
  },
});

const out = fs.createWriteStream(OUTPUT_PATH);
doc.pipe(out);

const FONTS = {
  regular: "Times-Roman",
  bold: "Times-Bold",
  italic: "Times-Italic",
  boldItalic: "Times-BoldItalic",
  mono: "Courier",
};

const C = {
  black: "#000000",
  darkGray: "#333333",
  midGray: "#555555",
  lightGray: "#888888",
  accent: "#1a1a2e",
  border: "#cccccc",
  disclaimerBg: "#fff8dc",
};

const PAGE_WIDTH = doc.page.width;
const CONTENT_WIDTH = PAGE_WIDTH - 90 - 72;

function drawHR(y?: number, color = C.border, thickness = 0.5) {
  const yPos = y ?? doc.y;
  doc
    .save()
    .moveTo(90, yPos)
    .lineTo(PAGE_WIDTH - 72, yPos)
    .lineWidth(thickness)
    .strokeColor(color)
    .stroke()
    .restore();
}

function sectionTitle(text: string) {
  doc.moveDown(0.8);
  drawHR();
  doc.moveDown(0.5);
  doc
    .font(FONTS.bold)
    .fontSize(11)
    .fillColor(C.accent)
    .text(text.toUpperCase(), { align: "left" });
  doc.moveDown(0.4);
  doc.font(FONTS.regular).fontSize(10).fillColor(C.black);
}

function subSection(text: string) {
  doc.moveDown(0.5);
  doc.font(FONTS.bold).fontSize(10).fillColor(C.darkGray).text(text);
  doc.moveDown(0.25);
  doc.font(FONTS.regular).fontSize(10).fillColor(C.black);
}

function subSubSection(text: string) {
  doc.moveDown(0.4);
  doc.font(FONTS.boldItalic).fontSize(10).fillColor(C.darkGray).text(text);
  doc.moveDown(0.2);
  doc.font(FONTS.regular).fontSize(10).fillColor(C.black);
}

function body(text: string, opts: object = {}) {
  doc
    .font(FONTS.regular)
    .fontSize(10)
    .fillColor(C.black)
    .text(text, { align: "justify", lineGap: 2, ...opts });
  doc.moveDown(0.3);
}

function claimText(num: string, text: string) {
  doc.moveDown(0.4);
  doc
    .font(FONTS.bold)
    .fontSize(10)
    .fillColor(C.black)
    .text(`Claim ${num}.`, { continued: true });
  doc
    .font(FONTS.regular)
    .fontSize(10)
    .fillColor(C.black)
    .text(` ${text}`, { align: "justify", lineGap: 2 });
  doc.moveDown(0.3);
}

function bullet(text: string, indent = 110) {
  const savedX = doc.x;
  doc
    .font(FONTS.regular)
    .fontSize(10)
    .fillColor(C.black)
    .text("•", 90, doc.y, { width: 20, continued: false });
  doc.text(text, indent, doc.y - doc.currentLineHeight(true), {
    width: CONTENT_WIDTH - (indent - 90),
    align: "justify",
    lineGap: 2,
  });
  doc.moveDown(0.15);
}

function numberedItem(n: number | string, text: string, indent = 110) {
  doc
    .font(FONTS.regular)
    .fontSize(10)
    .fillColor(C.black)
    .text(`${n}.`, 90, doc.y, { width: 20, continued: false });
  doc.text(text, indent, doc.y - doc.currentLineHeight(true), {
    width: CONTENT_WIDTH - (indent - 90),
    align: "justify",
    lineGap: 2,
  });
  doc.moveDown(0.2);
}

function letterItem(ltr: string, text: string, indent = 115) {
  doc
    .font(FONTS.regular)
    .fontSize(10)
    .fillColor(C.black)
    .text(`${ltr}.`, 105, doc.y, { width: 15, continued: false });
  doc.text(text, indent, doc.y - doc.currentLineHeight(true), {
    width: CONTENT_WIDTH - (indent - 90),
    align: "justify",
    lineGap: 2,
  });
  doc.moveDown(0.15);
}

function addPageNumber() {
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(pages.start + i);
    doc.save();
    doc.font(FONTS.regular).fontSize(8).fillColor(C.lightGray);
    doc.text(
      `B-Lawz Music LLC — Patent Application — Page ${i + 1}`,
      90,
      doc.page.height - 45,
      { width: CONTENT_WIDTH, align: "center" },
    );
    doc.restore();
  }
}

doc.on("pageAdded", () => {
  doc.font(FONTS.regular).fontSize(10).fillColor(C.black);
});

// ─────────────────────────────────────────────────────────────────────────────
// COVER PAGE
// ─────────────────────────────────────────────────────────────────────────────

doc.rect(0, 0, PAGE_WIDTH, 8).fill(C.accent);

doc.moveDown(2);

doc
  .font(FONTS.bold)
  .fontSize(9)
  .fillColor(C.lightGray)
  .text("UNITED STATES PATENT APPLICATION", { align: "center" });
doc.moveDown(0.3);

drawHR(doc.y + 4, C.border, 0.75);
doc.moveDown(1.2);

doc
  .font(FONTS.bold)
  .fontSize(13)
  .fillColor(C.accent)
  .text("HIERARCHICAL DISTRIBUTED STORAGE SYSTEM", { align: "center" });
doc
  .font(FONTS.bold)
  .fontSize(13)
  .fillColor(C.accent)
  .text("WITH CONTENT-ADDRESSED CHUNKING,", { align: "center" });
doc
  .font(FONTS.bold)
  .fontSize(13)
  .fillColor(C.accent)
  .text("POLICY-DRIVEN REPLICA PLACEMENT,", { align: "center" });
doc
  .font(FONTS.bold)
  .fontSize(13)
  .fillColor(C.accent)
  .text("HYBRID TIERING, AND WEBASSEMBLY-BASED", { align: "center" });
doc
  .font(FONTS.bold)
  .fontSize(13)
  .fillColor(C.accent)
  .text("SCRIPTING ENGINE FOR KEY-VALUE STORES", { align: "center" });

doc.moveDown(2);
drawHR(doc.y, C.border, 0.75);
doc.moveDown(1.5);

const metaLeft = 180;
const metaRight = 320;
const metaY = doc.y;

function metaRow(label: string, value: string) {
  const y = doc.y;
  doc
    .font(FONTS.bold)
    .fontSize(10)
    .fillColor(C.darkGray)
    .text(label, metaLeft, y, { width: metaRight - metaLeft - 10 });
  doc
    .font(FONTS.regular)
    .fontSize(10)
    .fillColor(C.black)
    .text(value, metaRight, y, { width: PAGE_WIDTH - metaRight - 72 });
  doc.moveDown(0.5);
}

metaRow("Application No.:", "[To Be Assigned by USPTO]");
metaRow("Filing Date:", "[To Be Assigned]");
metaRow("Assignee:", "B-Lawz Music LLC");
metaRow("Inventors:", "[To Be Completed]");
metaRow("Attorney Docket No.:", "[To Be Completed]");
metaRow("Classification (CPC):", "G06F 16/18 · G06F 16/22 · G06F 9/54");

doc.moveDown(2);
drawHR(doc.y, C.border, 0.75);
doc.moveDown(1);

doc.rect(90, doc.y, CONTENT_WIDTH, 48).fillAndStroke("#fffbea", "#e5c000");
doc
  .font(FONTS.boldItalic)
  .fontSize(8.5)
  .fillColor("#7a5c00")
  .text(
    "DISCLAIMER: This document is an informational template only and does not constitute legal advice or a filed patent " +
      "application. Patent law is jurisdiction-specific and technically demanding. Consult a registered patent attorney " +
      "or agent (USPTO registration required) before filing.",
    100,
    doc.y + 8,
    { width: CONTENT_WIDTH - 20, align: "justify", lineGap: 1.5 },
  );
doc.moveDown(3.2);

doc
  .font(FONTS.regular)
  .fontSize(8.5)
  .fillColor(C.lightGray)
  .text("© B-Lawz Music LLC — All Rights Reserved — Confidential", {
    align: "center",
  });

// ─────────────────────────────────────────────────────────────────────────────
// PAGE 2+: BODY
// ─────────────────────────────────────────────────────────────────────────────
doc.addPage();
doc.rect(0, 0, PAGE_WIDTH, 8).fill(C.accent);
doc.moveDown(0.5);

// Cross Reference
sectionTitle("Cross-Reference to Related Applications");
body("Not Applicable.");

// Federally Sponsored Research
sectionTitle("Statement Regarding Federally Sponsored Research");
body("Not Applicable.");

// Field
sectionTitle("Field of the Invention");
body(
  "The present invention relates generally to distributed data storage systems, and more particularly to a hierarchical, " +
    'content-addressed, chunked storage system that partitions data across isolated logical containers ("pockets"), distributes ' +
    "chunk replicas across heterogeneous storage nodes under a configurable placement policy, provides automatic hot/cold tier " +
    "migration with fallback, and exposes a key-value interface with a WebAssembly-based Lua scripting engine capable of " +
    "operating across a thread pool.",
);

// Background
sectionTitle("Background of the Invention");
body(
  "Modern cloud infrastructure demands storage systems that simultaneously satisfy conflicting requirements: low-latency " +
    "access, high throughput for large bulk writes, strong isolation between tenants, cost-optimized tiering, and programmable " +
    "query semantics. Existing systems address subsets of these requirements but fail to provide a unified, coherent architecture.",
);
body(
  "Content-addressed storage systems such as content-delivery networks and version-control backends hash data to produce " +
    "stable identifiers, enabling deduplication but typically lack tenant isolation and configurable placement policies.",
);
body(
  "Distributed file systems (e.g., GFS, HDFS) provide scalable chunk distribution but use centralized metadata servers, " +
    "creating bottlenecks, and do not provide per-tenant encryption or scripting interfaces.",
);
body(
  "Key-value stores (e.g., Redis) offer in-memory data structures and a Lua scripting interface, but their scripting engines " +
    "are single-threaded and tightly coupled to a synchronous event loop, limiting concurrency under script-heavy workloads.",
);
body(
  'Hybrid tiered storage systems separate "hot" (low-latency, high-cost) from "cold" (high-latency, low-cost) storage ' +
    "but typically require manual tiering policies and lack automatic, per-object fallback.",
);
body(
  "There is therefore a need for a system that: (1) partitions data into isolated encrypted logical containers; " +
    "(2) hashes and chunks data for content-addressed deduplication and distribution; (3) routes chunk replicas across " +
    "heterogeneous nodes under a declarative policy covering region affinity, cost tier, and capacity; (4) automatically " +
    "rebalances replicas in the background; (5) provides hot/cold tiering with transparent fallback; (6) exposes a " +
    "Redis-compatible key-value interface; and (7) executes Lua scripts safely in a pooled WebAssembly environment with " +
    "bidirectional type conversion.",
);

// Summary
sectionTitle("Summary of the Invention");
body(
  "In a first aspect, the invention provides a hierarchical chunked storage engine comprising: a pocket manager that maps " +
    "logical container identifiers to isolated storage directories; a chunking module that splits incoming byte sequences into " +
    "fixed-size segments and assigns each segment a content-address derived from a cryptographic hash of the segment's bytes; " +
    "a compression module that applies lossless compression to each chunk prior to storage; an optional per-pocket encryption " +
    "module that applies AES-GCM authenticated encryption keyed per logical container; an in-memory chunk cache; and a " +
    "reference-counting garbage collector that reclaims orphaned chunks upon write operations and compaction cycles.",
);
body(
  "In a second aspect, the invention provides a fabric distributed storage service comprising: a node registry that persists " +
    "storage node metadata including region, cost tier, capacity, utilization, and health; a placement strategy module that " +
    "selects, for each chunk, an ordered set of storage node identifiers by filtering healthy nodes for region affinity, cost " +
    "tier, and available capacity, then ranking by lowest utilization ratio; a chunk index that maps chunk identifiers to " +
    "their placed node identifiers and checksums; an object index that maps object identifiers to ordered chunk identifier " +
    "sequences; and a retrieval engine that reassembles objects by reading chunk data from replicas in placement order, " +
    "failing over to subsequent replicas on per-chunk read errors.",
);
body(
  "In a third aspect, the invention provides a background replica rebalancer that periodically identifies storage nodes " +
    "exceeding a high-watermark utilization ratio, selects candidate chunks from those nodes, migrates chunk bytes to " +
    "lower-utilization nodes via the placement strategy, updates the chunk index, and removes migrated chunks from source nodes.",
);
body(
  "In a fourth aspect, the invention provides a hybrid hot/cold tiered storage service that probes the availability of a " +
    "local sidecar object-storage endpoint at startup; on probe success, designates the sidecar-backed store as the hot tier; " +
    "always provisions a local pocket-dimension instance as the cold tier; and routes write requests by object size threshold " +
    "and configurable override, with automatic fallback from hot to cold on write failure.",
);
body(
  "In a fifth aspect, the invention provides a Redis-compatible key-value store with pooled WebAssembly Lua scripting " +
    "comprising: an in-memory key-value map with per-entry type metadata; a snapshot-based persistence mechanism backed by " +
    "the pocket-dimension engine; a Lua execution router that dispatches scripts not referencing redis.call to a thread-pool " +
    "of WebAssembly Lua virtual machines, and dispatches scripts referencing redis.call to a main-thread execution path; a " +
    "concurrency limiter governing the number of simultaneously active Lua evaluations; and bidirectional type-conversion " +
    "utilities mapping Lua tables, nil, and binary strings to Redis reply types and JavaScript values.",
);
body(
  "In a sixth aspect, the invention provides a checkpoint-resumable streaming pipeline that reads a progress offset from a " +
    "persistent key-value checkpoint key at startup, infers a consistent offset from a downstream sorted-set cardinality when " +
    "the checkpoint is absent, and produces batched stream events at a configurable tick interval until all chunks have been " +
    "transmitted, writing checkpoint updates after each batch.",
);

// Brief Description of Drawings
sectionTitle("Brief Description of the Drawings");
numberedItem(
  "FIG. 1",
  "is a high-level architecture diagram showing the Pocket Manager, Fabric Storage Service, Hybrid Tiering Service, Key-Value Store, and Lua Engine layers and their interconnections.",
);
numberedItem(
  "FIG. 2",
  "is a flowchart of the chunk write path: receive object → SHA-256 hash → split into fixed-size chunks → compress → optionally encrypt → persist → update chunk index and object index.",
);
numberedItem(
  "FIG. 3",
  "is a flowchart of the chunk read/reassembly path: lookup object index → retrieve chunk IDs in order → for each chunk, iterate replica node IDs → read from first available replica → concatenate → decrypt → decompress → return.",
);
numberedItem(
  "FIG. 4",
  "is a data-flow diagram of the Placement Strategy: receive (chunkId, size, policy) → filter healthy nodes → filter by regionAffinity → filter by costTier → filter by remaining capacity ≥ size → sort by utilization ratio → select top-N replicas.",
);
numberedItem(
  "FIG. 5",
  "is a sequence diagram of the background Rebalancer: scan nodes → identify high-watermark candidates → for each candidate chunk: read from source store → write to target store → update chunk index → delete from source.",
);
numberedItem(
  "FIG. 6",
  "is a state diagram of the Hybrid Storage Service: INIT → probe sidecar → {HOT_AVAILABLE, COLD_ONLY} → on write: route by size/override → {HOT_WRITE, COLD_WRITE, FALLBACK_TO_COLD}.",
);
numberedItem(
  "FIG. 7",
  "is a component diagram of the Redis Key-Value Store showing: Store (in-memory Map + type metadata) ↔ PocketDimension (snapshot persistence) ↔ LuaRouter ↔ {LuaWorkerPool (WebAssembly threads), MainThreadLuaEngine} ↔ TypeConverters.",
);
numberedItem(
  "FIG. 8",
  "is a flowchart of the Checkpoint-Resumable Auto-Push pipeline: startup → read checkpoint key → fallback to ZCARD → infer offset → tick loop → batch XADD/ZADD events → persist checkpoint → stop on completion.",
);

// Detailed Description
doc.addPage();
doc.rect(0, 0, PAGE_WIDTH, 8).fill(C.accent);
doc.moveDown(0.5);

sectionTitle("Detailed Description of the Preferred Embodiments");

subSection("1. Overview of the System Architecture");
body(
  "The system comprises six cooperating subsystems instantiated within a single Node.js server process configured with an " +
    "enlarged thread pool (UV_THREADPOOL_SIZE):",
);
numberedItem(
  1,
  "Pocket Dimension Engine — single-node, directory-backed, encrypted chunked storage.",
);
numberedItem(
  2,
  "Fabric Storage Service — multi-node distributed storage with replica placement.",
);
numberedItem(
  3,
  "Hybrid Storage Service — hot/cold tiering with automatic fallback.",
);
numberedItem(
  4,
  "Node Registry and Placement Strategy — storage node lifecycle and chunk routing.",
);
numberedItem(
  5,
  "Redis-Compatible Key-Value Store — in-memory data structures with Lua scripting.",
);
numberedItem(
  6,
  "Auto-Push Pipeline — checkpoint-resumable inter-instance streaming.",
);
doc.moveDown(0.3);
body(
  "All subsystems share a PostgreSQL database for persistent metadata (node registry, pocket registry, object index, chunk " +
    "index, key-value instance registry) accessed via a type-safe ORM layer. Within-process communication uses direct function " +
    "calls; cross-process communication in cluster mode uses Node.js IPC.",
);

subSection("2. Pocket Dimension Engine");
subSubSection("2.1 Pocket Isolation");
body(
  "A PocketDimensionManager singleton manages a map from pocket identifiers to open PocketDimension instances. Each " +
    "PocketDimension is assigned a root directory formed by joining a configurable base storage path with the pocket identifier " +
    "string, ensuring filesystem-level namespace isolation. Concurrent requests for the same pocket identifier return the same " +
    "in-memory instance without redundant open() operations.",
);
body("Each pocket maintains:");
bullet(
  "A metadata.json file recording the pocket name, creation timestamp, total bytes written, total chunk count, and compression statistics.",
);
bullet(
  "An index.json file recording all entry paths and their associated chunk identifier sequences, sizes, and versioning history.",
);
bullet(
  "A chunks/ subdirectory containing the actual chunk files, named by their content-address hash.",
);

subSubSection("2.2 Chunking and Content Addressing");
body("On write(entryPath, buffer), the engine:");
numberedItem(
  1,
  "Iterates over the input buffer in windows of size chunkSize (default 32 MiB, configurable per pocket), producing byte slices.",
);
numberedItem(
  2,
  "For each slice, computes a deterministic content address by applying SHA-256 to the slice bytes and encoding the digest as a hexadecimal string. This address serves as both the chunk's stable identifier and its deduplication key.",
);
numberedItem(
  3,
  "When deduplication is enabled (enableDeduplication: true), checks the in-memory chunk map for an existing entry under that address. If found, increments the access counter and reuses the existing chunk, avoiding redundant writes.",
);

subSubSection("2.3 Compression and Encryption");
body("For each unique chunk:");
numberedItem(
  1,
  "Compression: The raw slice is compressed using a configurable lossless algorithm (default zlib/deflate) at a configurable level. The compressed size and compression ratio are recorded in the chunk metadata.",
);
numberedItem(
  2,
  "Encryption: If the pocket was opened with an encryptionKey, the compressed bytes are encrypted using AES-256-GCM. The encryption key may be derived from a high-entropy secret and a user identifier using a key-derivation function, binding the pocket's contents to a specific principal without storing the raw key.",
);
numberedItem(
  3,
  "The final (compressed, optionally encrypted) bytes are written atomically to chunks/<chunkId> on disk.",
);
body(
  "The entry record stored in the index contains the ordered list of chunk identifiers, the original uncompressed size, and " +
    "optional version metadata, enabling both exact retrieval and historical versioning.",
);

subSubSection("2.4 Read and Reassembly");
body("On read(entryPath), the engine:");
numberedItem(
  1,
  "Looks up the entry in the index to obtain the ordered chunk identifier list.",
);
numberedItem(
  2,
  "For each chunk identifier, checks the in-memory chunk data cache. On cache miss, reads the chunk file from disk.",
);
numberedItem(
  3,
  "If the pocket has an encryption key, applies AES-256-GCM decryption.",
);
numberedItem(4, "Decompresses the decrypted bytes.");
numberedItem(
  5,
  "Concatenates all decompressed chunk buffers in their original order, returning the complete original byte sequence.",
);

subSubSection("2.5 Reference-Counted Garbage Collection");
body(
  "On write operations that overwrite an existing entry, the engine constructs a reference-count map by iterating all current " +
    "entries and tallying chunk identifier occurrences. Chunks belonging to the previous version of the overwritten entry that " +
    "have a reference count of one (i.e., not referenced by any other entry) are deleted from disk. A periodic compaction pass " +
    "scans the chunks/ directory for files not referenced by any index entry and removes them, reclaiming storage for chunks " +
    "orphaned by external interruptions.",
);

subSection("3. Fabric Distributed Storage Service");
subSubSection("3.1 Storage Node Registry");
body(
  "The NodeRegistry persists storage node descriptors in a relational database table. Each descriptor includes: a unique node " +
    'identifier, a geographic region label, a cost tier classification (e.g., "standard", "archive", "hot"), a backend type ' +
    "string, a backend configuration JSON object, total capacity in bytes, current utilized bytes, a health boolean, and a " +
    "heartbeat timestamp.",
);
body(
  "Nodes report liveness and current utilization by calling heartbeat(nodeId, deltaBytesWritten), which atomically increments " +
    "usedBytes, sets healthy: true, and records the current wall-clock time. Nodes not reporting a heartbeat within a configurable " +
    "staleness window are considered unhealthy and excluded from placement.",
);

subSubSection("3.2 Placement Strategy");
body(
  "The PlacementStrategy.placeChunk(chunkId, sizeBytes, policy) method selects node identifiers for a chunk as follows:",
);
numberedItem(
  1,
  "Healthy filter: Retrieves all nodes satisfying healthy = true.",
);
numberedItem(
  2,
  "Region affinity filter: If policy.regionAffinity is specified, retains only nodes whose region field matches.",
);
numberedItem(
  3,
  "Cost tier filter: If policy.costTier is specified, retains only nodes whose costTier field matches.",
);
numberedItem(
  4,
  "Capacity filter: Retains only nodes where capacityBytes − usedBytes ≥ sizeBytes, ensuring the chunk will fit.",
);
numberedItem(
  5,
  "Utilization ranking: Sorts the remaining candidates by ascending utilization ratio usedBytes / capacityBytes, preferring the least-utilized nodes.",
);
numberedItem(
  6,
  "Replica selection: Takes the top policy.redundancy ?? 1 candidates from the ranked list.",
);
numberedItem(
  7,
  "Throws a placement error if the filtered candidate set is empty or smaller than the requested replica count.",
);

subSubSection("3.3 Chunk Store Abstraction");
body(
  "A ChunkStore interface defines four operations: putChunk(id, data), getChunk(id), hasChunk(id), and deleteChunk(id). " +
    "Two concrete implementations are provided:",
);
body(
  "PocketDimensionChunkStore: Instantiates a PocketDimension instance per storage node with deduplication enabled. Keys " +
    "chunks as chunks/<prefix2>/<chunkId> where prefix2 is the first two hex characters of the chunk identifier, providing " +
    "directory sharding.",
);
body(
  "ReplitChunkStore: Probes a local HTTP sidecar at http://127.0.0.1:1106/object-storage/default-bucket to verify " +
    "availability. On success, dynamically imports the @replit/object-storage SDK and constructs a Client using a bucket " +
    "identifier from environment variables. Maps chunk identifiers to object keys under fabric-chunks/<prefix2>/<chunkId>.",
);

subSubSection("3.4 Object Storage and Retrieval");
body("storeObject(pocketId, volumeId, name, contentType, data, policy):");
numberedItem(
  1,
  "Computes a SHA-256 content hash of the full object buffer for deduplication and integrity verification.",
);
numberedItem(
  2,
  "Splits the buffer into chunks of DEFAULT_CHUNK_SIZE (4 MiB) using the same windowed iteration described in §2.2.",
);
numberedItem(3, "For each chunk slice:");
letterItem("a", "Computes the chunk identifier as sha256(slice).");
letterItem(
  "b",
  "Calls placement.placeChunk(chunkId, slice.length, policy) to obtain nodeIds.",
);
letterItem(
  "c",
  "For each nodeId in the placement decision, acquires the node's ChunkStore via a factory, checks hasChunk, and calls putChunk if absent, then calls nodeRegistry.heartbeat(nodeId, slice.length).",
);
letterItem(
  "d",
  "Calls chunkIndex.putChunkLocation(chunkId, nodeIds, checksum) to record the placement.",
);
numberedItem(
  4,
  "Calls objectIndex.putObject(...) to record the object manifest.",
);
doc.moveDown(0.2);
body("retrieveObject(objectId):");
numberedItem(
  1,
  "Loads the object manifest from objectIndex.getObject(objectId), obtaining the ordered chunkIds array.",
);
numberedItem(
  2,
  "Batch-loads chunk locations for all chunk identifiers via chunkIndex.getManyChunkLocations(chunkIds).",
);
numberedItem(
  3,
  "For each chunk identifier in order: iterates nodeIds, attempts getChunk on each replica in sequence, appends bytes on first success, propagates error if all replicas fail.",
);
numberedItem(4, "Returns Buffer.concat(parts) and the object manifest.");

subSection("4. Background Replica Rebalancer");
body(
  "The Rebalancer runs as a background service with a configurable polling interval. On each cycle:",
);
numberedItem(
  1,
  "Calls placement.findRebalanceCandidates(HIGH_WATERMARK), which returns chunks resident on nodes whose utilization ratio exceeds the high-watermark threshold (e.g., 0.85).",
);
numberedItem(2, "For each candidate chunk:");
letterItem(
  "a",
  "Reads the chunk bytes from the current source node's ChunkStore.",
);
letterItem(
  "b",
  "Calls placement.placeChunk with the chunk's size to identify a lower-utilization target node.",
);
letterItem("c", "Writes the chunk bytes to the target node's ChunkStore.");
letterItem("d", "Updates chunkIndex to reflect the new node identifier.");
letterItem(
  "e",
  "Calls deleteChunk on the source node's ChunkStore to release capacity.",
);
letterItem(
  "f",
  "Calls nodeRegistry.heartbeat for both source and target nodes to update utilization.",
);
body(
  "The rebalancer operates entirely in the background without blocking application I/O, ensuring continuous load leveling " +
    "across the storage cluster.",
);

subSection("5. Hybrid Hot/Cold Tiered Storage Service");
body(
  "Initialization: At service startup, probes http://127.0.0.1:1106/object-storage/default-bucket with a HEAD request. " +
    "If the probe returns HTTP 2xx, the service initializes a @replit/object-storage Client and designates it as the hot tier. " +
    "Regardless of probe outcome, the service opens a PocketDimension instance with compressionLevel: 9, enableDeduplication: true, " +
    "enableVersioning: true, and a 32 MiB chunk size as the cold tier.",
);
body("Upload routing:");
bullet(
  "Objects with data.length >= 50 MiB are routed unconditionally to the cold tier.",
);
bullet(
  "Objects with an explicit forcePocketDimension flag are routed to the cold tier.",
);
bullet(
  "All other objects are attempted on the hot tier if available. On any hot-tier write error, the service falls back transparently to the cold tier and records a fallback event.",
);
body(
  "Download routing: Checks a tier-affinity metadata record to determine which tier holds the object and issues the corresponding read call.",
);

subSection("6. Redis-Compatible Key-Value Store");
subSubSection("6.1 In-Memory Data Model");
body(
  "Each RedisStore instance maintains an in-memory Map<string, RedisEntry> where RedisEntry carries: type (one of string, list, " +
    "hash, set, zset, or stream), value (the JavaScript representation of the stored value), ttl (optional expiry timestamp in " +
    "milliseconds), and accessedAt (last access timestamp for LRU eviction). System-managed keys prefixed with __ are excluded " +
    "from LRU eviction to protect checkpoint and pipeline state.",
);

subSubSection("6.2 Snapshot Persistence");
body(
  "RedisStore.load() opens a PocketDimension pocket keyed by the instance identifier under a ./redis-dimensions/ storage path " +
    "with compressionLevel: 1 for low-latency snapshot restoration. The snapshot key __snapshot__ stores a serialized " +
    "representation of the Map contents. After load, sorted-set indexes are reconstructed from the deserialized entries. " +
    "Periodic or on-demand snapshots serialize the current Map state back to the same key.",
);

subSubSection("6.3 Redis Command Execution");
body(
  "The store implements the Redis Serialization Protocol (RESP) command set including: GET, SET, DEL, EXPIRE, TTL, KEYS, " +
    "HGET, HSET, HDEL, HGETALL, LPUSH, RPUSH, LPOP, RPOP, LRANGE, SADD, SREM, SMEMBERS, ZADD, ZRANGE, ZRANGEBYSCORE, ZCARD, " +
    "ZREM, ZSCORE, XADD, XREAD, XLEN, EVAL, EVALSHA, and additional administrative commands. HTTP routes expose these commands " +
    "via a JSON-body POST endpoint authenticated by a per-instance bearer token validated against the database record.",
);

subSubSection("6.4 WebAssembly Lua Scripting Engine");
body(
  "EVAL script numkeys [key ...] [arg ...] and EVALSHA sha1 numkeys ... commands invoke the Lua execution subsystem.",
);
body(
  "Script caching: Scripts submitted via EVAL are cached by their SHA-1 digest in a scriptCache map, enabling subsequent " +
    "EVALSHA calls to reuse compiled scripts without re-parsing.",
);
body(
  "Execution routing: The runLua(script, keys, argv) method applies a static regexp to the script text. Scripts not " +
    "referencing redis.call are dispatched to the LuaWorkerPool — a thread pool of WebAssembly Lua virtual machines (default " +
    "2 threads, configurable via LUA_WORKER_THREADS) implemented using the wasmoon library running inside Node.js worker_threads. " +
    "Scripts referencing redis.call execute in the main thread via a freshly instantiated wasmoon Lua factory engine, with " +
    "redis, cjson, cmsgpack, struct, and arithmetic helpers injected as Lua globals.",
);
body(
  "Concurrency control: A semaphore with capacity LUA_MAX_CONCURRENCY = 8 limits the number of simultaneously active Lua " +
    "engine instantiations, preventing runaway memory growth from concurrent script evaluations.",
);
body("Type conversion:");
bullet(
  "redisReplyToLua(value): maps Redis nil to Lua false (not null, which would crash the WebAssembly VM), maps Redis integers to Lua numbers, maps Redis bulk strings to Lua strings, maps Redis arrays to Lua 1-indexed tables.",
);
bullet(
  "luaToRedis(value): maps Lua false to Redis nil, maps Lua numbers to Redis integers, maps Lua tables to Redis arrays, maps Lua strings to Redis bulk strings.",
);
bullet(
  'luaTableToJs(table): handles wasmoon\'s proxy layer where Lua table key "0" corresponds to Lua index 1, correctly translating 1-based Lua arrays to 0-based JavaScript arrays.',
);
bullet(
  "Binary safety: raw bytes are encoded as hex strings for transit through the Lua VM boundary and decoded back to Buffer objects on the JavaScript side.",
);

subSection("7. Checkpoint-Resumable Streaming Pipeline");
body(
  "The AutoPushService implements a durable, crash-safe streaming pipeline that transfers a corpus of TOTAL_CHUNKS = 114,688 " +
    "chunk metadata records from an agent key-value store to a training key-value store.",
);
body("Startup and offset recovery:");
numberedItem(
  1,
  "Reads GET __autopush:progress from the agent store. If present, uses it as the current chunk offset.",
);
numberedItem(
  2,
  "If absent, queries ZCARD received:chunks on the training store. If the cardinality equals TOTAL_CHUNKS, the transfer is complete; writes SET __autopush:progress TOTAL_CHUNKS and exits.",
);
numberedItem(
  3,
  "If the cardinality is a partial count N, sets the chunk offset to N (inferred resumption), writes the checkpoint, and begins from offset N.",
);
body(
  "Tick loop — every TICK_MS = 50 milliseconds, the service processes a batch of BATCH_SIZE = 500 chunks:",
);
numberedItem(
  1,
  "For each chunk index i in [chunkIndex, chunkIndex + BATCH_SIZE): computes offset = i × CHUNK_SIZE_BYTES and size = min(CHUNK_SIZE_BYTES, TOTAL_DATASET_BYTES − offset); appends XADD push:stream event; appends ZADD received:chunks; appends XADD received:stream.",
);
numberedItem(2, "Advances chunkIndex by the batch size.");
numberedItem(3, "Writes the checkpoint: SET __autopush:progress <chunkIndex>.");
numberedItem(
  4,
  "If chunkIndex >= TOTAL_CHUNKS, clears the tick interval and marks the service complete.",
);
body(
  "This design tolerates process restarts at any point: on restart the offset is recovered either from the checkpoint key or " +
    "inferred from the downstream sorted set's cardinality, guaranteeing at-least-once delivery.",
);

// ─────────────────────────────────────────────────────────────────────────────
// CLAIMS PAGE
// ─────────────────────────────────────────────────────────────────────────────
doc.addPage();
doc.rect(0, 0, PAGE_WIDTH, 8).fill(C.accent);
doc.moveDown(0.5);

sectionTitle("Claims");

subSection("Independent Claims");

claimText(
  "1",
  "A computer-implemented storage system comprising: a pocket manager configured to map logical container identifiers to " +
    "isolated storage directories, each directory comprising a chunk subdirectory, an entry index, and pocket metadata; a " +
    "chunking module configured to split an input byte sequence into a plurality of fixed-size segments based on a configurable " +
    "chunk-size parameter; a content-addressing module configured to assign each segment a unique identifier by computing a " +
    "cryptographic hash of the segment's bytes; a compression module configured to apply lossless compression to each segment " +
    "prior to persistence; a chunk store configured to persist compressed segments to the chunk subdirectory under filenames " +
    "corresponding to their content-address identifiers; and a reassembly module configured to retrieve an ordered list of " +
    "chunk identifiers from the entry index for a given logical path, load each chunk from the chunk store, decompress each " +
    "chunk, and concatenate the decompressed chunks to reconstruct the original byte sequence.",
);

claimText(
  "2",
  "A computer-implemented distributed storage system comprising: a node registry configured to persist, for each storage " +
    "node, a region label, a cost tier classification, a total capacity value, a current utilization value, and a health " +
    "status; a placement strategy module configured to, for a given chunk, filter the set of registered storage nodes by " +
    "health status, region affinity, cost tier classification, and available capacity, rank the filtered nodes by ascending " +
    "utilization ratio, and select a configurable number of nodes as replica destinations; a chunk index configured to persist, " +
    "for each chunk identifier, the selected node identifiers and a checksum; an object index configured to persist, for each " +
    "object identifier, an ordered sequence of chunk identifiers; a write path configured to split an object into chunks, invoke " +
    "the placement strategy module for each chunk, write each chunk to the selected nodes' respective chunk stores, and record " +
    "placements in the chunk and object indexes; and a read path configured to load an object's ordered chunk identifier sequence, " +
    "retrieve each chunk from its recorded replica nodes with failover to subsequent replicas on read error, and concatenate the " +
    "retrieved chunks to reconstruct the object.",
);

claimText(
  "3",
  "A computer-implemented key-value store with a scripting engine, comprising: an in-memory key-value map storing entries " +
    "with associated type metadata, expiry timestamps, and access timestamps; a snapshot persistence module configured to " +
    "serialize and deserialize the key-value map to and from a compressed, content-addressed chunk store; a script cache " +
    "configured to store Lua scripts indexed by their SHA-1 digest; a Lua execution router configured to inspect a Lua script " +
    "for references to a Redis call function and, when no such reference is detected, dispatch the script to a thread pool of " +
    "WebAssembly Lua virtual machines, and when such a reference is detected, execute the script on a main execution thread; " +
    "a concurrency limiter configured to restrict the number of simultaneously active Lua virtual machine instantiations; and " +
    "a type conversion layer configured to translate between Lua values and Redis reply types, mapping Redis nil to the Lua " +
    "boolean false, mapping Lua 1-indexed tables to Redis arrays, and encoding binary data as hexadecimal strings for transit " +
    "through the Lua execution boundary.",
);

claimText(
  "4",
  "A computer-implemented tiered storage service comprising: an initialization module configured to probe, at service " +
    "startup, a local HTTP endpoint for the availability of a first-tier object storage service, and to unconditionally " +
    "provision a second-tier content-addressed pocket storage instance; a routing module configured to route write requests " +
    "to the first-tier service when the first tier is available and the object size is below a configurable threshold, and " +
    "to route write requests to the second-tier service when the first tier is unavailable, the object size meets or exceeds " +
    "the threshold, or an explicit override flag is set; and a fallback module configured to transparently reroute a write " +
    "request from the first-tier service to the second-tier service upon any first-tier write failure, without exposing the " +
    "failure to the caller.",
);

claimText(
  "5",
  "A computer-implemented checkpoint-resumable streaming pipeline comprising: a checkpoint module configured to, at pipeline " +
    "startup, read an offset value from a durable key-value store under a designated checkpoint key, and when the checkpoint " +
    "key is absent, query a downstream sorted set for its cardinality and use the cardinality as the inferred offset; a batch " +
    "emission module configured to, at a configurable tick interval, produce a fixed-size batch of stream events starting at " +
    "the current offset, append each event to at least one stream data structure and one sorted-set index in the downstream " +
    "store, advance the offset by the batch size, and write the updated offset to the checkpoint key; and a completion detector " +
    "configured to halt the pipeline when the offset meets or exceeds a predetermined total event count.",
);

subSection("Dependent Claims");

claimText(
  "6",
  "The system of Claim 1, further comprising a per-pocket encryption module configured to apply AES-256-GCM authenticated " +
    "encryption to each compressed segment using an encryption key bound to the logical container identifier, wherein the " +
    "encryption key is stored separately from the compressed segment data.",
);
claimText(
  "7",
  "The system of Claim 1, further comprising a reference-counting garbage collector configured to, upon overwriting an " +
    "existing entry, construct a reference-count map by tallying chunk identifier occurrences across all current entries, " +
    "and delete from the chunk store any chunk whose reference count would fall to zero.",
);
claimText(
  "8",
  "The system of Claim 1, further comprising a compaction module configured to scan the chunk subdirectory for files not " +
    "referenced by any entry in the entry index and delete the unreferenced files.",
);
claimText(
  "9",
  "The system of Claim 2, further comprising a background rebalancer configured to periodically identify storage nodes " +
    "whose utilization ratio exceeds a high-watermark threshold, read chunk data from those nodes, write the chunk data to " +
    "lower-utilization nodes identified by the placement strategy module, update the chunk index to record the new node " +
    "identifiers, and delete the chunk data from the source nodes.",
);
claimText(
  "10",
  "The system of Claim 2, wherein the chunk store abstraction is implemented by at least one of: a pocket-dimension chunk " +
    "store that persists chunks to an isolated pocket-dimension instance with per-directory sharding by chunk identifier " +
    "prefix; or a sidecar-backed object storage chunk store that maps chunk identifiers to object keys under a hierarchical " +
    "namespace and communicates with a local sidecar HTTP service.",
);
claimText(
  "11",
  "The system of Claim 3, wherein the thread pool of WebAssembly Lua virtual machines is implemented using operating-system " +
    "worker threads, each thread hosting a single stateful Lua virtual machine instance capable of executing Lua scripts with " +
    "injected global helpers including JSON serialization, MessagePack serialization, and arithmetic conversion utilities.",
);
claimText(
  "12",
  "The system of Claim 3, wherein the snapshot persistence module is backed by the system of Claim 1, and wherein the " +
    "key-value map is serialized using a binary encoding format before being written as a chunk sequence under a designated " +
    "snapshot entry path.",
);
claimText(
  "13",
  "The system of Claim 4, wherein the second-tier content-addressed pocket storage instance is opened with a compression " +
    "level of 9 and deduplication and versioning enabled, and wherein the size threshold below which write requests are " +
    "routed to the first tier is 50 mebibytes.",
);
claimText(
  "14",
  "The system of Claim 5, wherein the sorted set is indexed by byte offset values such that the cardinality of the sorted " +
    "set equals the number of successfully transmitted events, enabling deterministic offset inference in the absence of the " +
    "checkpoint key.",
);
claimText(
  "15",
  "The system of Claim 5, wherein stream events are appended to a capped stream data structure with a configurable maximum " +
    "length, ensuring bounded memory consumption in the downstream key-value store regardless of pipeline throughput.",
);

// ─────────────────────────────────────────────────────────────────────────────
// ABSTRACT PAGE
// ─────────────────────────────────────────────────────────────────────────────
doc.addPage();
doc.rect(0, 0, PAGE_WIDTH, 8).fill(C.accent);
doc.moveDown(0.5);

sectionTitle("Abstract");
body(
  "A hierarchical distributed storage system is disclosed comprising: a pocket-dimension engine that partitions data into " +
    "isolated, encrypted, content-addressed logical containers using AES-256-GCM per-pocket encryption, lossless compression, " +
    "reference-counted garbage collection, and configurable chunk sizes; a fabric storage service that distributes chunk replicas " +
    "across heterogeneous storage nodes using a policy-driven placement strategy filtering by region affinity, cost tier, and " +
    "available capacity with replica failover on read; a background rebalancer that migrates chunks away from overloaded nodes; " +
    "a hybrid hot/cold tiering service that routes objects to a sidecar-backed object store or a high-compression pocket-dimension " +
    "instance based on size threshold and availability; a Redis-compatible key-value store with snapshot persistence and pooled " +
    "WebAssembly Lua scripting that dispatches scripts free of redis.call to a worker-thread Lua pool while executing " +
    "inter-dependent scripts on the main thread with full bidirectional type conversion; and a checkpoint-resumable streaming " +
    "pipeline that recovers its transmission offset from a durable checkpoint key or from downstream sorted-set cardinality " +
    "on restart, guaranteeing at-least-once delivery of batched stream events.",
);

// ─────────────────────────────────────────────────────────────────────────────
// SIGNATURE/DECLARATION PAGE
// ─────────────────────────────────────────────────────────────────────────────
doc.addPage();
doc.rect(0, 0, PAGE_WIDTH, 8).fill(C.accent);
doc.moveDown(0.5);

sectionTitle("Declaration and Signature");

body(
  "The undersigned, being the inventor(s) or authorized representative of the assignee B-Lawz Music LLC, hereby declares " +
    "that all statements made herein of their own knowledge are true and that all statements made on information and belief are " +
    "believed to be true; and further that these statements were made with the knowledge that willful false statements and the " +
    "like so made are punishable by fine or imprisonment, or both, under Section 1001 of Title 18 of the United States Code, " +
    "and that such willful false statements may jeopardize the validity of the application or any patent issuing thereon.",
);

doc.moveDown(1.5);

const sigY = doc.y;
drawHR(sigY, C.black, 0.75);
doc
  .font(FONTS.regular)
  .fontSize(10)
  .fillColor(C.black)
  .text("Inventor Signature", 90, sigY + 8);
doc
  .font(FONTS.regular)
  .fontSize(10)
  .fillColor(C.black)
  .text("Date: ____________________", 350, sigY + 8);

doc.moveDown(3);
drawHR(doc.y, C.black, 0.75);
doc
  .font(FONTS.regular)
  .fontSize(10)
  .fillColor(C.black)
  .text("Printed Name of Inventor", 90, doc.y + 8);

doc.moveDown(3);
drawHR(doc.y, C.black, 0.75);
doc
  .font(FONTS.regular)
  .fontSize(10)
  .fillColor(C.black)
  .text(
    "Title / Role (if signing on behalf of B-Lawz Music LLC)",
    90,
    doc.y + 8,
  );

doc.moveDown(3);

doc
  .font(FONTS.bold)
  .fontSize(10)
  .fillColor(C.accent)
  .text("Assignee:", { continued: true });
doc
  .font(FONTS.regular)
  .fontSize(10)
  .fillColor(C.black)
  .text("  B-Lawz Music LLC");
doc.moveDown(1);

doc
  .font(FONTS.regular)
  .fontSize(9)
  .fillColor(C.lightGray)
  .text(
    "This application was prepared for informational purposes only. Filing with the USPTO requires a registered patent attorney or agent.",
    { align: "center" },
  );

// Footer page numbers
addPageNumber();

doc.end();

out.on("finish", () => {
  console.log(`PDF generated: ${OUTPUT_PATH}`);
});
