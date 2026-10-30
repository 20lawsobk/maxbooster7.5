-- Create system_logs table for structured logging storage
CREATE TABLE IF NOT EXISTS "system_logs" (
  "id" SERIAL PRIMARY KEY,
  "level" VARCHAR(10) NOT NULL,
  "service" VARCHAR(50) NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "timestamp" TIMESTAMP DEFAULT NOW() NOT NULL,
  "user_id" VARCHAR,
  "request_id" VARCHAR
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS "idx_system_logs_timestamp" ON "system_logs" ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS "idx_system_logs_level" ON "system_logs" ("level");
CREATE INDEX IF NOT EXISTS "idx_system_logs_service" ON "system_logs" ("service");
CREATE INDEX IF NOT EXISTS "idx_system_logs_level_service" ON "system_logs" ("level", "service");
CREATE INDEX IF NOT EXISTS "idx_system_logs_user_id" ON "system_logs" ("user_id");
