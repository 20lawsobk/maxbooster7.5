-- Drain old whole-index writers before deploying this change. The source PDIM
-- index is retained intact; the application imports it once transactionally.
CREATE TABLE IF NOT EXISTS hybrid_storage_files (
  key text PRIMARY KEY,
  user_id text NOT NULL,
  blob_key text NOT NULL,
  state text NOT NULL CHECK (state IN ('uploading','active','deleting')),
  metadata jsonb NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hybrid_storage_files_user_idx ON hybrid_storage_files(user_id,state);
CREATE INDEX IF NOT EXISTS hybrid_storage_files_blob_idx ON hybrid_storage_files(blob_key);
CREATE INDEX IF NOT EXISTS hybrid_storage_files_hash_idx ON hybrid_storage_files((metadata->>'contentHash'));
CREATE TABLE IF NOT EXISTS hybrid_storage_imports (
  source text PRIMARY KEY,
  imported_count integer NOT NULL,
  imported_at timestamp with time zone NOT NULL DEFAULT now()
);
