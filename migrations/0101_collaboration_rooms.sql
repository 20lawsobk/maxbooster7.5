CREATE TABLE "collaboration_rooms" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
  "project_id" varchar NOT NULL UNIQUE,
  "state" text DEFAULT 'active' NOT NULL,
  "media_state" text DEFAULT 'unavailable' NOT NULL,
  "media_region" varchar,
  "participant_limit" integer,
  "created_by" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "ended_at" timestamp,
  CONSTRAINT "collaboration_rooms_state_check"
    CHECK ("state" IN ('active', 'closed')),
  CONSTRAINT "collaboration_rooms_media_state_check"
    CHECK ("media_state" IN ('unavailable', 'available', 'degraded')),
  CONSTRAINT "collaboration_rooms_participant_limit_check"
    CHECK ("participant_limit" IS NULL OR "participant_limit" > 0)
);

CREATE TABLE "collaboration_room_messages" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
  "room_id" varchar NOT NULL REFERENCES "collaboration_rooms"("id") ON DELETE CASCADE,
  "sender_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "client_message_id" varchar(36) NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "collaboration_room_messages_idempotency_unique"
    UNIQUE ("room_id", "sender_id", "client_message_id"),
  CONSTRAINT "collaboration_room_messages_content_check"
    CHECK (length(btrim("content")) BETWEEN 1 AND 4000)
);

CREATE INDEX "collaboration_room_messages_room_created_idx"
  ON "collaboration_room_messages" ("room_id", "created_at");
