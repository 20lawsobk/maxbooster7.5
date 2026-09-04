---
name: Multer storage-engine shape mismatch
description: A multer instance's storage engine determines whether a file arrives as an in-memory buffer or a disk path; a shared downstream helper must handle both.
---

Rule: multer can be configured with memoryStorage (populates file.buffer, leaves file.path undefined) or diskStorage (populates file.path, leaves file.buffer undefined) per instance. A codebase can have multiple multer instances for different size/OOM tradeoffs — e.g. a small-file memory instance and a large-file disk instance to avoid OOM on big uploads. Any shared helper that processes "the uploaded file" and only reads file.buffer will crash or silently no-op for every route wired to a disk-storage instance, and the real bytes are left orphaned on local disk forever — never reaching real storage, never cleaned up.

**Why:** found this exact bug in this app — a shared upload-processing helper unconditionally required file.buffer, but the disk-storage multer instance (used specifically for large uploads to avoid OOM) only ever populates file.path.

**How to apply:** whenever you touch or add a shared "process this upload" helper, grep every multer instance in the codebase, confirm which storage engine each one uses, and make sure the helper branches on file.buffer vs file.path (reading the disk path into a buffer, or streaming it) rather than assuming one shape. Always delete the disk scratch copy in a finally block after use, on both success and failure.
