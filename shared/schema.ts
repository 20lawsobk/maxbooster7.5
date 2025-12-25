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
  bio: text("bio"),
  website: text("website"),
  location: text("location"),
  socialLinks: jsonb("social_links"),
  role: text("role").default("user"),
  subscriptionTier: text("subscription_tier"),
  subscriptionStatus: text("subscription_status"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeConnectedAccountId: text("stripe_connected_account_id"),
  subscriptionEndsAt: timestamp("subscription_ends_at"),
  trialEndsAt: timestamp("trial_ends_at"),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  onboardingStep: integer("onboarding_step").default(0),
  onboardingData: jsonb("onboarding_data"),
  preferences: jsonb("preferences"),
  notificationSettings: jsonb("notification_settings"),
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
// SESSIONS
// ============================================================================
export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  sessionToken: text("session_token").unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  lastActivity: timestamp("last_activity").defaultNow(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true, createdAt: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

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
// SUPPORT TICKETS
// ============================================================================
export const supportTickets = pgTable("support_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  subject: text("subject").notNull(),
  description: text("description"),
  status: text("status").default("open"),
  priority: text("priority").default("medium"),
  category: text("category").default("general"),
  assignedTo: varchar("assigned_to"),
  responseTimeMinutes: integer("response_time_minutes"),
  satisfactionRating: integer("satisfaction_rating"),
  metadata: jsonb("metadata"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = typeof supportTickets.$inferInsert;
export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({ id: true, createdAt: true, updatedAt: true });

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
// PLATFORM API CONFIGS
// ============================================================================
export const platformApiConfigs = pgTable("platform_api_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  platform: text("platform").notNull().unique(),
  displayName: text("display_name").notNull(),
  category: text("category").notNull(),
  authType: text("auth_type").notNull(),
  callbackUrl: text("callback_url"),
  authorizationUrl: text("authorization_url"),
  tokenUrl: text("token_url"),
  scopes: text("scopes").array(),
  requiredEnvVars: text("required_env_vars").array(),
  consoleUrl: text("console_url"),
  setupInstructions: text("setup_instructions"),
  webhookUrl: text("webhook_url"),
  webhookEvents: text("webhook_events").array(),
  isConfigured: boolean("is_configured").default(false),
  isActive: boolean("is_active").default(true),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export type PlatformApiConfig = typeof platformApiConfigs.$inferSelect;

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
// USER STORAGE (Pocket Dimension - Per-user cloud storage space)
// ============================================================================
export const userStorage = pgTable("user_storage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  storagePrefix: text("storage_prefix").notNull(),
  totalBytes: bigint("total_bytes", { mode: "number" }).default(0),
  fileCount: integer("file_count").default(0),
  quotaBytes: bigint("quota_bytes", { mode: "number" }).default(5368709120),
  isActive: boolean("is_active").default(true),
  lastAccessedAt: timestamp("last_accessed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type UserStorage = typeof userStorage.$inferSelect;
export const insertUserStorageSchema = createInsertSchema(userStorage).omit({ id: true, createdAt: true });

// ============================================================================
// USER STORAGE FILES (Individual files in pocket dimension)
// ============================================================================
export const userStorageFiles = pgTable("user_storage_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  storageId: varchar("storage_id").notNull(),
  fileName: text("file_name").notNull(),
  fileKey: text("file_key").notNull().unique(),
  mimeType: text("mime_type"),
  sizeBytes: bigint("size_bytes", { mode: "number" }).default(0),
  folder: text("folder").default("/"),
  isPublic: boolean("is_public").default(false),
  metadata: jsonb("metadata"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type UserStorageFile = typeof userStorageFiles.$inferSelect;
export const insertUserStorageFileSchema = createInsertSchema(userStorageFiles).omit({ id: true, createdAt: true });

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
// PLAYLIST JOURNEYS (Track playlist progression over time)
// ============================================================================
export const playlistJourneys = pgTable("playlist_journeys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  trackId: varchar("track_id").notNull(),
  playlistId: text("playlist_id").notNull(),
  playlistName: text("playlist_name").notNull(),
  platform: text("platform").notNull(),
  playlistType: text("playlist_type").default("editorial"),
  followerCount: integer("follower_count").default(0),
  position: integer("position"),
  previousPosition: integer("previous_position"),
  addedAt: timestamp("added_at").notNull(),
  removedAt: timestamp("removed_at"),
  streamsFromPlaylist: integer("streams_from_playlist").default(0),
  revenueFromPlaylist: real("revenue_from_playlist").default(0),
  daysOnPlaylist: integer("days_on_playlist").default(0),
  peakPosition: integer("peak_position"),
  curatorName: text("curator_name"),
  curatorId: text("curator_id"),
  isActive: boolean("is_active").default(true),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type PlaylistJourney = typeof playlistJourneys.$inferSelect;
export const insertPlaylistJourneySchema = createInsertSchema(playlistJourneys).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlaylistJourney = typeof playlistJourneys.$inferInsert;

// ============================================================================
// SYNC PLACEMENTS (TV/Movie/Ads sync tracking)
// ============================================================================
export const syncPlacements = pgTable("sync_placements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  trackId: varchar("track_id").notNull(),
  trackTitle: text("track_title").notNull(),
  placementType: text("placement_type").notNull(),
  mediaTitle: text("media_title").notNull(),
  mediaType: text("media_type").notNull(),
  network: text("network"),
  season: integer("season"),
  episode: integer("episode"),
  airDate: timestamp("air_date"),
  duration: integer("duration"),
  placement: text("placement"),
  licenseFee: real("license_fee"),
  territory: text("territory").default("worldwide"),
  exclusivity: text("exclusivity"),
  streamsBefore: integer("streams_before").default(0),
  streamsAfter: integer("streams_after").default(0),
  streamLift: real("stream_lift").default(0),
  revenueBefore: real("revenue_before").default(0),
  revenueAfter: real("revenue_after").default(0),
  revenueLift: real("revenue_lift").default(0),
  shazamsBefore: integer("shazams_before").default(0),
  shazamsAfter: integer("shazams_after").default(0),
  impactScore: real("impact_score").default(0),
  licensingAgency: text("licensing_agency"),
  musicSupervisor: text("music_supervisor"),
  verificationStatus: text("verification_status").default("pending"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type SyncPlacement = typeof syncPlacements.$inferSelect;
export const insertSyncPlacementSchema = createInsertSchema(syncPlacements).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSyncPlacement = typeof syncPlacements.$inferInsert;

// ============================================================================
// HISTORICAL ANALYTICS (Long-term data storage for YoY comparisons)
// ============================================================================
export const historicalAnalytics = pgTable("historical_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  trackId: varchar("track_id"),
  releaseId: varchar("release_id"),
  date: date("date").notNull(),
  period: text("period").notNull(),
  platform: text("platform"),
  streams: bigint("streams", { mode: "number" }).default(0),
  listeners: integer("listeners").default(0),
  followers: integer("followers").default(0),
  revenue: real("revenue").default(0),
  saves: integer("saves").default(0),
  shares: integer("shares").default(0),
  playlistAdds: integer("playlist_adds").default(0),
  playlistReach: integer("playlist_reach").default(0),
  shazams: integer("shazams").default(0),
  radioSpins: integer("radio_spins").default(0),
  youtubeViews: integer("youtube_views").default(0),
  socialMentions: integer("social_mentions").default(0),
  globalRank: integer("global_rank"),
  genreRank: integer("genre_rank"),
  countryRank: integer("country_rank"),
  maxScore: real("max_score"),
  milestones: jsonb("milestones"),
  demographicsSnapshot: jsonb("demographics_snapshot"),
  geographySnapshot: jsonb("geography_snapshot"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type HistoricalAnalytic = typeof historicalAnalytics.$inferSelect;
export const insertHistoricalAnalyticSchema = createInsertSchema(historicalAnalytics).omit({ id: true, createdAt: true });
export type InsertHistoricalAnalytic = typeof historicalAnalytics.$inferInsert;

// ============================================================================
// A&R DISCOVERIES (AI-powered talent discovery and scoring)
// ============================================================================
export const arDiscoveries = pgTable("ar_discoveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artistId: varchar("artist_id").notNull(),
  artistName: text("artist_name").notNull(),
  discoveredByUserId: varchar("discovered_by_user_id"),
  discoveryDate: timestamp("discovery_date").defaultNow(),
  genre: text("genre"),
  subGenres: text("sub_genres").array(),
  location: text("location"),
  country: text("country"),
  overallScore: real("overall_score").default(0),
  growthScore: real("growth_score").default(0),
  engagementScore: real("engagement_score").default(0),
  virality: real("virality_score").default(0),
  audienceQualityScore: real("audience_quality_score").default(0),
  playlistPotentialScore: real("playlist_potential_score").default(0),
  syncPotentialScore: real("sync_potential_score").default(0),
  signingPotentialScore: real("signing_potential_score").default(0),
  monthlyListeners: integer("monthly_listeners").default(0),
  monthlyListenersGrowth: real("monthly_listeners_growth").default(0),
  followerCount: integer("follower_count").default(0),
  followerGrowth: real("follower_growth").default(0),
  totalStreams: bigint("total_streams", { mode: "number" }).default(0),
  avgStreamsPerTrack: integer("avg_streams_per_track").default(0),
  playlistCount: integer("playlist_count").default(0),
  editorialPlaylistCount: integer("editorial_playlist_count").default(0),
  socialFollowers: integer("social_followers").default(0),
  socialEngagementRate: real("social_engagement_rate").default(0),
  topMarkets: jsonb("top_markets"),
  audienceDemographics: jsonb("audience_demographics"),
  similarArtists: text("similar_artists").array(),
  breakoutTracks: jsonb("breakout_tracks"),
  growthTrajectory: text("growth_trajectory"),
  predictedPeakDate: timestamp("predicted_peak_date"),
  riskFactors: jsonb("risk_factors"),
  strengthFactors: jsonb("strength_factors"),
  recommendedActions: jsonb("recommended_actions"),
  isWatching: boolean("is_watching").default(false),
  isSigned: boolean("is_signed").default(false),
  notes: text("notes"),
  status: text("status").default("discovered"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type ArDiscovery = typeof arDiscoveries.$inferSelect;
export const insertArDiscoverySchema = createInsertSchema(arDiscoveries).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertArDiscovery = typeof arDiscoveries.$inferInsert;

// ============================================================================
// PLATFORM DATA SOURCES (25+ platforms tracking)
// ============================================================================
export const platformDataSources = pgTable("platform_data_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  trackId: varchar("track_id"),
  date: timestamp("date").notNull().defaultNow(),
  platform: text("platform").notNull(),
  shazamCount: integer("shazam_count").default(0),
  shazamRank: integer("shazam_rank"),
  radioSpins: integer("radio_spins").default(0),
  radioAudience: integer("radio_audience").default(0),
  radioStations: integer("radio_stations").default(0),
  wikipediaPageViews: integer("wikipedia_page_views").default(0),
  beatportRank: integer("beatport_rank"),
  beatportSales: integer("beatport_sales").default(0),
  bandsinTownFollowers: integer("bandsintown_followers").default(0),
  upcomingShows: integer("upcoming_shows").default(0),
  songkickFollowers: integer("songkick_followers").default(0),
  qqMusicPlays: integer("qq_music_plays").default(0),
  qqMusicFans: integer("qq_music_fans").default(0),
  tidalStreams: integer("tidal_streams").default(0),
  tidalFavorites: integer("tidal_favorites").default(0),
  pandoraSpins: integer("pandora_spins").default(0),
  pandoraStations: integer("pandora_stations").default(0),
  deezerStreams: integer("deezer_streams").default(0),
  deezerFans: integer("deezer_fans").default(0),
  soundcloudPlays: integer("soundcloud_plays").default(0),
  soundcloudLikes: integer("soundcloud_likes").default(0),
  soundcloudReposts: integer("soundcloud_reposts").default(0),
  audiomackPlays: integer("audiomack_plays").default(0),
  napsterStreams: integer("napster_streams").default(0),
  amazonMusicStreams: integer("amazon_music_streams").default(0),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type PlatformDataSource = typeof platformDataSources.$inferSelect;
export const insertPlatformDataSourceSchema = createInsertSchema(platformDataSources).omit({ id: true, createdAt: true });
export type InsertPlatformDataSource = typeof platformDataSources.$inferInsert;

// ============================================================================
// GLOBAL RANKINGS (Unified ranking system)
// ============================================================================
export const globalRankings = pgTable("global_rankings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  artistId: varchar("artist_id"),
  trackId: varchar("track_id"),
  date: date("date").notNull(),
  maxScore: real("max_score").default(0),
  globalRank: integer("global_rank"),
  genreRank: integer("genre_rank"),
  countryRank: integer("country_rank"),
  genre: text("genre"),
  country: text("country"),
  platformScores: jsonb("platform_scores"),
  streamingScore: real("streaming_score").default(0),
  socialScore: real("social_score").default(0),
  playlistScore: real("playlist_score").default(0),
  shazamScore: real("shazam_score").default(0),
  radioScore: real("radio_score").default(0),
  viralScore: real("viral_score").default(0),
  growthRate: real("growth_rate").default(0),
  previousRank: integer("previous_rank"),
  rankChange: integer("rank_change").default(0),
  peakRank: integer("peak_rank"),
  weeksOnChart: integer("weeks_on_chart").default(0),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type GlobalRanking = typeof globalRankings.$inferSelect;
export const insertGlobalRankingSchema = createInsertSchema(globalRankings).omit({ id: true, createdAt: true });
export type InsertGlobalRanking = typeof globalRankings.$inferInsert;

// ============================================================================
// NLP QUERY LOGS (Track natural language queries)
// ============================================================================
export const nlpQueryLogs = pgTable("nlp_query_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  query: text("query").notNull(),
  parsedIntent: text("parsed_intent"),
  parsedEntities: jsonb("parsed_entities"),
  responseType: text("response_type"),
  responseData: jsonb("response_data"),
  executionTimeMs: integer("execution_time_ms"),
  wasSuccessful: boolean("was_successful").default(true),
  errorMessage: text("error_message"),
  feedback: text("feedback"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type NlpQueryLog = typeof nlpQueryLogs.$inferSelect;
export const insertNlpQueryLogSchema = createInsertSchema(nlpQueryLogs).omit({ id: true, createdAt: true });
export type InsertNlpQueryLog = typeof nlpQueryLogs.$inferInsert;

// ============================================================================
// PROMOTIONAL TOOLS (Pre-save pages, Promo Cards, Spotify Canvas, Lyrics Sync)
// ============================================================================
export const preSavePages = pgTable("pre_save_pages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull(),
  userId: varchar("user_id").notNull(),
  slug: text("slug").unique().notNull(),
  title: text("title").notNull(),
  artistName: text("artist_name").notNull(),
  coverArtUrl: text("cover_art_url"),
  releaseDate: timestamp("release_date"),
  description: text("description"),
  backgroundColor: text("background_color").default("#1a1a2e"),
  textColor: text("text_color").default("#ffffff"),
  buttonColor: text("button_color").default("#4ecdc4"),
  spotifyPreSaveUrl: text("spotify_presave_url"),
  appleMusicPreAddUrl: text("apple_music_preadd_url"),
  deezerPreSaveUrl: text("deezer_presave_url"),
  amazonMusicUrl: text("amazon_music_url"),
  youtubeUrl: text("youtube_url"),
  tidalUrl: text("tidal_url"),
  socialLinks: jsonb("social_links"),
  customLinks: jsonb("custom_links"),
  emailCapture: boolean("email_capture").default(true),
  emailList: jsonb("email_list").default([]),
  views: integer("views").default(0),
  preSaves: integer("pre_saves").default(0),
  emailSignups: integer("email_signups").default(0),
  clicksByPlatform: jsonb("clicks_by_platform").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type PreSavePage = typeof preSavePages.$inferSelect;
export const insertPreSavePageSchema = createInsertSchema(preSavePages).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPreSavePage = typeof preSavePages.$inferInsert;

export const promoCards = pgTable("promo_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull(),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(),
  template: text("template").default("minimal"),
  coverArtUrl: text("cover_art_url"),
  artistName: text("artist_name").notNull(),
  trackTitle: text("track_title").notNull(),
  releaseDate: text("release_date"),
  customText: text("custom_text"),
  backgroundColor: text("background_color").default("#1a1a2e"),
  textColor: text("text_color").default("#ffffff"),
  accentColor: text("accent_color").default("#4ecdc4"),
  fontFamily: text("font_family").default("Inter"),
  generatedImageUrl: text("generated_image_url"),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type PromoCard = typeof promoCards.$inferSelect;
export const insertPromoCardSchema = createInsertSchema(promoCards).omit({ id: true, createdAt: true });
export type InsertPromoCard = typeof promoCards.$inferInsert;

export const miniVideos = pgTable("mini_videos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull(),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(),
  duration: integer("duration").default(15),
  aspectRatio: text("aspect_ratio").notNull(),
  coverArtUrl: text("cover_art_url"),
  audioPreviewUrl: text("audio_preview_url"),
  audioStartTime: real("audio_start_time").default(0),
  backgroundColor: text("background_color").default("#1a1a2e"),
  accentColor: text("accent_color").default("#4ecdc4"),
  textOverlay: text("text_overlay"),
  animationStyle: text("animation_style").default("wave"),
  generatedVideoUrl: text("generated_video_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type MiniVideo = typeof miniVideos.$inferSelect;
export const insertMiniVideoSchema = createInsertSchema(miniVideos).omit({ id: true, createdAt: true });
export type InsertMiniVideo = typeof miniVideos.$inferInsert;

export const spotifyCanvases = pgTable("spotify_canvases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull(),
  trackId: varchar("track_id").notNull(),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(),
  sourceUrl: text("source_url").notNull(),
  duration: integer("duration").default(8),
  loopPoint: real("loop_point").default(0),
  generatedCanvasUrl: text("generated_canvas_url"),
  status: text("status").default("draft"),
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SpotifyCanvas = typeof spotifyCanvases.$inferSelect;
export const insertSpotifyCanvasSchema = createInsertSchema(spotifyCanvases).omit({ id: true, createdAt: true });
export type InsertSpotifyCanvas = typeof spotifyCanvases.$inferInsert;

export const lyricsSyncs = pgTable("lyrics_syncs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trackId: varchar("track_id").notNull(),
  releaseId: varchar("release_id").notNull(),
  userId: varchar("user_id").notNull(),
  language: text("language").notNull(),
  lyrics: jsonb("lyrics").default([]),
  plainText: text("plain_text").notNull(),
  syncMethod: text("sync_method").default("manual"),
  status: text("status").default("draft"),
  platforms: jsonb("platforms").default(["spotify", "apple_music", "amazon_music", "youtube_music"]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type LyricsSync = typeof lyricsSyncs.$inferSelect;
export const insertLyricsSyncSchema = createInsertSchema(lyricsSyncs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLyricsSync = typeof lyricsSyncs.$inferInsert;

// ============================================================================
// ADVANCED ANALYTICS (Chartmetric-matching)
// ============================================================================
export const artistScores = pgTable("artist_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  date: date("date").notNull(),
  artistScore: real("artist_score").default(0),
  careerStage: text("career_stage").default("undiscovered"),
  streamingScore: real("streaming_score").default(0),
  socialScore: real("social_score").default(0),
  playlistScore: real("playlist_score").default(0),
  radioScore: real("radio_score").default(0),
  growthVelocity: real("growth_velocity").default(0),
  momentumScore: real("momentum_score").default(0),
  triggerCities: jsonb("trigger_cities"),
  breakoutMarkets: jsonb("breakout_markets"),
  audienceDemographics: jsonb("audience_demographics"),
  competitorBenchmark: jsonb("competitor_benchmark"),
  milestones: jsonb("milestones"),
  predictions: jsonb("predictions"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ArtistScore = typeof artistScores.$inferSelect;
export const insertArtistScoreSchema = createInsertSchema(artistScores).omit({ id: true, createdAt: true });
export type InsertArtistScore = typeof artistScores.$inferInsert;

// ============================================================================
// MARKETPLACE ENHANCEMENTS (BeatStars-matching)
// ============================================================================
export const marketplaceRecommendations = pgTable("marketplace_recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  listingId: varchar("listing_id"),
  recommendationType: text("recommendation_type").notNull(),
  score: real("score").default(0),
  reason: text("reason"),
  metadata: jsonb("metadata"),
  impressions: integer("impressions").default(0),
  clicks: integer("clicks").default(0),
  conversions: integer("conversions").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
});

export type MarketplaceRecommendation = typeof marketplaceRecommendations.$inferSelect;
export const insertMarketplaceRecommendationSchema = createInsertSchema(marketplaceRecommendations).omit({ id: true, createdAt: true });
export type InsertMarketplaceRecommendation = typeof marketplaceRecommendations.$inferInsert;

export const beatPromotions = pgTable("beat_promotions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  listingId: varchar("listing_id").notNull(),
  campaignType: text("campaign_type").notNull(),
  budget: real("budget").default(0),
  spent: real("spent").default(0),
  targetGenres: jsonb("target_genres"),
  targetCountries: jsonb("target_countries"),
  placement: text("placement"),
  impressions: integer("impressions").default(0),
  clicks: integer("clicks").default(0),
  conversions: integer("conversions").default(0),
  status: text("status").default("draft"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type BeatPromotion = typeof beatPromotions.$inferSelect;
export const insertBeatPromotionSchema = createInsertSchema(beatPromotions).omit({ id: true, createdAt: true });
export type InsertBeatPromotion = typeof beatPromotions.$inferInsert;

// ============================================================================
// SYSTEM SETTINGS (for platform-wide configurations)
// ============================================================================
export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: jsonb("value"),
  description: text("description"),
  updatedBy: varchar("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({ id: true, createdAt: true });
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;

// ============================================================================
// MODEL A - SOCIAL MEDIA AUTOPILOT TABLES
// ============================================================================

// Social Autopilot Content - Content posts with performance metrics
export const socialAutopilotContent = pgTable("social_autopilot_content", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(), // snippet, performance, bts, meme, story, lyric, reaction, educational
  format: text("format").notNull(), // text, image, short_video, long_video, audio
  trackUsed: varchar("track_used"),
  hookType: text("hook_type").notNull(), // emotional, controversial, pov, storytelling, flex, transformation, process
  tone: text("tone").notNull(), // sad, hype, romantic, angry, nostalgic, inspirational
  platform: text("platform").notNull(), // tiktok, instagram, youtube, twitter, facebook, threads
  postingTime: timestamp("posting_time"),
  lengthSeconds: integer("length_seconds"),
  performance: jsonb("performance"), // {views, likes, comments, shares, saves, profile_visits, follower_gain, music_actions}
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type SocialAutopilotContent = typeof socialAutopilotContent.$inferSelect;
export const insertSocialAutopilotContentSchema = createInsertSchema(socialAutopilotContent).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSocialAutopilotContent = z.infer<typeof insertSocialAutopilotContentSchema>;

// Fan Segments - Fan audience segments
export const fanSegments = pgTable("fan_segments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  tasteVector: jsonb("taste_vector"), // {artists: [], genres: [], moods: []}
  behavioralSignals: jsonb("behavioral_signals"), // {avg_watch_time, comment_frequency, save_rate, dm_intent_score}
  preferredContentPatterns: jsonb("preferred_content_patterns"), // array of pattern objects
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type FanSegment = typeof fanSegments.$inferSelect;
export const insertFanSegmentSchema = createInsertSchema(fanSegments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFanSegment = z.infer<typeof insertFanSegmentSchema>;

// Music Impact Metrics - MusicImpact scores per content
export const musicImpactMetrics = pgTable("music_impact_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  contentId: varchar("content_id").notNull(), // FK to socialAutopilotContent
  savesWeighted: real("saves_weighted").default(0),
  playlistAddsWeighted: real("playlist_adds_weighted").default(0),
  profileVisitsWeighted: real("profile_visits_weighted").default(0),
  followerGrowthWeighted: real("follower_growth_weighted").default(0),
  highIntentDmsWeighted: real("high_intent_dms_weighted").default(0),
  totalScore: real("total_score").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export type MusicImpactMetric = typeof musicImpactMetrics.$inferSelect;
export const insertMusicImpactMetricSchema = createInsertSchema(musicImpactMetrics).omit({ id: true, createdAt: true });
export type InsertMusicImpactMetric = z.infer<typeof insertMusicImpactMetricSchema>;

// Social Pattern Aggregates - Long-term pattern memory
export const socialPatternAggregates = pgTable("social_pattern_aggregates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  patternHash: text("pattern_hash").notNull(), // hash of hook_type, tone, format, track_used
  hookType: text("hook_type").notNull(),
  tone: text("tone").notNull(),
  format: text("format").notNull(),
  trackUsed: varchar("track_used"),
  totalPosts: integer("total_posts").default(0),
  totalImpact: real("total_impact").default(0),
  avgImpact: real("avg_impact").default(0),
  impactStd: real("impact_std").default(0),
  timeDecayFactor: real("time_decay_factor").default(1),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SocialPatternAggregate = typeof socialPatternAggregates.$inferSelect;
export const insertSocialPatternAggregateSchema = createInsertSchema(socialPatternAggregates).omit({ id: true, createdAt: true });
export type InsertSocialPatternAggregate = z.infer<typeof insertSocialPatternAggregateSchema>;

// ============================================================================
// MODEL B - ORGANIC ADVERTISING AUTOPILOT TABLES
// ============================================================================

// Organic Assets - Organic marketing assets
export const organicAssets = pgTable("organic_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(), // seo_article, youtube_video, playlist, creator_placement, ugc_challenge, blog_post, mini_app, tool
  topic: text("topic").notNull(),
  trackUsed: varchar("track_used"),
  intent: text("intent").notNull(), // discovery, education, emotional, niche, search
  creationCostHours: real("creation_cost_hours").default(0),
  distributionCost: real("distribution_cost").default(0),
  performance: jsonb("performance"), // {monthly_views, monthly_clickthrough, streaming_conversions, playlist_adds, email_signups, revenue_generated}
  decayCurve: jsonb("decay_curve"), // {half_life_days, stability_score}
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type OrganicAsset = typeof organicAssets.$inferSelect;
export const insertOrganicAssetSchema = createInsertSchema(organicAssets).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrganicAsset = z.infer<typeof insertOrganicAssetSchema>;

// Organic Channels - Distribution channels
export const organicChannels = pgTable("organic_channels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // search, community, creator, playlist, blog, social
  estimatedMonthlyReach: integer("estimated_monthly_reach").default(0),
  audienceQualityScore: real("audience_quality_score").default(0),
  efficiencyScore: real("efficiency_score").default(0),
  historicalPerformance: jsonb("historical_performance"), // {avg_streams_generated, avg_revenue_generated, avg_ltv_of_users}
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type OrganicChannel = typeof organicChannels.$inferSelect;
export const insertOrganicChannelSchema = createInsertSchema(organicChannels).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrganicChannel = z.infer<typeof insertOrganicChannelSchema>;

// Organic ROI Snapshots - ROI tracking per asset
export const organicRoiSnapshots = pgTable("organic_roi_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  assetId: varchar("asset_id").notNull(), // FK to organicAssets
  revenueOverPeriod: real("revenue_over_period").default(0),
  creationCost: real("creation_cost").default(0),
  distributionCost: real("distribution_cost").default(0),
  effectiveRoi: real("effective_roi").default(0),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type OrganicRoiSnapshot = typeof organicRoiSnapshots.$inferSelect;
export const insertOrganicRoiSnapshotSchema = createInsertSchema(organicRoiSnapshots).omit({ id: true, createdAt: true });
export type InsertOrganicRoiSnapshot = z.infer<typeof insertOrganicRoiSnapshotSchema>;

// Organic Asset Lifetime - Long-term asset memory
export const organicAssetLifetime = pgTable("organic_asset_lifetime", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  assetId: varchar("asset_id").notNull(), // FK to organicAssets
  lifetimeStreams: integer("lifetime_streams").default(0),
  lifetimeRevenue: real("lifetime_revenue").default(0),
  totalCreationCostHours: real("total_creation_cost_hours").default(0),
  totalDistributionCost: real("total_distribution_cost").default(0),
  effectiveRoi: real("effective_roi").default(0),
  firstSeen: timestamp("first_seen").defaultNow(),
  lastSeen: timestamp("last_seen").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type OrganicAssetLifetimeRecord = typeof organicAssetLifetime.$inferSelect;
export const insertOrganicAssetLifetimeSchema = createInsertSchema(organicAssetLifetime).omit({ id: true, createdAt: true });
export type InsertOrganicAssetLifetime = z.infer<typeof insertOrganicAssetLifetimeSchema>;

// ============================================================================
// BRIDGE LAYER - AUTOPILOT CROSS-INSIGHTS
// ============================================================================

// Autopilot Cross Insights - Cross-learning between autopilots
export const autopilotCrossInsights = pgTable("autopilot_cross_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  insightType: text("insight_type").notNull(), // social_to_organic, organic_to_social
  topHooks: jsonb("top_hooks"), // array of hook patterns with avg_music_impact
  topTracksByImpact: jsonb("top_tracks_by_impact"), // array of track_id with avg_impact
  generatedAt: timestamp("generated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type AutopilotCrossInsight = typeof autopilotCrossInsights.$inferSelect;
export const insertAutopilotCrossInsightSchema = createInsertSchema(autopilotCrossInsights).omit({ id: true, createdAt: true });
export type InsertAutopilotCrossInsight = z.infer<typeof insertAutopilotCrossInsightSchema>;

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
