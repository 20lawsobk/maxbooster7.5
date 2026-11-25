-- Migration 0016: Critical missing indexes for 90M-user scale
-- Every table below had only a PK index — these additions prevent full-table
-- scans on the hottest query paths.  All indexes use IF NOT EXISTS so the
-- migration is idempotent and safe to re-run.

-- ─────────────────────────────────────────────────────────────────
-- TRACKS  (DAW tracks within a studio project — queried by project)
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS tracks_project_id_idx
  ON tracks (project_id);

CREATE INDEX IF NOT EXISTS tracks_project_id_created_at_idx
  ON tracks (project_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────
-- SOCIAL_ACCOUNTS  (connected OAuth platforms — queried by user + platform)
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS social_accounts_user_id_idx
  ON social_accounts (user_id);

CREATE INDEX IF NOT EXISTS social_accounts_platform_user_id_idx
  ON social_accounts (platform, user_id);

CREATE INDEX IF NOT EXISTS social_accounts_user_id_is_active_idx
  ON social_accounts (user_id, is_active);

-- ─────────────────────────────────────────────────────────────────
-- SOCIAL_METRICS  (analytics data — queried by campaign + time range)
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS social_metrics_campaign_id_idx
  ON social_metrics (campaign_id);

CREATE INDEX IF NOT EXISTS social_metrics_campaign_id_metric_at_idx
  ON social_metrics (campaign_id, metric_at DESC);

CREATE INDEX IF NOT EXISTS social_metrics_variant_id_idx
  ON social_metrics (variant_id);

-- ─────────────────────────────────────────────────────────────────
-- AUDIT_LOGS  (security/compliance queries — queried by user + time)
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx
  ON audit_logs (user_id);

CREATE INDEX IF NOT EXISTS audit_logs_user_id_created_at_idx
  ON audit_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_action_idx
  ON audit_logs (action);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON audit_logs (created_at DESC);

-- ─────────────────────────────────────────────────────────────────
-- EARNINGS  (financial queries — queried by user + time + platform)
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS earnings_user_id_idx
  ON earnings (user_id);

CREATE INDEX IF NOT EXISTS earnings_user_id_created_at_idx
  ON earnings (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS earnings_user_id_platform_idx
  ON earnings (user_id, platform);

CREATE INDEX IF NOT EXISTS earnings_release_id_idx
  ON earnings (release_id);

-- ─────────────────────────────────────────────────────────────────
-- LYRICS  (queried by project)
-- ─────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS lyrics_project_id_idx
  ON lyrics (project_id);

-- ─────────────────────────────────────────────────────────────────
-- ASSETS  (studio assets — queried by project + owner)
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS assets_project_id_idx
  ON assets (project_id);

CREATE INDEX IF NOT EXISTS assets_owner_id_idx
  ON assets (owner_id);

CREATE INDEX IF NOT EXISTS assets_owner_id_created_at_idx
  ON assets (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS assets_kind_idx
  ON assets (kind);

-- ─────────────────────────────────────────────────────────────────
-- CLIPS  (DAW clips — queried by track)
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS clips_track_id_idx
  ON clips (track_id);

CREATE INDEX IF NOT EXISTS clips_asset_id_idx
  ON clips (asset_id);

-- ─────────────────────────────────────────────────────────────────
-- COLLABORATORS  (release/track collaborators — queried by user + release)
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS collaborators_user_id_idx
  ON collaborators (user_id);

CREATE INDEX IF NOT EXISTS collaborators_release_id_idx
  ON collaborators (release_id);

CREATE INDEX IF NOT EXISTS collaborators_track_id_idx
  ON collaborators (track_id);

CREATE INDEX IF NOT EXISTS collaborators_email_idx
  ON collaborators (email);

-- ─────────────────────────────────────────────────────────────────
-- DISTRO_RELEASES  (distribution — queried by artist)
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS distro_releases_artist_id_idx
  ON distro_releases (artist_id);

CREATE INDEX IF NOT EXISTS distro_releases_artist_id_created_at_idx
  ON distro_releases (artist_id, created_at DESC);

CREATE INDEX IF NOT EXISTS distro_releases_release_date_idx
  ON distro_releases (release_date DESC);

-- ─────────────────────────────────────────────────────────────────
-- DISTRO_TRACKS  (distribution tracks — queried by release)
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS distro_tracks_release_id_idx
  ON distro_tracks (release_id);

CREATE INDEX IF NOT EXISTS distro_tracks_release_id_track_number_idx
  ON distro_tracks (release_id, track_number);

-- ─────────────────────────────────────────────────────────────────
-- ROYALTY_SPLITS  (royalty management — queried by listing + recipient)
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS royalty_splits_listing_id_idx
  ON royalty_splits (listing_id);

CREATE INDEX IF NOT EXISTS royalty_splits_recipient_id_idx
  ON royalty_splits (recipient_id);

-- ─────────────────────────────────────────────────────────────────
-- WEBHOOK_EVENTS  (webhook processor — queried by processed + time)
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS webhook_events_processed_created_at_idx
  ON webhook_events (processed, created_at DESC);

CREATE INDEX IF NOT EXISTS webhook_events_event_type_idx
  ON webhook_events (event_type);

CREATE INDEX IF NOT EXISTS webhook_events_provider_idx
  ON webhook_events (provider);

-- ─────────────────────────────────────────────────────────────────
-- NOTIFICATIONS  (missing compound index — unread query is a hot path)
-- existing: (user_id), (read), (created_at) — missing the covering compound
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS notifications_user_id_read_created_at_idx
  ON notifications (user_id, read, created_at DESC);
