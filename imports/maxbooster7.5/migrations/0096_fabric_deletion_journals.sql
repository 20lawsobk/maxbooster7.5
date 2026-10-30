BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('fabric-chunk:root-catalog',0));
CREATE TABLE IF NOT EXISTS fabric_deletion_objects (
  object_id text PRIMARY KEY, object_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fabric_deletion_chunks (
  object_id text NOT NULL, ordinal integer NOT NULL, chunk_id text NOT NULL,
  state text NOT NULL DEFAULT 'pending', location jsonb,
  done_nodes jsonb NOT NULL DEFAULT '[]'::jsonb, PRIMARY KEY (object_id,ordinal)
);
CREATE INDEX IF NOT EXISTS fabric_deletion_chunks_chunk_idx ON fabric_deletion_chunks(chunk_id);
ALTER TABLE fabric_chunks ADD COLUMN IF NOT EXISTS ref_count integer NOT NULL DEFAULT 1;
ALTER TABLE fabric_chunks ADD COLUMN IF NOT EXISTS physical_keys jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE fabric_objects ADD COLUMN IF NOT EXISTS dependencies_indexed boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS fabric_catalog_fence (
  id text PRIMARY KEY, generation bigint NOT NULL DEFAULT 0
);
INSERT INTO fabric_catalog_fence(id,generation) VALUES('root-catalog',0) ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS fabric_object_dependencies (
  object_id varchar PRIMARY KEY REFERENCES fabric_objects(id) ON DELETE CASCADE,
  base_object_id varchar NOT NULL REFERENCES fabric_objects(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS fabric_object_dependencies_base_idx ON fabric_object_dependencies(base_object_id);
-- Count every occurrence, including repeated content within one object and
-- references claimed by an interrupted delete which have not yet been released.
UPDATE fabric_chunks AS c SET ref_count=(
  SELECT count(*)::integer FROM (
    SELECT jsonb_array_elements_text(chunk_ids) AS chunk_id FROM fabric_objects
    UNION ALL SELECT chunk_id FROM fabric_deletion_chunks WHERE state='pending'
  ) AS live_refs WHERE live_refs.chunk_id=c.id
);
COMMIT;
