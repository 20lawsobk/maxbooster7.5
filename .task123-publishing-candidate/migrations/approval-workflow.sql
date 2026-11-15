-- Approval Workflow Migration
-- Only add new enums, tables, and columns for approval system

-- Create new enums if they don't exist
DO $$ BEGIN
  CREATE TYPE approval_status AS ENUM('draft', 'pending_review', 'approved', 'rejected', 'published');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM('content_creator', 'reviewer', 'manager', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add social_role to users table if not exists
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN social_role user_role DEFAULT 'content_creator';
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Add approval columns to posts table if not exists
DO $$ BEGIN
  ALTER TABLE posts ADD COLUMN approval_status approval_status DEFAULT 'draft';
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE posts ADD COLUMN submitted_by varchar(255);
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE posts ADD COLUMN reviewed_by varchar(255);
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE posts ADD COLUMN reviewed_at timestamp;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE posts ADD COLUMN rejection_reason text;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Create approval_history table if not exists
CREATE TABLE IF NOT EXISTS approval_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id varchar(255) NOT NULL,
  action varchar(50) NOT NULL,
  from_status approval_status,
  to_status approval_status NOT NULL,
  comment text,
  metadata jsonb,
  created_at timestamp DEFAULT now() NOT NULL
);

-- Create indexes for approval_history if not exists
CREATE INDEX IF NOT EXISTS approval_history_post_id_idx ON approval_history (post_id);
CREATE INDEX IF NOT EXISTS approval_history_user_id_idx ON approval_history (user_id);
CREATE INDEX IF NOT EXISTS approval_history_action_idx ON approval_history (action);
CREATE INDEX IF NOT EXISTS approval_history_created_at_idx ON approval_history (created_at);
CREATE INDEX IF NOT EXISTS approval_history_post_id_created_at_idx ON approval_history (post_id, created_at);

-- Create indexes for posts approval columns if not exists
CREATE INDEX IF NOT EXISTS posts_approval_status_idx ON posts (approval_status);
CREATE INDEX IF NOT EXISTS posts_reviewed_by_idx ON posts (reviewed_by);
CREATE INDEX IF NOT EXISTS posts_submitted_by_idx ON posts (submitted_by);
