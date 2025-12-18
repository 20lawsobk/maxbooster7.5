import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, real, date, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// USERS
// ============================================================================
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  username: text("username").unique(),
  password: text("password").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  role: text("role").default("user"),
  subscriptionTier: text("subscription_tier"),
  subscriptionStatus: text("subscription_status"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeConnectedAccountId: text("stripe_connected_account_id"),
  subscriptionEndsAt: timestamp("subscription_ends_at"),
  trialEndsAt: timestamp("trial_ends_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  password: true,
  firstName: true,
  lastName: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ============================================================================
// ANALYTICS
// ============================================================================
export const analytics = pgTable("analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  date: timestamp("date").notNull().defaultNow(),
  streams: integer("streams").default(0),
  revenue: real("revenue").default(0),
  totalListeners: integer("total_listeners").default(0),
  followers: integer("followers").default(0),
  platform: text("platform"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAnalyticsSchema = createInsertSchema(analytics).omit({ id: true, createdAt: true });
export type InsertAnalytics = z.infer<typeof insertAnalyticsSchema>;

// ============================================================================
// SUBSCRIPTIONS
// ============================================================================
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  plan: text("plan").notNull(),
  status: text("status").notNull(),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  canceledAt: timestamp("canceled_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true });
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;

// ============================================================================
// PROJECTS
// ============================================================================
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  genre: text("genre"),
  bpm: integer("bpm"),
  key: text("key"),
  status: text("status").default("draft"),
  isStudioProject: boolean("is_studio_project").default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;

// ============================================================================
// RELEASES (Distribution)
// ============================================================================
export const releases = pgTable("releases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  artistId: varchar("artist_id"),
  title: text("title").notNull(),
  releaseDate: timestamp("release_date"),
  status: text("status").default("draft"),
  upc: text("upc"),
  artworkUrl: text("artwork_url"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertReleaseSchema = createInsertSchema(releases).omit({ id: true, createdAt: true });
export type InsertRelease = z.infer<typeof insertReleaseSchema>;

// ============================================================================
// CAMPAIGNS (Advertising)
// ============================================================================
export const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  platform: text("platform"),
  status: text("status").default("draft"),
  budget: real("budget"),
  spent: real("spent").default(0),
  impressions: integer("impressions").default(0),
  clicks: integer("clicks").default(0),
  conversions: integer("conversions").default(0),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCampaignSchema = createInsertSchema(campaigns).omit({ id: true, createdAt: true });
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;

// ============================================================================
// SOCIAL CAMPAIGNS
// ============================================================================
export const socialCampaigns = pgTable("social_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  platform: text("platform").notNull(),
  content: text("content"),
  status: text("status").default("scheduled"),
  scheduledAt: timestamp("scheduled_at"),
  publishedAt: timestamp("published_at"),
  mediaUrls: text("media_urls").array(),
  engagement: jsonb("engagement"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSocialCampaignSchema = createInsertSchema(socialCampaigns).omit({ id: true, createdAt: true });
export type InsertSocialCampaign = z.infer<typeof insertSocialCampaignSchema>;

// ============================================================================
// STOREFRONTS (Marketplace)
// ============================================================================
export const storefronts = pgTable("storefronts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  templateId: text("template_id"),
  customization: jsonb("customization"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertStorefrontSchema = createInsertSchema(storefronts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateStorefrontSchema = insertStorefrontSchema.partial();
export type InsertStorefront = z.infer<typeof insertStorefrontSchema>;

// ============================================================================
// MEMBERSHIP TIERS
// ============================================================================
export const membershipTiers = pgTable("membership_tiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  storefrontId: varchar("storefront_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  priceCents: integer("price_cents").notNull(),
  currency: text("currency").default("usd"),
  interval: text("interval").notNull(),
  benefits: jsonb("benefits"),
  maxSubscribers: integer("max_subscribers"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMembershipTierSchema = createInsertSchema(membershipTiers).pick({
  storefrontId: true,
  name: true,
  description: true,
  priceCents: true,
  currency: true,
  interval: true,
  benefits: true,
  maxSubscribers: true,
});

export const updateMembershipTierSchema = insertMembershipTierSchema.partial();

// ============================================================================
// BEATS (Marketplace listings)
// ============================================================================
export const beats = pgTable("beats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  price: real("price").notNull(),
  genre: text("genre"),
  bpm: integer("bpm"),
  key: text("key"),
  audioUrl: text("audio_url"),
  artworkUrl: text("artwork_url"),
  licenseType: text("license_type").default("basic"),
  tags: text("tags").array(),
  isPublished: boolean("is_published").default(false),
  plays: integer("plays").default(0),
  downloads: integer("downloads").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// HYPERFOLLOW PAGES
// ============================================================================
export const hyperFollowPages = pgTable("hyperfollow_pages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  imageUrl: text("image_url"),
  links: jsonb("links"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// DISTRIBUTION RELEASES
// ============================================================================
export const distroReleases = pgTable("distro_releases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artistId: varchar("artist_id").notNull(),
  title: text("title").notNull(),
  releaseDate: timestamp("release_date"),
  status: text("status").default("draft"),
  artworkUrl: text("artwork_url"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// DISTRIBUTION TRACKS
// ============================================================================
export const distroTracks = pgTable("distro_tracks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull(),
  title: text("title").notNull(),
  trackNumber: integer("track_number").notNull(),
  isrc: text("isrc"),
  audioUrl: text("audio_url"),
  duration: integer("duration"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// DSP PROVIDERS
// ============================================================================
export const dspProviders = pgTable("dsp_providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  isActive: boolean("is_active").default(true),
  metadata: jsonb("metadata"),
});

// ============================================================================
// CUSTOMER MEMBERSHIPS (Storefront subscriptions)
// ============================================================================
export const customerMemberships = pgTable("customer_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull(),
  tierId: varchar("tier_id").notNull(),
  storefrontId: varchar("storefront_id").notNull(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status").default("active"),
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomerMembershipSchema = createInsertSchema(customerMemberships).pick({
  customerId: true,
  tierId: true,
  storefrontId: true,
  stripeSubscriptionId: true,
  status: true,
});

// ============================================================================
// STATUS PAGE INCIDENTS
// ============================================================================
export const statusPageIncidents = pgTable("status_page_incidents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").default("investigating"),
  severity: text("severity").default("minor"),
  startedAt: timestamp("started_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// STATUS PAGE INCIDENT SERVICES
// ============================================================================
export const statusPageIncidentServices = pgTable("status_page_incident_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  incidentId: varchar("incident_id").notNull(),
  serviceName: text("service_name").notNull(),
  status: text("status").default("degraded"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// DMCA NOTICES
// ============================================================================
export const dmcaNotices = pgTable("dmca_notices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contentType: text("content_type").notNull(),
  contentId: varchar("content_id").notNull(),
  claimantName: text("claimant_name").notNull(),
  claimantEmail: text("claimant_email").notNull(),
  description: text("description"),
  status: text("status").default("pending"),
  submittedAt: timestamp("submitted_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// DMCA STRIKES
// ============================================================================
export const dmcaStrikes = pgTable("dmca_strikes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  noticeId: varchar("notice_id"),
  contentType: text("content_type").notNull(),
  contentId: varchar("content_id").notNull(),
  reason: text("reason"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// LISTINGS (Marketplace)
// ============================================================================
export const listings = pgTable("listings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  storefrontId: varchar("storefront_id"),
  title: text("title").notNull(),
  description: text("description"),
  priceCents: integer("price_cents").notNull(),
  currency: text("currency").default("usd"),
  listingType: text("listing_type").default("one_time"),
  category: text("category"),
  audioUrl: text("audio_url"),
  artworkUrl: text("artwork_url"),
  previewUrl: text("preview_url"),
  isPublished: boolean("is_published").default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertListingSchema = createInsertSchema(listings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ============================================================================
// STATUS PAGE INCIDENT UPDATES
// ============================================================================
export const statusPageIncidentUpdates = pgTable("status_page_incident_updates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  incidentId: varchar("incident_id").notNull(),
  message: text("message").notNull(),
  status: text("status").default("investigating"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// STATUS PAGE SERVICES
// ============================================================================
export const statusPageServices = pgTable("status_page_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  status: text("status").default("operational"),
  category: text("category"),
  displayOrder: integer("display_order").default(0),
  isPublic: boolean("is_public").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// STOREFRONT TEMPLATES
// ============================================================================
export const storefrontTemplates = pgTable("storefront_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  previewUrl: text("preview_url"),
  configuration: jsonb("configuration"),
  isActive: boolean("is_active").default(true),
  isPremium: boolean("is_premium").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// LEGAL HOLDS
// ============================================================================
export const legalHolds = pgTable("legal_holds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  contentType: text("content_type").notNull(),
  contentId: varchar("content_id").notNull(),
  reason: text("reason"),
  holdType: text("hold_type").default("dmca"),
  status: text("status").default("active"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// ISRC REGISTRY
// ============================================================================
export const isrcRegistry = pgTable("isrc_registry", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  isrc: text("isrc").notNull().unique(),
  trackId: varchar("track_id").notNull(),
  releaseId: varchar("release_id"),
  artistId: varchar("artist_id").notNull(),
  title: text("title").notNull(),
  registeredAt: timestamp("registered_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// STATUS PAGE SUBSCRIBERS
// ============================================================================
export const statusPageSubscribers = pgTable("status_page_subscribers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  phone: text("phone"),
  isVerified: boolean("is_verified").default(false),
  notificationPreferences: jsonb("notification_preferences"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// UPC REGISTRY
// ============================================================================
export const upcRegistry = pgTable("upc_registry", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  upc: text("upc").notNull().unique(),
  releaseId: varchar("release_id").notNull(),
  artistId: varchar("artist_id").notNull(),
  title: text("title").notNull(),
  registeredAt: timestamp("registered_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// STATUS PAGE UPTIME METRICS
// ============================================================================
export const statusPageUptimeMetrics = pgTable("status_page_uptime_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceId: varchar("service_id").notNull(),
  date: timestamp("date").notNull().defaultNow(),
  uptimePercentage: real("uptime_percentage").default(100),
  downtime: integer("downtime").default(0),
  responseTime: integer("response_time"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// CATALOG IMPORT JOBS
// ============================================================================
export const catalogImportJobs = pgTable("catalog_import_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artistId: varchar("artist_id").notNull(),
  status: text("status").default("pending"),
  sourceType: text("source_type").notNull(),
  sourceUrl: text("source_url"),
  progress: integer("progress").default(0),
  totalTracks: integer("total_tracks"),
  importedTracks: integer("imported_tracks").default(0),
  errors: jsonb("errors"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// CATALOG IMPORT ROWS
// ============================================================================
export const catalogImportRows = pgTable("catalog_import_rows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  trackTitle: text("track_title").notNull(),
  artistName: text("artist_name"),
  releaseTitle: text("release_title"),
  isrc: text("isrc"),
  upc: text("upc"),
  status: text("status").default("pending"),
  errorMessage: text("error_message"),
  importedTrackId: varchar("imported_track_id"),
  rawData: jsonb("raw_data"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// RELEASE WORKFLOW REQUESTS
// ============================================================================
export const releaseWorkflowRequests = pgTable("release_workflow_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull(),
  requestType: text("request_type").notNull(),
  requestedBy: varchar("requested_by").notNull(),
  status: text("status").default("pending"),
  metadata: jsonb("metadata"),
  processedAt: timestamp("processed_at"),
  processedBy: varchar("processed_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// RELEASE VERSION HISTORY
// ============================================================================
export const releaseVersionHistory = pgTable("release_version_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull(),
  version: integer("version").notNull(),
  changeType: text("change_type").notNull(),
  changedBy: varchar("changed_by").notNull(),
  changes: jsonb("changes"),
  previousData: jsonb("previous_data"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// RELEASE SCHEDULED ACTIONS
// ============================================================================
export const releaseScheduledActions = pgTable("release_scheduled_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull(),
  actionType: text("action_type").notNull(),
  scheduledFor: timestamp("scheduled_for").notNull(),
  status: text("status").default("pending"),
  metadata: jsonb("metadata"),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// PRE-SAVE CAMPAIGNS
// ============================================================================
export const preSaveCampaigns = pgTable("pre_save_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  startDate: timestamp("start_date"),
  platforms: text("platforms").array(),
  status: text("status").default("active"),
  totalSaves: integer("total_saves").default(0),
  artwork: text("artwork"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// INSTANT PAYOUTS
// ============================================================================
export const instantPayouts = pgTable("instant_payouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: text("currency").default("usd"),
  status: text("status").default("pending"),
  stripePayoutId: text("stripe_payout_id"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// KYC DOCUMENTS
// ============================================================================
export const kycDocuments = pgTable("kyc_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  documentType: text("document_type").notNull(),
  documentUrl: text("document_url"),
  status: text("status").default("pending"),
  verifiedAt: timestamp("verified_at"),
  expiresAt: timestamp("expires_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// NOTIFICATIONS
// ============================================================================
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message"),
  isRead: boolean("is_read").default(false),
  actionUrl: text("action_url"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// SECURITY THREATS (Self-Healing Security)
// ============================================================================
export const securityThreats = pgTable("security_threats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  threatType: text("threat_type").notNull(),
  severity: text("severity").notNull(),
  sourceIp: text("source_ip"),
  userId: varchar("user_id"),
  sessionId: varchar("session_id"),
  path: text("path"),
  method: text("method"),
  indicators: jsonb("indicators"),
  confidence: real("confidence"),
  status: text("status").default("detected"),
  healingActions: jsonb("healing_actions"),
  detectedAt: timestamp("detected_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SecurityThreat = typeof securityThreats.$inferSelect;
export type InsertSecurityThreat = typeof securityThreats.$inferInsert;
export const insertSecurityThreatSchema = createInsertSchema(securityThreats).omit({ id: true, createdAt: true });

// ============================================================================
// IP BLACKLIST (Self-Healing Security)
// ============================================================================
export const ipBlacklist = pgTable("ip_blacklist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ip: text("ip").notNull(),
  reason: text("reason").notNull(),
  severity: text("severity").default("medium"),
  threatId: varchar("threat_id"),
  blockedAt: timestamp("blocked_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").default(true),
  blockCount: integer("block_count").default(1),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type IpBlacklist = typeof ipBlacklist.$inferSelect;
export type InsertIpBlacklist = typeof ipBlacklist.$inferInsert;
export const insertIpBlacklistSchema = createInsertSchema(ipBlacklist).omit({ id: true, createdAt: true });

// ============================================================================
// POSTS (Social Media)
// ============================================================================
export const posts = pgTable("posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  campaignId: varchar("campaign_id"),
  platform: text("platform").notNull(),
  content: text("content"),
  mediaUrls: text("media_urls").array(),
  status: text("status").default("draft"),
  approvalStatus: text("approval_status").default("draft"),
  submittedBy: varchar("submitted_by"),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  rejectionReason: text("rejection_reason"),
  scheduledAt: timestamp("scheduled_at"),
  publishedAt: timestamp("published_at"),
  platformPostId: text("platform_post_id"),
  engagement: jsonb("engagement"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// AUDIO CLIPS (Studio)
// ============================================================================
export const audioClips = pgTable("audio_clips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  trackId: varchar("track_id"),
  name: text("name").notNull(),
  audioUrl: text("audio_url"),
  startTime: real("start_time").default(0),
  duration: real("duration"),
  fadeIn: real("fade_in").default(0),
  fadeOut: real("fade_out").default(0),
  gain: real("gain").default(1),
  warpMode: text("warp_mode"),
  warpSettings: jsonb("warp_settings"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// MARKERS (Studio Timeline)
// ============================================================================
export const markers = pgTable("markers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  name: text("name").notNull(),
  time: real("time").notNull(),
  color: text("color"),
  markerType: text("marker_type").default("generic"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// PLUGIN CATALOG
// ============================================================================
export const pluginCatalog = pgTable("plugin_catalog", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  type: text("type").notNull(),
  category: text("category"),
  vendor: text("vendor"),
  version: text("version"),
  description: text("description"),
  iconUrl: text("icon_url"),
  parameters: jsonb("parameters"),
  presets: jsonb("presets"),
  isBuiltIn: boolean("is_built_in").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// WORKSPACE AUDIT LOG
// ============================================================================
export const workspaceAuditLog = pgTable("workspace_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id").notNull(),
  action: text("action").notNull(),
  resourceType: text("resource_type"),
  resourceId: varchar("resource_id"),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// API KEYS (Developer)
// ============================================================================
export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  scopes: text("scopes").array(),
  rateLimit: integer("rate_limit").default(1000),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// DSP ANALYTICS
// ============================================================================
export const dspAnalytics = pgTable("dsp_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull(),
  trackId: varchar("track_id"),
  platform: text("platform").notNull(),
  date: date("date").notNull(),
  streams: integer("streams").default(0),
  revenue: real("revenue").default(0),
  saves: integer("saves").default(0),
  playlistAdds: integer("playlist_adds").default(0),
  listeners: integer("listeners").default(0),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================
export type Analytics = typeof analytics.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Release = typeof releases.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type SocialCampaign = typeof socialCampaigns.$inferSelect;
export type Storefront = typeof storefronts.$inferSelect;
export type MembershipTier = typeof membershipTiers.$inferSelect;
export type Beat = typeof beats.$inferSelect;
export type HyperFollowPage = typeof hyperFollowPages.$inferSelect;
export type DistroRelease = typeof distroReleases.$inferSelect;
export type DistroTrack = typeof distroTracks.$inferSelect;
export type DSPProvider = typeof dspProviders.$inferSelect;
export type CustomerMembership = typeof customerMemberships.$inferSelect;
export type StatusPageIncident = typeof statusPageIncidents.$inferSelect;
export type StatusPageIncidentService = typeof statusPageIncidentServices.$inferSelect;
export type DmcaNotice = typeof dmcaNotices.$inferSelect;
export type DmcaStrike = typeof dmcaStrikes.$inferSelect;
export type Listing = typeof listings.$inferSelect;
export type StatusPageIncidentUpdate = typeof statusPageIncidentUpdates.$inferSelect;
export type StatusPageService = typeof statusPageServices.$inferSelect;
export type StorefrontTemplate = typeof storefrontTemplates.$inferSelect;
export type LegalHold = typeof legalHolds.$inferSelect;
export type IsrcRegistry = typeof isrcRegistry.$inferSelect;
export type StatusPageSubscriber = typeof statusPageSubscribers.$inferSelect;
export type UpcRegistry = typeof upcRegistry.$inferSelect;
export type StatusPageUptimeMetric = typeof statusPageUptimeMetrics.$inferSelect;
export type CatalogImportJob = typeof catalogImportJobs.$inferSelect;
export type CatalogImportRow = typeof catalogImportRows.$inferSelect;
export type ReleaseWorkflowRequest = typeof releaseWorkflowRequests.$inferSelect;
export type ReleaseVersionHistory = typeof releaseVersionHistory.$inferSelect;
export type ReleaseScheduledAction = typeof releaseScheduledActions.$inferSelect;
export type PreSaveCampaign = typeof preSaveCampaigns.$inferSelect;
export type InstantPayout = typeof instantPayouts.$inferSelect;
export type KycDocument = typeof kycDocuments.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type AudioClip = typeof audioClips.$inferSelect;
export type Marker = typeof markers.$inferSelect;
export type PluginCatalogEntry = typeof pluginCatalog.$inferSelect;
export type WorkspaceAuditEntry = typeof workspaceAuditLog.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type DspAnalytic = typeof dspAnalytics.$inferSelect;

// ============================================================================
// ORDERS (Marketplace)
// ============================================================================
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  sellerId: varchar("seller_id").notNull(),
  listingId: varchar("listing_id").notNull(),
  amount: real("amount").notNull(),
  currency: text("currency").default("usd"),
  status: text("status").default("pending"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// KYC VERIFICATIONS
// ============================================================================
export const kycVerifications = pgTable("kyc_verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  verificationType: text("verification_type").notNull(),
  status: text("status").default("pending"),
  provider: text("provider"),
  providerReference: text("provider_reference"),
  verifiedAt: timestamp("verified_at"),
  expiresAt: timestamp("expires_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// APPROVAL HISTORY (Social)
// ============================================================================
export const approvalHistory = pgTable("approval_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull(),
  userId: varchar("user_id").notNull(),
  action: text("action").notNull(),
  comment: text("comment"),
  previousStatus: text("previous_status"),
  newStatus: text("new_status"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// SCHEDULED POST BATCHES
// ============================================================================
export const scheduledPostBatches = pgTable("scheduled_post_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  status: text("status").default("pending"),
  postIds: text("post_ids").array(),
  scheduledAt: timestamp("scheduled_at"),
  completedAt: timestamp("completed_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// COMP VERSIONS (Studio)
// ============================================================================
export const compVersions = pgTable("comp_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  trackId: varchar("track_id").notNull(),
  name: text("name").notNull(),
  segments: jsonb("segments"),
  isActive: boolean("is_active").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// PLUGIN INSTANCES (Studio)
// ============================================================================
export const pluginInstances = pgTable("plugin_instances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  trackId: varchar("track_id"),
  pluginId: varchar("plugin_id").notNull(),
  name: text("name"),
  position: integer("position").default(0),
  parameters: jsonb("parameters"),
  presetId: varchar("preset_id"),
  isBypassed: boolean("is_bypassed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// STEM EXPORTS
// ============================================================================
export const stemExports = pgTable("stem_exports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  format: text("format").default("wav"),
  bitDepth: integer("bit_depth").default(24),
  sampleRate: integer("sample_rate").default(44100),
  trackIds: text("track_ids").array(),
  status: text("status").default("pending"),
  outputUrl: text("output_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// WARP MARKERS
// ============================================================================
export const warpMarkers = pgTable("warp_markers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clipId: varchar("clip_id").notNull(),
  beatPosition: real("beat_position").notNull(),
  samplePosition: real("sample_position").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWarpMarkerSchema = createInsertSchema(warpMarkers).omit({ id: true, createdAt: true });

// ============================================================================
// WORKSPACE CATALOGS
// ============================================================================
export const workspaceCatalogs = pgTable("workspace_catalogs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  items: jsonb("items"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// API USAGE
// ============================================================================
export const apiUsage = pgTable("api_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  apiKeyId: varchar("api_key_id").notNull(),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  statusCode: integer("status_code"),
  responseTimeMs: integer("response_time_ms"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// ALERT INCIDENTS
// ============================================================================
export const alertIncidents = pgTable("alert_incidents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alertType: text("alert_type").notNull(),
  severity: text("severity").default("warning"),
  message: text("message").notNull(),
  source: text("source"),
  status: text("status").default("active"),
  acknowledgedBy: varchar("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedAt: timestamp("resolved_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// DSP SYNC STATUS
// ============================================================================
export const dspSyncStatus = pgTable("dsp_sync_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull(),
  platform: text("platform").notNull(),
  status: text("status").default("pending"),
  lastSyncAt: timestamp("last_sync_at"),
  platformReleaseId: text("platform_release_id"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// EMAIL EVENTS (SendGrid Webhooks)
// ============================================================================
export const emailEvents = pgTable("email_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: text("message_id"),
  email: text("email").notNull(),
  event: text("event").notNull(),
  timestamp: timestamp("timestamp"),
  category: text("category"),
  reason: text("reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// ADDITIONAL TYPE EXPORTS
// ============================================================================
export type Order = typeof orders.$inferSelect;
export type KycVerification = typeof kycVerifications.$inferSelect;
export type ApprovalHistoryEntry = typeof approvalHistory.$inferSelect;
export type ScheduledPostBatch = typeof scheduledPostBatches.$inferSelect;
export type CompVersion = typeof compVersions.$inferSelect;
export type PluginInstance = typeof pluginInstances.$inferSelect;
export type StemExport = typeof stemExports.$inferSelect;
export type WarpMarker = typeof warpMarkers.$inferSelect;
export type WorkspaceCatalog = typeof workspaceCatalogs.$inferSelect;
export type ApiUsage = typeof apiUsage.$inferSelect;
export type AlertIncident = typeof alertIncidents.$inferSelect;
export type DspSyncStatus = typeof dspSyncStatus.$inferSelect;
export type EmailEvent = typeof emailEvents.$inferSelect;

// ============================================================================
// REQUEST INSTANT PAYOUT SCHEMA
// ============================================================================
export const requestInstantPayoutSchema = z.object({
  amountCents: z.number().int().positive(),
  currency: z.string().default("usd"),
});


// ============================================================================
// APPROVE POST SCHEMA
// ============================================================================
export const approvePostSchema = z.object({
  postId: z.string(),
  approved: z.boolean(),
  comment: z.string().optional(),
});

// ============================================================================
// BULK SCHEDULE POST SCHEMA
// ============================================================================
export const bulkSchedulePostSchema = z.object({
  postIds: z.array(z.string()),
  scheduledAt: z.string(),
  timezone: z.string().optional(),
});

// ============================================================================
// TAKE GROUPS (Studio Comping)
// ============================================================================
export const takeGroups = pgTable("take_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  trackId: varchar("track_id").notNull(),
  name: text("name").notNull(),
  takes: jsonb("takes"),
  activeCompId: varchar("active_comp_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// PLUGIN PRESETS
// ============================================================================
export const pluginPresets = pgTable("plugin_presets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pluginId: varchar("plugin_id").notNull(),
  userId: varchar("user_id"),
  name: text("name").notNull(),
  isFactory: boolean("is_factory").default(false),
  parameters: jsonb("parameters"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// STUDIO TRACKS
// ============================================================================
export const studioTracks = pgTable("studio_tracks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  name: text("name").notNull(),
  trackType: text("track_type").default("audio"),
  color: text("color"),
  volume: real("volume").default(1),
  pan: real("pan").default(0),
  isMuted: boolean("is_muted").default(false),
  isSolo: boolean("is_solo").default(false),
  isArmed: boolean("is_armed").default(false),
  inputSource: text("input_source"),
  outputBus: text("output_bus"),
  order: integer("order").default(0),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// WORKSPACE INVITATIONS
// ============================================================================
export const workspaceInvitations = pgTable("workspace_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  email: text("email").notNull(),
  role: text("role").default("member"),
  invitedBy: varchar("invited_by").notNull(),
  status: text("status").default("pending"),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// ALERT RULES
// ============================================================================
export const alertRules = pgTable("alert_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  condition: text("condition").notNull(),
  threshold: real("threshold"),
  severity: text("severity").default("warning"),
  channels: text("channels").array(),
  isActive: boolean("is_active").default(true),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// PLAYLIST ATTRIBUTIONS
// ============================================================================
export const playlistAttributions = pgTable("playlist_attributions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull(),
  trackId: varchar("track_id"),
  playlistId: text("playlist_id").notNull(),
  playlistName: text("playlist_name"),
  platform: text("platform").notNull(),
  addedAt: timestamp("added_at"),
  removedAt: timestamp("removed_at"),
  streamCount: integer("stream_count").default(0),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// EMAIL MESSAGES
// ============================================================================
export const emailMessages = pgTable("email_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  to: text("to").notNull(),
  from: text("from").notNull(),
  subject: text("subject").notNull(),
  templateId: text("template_id"),
  status: text("status").default("pending"),
  sendgridMessageId: text("sendgrid_message_id"),
  sentAt: timestamp("sent_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// FINAL TYPE EXPORTS
// ============================================================================
export type TakeGroup = typeof takeGroups.$inferSelect;
export type PluginPreset = typeof pluginPresets.$inferSelect;
export type StudioTrack = typeof studioTracks.$inferSelect;
export type WorkspaceInvitation = typeof workspaceInvitations.$inferSelect;
export type AlertRule = typeof alertRules.$inferSelect;
export type PlaylistAttribution = typeof playlistAttributions.$inferSelect;
export type EmailMessage = typeof emailMessages.$inferSelect;

// ============================================================================
// REJECT POST SCHEMA
// ============================================================================
export const rejectPostSchema = z.object({
  postId: z.string(),
  reason: z.string().optional(),
});

// ============================================================================
// BULK VALIDATE POST SCHEMA
// ============================================================================
export const bulkValidatePostSchema = z.object({
  postIds: z.array(z.string()),
});

// ============================================================================
// TAKE LANES (Studio Comping)
// ============================================================================
export const takeLanes = pgTable("take_lanes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  takeGroupId: varchar("take_group_id").notNull(),
  name: text("name").notNull(),
  clipId: varchar("clip_id"),
  isActive: boolean("is_active").default(false),
  order: integer("order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// UPDATE WARP MARKER SCHEMA
// ============================================================================
export const updateWarpMarkerSchema = z.object({
  beatPosition: z.number().optional(),
  samplePosition: z.number().optional(),
});

// ============================================================================
// WORKSPACE MEMBERS
// ============================================================================
export const workspaceMembers = pgTable("workspace_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id").notNull(),
  role: text("role").default("member"),
  joinedAt: timestamp("joined_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// SYSTEM METRICS
// ============================================================================
export const systemMetrics = pgTable("system_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metricType: text("metric_type").notNull(),
  value: real("value").notNull(),
  unit: text("unit"),
  source: text("source"),
  tags: jsonb("tags"),
  timestamp: timestamp("timestamp").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// LISTENER COHORTS
// ============================================================================
export const listenerCohorts = pgTable("listener_cohorts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull(),
  cohortName: text("cohort_name").notNull(),
  platform: text("platform"),
  listenerCount: integer("listener_count").default(0),
  demographics: jsonb("demographics"),
  geographics: jsonb("geographics"),
  period: text("period"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// FINAL REMAINING TYPE EXPORTS
// ============================================================================
export type TakeLane = typeof takeLanes.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type SystemMetric = typeof systemMetrics.$inferSelect;
export type ListenerCohort = typeof listenerCohorts.$inferSelect;

// ============================================================================
// SUBMIT FOR REVIEW SCHEMA
// ============================================================================
export const submitForReviewSchema = z.object({
  postId: z.string(),
  notes: z.string().optional(),
});

// ============================================================================
// SOCIAL ACCOUNTS
// ============================================================================
export const socialAccounts = pgTable("social_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  platform: text("platform").notNull(),
  platformUserId: text("platform_user_id"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  username: text("username"),
  profileUrl: text("profile_url"),
  followerCount: integer("follower_count").default(0),
  isActive: boolean("is_active").default(true),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// TAKE SEGMENTS (Studio Comping)
// ============================================================================
export const takeSegments = pgTable("take_segments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  compVersionId: varchar("comp_version_id").notNull(),
  takeLaneId: varchar("take_lane_id").notNull(),
  startTime: real("start_time").notNull(),
  endTime: real("end_time").notNull(),
  fadeIn: real("fade_in").default(0),
  fadeOut: real("fade_out").default(0),
  order: integer("order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// WORKSPACE ROLES
// ============================================================================
export const workspaceRoles = pgTable("workspace_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  name: text("name").notNull(),
  permissions: text("permissions").array(),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// REVENUE FORECASTS
// ============================================================================
export const revenueForecasts = pgTable("revenue_forecasts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  releaseId: varchar("release_id"),
  forecastType: text("forecast_type").notNull(),
  period: text("period").notNull(),
  predictedRevenue: real("predicted_revenue"),
  confidenceLevel: real("confidence_level"),
  factors: jsonb("factors"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// VERY FINAL TYPE EXPORTS
// ============================================================================
export type SocialAccount = typeof socialAccounts.$inferSelect;
export type TakeSegment = typeof takeSegments.$inferSelect;
export type WorkspaceRole = typeof workspaceRoles.$inferSelect;
export type RevenueForecast = typeof revenueForecasts.$inferSelect;

// ============================================================================
// WORKSPACES
// ============================================================================
export const workspaces = pgTable("workspaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  ownerId: varchar("owner_id").notNull(),
  description: text("description"),
  logoUrl: text("logo_url"),
  isActive: boolean("is_active").default(true),
  settings: jsonb("settings"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Workspace = typeof workspaces.$inferSelect;

// ============================================================================
// APPROVAL REQUESTS
// ============================================================================
export const approvalRequests = pgTable("approval_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  requesterId: varchar("requester_id").notNull(),
  approverId: varchar("approver_id"),
  resourceType: text("resource_type").notNull(),
  resourceId: varchar("resource_id").notNull(),
  status: text("status").default("pending"),
  notes: text("notes"),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ApprovalRequest = typeof approvalRequests.$inferSelect;

// ============================================================================
// APPROVAL STEPS
// ============================================================================
export const approvalSteps = pgTable("approval_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull(),
  stepOrder: integer("step_order").default(1),
  approverId: varchar("approver_id").notNull(),
  status: text("status").default("pending"),
  comment: text("comment"),
  actionTakenAt: timestamp("action_taken_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ApprovalStep = typeof approvalSteps.$inferSelect;

// ============================================================================
// APPROVAL WORKFLOWS
// ============================================================================
export const approvalWorkflows = pgTable("approval_workflows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  name: text("name").notNull(),
  resourceType: text("resource_type").notNull(),
  steps: jsonb("steps"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ApprovalWorkflow = typeof approvalWorkflows.$inferSelect;

// ============================================================================
// SSO CONFIGS
// ============================================================================
export const ssoConfigs = pgTable("sso_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  provider: text("provider").notNull(),
  entityId: text("entity_id"),
  ssoUrl: text("sso_url"),
  certificateFingerprint: text("certificate_fingerprint"),
  oidcClientId: text("oidc_client_id"),
  oidcIssuer: text("oidc_issuer"),
  isActive: boolean("is_active").default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SsoConfig = typeof ssoConfigs.$inferSelect;

// ============================================================================
// AD CAMPAIGNS (Advertising)
// ============================================================================
export const adCampaigns = pgTable("ad_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  platform: text("platform").notNull(),
  objective: text("objective"),
  budget: real("budget").default(0),
  dailyBudget: real("daily_budget"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  targetAudience: jsonb("target_audience"),
  creativeIds: text("creative_ids").array(),
  status: text("status").default("draft"),
  performance: jsonb("performance"),
  aiOptimizations: jsonb("ai_optimizations"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export type AdCampaign = typeof adCampaigns.$inferSelect;
export const insertAdCampaignSchema = createInsertSchema(adCampaigns).omit({ id: true, createdAt: true });

// ============================================================================
// AD CREATIVES
// ============================================================================
export const adCreatives = pgTable("ad_creatives", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  campaignId: varchar("campaign_id"),
  name: text("name").notNull(),
  type: text("type").notNull(),
  headline: text("headline"),
  description: text("description"),
  mediaUrl: text("media_url"),
  thumbnailUrl: text("thumbnail_url"),
  callToAction: text("call_to_action"),
  landingUrl: text("landing_url"),
  status: text("status").default("draft"),
  performance: jsonb("performance"),
  variants: jsonb("variants"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type AdCreative = typeof adCreatives.$inferSelect;
export const insertAdCreativeSchema = createInsertSchema(adCreatives).omit({ id: true, createdAt: true });

// ============================================================================
// CONTENT CALENDAR
// ============================================================================
export const contentCalendar = pgTable("content_calendar", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  title: text("title").notNull(),
  contentType: text("content_type").notNull(),
  platform: text("platform"),
  scheduledAt: timestamp("scheduled_at"),
  status: text("status").default("planned"),
  content: jsonb("content"),
  mediaUrls: text("media_urls").array(),
  tags: text("tags").array(),
  campaignId: varchar("campaign_id"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ContentCalendarEntry = typeof contentCalendar.$inferSelect;
export const insertContentCalendarSchema = createInsertSchema(contentCalendar).omit({ id: true, createdAt: true });

// ============================================================================
// AI MODELS
// ============================================================================
export const aiModels = pgTable("ai_models", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  modelName: text("model_name").notNull().unique(),
  modelType: text("model_type").notNull(),
  description: text("description"),
  version: text("version").default("1.0.0"),
  status: text("status").default("active"),
  capabilities: text("capabilities").array(),
  inputSchema: jsonb("input_schema"),
  outputSchema: jsonb("output_schema"),
  parameters: jsonb("parameters"),
  trainingData: jsonb("training_data"),
  performance: jsonb("performance"),
  lastTrainedAt: timestamp("last_trained_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export type AiModel = typeof aiModels.$inferSelect;
export const insertAiModelSchema = createInsertSchema(aiModels).omit({ id: true, createdAt: true });

// ============================================================================
// USER BRAND VOICES
// ============================================================================
export const userBrandVoices = pgTable("user_brand_voices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  voiceName: text("voice_name").notNull(),
  description: text("description"),
  tone: text("tone"),
  personality: text("personality").array(),
  vocabulary: text("vocabulary").array(),
  avoidWords: text("avoid_words").array(),
  writingStyle: text("writing_style"),
  sampleContent: text("sample_content").array(),
  targetAudience: text("target_audience"),
  brandValues: text("brand_values").array(),
  isDefault: boolean("is_default").default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export type UserBrandVoice = typeof userBrandVoices.$inferSelect;
export const insertUserBrandVoiceSchema = createInsertSchema(userBrandVoices).omit({ id: true, createdAt: true });

// ============================================================================
// INFERENCE RUNS (AI Model Execution Tracking)
// ============================================================================
export const inferenceRuns = pgTable("inference_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  modelId: varchar("model_id"),
  modelName: text("model_name").notNull(),
  inputData: jsonb("input_data"),
  outputData: jsonb("output_data"),
  status: text("status").default("pending"),
  latencyMs: integer("latency_ms"),
  tokensUsed: integer("tokens_used"),
  cost: real("cost"),
  error: text("error"),
  metadata: jsonb("metadata"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type InferenceRun = typeof inferenceRuns.$inferSelect;
export const insertInferenceRunSchema = createInsertSchema(inferenceRuns).omit({ id: true, createdAt: true });

// ============================================================================
// HASHTAG RESEARCH
// ============================================================================
export const hashtagResearch = pgTable("hashtag_research", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  hashtag: text("hashtag").notNull(),
  platform: text("platform").notNull(),
  volume: integer("volume").default(0),
  engagement: real("engagement").default(0),
  competition: real("competition").default(0),
  trending: boolean("trending").default(false),
  relatedHashtags: text("related_hashtags").array(),
  audienceSize: integer("audience_size"),
  growthRate: real("growth_rate"),
  peakHours: integer("peak_hours").array(),
  category: text("category"),
  metadata: jsonb("metadata"),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type HashtagResearch = typeof hashtagResearch.$inferSelect;
export const insertHashtagResearchSchema = createInsertSchema(hashtagResearch).omit({ id: true, createdAt: true });

// ============================================================================
// EXPLANATION LOGS (AI Decision Logging)
// ============================================================================
export const explanationLogs = pgTable("explanation_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  modelName: text("model_name").notNull(),
  decisionType: text("decision_type").notNull(),
  inputData: jsonb("input_data"),
  outputData: jsonb("output_data"),
  confidence: real("confidence"),
  explanation: text("explanation"),
  factors: jsonb("factors"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ExplanationLog = typeof explanationLogs.$inferSelect;
export const insertExplanationLogSchema = createInsertSchema(explanationLogs).omit({ id: true, createdAt: true });

// ============================================================================
// BEST POSTING TIMES
// ============================================================================
export const bestPostingTimes = pgTable("best_posting_times", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  platform: text("platform").notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  hour: integer("hour").notNull(),
  engagementScore: real("engagement_score").default(0),
  postCount: integer("post_count").default(0),
  avgLikes: real("avg_likes").default(0),
  avgComments: real("avg_comments").default(0),
  avgShares: real("avg_shares").default(0),
  avgReach: real("avg_reach").default(0),
  confidence: real("confidence").default(0),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type BestPostingTime = typeof bestPostingTimes.$inferSelect;
export const insertBestPostingTimeSchema = createInsertSchema(bestPostingTimes).omit({ id: true, createdAt: true });

// ============================================================================
// AI MODEL VERSIONS
// ============================================================================
export const aiModelVersions = pgTable("ai_model_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  modelId: varchar("model_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  versionHash: text("version_hash"),
  status: text("status").default("staging"),
  accuracy: real("accuracy"),
  trainingMetrics: jsonb("training_metrics"),
  validationMetrics: jsonb("validation_metrics"),
  parameters: jsonb("parameters"),
  changelog: text("changelog"),
  createdBy: varchar("created_by"),
  deployedAt: timestamp("deployed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type AiModelVersion = typeof aiModelVersions.$inferSelect;
export const insertAiModelVersionSchema = createInsertSchema(aiModelVersions).omit({ id: true, createdAt: true });

// ============================================================================
// USER TASTE PROFILES (For Personalized Discovery Algorithm)
// ============================================================================
export const userTasteProfiles = pgTable("user_taste_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  genreScores: jsonb("genre_scores").default({}),
  moodScores: jsonb("mood_scores").default({}),
  preferredTempoMin: integer("preferred_tempo_min").default(80),
  preferredTempoMax: integer("preferred_tempo_max").default(150),
  preferredKeys: text("preferred_keys").array().default([]),
  followedProducers: text("followed_producers").array().default([]),
  priceSensitivity: real("price_sensitivity").default(0.5),
  totalInteractions: integer("total_interactions").default(0),
  purchaseCount: integer("purchase_count").default(0),
  tasteEmbedding: jsonb("taste_embedding"),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type UserTasteProfile = typeof userTasteProfiles.$inferSelect;
export const insertUserTasteProfileSchema = createInsertSchema(userTasteProfiles).omit({ id: true, createdAt: true });

// ============================================================================
// BEAT INTERACTIONS (Tracks user behavior for discovery algorithm)
// ============================================================================
export const beatInteractions = pgTable("beat_interactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  beatId: varchar("beat_id").notNull(),
  interactionType: text("interaction_type").notNull(),
  playDurationSeconds: integer("play_duration_seconds"),
  completionRate: real("completion_rate"),
  source: text("source").default("browse"),
  sessionId: varchar("session_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type BeatInteraction = typeof beatInteractions.$inferSelect;
export const insertBeatInteractionSchema = createInsertSchema(beatInteractions).omit({ id: true, createdAt: true });

// ============================================================================
// BEAT DISCOVERY SCORES (Pre-calculated scores for fast discovery)
// ============================================================================
export const beatDiscoveryScores = pgTable("beat_discovery_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  beatId: varchar("beat_id").notNull(),
  userId: varchar("user_id").notNull(),
  tasteMatchScore: real("taste_match_score").default(0),
  freshnessScore: real("freshness_score").default(1),
  popularityScore: real("popularity_score").default(0),
  producerAffinityScore: real("producer_affinity_score").default(0),
  discoveryScore: real("discovery_score").default(0),
  calculatedAt: timestamp("calculated_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
});

export type BeatDiscoveryScore = typeof beatDiscoveryScores.$inferSelect;
export const insertBeatDiscoveryScoreSchema = createInsertSchema(beatDiscoveryScores).omit({ id: true, createdAt: true });

// ============================================================================
// INSERT SCHEMAS FOR NEW TABLES (must be at end after all tables defined)
// ============================================================================
export const insertTakeGroupSchema = createInsertSchema(takeGroups).omit({ id: true, createdAt: true });
export const insertPluginPresetSchema = createInsertSchema(pluginPresets).omit({ id: true, createdAt: true });
export const insertStudioTrackSchema = createInsertSchema(studioTracks).omit({ id: true, createdAt: true });
export const insertWorkspaceInvitationSchema = createInsertSchema(workspaceInvitations).omit({ id: true, createdAt: true });
export const insertAlertRuleSchema = createInsertSchema(alertRules).omit({ id: true, createdAt: true });
export const insertPlaylistAttributionSchema = createInsertSchema(playlistAttributions).omit({ id: true, createdAt: true });
export const insertEmailMessageSchema = createInsertSchema(emailMessages).omit({ id: true, createdAt: true });
export const insertTakeLaneSchema = createInsertSchema(takeLanes).omit({ id: true, createdAt: true });
export const insertWorkspaceMemberSchema = createInsertSchema(workspaceMembers).omit({ id: true, createdAt: true });
export const insertSystemMetricSchema = createInsertSchema(systemMetrics).omit({ id: true, createdAt: true });
export const insertListenerCohortSchema = createInsertSchema(listenerCohorts).omit({ id: true, createdAt: true });
export const insertSocialAccountSchema = createInsertSchema(socialAccounts).omit({ id: true, createdAt: true });
export const insertTakeSegmentSchema = createInsertSchema(takeSegments).omit({ id: true, createdAt: true });
export const insertWorkspaceRoleSchema = createInsertSchema(workspaceRoles).omit({ id: true, createdAt: true });
export const insertRevenueForecastSchema = createInsertSchema(revenueForecasts).omit({ id: true, createdAt: true });
export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({ id: true, createdAt: true });
export const insertApprovalRequestSchema = createInsertSchema(approvalRequests).omit({ id: true, createdAt: true });
export const insertApprovalStepSchema = createInsertSchema(approvalSteps).omit({ id: true, createdAt: true });
export const insertApprovalWorkflowSchema = createInsertSchema(approvalWorkflows).omit({ id: true, createdAt: true });
export const insertSsoConfigSchema = createInsertSchema(ssoConfigs).omit({ id: true, createdAt: true });
