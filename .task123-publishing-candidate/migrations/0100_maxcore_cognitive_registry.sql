CREATE TABLE "maxcore_cognitive_entities" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
  "owner_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "entity_type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "search_text" text DEFAULT '' NOT NULL,
  "schema_version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "maxcore_cognitive_entity_type_check"
    CHECK ("entity_type" IN ('project','goal','task','agent','department','memory','tool','workflow','document','knowledge_node','event')),
  CONSTRAINT "maxcore_cognitive_schema_version_check"
    CHECK ("schema_version" > 0),
  CONSTRAINT "maxcore_cognitive_owner_id_id_unique"
    UNIQUE ("owner_id", "id")
);

CREATE INDEX "maxcore_cognitive_owner_type_updated_idx"
  ON "maxcore_cognitive_entities" ("owner_id", "entity_type", "updated_at");

CREATE INDEX "maxcore_cognitive_search_idx"
  ON "maxcore_cognitive_entities" USING gin (to_tsvector('simple', "search_text"));

CREATE TABLE "maxcore_cognitive_relationships" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
  "owner_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "source_id" varchar NOT NULL,
  "target_id" varchar NOT NULL,
  "relation_type" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "maxcore_cognitive_relationship_source_owner_fk"
    FOREIGN KEY ("owner_id", "source_id")
    REFERENCES "maxcore_cognitive_entities" ("owner_id", "id") ON DELETE CASCADE,
  CONSTRAINT "maxcore_cognitive_relationship_target_owner_fk"
    FOREIGN KEY ("owner_id", "target_id")
    REFERENCES "maxcore_cognitive_entities" ("owner_id", "id") ON DELETE CASCADE,
  CONSTRAINT "maxcore_cognitive_relationship_type_check"
    CHECK ("relation_type" IN ('depends_on','created_by','assigned_to','related_to','improves','blocks','supports','owns','contains')),
  CONSTRAINT "maxcore_cognitive_relationship_no_self_edge"
    CHECK ("source_id" <> "target_id"),
  CONSTRAINT "maxcore_cognitive_relationship_unique_edge"
    UNIQUE ("owner_id", "source_id", "target_id", "relation_type")
);

CREATE INDEX "maxcore_cognitive_relationship_source_idx"
  ON "maxcore_cognitive_relationships" ("owner_id", "source_id", "relation_type");

CREATE INDEX "maxcore_cognitive_relationship_target_idx"
  ON "maxcore_cognitive_relationships" ("owner_id", "target_id", "relation_type");
