---
name: Storage tracking + key safety
description: Rules for /api/storage upload/download/delete routes — tracking rows, wildcard key normalization, soft-delete enforcement
---
- Rule 1: every path that uploads an object (single-shot /upload AND chunked /upload/chunk in server/routes/storage.ts) must insert a user_storage_files row (creating user_storage on demand); on tracking failure, delete the object and fail the request. **Why:** untracked objects are invisible to quota and can never be deleted — the "deleted file still served" integration failure was really "upload never tracked".
- Rule 2: Express 5 already percent-decodes params. Wildcard `*key` params are ARRAYS — join with "/" but NEVER decodeURIComponent again: double-decoding lets %252e%252e become ".." after ownership checks (authenticated cross-user read). Reject keys containing "..", NUL, backslash, or leading "/" before any auth/storage op (normalizeStorageKey in storage.ts; inline guard in routes.ts /api/storage/file/*key).
- Rule 3: soft-deleted files (user_storage_files.deletedAt set) must 404 on BOTH GET routes (public one in server/routes.ts and authed one in server/routes/storage.ts) and the audio cache must be invalidated on delete.
**How to apply:** any new storage route handling *key wildcards or uploads must follow all three rules; regression tests belong in tests/file-management.test.ts.
