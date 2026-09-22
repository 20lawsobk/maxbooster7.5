-- Apply only to the external PDIM metadata database after operator review.
CREATE TABLE IF NOT EXISTS fabric_deletion_objects (
  id text PRIMARY KEY,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fabric_deletion_chunks (
  object_id text NOT NULL REFERENCES fabric_deletion_objects(id),
  ordinal integer NOT NULL,
  chunk_id text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','released','complete')),
  location jsonb,
  done_nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY(object_id,ordinal)
);
CREATE INDEX IF NOT EXISTS fabric_deletion_chunks_pending_idx
  ON fabric_deletion_chunks(chunk_id) WHERE state <> 'complete';