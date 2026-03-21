import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, real, date, bigint, serial, index } from "drizzle-orm/pg-core";
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
  artistName: text("artist_name"),
  bio: text("bio"),
  website: text("website"),
  location: text("location"),
  avatarUrl: text("avatar_url"),
  profileImageUrl: text("profile_image_url"),
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
  twoFactorSecret: text("two_factor_secret"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  passwordResetToken: text("password_reset_token"),
  passwordResetExpires: timestamp("password_reset_expires"),
  googleId: text("google_id"),
  emailVerified: boolean("email_verified").default(false),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationExpires: timestamp("email_verification_expires"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  passwordResetTokenIdx: index("users_password_reset_token_idx").on(table.passwordResetToken),
  googleIdIdx: index("users_google_id_idx").on(table.googleId),
  stripeCustomerIdIdx: index("users_stripe_customer_id_idx").on(table.stripeCustomerId),
}));

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
  trusted: boolean("trusted").default(false),
  lastActivity: timestamp("last_activity").defaultNow(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("sessions_user_id_last_activity_idx").on(t.userId, t.lastActivity),
]);

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
}, (t) => [
  index("subscriptions_user_id_idx").on(t.userId),
]);

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
  workflowStage: text("workflow_stage").default("setup"),
  isStudioProject: boolean("is_studio_project").default(false),
  metadata: jsonb("metadata"),
  favorite: boolean("favorite").default(false),
  lastOpenedAt: timestamp("last_opened_at"),
  coverImageUrl: text("cover_image_url"),
  audioUrl: text("audio_url"),
  fileSize: integer("file_size"),
  duration: integer("duration"),
  tags: jsonb("tags").$type<string[]>(),
  timeSignature: text("time_signature").default("4/4"),
  sampleRate: integer("sample_rate").default(44100),
  bitDepth: integer("bit_depth").default(24),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

// ============================================================================
// STUDIO TEMPLATES
// ============================================================================
export const studioTemplates = pgTable("studio_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").default("user"),
  genre: text("genre"),
  bpm: integer("bpm").default(120),
  timeSignature: text("time_signature").default("4/4"),
  trackCount: integer("track_count").default(0),
  templateData: jsonb("template_data"),
  coverImageUrl: text("cover_image_url"),
  isBuiltIn: boolean("is_built_in").default(false),
  usageCount: integer("usage_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertStudioTemplateSchema = createInsertSchema(studioTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStudioTemplate = z.infer<typeof insertStudioTemplateSchema>;
export type StudioTemplate = typeof studioTemplates.$inferSelect;

// ============================================================================
// STUDIO RECENT FILES
// ============================================================================
export const studioRecentFiles = pgTable("studio_recent_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  projectId: varchar("project_id"),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileType: text("file_type").default("audio"),
  accessedAt: timestamp("accessed_at").defaultNow(),
  metadata: jsonb("metadata"),
});

export const insertStudioRecentFileSchema = createInsertSchema(studioRecentFiles).omit({ id: true, accessedAt: true });
export type InsertStudioRecentFile = z.infer<typeof insertStudioRecentFileSchema>;
export type StudioRecentFile = typeof studioRecentFiles.$inferSelect;

// ============================================================================
// STUDIO PINNED FOLDERS
// ============================================================================
export const studioPinnedFolders = pgTable("studio_pinned_folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  path: text("path").notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertStudioPinnedFolderSchema = createInsertSchema(studioPinnedFolders).omit({ id: true, createdAt: true });
export type InsertStudioPinnedFolder = z.infer<typeof insertStudioPinnedFolderSchema>;
export type StudioPinnedFolder = typeof studioPinnedFolders.$inferSelect;

// ============================================================================
// STUDIO PROJECTS (DAW Project State)
// ============================================================================
export const studioProjects = pgTable("studio_projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull().default("Untitled"),
  title: text("title"),
  description: text("description"),
  genre: text("genre"),
  bpm: integer("bpm").default(120),
  key: text("key"),
  timeSignature: text("time_signature").default("4/4"),
  sampleRate: integer("sample_rate").default(44100),
  bitDepth: integer("bit_depth").default(24),
  metadata: jsonb("metadata"),
  mixBusConfig: jsonb("mix_bus_config"),
  masterSettings: jsonb("master_settings"),
  automationData: jsonb("automation_data"),
  markerData: jsonb("marker_data"),
  isTemplate: boolean("is_template").default(false),
  templateId: varchar("template_id"),
  status: text("status").default("active"),
  lastSavedAt: timestamp("last_saved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertStudioProjectSchema = createInsertSchema(studioProjects).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStudioProject = z.infer<typeof insertStudioProjectSchema>;
export type StudioProject = typeof studioProjects.$inferSelect;

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
  subdomain: text("subdomain").unique(),
  customDomain: text("custom_domain").unique(),
  isSubdomainActive: boolean("is_subdomain_active").default(false),
  isCustomDomainActive: boolean("is_custom_domain_active").default(false),
  templateId: text("template_id"),
  customization: jsonb("customization"),
  seo: jsonb("seo"),
  isActive: boolean("is_active").default(true),
  isPublic: boolean("is_public").default(true),
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
// DNS RECORD CACHE (Built-in GoDaddy-style DNS zone management)
// ============================================================================
export const dnsRecordCache = pgTable("dns_record_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  storefrontId: varchar("storefront_id").notNull(),
  domain: text("domain").notNull(),
  provider: text("provider").notNull().default('godaddy'),
  recordType: text("record_type").notNull(),
  name: text("name").notNull(),
  value: text("value").notNull(),
  ttl: integer("ttl").default(3600),
  priority: integer("priority"),
  isLocal: boolean("is_local").default(false),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDnsRecordCacheSchema = createInsertSchema(dnsRecordCache).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDnsRecordCache = z.infer<typeof insertDnsRecordCacheSchema>;

// ============================================================================
// DNS TEMPLATES (Reusable DNS record configurations)
// ============================================================================
export const dnsTemplates = pgTable("dns_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  records: jsonb("records").notNull(),
  isGlobal: boolean("is_global").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDnsTemplateSchema = createInsertSchema(dnsTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDnsTemplate = z.infer<typeof insertDnsTemplateSchema>;

// ============================================================================
// DNS PROVIDER CREDENTIALS (per-user registrar API keys)
// ============================================================================
export const dnsProviderCredentials = pgTable("dns_provider_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  provider: text("provider").notNull(),
  domain: text("domain").notNull(),
  credentials: jsonb("credentials").notNull(),
  isVerified: boolean("is_verified").default(false),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDnsProviderCredentialsSchema = createInsertSchema(dnsProviderCredentials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDnsProviderCredentials = z.infer<typeof insertDnsProviderCredentialsSchema>;

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
  currentSubscribers: integer("current_subscribers").default(0),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  stripePriceId: text("stripe_price_id"),
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
  discountPercent: integer("discount_percent"),
  discountPriceCents: integer("discount_price_cents"),
  discountExpiresAt: timestamp("discount_expires_at"),
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
// LISTING LICENSE TIERS (Per-license pricing & discounts)
// ============================================================================
export const listingLicenseTiers = pgTable("listing_license_tiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  listingId: varchar("listing_id").notNull(),
  licenseType: text("license_type").notNull(),
  label: text("label"),
  priceCents: integer("price_cents").notNull(),
  discountType: text("discount_type").default("none"),
  discountPercent: integer("discount_percent"),
  discountPriceCents: integer("discount_price_cents"),
  discountExpiresAt: timestamp("discount_expires_at"),
  bogoEnabled: boolean("bogo_enabled").default(false),
  bogoGetType: text("bogo_get_type"),
  bogoGetPercent: integer("bogo_get_percent").default(100),
  fileFormats: text("file_formats").array(),
  audioUrls: jsonb("audio_urls"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type ListingLicenseTier = typeof listingLicenseTiers.$inferSelect;

// ============================================================================
// STOREFRONT SOCIAL (Follows, Likes, Ratings)
// ============================================================================
export const storefrontFollows = pgTable("storefront_follows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  storefrontId: varchar("storefront_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const storefrontLikes = pgTable("storefront_likes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  storefrontId: varchar("storefront_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const storefrontRatings = pgTable("storefront_ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  storefrontId: varchar("storefront_id").notNull(),
  rating: integer("rating").notNull(),
  review: text("review"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================================
// BEAT LIKES (Marketplace)
// ============================================================================
export const beatLikes = pgTable("beat_likes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  beatId: varchar("beat_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// LICENSE TEMPLATES (Marketplace)
// ============================================================================
export const licenseTemplates = pgTable("license_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull().default("basic"),
  priceCents: integer("price_cents").notNull().default(2999),
  streams: text("streams").default("100000"),
  copies: text("copies").default("5000"),
  musicVideos: text("music_videos").default("1"),
  duration: text("duration").default("1 year"),
  allowsBroadcast: boolean("allows_broadcast").default(false),
  allowsProfit: boolean("allows_profit").default(true),
  allowsSync: boolean("allows_sync").default(false),
  fileFormats: text("file_formats").default("MP3"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================================
// STOREFRONT ORDERS (Checkout)
// ============================================================================
export const storefrontOrders = pgTable("storefront_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  buyerId: varchar("buyer_id").notNull(),
  storefrontId: varchar("storefront_id").notNull(),
  sellerId: varchar("seller_id").notNull(),
  listingId: varchar("listing_id").notNull(),
  licenseType: text("license_type").default("basic"),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").default("usd"),
  status: text("status").default("pending"),
  stripeSessionId: text("stripe_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  appliedPromotionId: varchar("applied_promotion_id"),
  discountCents: integer("discount_cents").default(0),
  isFreeItem: boolean("is_free_item").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================================
// CONTRACT TEMPLATES (Marketplace)
// ============================================================================
export const contractTemplates = pgTable("contract_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  content: text("content").notNull(),
  category: text("category").default("custom"),
  variables: jsonb("variables").default([]),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertContractTemplateSchema = createInsertSchema(contractTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ============================================================================
// MARKETPLACE DISPUTES
// ============================================================================
export const marketplaceDisputes = pgTable("marketplace_disputes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull(),
  buyerId: varchar("buyer_id").notNull(),
  sellerId: varchar("seller_id").notNull(),
  disputeType: text("dispute_type").notNull(),
  status: text("status").default("open"),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  evidence: jsonb("evidence").$type<Array<{ type: string; url: string; uploadedAt: string; uploadedBy: string }>>().default([]),
  messages: jsonb("messages").$type<Array<{ from: string; message: string; sentAt: string; type: 'user' | 'system' | 'admin' }>>().default([]),
  resolution: jsonb("resolution").$type<{
    outcome: 'refund_full' | 'refund_partial' | 'no_refund' | 'license_reissued' | 'mutual_agreement';
    refundAmount?: number;
    explanation: string;
    resolvedBy: string;
    resolvedAt: string;
  } | null>(),
  escalatedAt: timestamp("escalated_at"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMarketplaceDisputeSchema = createInsertSchema(marketplaceDisputes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMarketplaceDispute = z.infer<typeof insertMarketplaceDisputeSchema>;
export type MarketplaceDispute = typeof marketplaceDisputes.$inferSelect;

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

export const storefrontsRelations = relations(storefronts, ({ one }) => ({
  template: one(storefrontTemplates, {
    fields: [storefronts.templateId],
    references: [storefrontTemplates.id],
  }),
}));

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
// PRE-SAVE CAMPAIGNS (Enhanced for production)
// ============================================================================
export const preSaveCampaigns = pgTable("pre_save_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  platforms: text("platforms").array(),
  status: text("status").default("active"),
  totalSaves: integer("total_saves").default(0),
  spotifySaves: integer("spotify_saves").default(0),
  appleMusicSaves: integer("apple_music_saves").default(0),
  deezerSaves: integer("deezer_saves").default(0),
  artwork: text("artwork"),
  landingPageUrl: text("landing_page_url"),
  collectEmails: boolean("collect_emails").default(true),
  emailSignups: integer("email_signups").default(0),
  targetSaves: integer("target_saves"),
  conversionRate: real("conversion_rate"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPreSaveCampaignSchema = createInsertSchema(preSaveCampaigns).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPreSaveCampaign = typeof preSaveCampaigns.$inferInsert;

// ============================================================================
// PRE-SAVE ENTRIES (Individual user saves)
// ============================================================================
export const preSaveEntries = pgTable("pre_save_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull(),
  platform: text("platform").notNull(),
  email: text("email"),
  spotifyUserId: text("spotify_user_id"),
  appleMusicUserId: text("apple_music_user_id"),
  deezerUserId: text("deezer_user_id"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  country: text("country"),
  city: text("city"),
  referer: text("referer"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPreSaveEntrySchema = createInsertSchema(preSaveEntries).omit({ id: true, createdAt: true });
export type PreSaveEntry = typeof preSaveEntries.$inferSelect;
export type InsertPreSaveEntry = typeof preSaveEntries.$inferInsert;

// ============================================================================
// DISTRIBUTION SLA METRICS (Production delivery tracking)
// ============================================================================
export const distributionSLAMetrics = pgTable("distribution_sla_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull(),
  platform: text("platform").notNull(),
  submittedAt: timestamp("submitted_at").notNull(),
  targetDeliveryAt: timestamp("target_delivery_at").notNull(),
  actualDeliveryAt: timestamp("actual_delivery_at"),
  liveAt: timestamp("live_at"),
  slaTargetHours: integer("sla_target_hours").default(48),
  actualDeliveryHours: real("actual_delivery_hours"),
  metSLA: boolean("met_sla"),
  status: text("status").default("pending"),
  deliveryPhase: text("delivery_phase").default("queued"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  lastRetryAt: timestamp("last_retry_at"),
  platformReleaseId: text("platform_release_id"),
  platformTrackingUrl: text("platform_tracking_url"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDistributionSLAMetricSchema = createInsertSchema(distributionSLAMetrics).omit({ id: true, createdAt: true, updatedAt: true });
export type DistributionSLAMetric = typeof distributionSLAMetrics.$inferSelect;
export type InsertDistributionSLAMetric = typeof distributionSLAMetrics.$inferInsert;

// ============================================================================
// CONTENT ID REGISTRATIONS (YouTube monetization)
// ============================================================================
export const contentIdRegistrations = pgTable("content_id_registrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull(),
  trackId: varchar("track_id").notNull(),
  userId: varchar("user_id").notNull(),
  isrc: text("isrc").notNull(),
  assetId: text("asset_id"),
  status: text("status").default("pending"),
  registrationType: text("registration_type").default("sound_recording"),
  ownershipPercentage: real("ownership_percentage").default(100),
  territories: text("territories").array(),
  matchPolicy: text("match_policy").default("monetize"),
  claimPolicy: text("claim_policy").default("monetize"),
  allowUserUploads: boolean("allow_user_uploads").default(false),
  youtubeChannelId: text("youtube_channel_id"),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  activeAt: timestamp("active_at"),
  totalClaims: integer("total_claims").default(0),
  totalRevenue: real("total_revenue").default(0),
  lastClaimAt: timestamp("last_claim_at"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertContentIdRegistrationSchema = createInsertSchema(contentIdRegistrations).omit({ id: true, createdAt: true, updatedAt: true });
export type ContentIdRegistration = typeof contentIdRegistrations.$inferSelect;
export type InsertContentIdRegistration = typeof contentIdRegistrations.$inferInsert;

// ============================================================================
// SYNC LICENSING (Film/TV/Ads licensing)
// ============================================================================
export const syncLicenses = pgTable("sync_licenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull(),
  trackId: varchar("track_id"),
  userId: varchar("user_id").notNull(),
  isAvailableForSync: boolean("is_available_for_sync").default(true),
  syncCategories: text("sync_categories").array(),
  exclusivityType: text("exclusivity_type").default("non_exclusive"),
  minimumFee: real("minimum_fee"),
  currency: text("currency").default("usd"),
  pricePerUse: real("price_per_use"),
  territories: text("territories").array(),
  usageTypes: text("usage_types").array(),
  mediaTypes: text("media_types").array(),
  duration: text("duration"),
  instrumentalAvailable: boolean("instrumental_available").default(false),
  instrumentalUrl: text("instrumental_url"),
  stemsAvailable: boolean("stems_available").default(false),
  stemsUrl: text("stems_url"),
  contactEmail: text("contact_email"),
  contactName: text("contact_name"),
  publisherName: text("publisher_name"),
  publisherIPI: text("publisher_ipi"),
  proAffiliation: text("pro_affiliation"),
  status: text("status").default("active"),
  totalInquiries: integer("total_inquiries").default(0),
  totalPlacements: integer("total_placements").default(0),
  totalRevenue: real("total_revenue").default(0),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSyncLicenseSchema = createInsertSchema(syncLicenses).omit({ id: true, createdAt: true, updatedAt: true });
export type SyncLicense = typeof syncLicenses.$inferSelect;
export type InsertSyncLicense = typeof syncLicenses.$inferInsert;

// ============================================================================
// SYNC LICENSE INQUIRIES
// ============================================================================
export const syncLicenseInquiries = pgTable("sync_license_inquiries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  syncLicenseId: varchar("sync_license_id").notNull(),
  userId: varchar("user_id"),
  inquirerName: text("inquirer_name").notNull(),
  inquirerEmail: text("inquirer_email").notNull(),
  inquirerCompany: text("inquirer_company"),
  projectType: text("project_type"),
  projectDescription: text("project_description"),
  proposedUsage: text("proposed_usage"),
  proposedFee: real("proposed_fee"),
  proposedTerritory: text("proposed_territory"),
  proposedDuration: text("proposed_duration"),
  status: text("status").default("pending"),
  respondedAt: timestamp("responded_at"),
  responseNotes: text("response_notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSyncLicenseInquirySchema = createInsertSchema(syncLicenseInquiries).omit({ id: true, createdAt: true });
export type SyncLicenseInquiry = typeof syncLicenseInquiries.$inferSelect;
export type InsertSyncLicenseInquiry = typeof syncLicenseInquiries.$inferInsert;

// ============================================================================
// ROYALTY SPLITS (Collaborator percentage allocations)
// ============================================================================
export const royaltySplits = pgTable("royalty_splits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull(),
  trackId: varchar("track_id"),
  userId: varchar("user_id"),
  collaboratorName: text("collaborator_name").notNull(),
  collaboratorEmail: text("collaborator_email").notNull(),
  role: text("role").notNull(),
  percentage: real("percentage").notNull(),
  payoutMethod: text("payout_method").default("platform"),
  stripeAccountId: text("stripe_account_id"),
  paypalEmail: text("paypal_email"),
  bankDetails: jsonb("bank_details"),
  status: text("status").default("pending"),
  inviteSentAt: timestamp("invite_sent_at"),
  inviteAcceptedAt: timestamp("invite_accepted_at"),
  verifiedAt: timestamp("verified_at"),
  totalEarned: real("total_earned").default(0),
  totalPaid: real("total_paid").default(0),
  pendingPayout: real("pending_payout").default(0),
  lastPayoutAt: timestamp("last_payout_at"),
  ipiNumber: text("ipi_number"),
  proAffiliation: text("pro_affiliation"),
  publisherName: text("publisher_name"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertRoyaltySplitSchema = createInsertSchema(royaltySplits).omit({ id: true, createdAt: true, updatedAt: true });
export type RoyaltySplit = typeof royaltySplits.$inferSelect;
export type InsertRoyaltySplit = typeof royaltySplits.$inferInsert;

// ============================================================================
// ROYALTY TRANSACTIONS (Payment history)
// ============================================================================
export const royaltyTransactions = pgTable("royalty_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  splitId: varchar("split_id").notNull(),
  releaseId: varchar("release_id").notNull(),
  userId: varchar("user_id"),
  amount: real("amount").notNull(),
  currency: text("currency").default("usd"),
  transactionType: text("transaction_type").notNull(),
  platform: text("platform"),
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  streamCount: integer("stream_count"),
  status: text("status").default("pending"),
  stripeTransferId: text("stripe_transfer_id"),
  paypalTransactionId: text("paypal_transaction_id"),
  paidAt: timestamp("paid_at"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("royalty_transactions_user_id_idx").on(table.userId),
  createdAtIdx: index("royalty_transactions_created_at_idx").on(table.createdAt),
  platformIdx: index("royalty_transactions_platform_idx").on(table.platform),
}));

export const insertRoyaltyTransactionSchema = createInsertSchema(royaltyTransactions).omit({ id: true, createdAt: true });
export type RoyaltyTransaction = typeof royaltyTransactions.$inferSelect;
export type InsertRoyaltyTransaction = typeof royaltyTransactions.$inferInsert;

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
  riskScore: real("risk_score"),
  riskFlags: jsonb("risk_flags"),
  failureReason: text("failure_reason"),
  metadata: jsonb("metadata"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// REFUNDS (Payment Refund Tracking)
// ============================================================================
export const refunds = pgTable("refunds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull(),
  userId: varchar("user_id").notNull(),
  sellerId: varchar("seller_id"),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: text("currency").default("usd"),
  reason: text("reason"),
  status: text("status").default("pending"),
  stripeRefundId: text("stripe_refund_id"),
  stripeChargeId: text("stripe_charge_id"),
  initiatedBy: text("initiated_by"),
  refundType: text("refund_type").default("full"),
  failureReason: text("failure_reason"),
  metadata: jsonb("metadata"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Refund = typeof refunds.$inferSelect;
export type InsertRefund = typeof refunds.$inferInsert;
export const insertRefundSchema = createInsertSchema(refunds).omit({ id: true, createdAt: true });

// ============================================================================
// LEDGER ENTRIES (Financial Audit Trail)
// ============================================================================
export const ledgerEntries = pgTable("ledger_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  entryType: text("entry_type").notNull(),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: text("currency").default("usd"),
  balanceAfterCents: bigint("balance_after_cents", { mode: "number" }),
  referenceType: text("reference_type"),
  referenceId: varchar("reference_id"),
  description: text("description"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type InsertLedgerEntry = typeof ledgerEntries.$inferInsert;
export const insertLedgerEntrySchema = createInsertSchema(ledgerEntries).omit({ id: true, createdAt: true });

// ============================================================================
// TAX FORMS (1099, W-9, etc.)
// ============================================================================
export const taxForms = pgTable("tax_forms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  formType: text("form_type").notNull(),
  taxYear: integer("tax_year").notNull(),
  totalEarningsCents: bigint("total_earnings_cents", { mode: "number" }).default(0),
  status: text("status").default("pending"),
  formData: jsonb("form_data"),
  pdfUrl: text("pdf_url"),
  submittedAt: timestamp("submitted_at"),
  generatedAt: timestamp("generated_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type TaxForm = typeof taxForms.$inferSelect;
export type InsertTaxForm = typeof taxForms.$inferInsert;
export const insertTaxFormSchema = createInsertSchema(taxForms).omit({ id: true, createdAt: true });

// ============================================================================
// ROYALTY STATEMENTS
// ============================================================================
export const royaltyStatements = pgTable("royalty_statements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  label: text("label"),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  totalEarnings: text("total_earnings").default("0"),
  status: text("status").default("available"),
  downloadUrl: text("download_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type RoyaltyStatement = typeof royaltyStatements.$inferSelect;
export type InsertRoyaltyStatement = typeof royaltyStatements.$inferInsert;

// ============================================================================
// ROYALTY DISPUTES
// ============================================================================
export const royaltyDisputes = pgTable("royalty_disputes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(),
  status: text("status").default("open"),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  amount: text("amount"),
  period: text("period"),
  resolution: text("resolution"),
  outcome: text("outcome"),
  evidenceCount: integer("evidence_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type RoyaltyDispute = typeof royaltyDisputes.$inferSelect;
export type InsertRoyaltyDispute = typeof royaltyDisputes.$inferInsert;

// ============================================================================
// DISPUTE MESSAGES
// ============================================================================
export const disputeMessages = pgTable("dispute_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  disputeId: varchar("dispute_id").notNull(),
  sender: text("sender").notNull(),
  content: text("content").notNull(),
  attachments: jsonb("attachments"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type DisputeMessage = typeof disputeMessages.$inferSelect;
export type InsertDisputeMessage = typeof disputeMessages.$inferInsert;

// ============================================================================
// INVOICES (Persistent Invoice Storage)
// ============================================================================
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: text("invoice_number").notNull().unique(),
  userId: varchar("user_id").notNull(),
  invoiceType: text("invoice_type").default("sale"),
  status: text("status").default("draft"),
  fromAddress: jsonb("from_address"),
  toAddress: jsonb("to_address"),
  lineItems: jsonb("line_items"),
  subtotalCents: bigint("subtotal_cents", { mode: "number" }).default(0),
  taxCents: bigint("tax_cents", { mode: "number" }).default(0),
  discountCents: bigint("discount_cents", { mode: "number" }).default(0),
  totalCents: bigint("total_cents", { mode: "number" }).default(0),
  currency: text("currency").default("usd"),
  dueDate: timestamp("due_date"),
  paidAt: timestamp("paid_at"),
  paymentMethod: text("payment_method"),
  stripeInvoiceId: text("stripe_invoice_id"),
  pdfUrl: text("pdf_url"),
  notes: text("notes"),
  terms: text("terms"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true, updatedAt: true });

// ============================================================================
// SPLIT PAYMENTS (Collaborator Payment Tracking)
// ============================================================================
export const splitPayments = pgTable("split_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull(),
  userId: varchar("user_id").notNull(),
  collaboratorId: varchar("collaborator_id").notNull(),
  percentage: real("percentage").notNull(),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: text("currency").default("usd"),
  status: text("status").default("pending"),
  stripeTransferId: text("stripe_transfer_id"),
  failureReason: text("failure_reason"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SplitPayment = typeof splitPayments.$inferSelect;
export type InsertSplitPayment = typeof splitPayments.$inferInsert;
export const insertSplitPaymentSchema = createInsertSchema(splitPayments).omit({ id: true, createdAt: true });

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
// PUSH SUBSCRIPTIONS (Web Push Notifications)
// ============================================================================
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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
  changes: jsonb("changes"),
  previousValues: jsonb("previous_values"),
  newValues: jsonb("new_values"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkspaceAuditLogSchema = createInsertSchema(workspaceAuditLog).omit({ id: true, createdAt: true });
export type InsertWorkspaceAuditLog = z.infer<typeof insertWorkspaceAuditLogSchema>;

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
  userId: varchar("user_id"),
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
// Note: Project type is already exported near projects table definition
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
  licenseType: text("license_type").default("basic"),
  licenseSnapshot: jsonb("license_snapshot"),
  licenseDocumentUrl: text("license_document_url"),
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
  projectId: varchar("project_id"),
  items: jsonb("items"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkspaceCatalogSchema = createInsertSchema(workspaceCatalogs).omit({ id: true, createdAt: true });
export type InsertWorkspaceCatalog = z.infer<typeof insertWorkspaceCatalogSchema>;
export type WorkspaceCatalog = typeof workspaceCatalogs.$inferSelect;

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
// DSP USER PLATFORM SYNC STATUS (per-user, per-platform OAuth tracking)
// ============================================================================
export const dspUserPlatformStatus = pgTable("dsp_user_platform_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  platform: text("platform").notNull(),
  syncStatus: text("sync_status").default("pending"),
  lastSyncAt: timestamp("last_sync_at"),
  lastSuccessAt: timestamp("last_success_at"),
  credentials: jsonb("credentials"),
  errorMessage: text("error_message"),
  errorCount: integer("error_count").default(0),
  dataRangeStart: timestamp("data_range_start"),
  dataRangeEnd: timestamp("data_range_end"),
  recordsProcessed: integer("records_processed").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  userPlatformIdx: index("dsp_user_platform_status_user_platform_idx").on(t.userId, t.platform),
}));

export type DspUserPlatformStatus = typeof dspUserPlatformStatus.$inferSelect;
export type InsertDspUserPlatformStatus = typeof dspUserPlatformStatus.$inferInsert;

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
  roleId: varchar("role_id"),
  invitedBy: varchar("invited_by").notNull(),
  status: text("status").default("pending"),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  acceptedByUserId: varchar("accepted_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkspaceInvitationSchema = createInsertSchema(workspaceInvitations).omit({ id: true, createdAt: true });
export type InsertWorkspaceInvitation = z.infer<typeof insertWorkspaceInvitationSchema>;
export type WorkspaceInvitation = typeof workspaceInvitations.$inferSelect;

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
  userId: varchar("user_id").notNull(),
  releaseId: varchar("release_id"),
  trackId: varchar("track_id"),
  playlistId: text("playlist_id").notNull(),
  playlistName: text("playlist_name").notNull(),
  playlistType: text("playlist_type").notNull(),
  platform: text("platform").notNull(),
  addedDate: timestamp("added_date"),
  removedDate: timestamp("removed_date"),
  streams: integer("streams").default(0),
  listeners: integer("listeners").default(0),
  saves: integer("saves").default(0),
  revenue: text("revenue"),
  position: integer("position"),
  followerCount: integer("follower_count").default(0),
  curatorName: text("curator_name"),
  isActive: boolean("is_active").default(true),
  pitchStatus: text("pitch_status"),
  pitchDate: timestamp("pitch_date"),
  pitchResponse: text("pitch_response"),
  lastUpdated: timestamp("last_updated"),
  updatedAt: timestamp("updated_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPlaylistAttributionSchema = createInsertSchema(playlistAttributions).omit({ id: true, createdAt: true });
export type InsertPlaylistAttribution = z.infer<typeof insertPlaylistAttributionSchema>;

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
  roleId: varchar("role_id"),
  status: text("status").default("active"),
  lastActiveAt: timestamp("last_active_at"),
  joinedAt: timestamp("joined_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkspaceMemberSchema = createInsertSchema(workspaceMembers).omit({ id: true, createdAt: true });
export type InsertWorkspaceMember = z.infer<typeof insertWorkspaceMemberSchema>;

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
  forecastDate: timestamp("forecast_date").defaultNow(),
  forecastType: text("forecast_type").notNull(),
  period: text("period").notNull(),
  projectedStreams: integer("projected_streams"),
  projectedRevenue: real("projected_revenue"),
  projectedRoyalties: real("projected_royalties"),
  predictedRevenue: real("predicted_revenue"),
  confidence: real("confidence"),
  confidenceLevel: real("confidence_level"),
  confidenceLow: real("confidence_low"),
  confidenceHigh: real("confidence_high"),
  methodology: text("methodology"),
  factors: jsonb("factors"),
  actualRevenue: real("actual_revenue"),
  actualStreams: integer("actual_streams"),
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
  slug: text("slug").unique(),
  ownerId: varchar("owner_id").notNull(),
  description: text("description"),
  logoUrl: text("logo_url"),
  isActive: boolean("is_active").default(true),
  settings: jsonb("settings"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({ id: true, createdAt: true });
export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
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
}, (table) => ({
  modelTypeIdx: index("ai_models_model_type_idx").on(table.modelType),
  statusIdx: index("ai_models_status_idx").on(table.status),
}));

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
  deletedAt: timestamp("deleted_at"),
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
// BOGO PROMOTIONS (Buy X Get Y deals for storefronts)
// ============================================================================
export const bogoPromotions = pgTable("bogo_promotions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  storefrontId: varchar("storefront_id").notNull(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  promoType: text("promo_type").notNull().default("buy_x_get_y_free"),
  buyQuantity: integer("buy_quantity").notNull().default(1),
  getQuantity: integer("get_quantity").notNull().default(1),
  getDiscountPercent: integer("get_discount_percent").notNull().default(100),
  appliesTo: text("applies_to").notNull().default("all"),
  applicableListingIds: jsonb("applicable_listing_ids").$type<string[]>().default([]),
  applicableGenres: jsonb("applicable_genres").$type<string[]>().default([]),
  buyLicenseType: text("buy_license_type"),
  bogoLicenseType: text("bogo_license_type"),
  maxRedemptions: integer("max_redemptions"),
  redemptionCount: integer("redemption_count").default(0),
  perCustomerLimit: integer("per_customer_limit"),
  stackable: boolean("stackable").default(false),
  priority: integer("priority").default(0),
  status: text("status").notNull().default("active"),
  startAt: timestamp("start_at"),
  endAt: timestamp("end_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type BogoPromotion = typeof bogoPromotions.$inferSelect;
export const insertBogoPromotionSchema = createInsertSchema(bogoPromotions).omit({ id: true, createdAt: true, updatedAt: true, redemptionCount: true });
export type InsertBogoPromotion = typeof bogoPromotions.$inferInsert;

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
// SOCIAL LISTENING - Brand mentions and sentiment tracking
// ============================================================================
export const socialMentions = pgTable("social_mentions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  platform: text("platform").notNull(),
  author: text("author"),
  authorHandle: text("author_handle"),
  authorAvatar: text("author_avatar"),
  authorFollowers: integer("author_followers").default(0),
  content: text("content"),
  sentiment: text("sentiment").default("neutral"),
  sentimentScore: real("sentiment_score").default(0),
  keywords: jsonb("keywords"),
  reach: integer("reach").default(0),
  engagement: integer("engagement").default(0),
  url: text("url"),
  isInfluencer: boolean("is_influencer").default(false),
  responded: boolean("responded").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SocialMention = typeof socialMentions.$inferSelect;
export const insertSocialMentionSchema = createInsertSchema(socialMentions).omit({ id: true, createdAt: true });
export type InsertSocialMention = z.infer<typeof insertSocialMentionSchema>;

// ============================================================================
// SOCIAL KEYWORDS - Tracked keywords for social listening
// ============================================================================
export const socialKeywords = pgTable("social_keywords", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  keyword: text("keyword").notNull(),
  isActive: boolean("is_active").default(true),
  mentionCount: integer("mention_count").default(0),
  lastMentionAt: timestamp("last_mention_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SocialKeyword = typeof socialKeywords.$inferSelect;
export const insertSocialKeywordSchema = createInsertSchema(socialKeywords).omit({ id: true, createdAt: true });
export type InsertSocialKeyword = z.infer<typeof insertSocialKeywordSchema>;

// ============================================================================
// COMPETITOR PROFILES - Competitor tracking for benchmarking
// ============================================================================
export const competitorProfiles = pgTable("competitor_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  handle: text("handle"),
  platforms: jsonb("platforms"),
  followers: integer("followers").default(0),
  followersGrowth: real("followers_growth").default(0),
  engagementRate: real("engagement_rate").default(0),
  postsPerWeek: real("posts_per_week").default(0),
  avgLikes: integer("avg_likes").default(0),
  avgComments: integer("avg_comments").default(0),
  avgShares: integer("avg_shares").default(0),
  contentMix: jsonb("content_mix"),
  topHashtags: jsonb("top_hashtags"),
  lastUpdated: timestamp("last_updated"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export type CompetitorProfile = typeof competitorProfiles.$inferSelect;
export const insertCompetitorProfileSchema = createInsertSchema(competitorProfiles).omit({ id: true, createdAt: true });
export type InsertCompetitorProfile = z.infer<typeof insertCompetitorProfileSchema>;

// ============================================================================
// SOCIAL INBOX MESSAGES - Unified inbox for all platform messages
// ============================================================================
export const socialInboxMessages = pgTable("social_inbox_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  platform: text("platform").notNull(),
  messageType: text("message_type").notNull(),
  content: text("content"),
  authorId: text("author_id"),
  authorName: text("author_name"),
  authorHandle: text("author_handle"),
  authorAvatar: text("author_avatar"),
  authorFollowers: integer("author_followers").default(0),
  authorVerified: boolean("author_verified").default(false),
  postContent: text("post_content"),
  postUrl: text("post_url"),
  sentiment: text("sentiment").default("neutral"),
  priority: text("priority").default("medium"),
  status: text("status").default("unread"),
  assignedTo: varchar("assigned_to"),
  tags: jsonb("tags"),
  threadId: varchar("thread_id"),
  parentMessageId: varchar("parent_message_id"),
  repliedAt: timestamp("replied_at"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SocialInboxMessage = typeof socialInboxMessages.$inferSelect;
export const insertSocialInboxMessageSchema = createInsertSchema(socialInboxMessages).omit({ id: true, createdAt: true });
export type InsertSocialInboxMessage = z.infer<typeof insertSocialInboxMessageSchema>;

// ============================================================================
// ONBOARDING TASKS - Default tasks for first week success path
// ============================================================================
export const onboardingTasks = pgTable("onboarding_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  points: integer("points").default(0),
  order: integer("order").default(0),
  isRequired: boolean("is_required").default(false),
  actionUrl: text("action_url"),
  icon: text("icon"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type OnboardingTask = typeof onboardingTasks.$inferSelect;
export const insertOnboardingTaskSchema = createInsertSchema(onboardingTasks).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOnboardingTask = z.infer<typeof insertOnboardingTaskSchema>;

// ============================================================================
// USER ONBOARDING - Track user progress through first week success path
// ============================================================================
export const userOnboarding = pgTable("user_onboarding", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  currentStep: integer("current_step").default(0),
  completedSteps: jsonb("completed_steps").$type<string[]>().default([]),
  totalPoints: integer("total_points").default(0),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  skippedAt: timestamp("skipped_at"),
  dayStreak: integer("day_streak").default(0),
  lastActivityAt: timestamp("last_activity_at").defaultNow(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UserOnboarding = typeof userOnboarding.$inferSelect;
export const insertUserOnboardingSchema = createInsertSchema(userOnboarding).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserOnboarding = z.infer<typeof insertUserOnboardingSchema>;

// ============================================================================
// ARTIST PROGRESS SNAPSHOTS - Daily career growth metrics
// ============================================================================
export const artistProgressSnapshots = pgTable("artist_progress_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  snapshotDate: date("snapshot_date").notNull(),
  totalStreams: bigint("total_streams", { mode: "number" }).default(0),
  totalFollowers: integer("total_followers").default(0),
  totalRevenue: real("total_revenue").default(0),
  totalReleases: integer("total_releases").default(0),
  engagementScore: real("engagement_score").default(0),
  growthRate: real("growth_rate").default(0),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ArtistProgressSnapshot = typeof artistProgressSnapshots.$inferSelect;
export const insertArtistProgressSnapshotSchema = createInsertSchema(artistProgressSnapshots).omit({ id: true, createdAt: true });
export type InsertArtistProgressSnapshot = z.infer<typeof insertArtistProgressSnapshotSchema>;

// ============================================================================
// ACHIEVEMENTS - Gamification milestones and badges
// ============================================================================
export const achievements = pgTable("achievements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  iconUrl: text("icon_url"),
  points: integer("points").default(0),
  requirement: jsonb("requirement"),
  tier: text("tier").default("bronze"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Achievement = typeof achievements.$inferSelect;
export const insertAchievementSchema = createInsertSchema(achievements).omit({ id: true, createdAt: true });
export type InsertAchievement = z.infer<typeof insertAchievementSchema>;

// ============================================================================
// USER ACHIEVEMENTS - Track which achievements users have unlocked
// ============================================================================
export const userAchievements = pgTable("user_achievements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  achievementId: varchar("achievement_id").notNull(),
  progress: real("progress").default(0),
  unlockedAt: timestamp("unlocked_at"),
  notified: boolean("notified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export type UserAchievement = typeof userAchievements.$inferSelect;
export const insertUserAchievementSchema = createInsertSchema(userAchievements).omit({ id: true, createdAt: true });
export type InsertUserAchievement = z.infer<typeof insertUserAchievementSchema>;

// ============================================================================
// USER STREAKS - Track login, posting, and release streaks
// ============================================================================
export const userStreaks = pgTable("user_streaks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  streakType: text("streak_type").notNull(),
  currentStreak: integer("current_streak").default(0),
  longestStreak: integer("longest_streak").default(0),
  lastActivityDate: date("last_activity_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UserStreak = typeof userStreaks.$inferSelect;
export const insertUserStreakSchema = createInsertSchema(userStreaks).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserStreak = z.infer<typeof insertUserStreakSchema>;

// ============================================================================
// CAREER COACH RECOMMENDATIONS - AI-powered personalized daily tips
// ============================================================================
export const careerCoachRecommendations = pgTable("career_coach_recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  priority: integer("priority").default(1),
  actionUrl: text("action_url"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  dismissedAt: timestamp("dismissed_at"),
  completedAt: timestamp("completed_at"),
});

export type CareerCoachRecommendation = typeof careerCoachRecommendations.$inferSelect;
export const insertCareerCoachRecommendationSchema = createInsertSchema(careerCoachRecommendations).omit({ id: true, createdAt: true });
export type InsertCareerCoachRecommendation = z.infer<typeof insertCareerCoachRecommendationSchema>;

// ============================================================================
// CAREER GOALS - User-defined SMART goals with progress tracking
// ============================================================================
export const careerGoals = pgTable("career_goals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  goalType: text("goal_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  targetValue: real("target_value").notNull(),
  currentValue: real("current_value").default(0),
  unit: text("unit"),
  deadline: timestamp("deadline"),
  status: text("status").default("active"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type CareerGoal = typeof careerGoals.$inferSelect;
export const insertCareerGoalSchema = createInsertSchema(careerGoals).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCareerGoal = z.infer<typeof insertCareerGoalSchema>;

// ============================================================================
// EMAIL PREFERENCES - User email notification settings
// ============================================================================
export const emailPreferences = pgTable("email_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  weeklyInsights: boolean("weekly_insights").default(true),
  weeklyInsightsFrequency: text("weekly_insights_frequency").default("weekly"),
  marketingEmails: boolean("marketing_emails").default(true),
  releaseAlerts: boolean("release_alerts").default(true),
  collaborationAlerts: boolean("collaboration_alerts").default(true),
  revenueAlerts: boolean("revenue_alerts").default(true),
  unsubscribedAt: timestamp("unsubscribed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type EmailPreference = typeof emailPreferences.$inferSelect;
export const insertEmailPreferenceSchema = createInsertSchema(emailPreferences).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmailPreference = z.infer<typeof insertEmailPreferenceSchema>;

// ============================================================================
// SENT EMAILS - Track all sent emails for analytics and tracking
// ============================================================================
export const sentEmails = pgTable("sent_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  emailType: text("email_type").notNull(),
  subject: text("subject").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  metadata: jsonb("metadata"),
  sentAt: timestamp("sent_at").defaultNow(),
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  clickedLink: text("clicked_link"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SentEmail = typeof sentEmails.$inferSelect;
export const insertSentEmailSchema = createInsertSchema(sentEmails).omit({ id: true, createdAt: true, sentAt: true });
export type InsertSentEmail = z.infer<typeof insertSentEmailSchema>;

// ============================================================================
// ARTIST CONNECTIONS - Track connections between artists for collaboration
// ============================================================================
export const artistConnections = pgTable("artist_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requesterId: varchar("requester_id").notNull(),
  receiverId: varchar("receiver_id").notNull(),
  status: text("status").default("pending"),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow(),
  acceptedAt: timestamp("accepted_at"),
});

export type ArtistConnection = typeof artistConnections.$inferSelect;
export const insertArtistConnectionSchema = createInsertSchema(artistConnections).omit({ id: true, createdAt: true });
export type InsertArtistConnection = z.infer<typeof insertArtistConnectionSchema>;

// ============================================================================
// COLLABORATION PROJECTS - Projects for artist collaborations
// ============================================================================
export const collaborationProjects = pgTable("collaboration_projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  ownerId: varchar("owner_id").notNull(),
  status: text("status").default("open"),
  genre: text("genre"),
  lookingFor: text("looking_for").array(),
  maxMembers: integer("max_members").default(10),
  isPublic: boolean("is_public").default(true),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type CollaborationProject = typeof collaborationProjects.$inferSelect;
export const insertCollaborationProjectSchema = createInsertSchema(collaborationProjects).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCollaborationProject = z.infer<typeof insertCollaborationProjectSchema>;

// ============================================================================
// PROJECT MEMBERS - Track members of collaboration projects
// ============================================================================
export const projectMembers = pgTable("project_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  userId: varchar("user_id").notNull(),
  role: text("role").default("member"),
  status: text("status").default("active"),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export type ProjectMember = typeof projectMembers.$inferSelect;
export const insertProjectMemberSchema = createInsertSchema(projectMembers).omit({ id: true, joinedAt: true });
export type InsertProjectMember = z.infer<typeof insertProjectMemberSchema>;

// ============================================================================
// COLLABORATION SNAPSHOTS - Persistent storage for real-time Yjs documents
// ============================================================================
export const collabSnapshots = pgTable("collab_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  documentState: text("document_state").notNull(),
  documentHash: varchar("document_hash", { length: 64 }),
  version: integer("version").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by"),
});

export type CollabSnapshot = typeof collabSnapshots.$inferSelect;
export const insertCollabSnapshotSchema = createInsertSchema(collabSnapshots).omit({ id: true, createdAt: true });
export type InsertCollabSnapshot = z.infer<typeof insertCollabSnapshotSchema>;

// ============================================================================
// RELEASE COUNTDOWNS - Pre-release campaign tracking
// ============================================================================
export const releaseCountdowns = pgTable("release_countdowns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  releaseId: varchar("release_id"),
  title: text("title").notNull(),
  releaseDate: timestamp("release_date").notNull(),
  artworkUrl: text("artwork_url"),
  presaveUrl: text("presave_url"),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ReleaseCountdown = typeof releaseCountdowns.$inferSelect;
export const insertReleaseCountdownSchema = createInsertSchema(releaseCountdowns).omit({ id: true, createdAt: true });
export type InsertReleaseCountdown = z.infer<typeof insertReleaseCountdownSchema>;

// ============================================================================
// COUNTDOWN TASKS - Checklist items for pre-release campaigns
// ============================================================================
export const countdownTasks = pgTable("countdown_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countdownId: varchar("countdown_id").notNull(),
  task: text("task").notNull(),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  order: integer("order").default(0),
  category: text("category"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type CountdownTask = typeof countdownTasks.$inferSelect;
export const insertCountdownTaskSchema = createInsertSchema(countdownTasks).omit({ id: true, createdAt: true });
export type InsertCountdownTask = z.infer<typeof insertCountdownTaskSchema>;

// ============================================================================
// COUNTDOWN ANALYTICS - Track pre-save metrics
// ============================================================================
export const countdownAnalytics = pgTable("countdown_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countdownId: varchar("countdown_id").notNull(),
  date: timestamp("date").notNull().defaultNow(),
  presaves: integer("presaves").default(0),
  shares: integer("shares").default(0),
  pageViews: integer("page_views").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export type CountdownAnalytic = typeof countdownAnalytics.$inferSelect;
export const insertCountdownAnalyticSchema = createInsertSchema(countdownAnalytics).omit({ id: true, createdAt: true });
export type InsertCountdownAnalytic = z.infer<typeof insertCountdownAnalyticSchema>;

// ============================================================================
// AUTOPILOT LEARNING DATA - Track performance metrics for continuous learning
// ============================================================================
export const autopilotLearningData = pgTable("autopilot_learning_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  platform: text("platform").notNull(),
  contentType: text("content_type"),
  hookType: text("hook_type"),
  postingHour: integer("posting_hour"),
  postingDayOfWeek: integer("posting_day_of_week"),
  engagementRate: real("engagement_rate").default(0),
  impressions: integer("impressions").default(0),
  clicks: integer("clicks").default(0),
  shares: integer("shares").default(0),
  likes: integer("likes").default(0),
  comments: integer("comments").default(0),
  saves: integer("saves").default(0),
  reach: integer("reach").default(0),
  hashtags: jsonb("hashtags").$type<string[]>(),
  contentText: text("content_text"),
  mediaType: text("media_type"),
  postId: varchar("post_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type AutopilotLearningData = typeof autopilotLearningData.$inferSelect;
export const insertAutopilotLearningDataSchema = createInsertSchema(autopilotLearningData).omit({ id: true, createdAt: true });
export type InsertAutopilotLearningData = z.infer<typeof insertAutopilotLearningDataSchema>;

// ============================================================================
// AUTOPILOT INSIGHTS - AI-generated insights from learning data
// ============================================================================
export const autopilotInsights = pgTable("autopilot_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  insightType: text("insight_type").notNull(),
  platform: text("platform"),
  data: jsonb("data").notNull(),
  confidence: real("confidence").default(0),
  priority: integer("priority").default(0),
  isActive: boolean("is_active").default(true),
  expiresAt: timestamp("expires_at"),
  generatedAt: timestamp("generated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type AutopilotInsight = typeof autopilotInsights.$inferSelect;
export const insertAutopilotInsightSchema = createInsertSchema(autopilotInsights).omit({ id: true, createdAt: true, generatedAt: true });
export type InsertAutopilotInsight = z.infer<typeof insertAutopilotInsightSchema>;

// ============================================================================
// AUTOPILOT USER PREFERENCES - User-provided content generation guidelines
// ============================================================================
export const autopilotPreferences = pgTable("autopilot_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  
  // Artist/Brand Identity
  artistName: text("artist_name"),
  artistBio: text("artist_bio"),
  genre: text("genre"),
  subGenres: jsonb("sub_genres").$type<string[]>(),
  brandVoice: text("brand_voice"), // 'professional' | 'casual' | 'energetic' | 'edgy' | 'inspirational'
  targetAudience: text("target_audience"),
  uniqueSellingPoints: jsonb("unique_selling_points").$type<string[]>(),
  
  // Content Generation Guidelines
  contentTone: text("content_tone"), // 'professional' | 'casual' | 'energetic' | 'promotional'
  preferredEmojis: jsonb("preferred_emojis").$type<string[]>(),
  avoidEmojis: boolean("avoid_emojis").default(false),
  preferredHashtags: jsonb("preferred_hashtags").$type<string[]>(),
  avoidHashtags: jsonb("avoid_hashtags").$type<string[]>(),
  contentThemes: jsonb("content_themes").$type<string[]>(), // e.g. ['new releases', 'behind the scenes', 'fan engagement']
  avoidTopics: jsonb("avoid_topics").$type<string[]>(),
  callToActionStyle: text("call_to_action_style"), // 'direct' | 'subtle' | 'question' | 'urgency'
  contentQualityThreshold: integer("content_quality_threshold").default(90), // 0-100, minimum score before auto-posting
  
  // Platform-Specific Settings
  platformSettings: jsonb("platform_settings").$type<{
    twitter?: { enabled: boolean; postsPerDay: number; autoPost: boolean; contentTypes: string[] };
    instagram?: { enabled: boolean; postsPerDay: number; autoPost: boolean; contentTypes: string[] };
    tiktok?: { enabled: boolean; postsPerDay: number; autoPost: boolean; contentTypes: string[] };
    facebook?: { enabled: boolean; postsPerDay: number; autoPost: boolean; contentTypes: string[] };
    youtube?: { enabled: boolean; postsPerDay: number; autoPost: boolean; contentTypes: string[] };
    linkedin?: { enabled: boolean; postsPerDay: number; autoPost: boolean; contentTypes: string[] };
    threads?: { enabled: boolean; postsPerDay: number; autoPost: boolean; contentTypes: string[] };
    googlebusiness?: { enabled: boolean; postsPerDay: number; autoPost: boolean; contentTypes: string[] };
  }>(),
  
  // Posting Schedule
  postingSchedule: jsonb("posting_schedule").$type<{
    timezone: string;
    preferredHours: number[];
    preferredDays: string[];
    avoidHours: number[];
    avoidDays: string[];
  }>(),
  
  // Advertisement Autopilot Settings
  adAutopilotEnabled: boolean("ad_autopilot_enabled").default(false),
  organicGrowthPriority: text("organic_growth_priority"), // 'reach' | 'engagement' | 'followers' | 'conversions'
  crossPostingEnabled: boolean("cross_posting_enabled").default(true),
  viralOptimizationLevel: text("viral_optimization_level"), // 'conservative' | 'moderate' | 'aggressive'
  
  // Content Examples (for AI to learn from)
  contentExamples: jsonb("content_examples").$type<{
    goodPosts: string[];
    badPosts: string[];
    inspirationalAccounts: string[];
  }>(),
  
  // Current Promotions/Releases
  currentReleases: jsonb("current_releases").$type<{
    title: string;
    type: string;
    releaseDate: string;
    streamingLinks: Record<string, string>;
    promoUntil: string;
  }[]>(),
  
  // Custom Instructions
  customInstructions: text("custom_instructions"),
  
  // Status
  isActive: boolean("is_active").default(true),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type AutopilotPreference = typeof autopilotPreferences.$inferSelect;
export const insertAutopilotPreferenceSchema = createInsertSchema(autopilotPreferences).omit({ id: true, createdAt: true, lastUpdated: true });
export type InsertAutopilotPreference = z.infer<typeof insertAutopilotPreferenceSchema>;

// ============================================================================
// SYSTEM LOGS - Structured logging storage for queryable logs
// ============================================================================
export const systemLogs = pgTable("system_logs", {
  id: serial("id").primaryKey(),
  level: varchar("level", { length: 10 }).notNull(), // debug, info, warn, error, fatal
  service: varchar("service", { length: 50 }).notNull(), // api, auth, database, ai, storage, queue, email, social
  message: text("message").notNull(),
  metadata: jsonb("metadata"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  userId: varchar("user_id"),
  requestId: varchar("request_id"),
});

export type SystemLog = typeof systemLogs.$inferSelect;
export const insertSystemLogSchema = createInsertSchema(systemLogs).omit({ id: true });
export type InsertSystemLog = z.infer<typeof insertSystemLogSchema>;

// ============================================================================
// SPLIT SHEETS (royalty split agreements between collaborators)
// ============================================================================
export const splitSheets = pgTable("split_sheets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull(),
  creatorId: varchar("creator_id").notNull(),
  contractName: text("contract_name").notNull(),
  participants: jsonb("participants").notNull().default(sql`'[]'::jsonb`),
  status: text("status").notNull().default("pending_signature"),
  effectiveDate: timestamp("effective_date").notNull(),
  signatures: jsonb("signatures").notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SplitSheet = typeof splitSheets.$inferSelect;
export const insertSplitSheetSchema = createInsertSchema(splitSheets).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSplitSheet = z.infer<typeof insertSplitSheetSchema>;

// ============================================================================
// BATCH TEMPLATES (user-created bulk operation templates)
// ============================================================================
export const batchTemplates = pgTable("batch_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  resource: text("resource").notNull(),
  action: text("action").notNull().default("bulk_operation"),
  configuration: jsonb("configuration").notNull().default(sql`'{}'::jsonb`),
  isFavorite: boolean("is_favorite").notNull().default(false),
  isShared: boolean("is_shared").notNull().default(false),
  sharedBy: varchar("shared_by"),
  usageCount: integer("usage_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type BatchTemplate = typeof batchTemplates.$inferSelect;
export const insertBatchTemplateSchema = createInsertSchema(batchTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBatchTemplate = z.infer<typeof insertBatchTemplateSchema>;

// ============================================================================
// SHARE LINKS (persistent share links for exports, projects, audio files)
// ============================================================================
export const shareLinks = pgTable("share_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shortCode: varchar("short_code").notNull().unique(),
  url: text("url").notNull(),
  name: text("name").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: varchar("resource_id").notNull(),
  userId: varchar("user_id").notNull(),
  expiresAt: timestamp("expires_at"),
  isPasswordProtected: boolean("is_password_protected").notNull().default(false),
  passwordHash: text("password_hash"),
  maxDownloads: integer("max_downloads"),
  downloadCount: integer("download_count").notNull().default(0),
  viewCount: integer("view_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  allowedEmails: jsonb("allowed_emails"),
  requiresEmail: boolean("requires_email").notNull().default(false),
  lastAccessedAt: timestamp("last_accessed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ShareLink = typeof shareLinks.$inferSelect;
export const insertShareLinkSchema = createInsertSchema(shareLinks).omit({ id: true, createdAt: true });
export type InsertShareLink = z.infer<typeof insertShareLinkSchema>;

// ============================================================================
// COLLABORATION COMMENTS (threaded comments on studio projects)
// ============================================================================
export const collaborationComments = pgTable("collaboration_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  parentId: varchar("parent_id"),
  elementId: varchar("element_id"),
  userId: varchar("user_id").notNull(),
  userName: text("user_name").notNull(),
  userAvatar: text("user_avatar"),
  content: text("content").notNull(),
  mentions: jsonb("mentions").notNull().default(sql`'[]'::jsonb`),
  timestamp: integer("timestamp"),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CollaborationComment = typeof collaborationComments.$inferSelect;
export const insertCollaborationCommentSchema = createInsertSchema(collaborationComments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCollaborationComment = z.infer<typeof insertCollaborationCommentSchema>;

// ============================================================================
// COLLABORATION VERSIONS (project version snapshots)
// ============================================================================
export const collaborationVersions = pgTable("collaboration_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  version: integer("version").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: varchar("created_by").notNull(),
  createdByName: text("created_by_name").notNull(),
  size: integer("size"),
  changes: jsonb("changes").default(sql`'[]'::jsonb`),
  isAutoSave: boolean("is_auto_save").notNull().default(false),
  isCurrent: boolean("is_current").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CollaborationVersion = typeof collaborationVersions.$inferSelect;
export const insertCollaborationVersionSchema = createInsertSchema(collaborationVersions).omit({ id: true, createdAt: true });
export type InsertCollaborationVersion = z.infer<typeof insertCollaborationVersionSchema>;

// ============================================================================
// COLLABORATION ACCESS REQUESTS (project access permission requests)
// ============================================================================
export const collaborationAccessRequests = pgTable("collaboration_access_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  requesterId: varchar("requester_id").notNull(),
  requesterName: text("requester_name").notNull(),
  requesterEmail: text("requester_email").notNull(),
  requestedAccess: text("requested_access").notNull(),
  message: text("message"),
  status: text("status").notNull().default("pending"),
  respondedBy: varchar("responded_by"),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CollaborationAccessRequest = typeof collaborationAccessRequests.$inferSelect;
export const insertCollaborationAccessRequestSchema = createInsertSchema(collaborationAccessRequests).omit({ id: true, createdAt: true });
export type InsertCollaborationAccessRequest = z.infer<typeof insertCollaborationAccessRequestSchema>;

// ============================================================================
// SEARCH HISTORY (per-user search query history, persisted across restarts)
// ============================================================================
export const searchHistory = pgTable("search_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  query: text("query").notNull(),
  resultCount: integer("result_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SearchHistoryItem = typeof searchHistory.$inferSelect;

// ============================================================================
// FILTER PRESETS (user-created named filter configurations, persisted)
// ============================================================================
export const filterPresets = pgTable("filter_presets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  context: text("context").notNull().default("global"),
  filters: jsonb("filters").notNull().default(sql`'{}'::jsonb`),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type FilterPreset = typeof filterPresets.$inferSelect;

// ============================================================================
// MUSIC WORKFLOW AUTOMATIONS
// Per-user optional automation configs covering the full music artist journey
// ============================================================================
export const musicWorkflowAutomations = pgTable("music_workflow_automations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  templateId: varchar("template_id").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
  lastTriggeredAt: timestamp("last_triggered_at"),
  triggerCount: integer("trigger_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type MusicWorkflowAutomation = typeof musicWorkflowAutomations.$inferSelect;
export type InsertMusicWorkflowAutomation = typeof musicWorkflowAutomations.$inferInsert;

export const musicWorkflowExecutionLogs = pgTable("music_workflow_execution_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  templateId: varchar("template_id").notNull(),
  eventType: varchar("event_type").notNull(),
  status: varchar("status").notNull().default("success"),
  result: jsonb("result"),
  error: text("error"),
  executedAt: timestamp("executed_at").defaultNow().notNull(),
});

export type MusicWorkflowExecutionLog = typeof musicWorkflowExecutionLogs.$inferSelect;

// ============================================================================
// ARTIST PROFILES
// Stores platform-specific artist identifiers for distribution mapping.
// One user may have multiple artist profiles (e.g. solo + band).
// ============================================================================
export const artistProfiles = pgTable("artist_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  artistName: varchar("artist_name", { length: 255 }).notNull(),
  isNewArtist: boolean("is_new_artist").notNull().default(true),

  // Platform identifiers – stored after lookup or user entry
  spotifyArtistId: varchar("spotify_artist_id", { length: 255 }),
  spotifyArtistUri: varchar("spotify_artist_uri", { length: 255 }),
  appleArtistId: varchar("apple_artist_id", { length: 255 }),
  youtubeChannelId: varchar("youtube_channel_id", { length: 255 }),
  tidalArtistId: varchar("tidal_artist_id", { length: 255 }),
  deezerArtistId: varchar("deezer_artist_id", { length: 255 }),
  soundcloudArtistId: varchar("soundcloud_artist_id", { length: 255 }),
  amazonMusicArtistId: varchar("amazon_music_artist_id", { length: 255 }),

  // Verification state
  isVerified: boolean("is_verified").notNull().default(false),
  verifiedAt: timestamp("verified_at"),
  verifiedPlatforms: jsonb("verified_platforms").$type<string[]>().default(sql`'[]'::jsonb`),

  // Fixer mechanism – re-map misattributed releases
  fixerPending: boolean("fixer_pending").notNull().default(false),
  fixerTargetSpotifyUri: varchar("fixer_target_spotify_uri", { length: 255 }),
  fixerNotes: text("fixer_notes"),
  fixerStatus: varchar("fixer_status", { length: 50 }).default("none"),
  fixerRequestedAt: timestamp("fixer_requested_at"),
  fixerResolvedAt: timestamp("fixer_resolved_at"),

  profileImageUrl: varchar("profile_image_url", { length: 500 }),
  genres: jsonb("genres").$type<string[]>().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ArtistProfile = typeof artistProfiles.$inferSelect;
export type InsertArtistProfile = typeof artistProfiles.$inferInsert;
export const insertArtistProfileSchema = createInsertSchema(artistProfiles).omit({ id: true, createdAt: true, updatedAt: true });

// Junction table linking artist profiles to releases
export const artistProfileReleases = pgTable("artist_profile_releases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artistProfileId: varchar("artist_profile_id").notNull(),
  releaseId: varchar("release_id").notNull(),
  isPrimary: boolean("is_primary").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ArtistProfileRelease = typeof artistProfileReleases.$inferSelect;

// ============================================================================
// INSERT SCHEMAS FOR NEW TABLES (must be at end after all tables defined)
// ============================================================================
export const insertTakeGroupSchema = createInsertSchema(takeGroups).omit({ id: true, createdAt: true });
export const insertPluginPresetSchema = createInsertSchema(pluginPresets).omit({ id: true, createdAt: true });
export const insertStudioTrackSchema = createInsertSchema(studioTracks).omit({ id: true, createdAt: true });
export const insertAlertRuleSchema = createInsertSchema(alertRules).omit({ id: true, createdAt: true });
export const insertEmailMessageSchema = createInsertSchema(emailMessages).omit({ id: true, createdAt: true });
export const insertTakeLaneSchema = createInsertSchema(takeLanes).omit({ id: true, createdAt: true });
export const insertSystemMetricSchema = createInsertSchema(systemMetrics).omit({ id: true, createdAt: true });
export const insertListenerCohortSchema = createInsertSchema(listenerCohorts).omit({ id: true, createdAt: true });
export const insertSocialAccountSchema = createInsertSchema(socialAccounts).omit({ id: true, createdAt: true });
export const insertTakeSegmentSchema = createInsertSchema(takeSegments).omit({ id: true, createdAt: true });
export const insertWorkspaceRoleSchema = createInsertSchema(workspaceRoles).omit({ id: true, createdAt: true });
export const insertRevenueForecastSchema = createInsertSchema(revenueForecasts).omit({ id: true, createdAt: true });
export const insertApprovalRequestSchema = createInsertSchema(approvalRequests).omit({ id: true, createdAt: true });
export const insertApprovalStepSchema = createInsertSchema(approvalSteps).omit({ id: true, createdAt: true });
export const insertApprovalWorkflowSchema = createInsertSchema(approvalWorkflows).omit({ id: true, createdAt: true });
export const insertSsoConfigSchema = createInsertSchema(ssoConfigs).omit({ id: true, createdAt: true });

// ============================================================================
// POCKET DIMENSION FABRIC
// ============================================================================

export const fabricPockets = pgTable("fabric_pockets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  policy: jsonb("policy").notNull().default(sql`'{}'`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fabricVolumes = pgTable("fabric_volumes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pocketId: varchar("pocket_id").notNull().references(() => fabricPockets.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 32 }).notNull().default("objects"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const fabricStorageNodes = pgTable("fabric_storage_nodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  region: varchar("region", { length: 128 }).notNull(),
  costTier: varchar("cost_tier", { length: 32 }).notNull().default("standard"),
  backendType: varchar("backend_type", { length: 64 }).notNull(),
  backendConfig: jsonb("backend_config").notNull().default(sql`'{}'`),
  capacityBytes: varchar("capacity_bytes").notNull().default("0"),
  usedBytes: varchar("used_bytes").notNull().default("0"),
  healthy: boolean("healthy").notNull().default(true),
  lastHeartbeat: timestamp("last_heartbeat").notNull().defaultNow(),
});

export const fabricObjects = pgTable("fabric_objects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  volumeId: varchar("volume_id").notNull().references(() => fabricVolumes.id, { onDelete: 'cascade' }),
  originalName: varchar("original_name", { length: 512 }).notNull(),
  contentType: varchar("content_type", { length: 256 }).notNull().default("application/octet-stream"),
  sizeBytes: varchar("size_bytes").notNull().default("0"),
  chunkIds: jsonb("chunk_ids").notNull().default(sql`'[]'`),
  contentHash: varchar("content_hash", { length: 128 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const fabricChunks = pgTable("fabric_chunks", {
  id: varchar("id").primaryKey(),
  objectId: varchar("object_id").notNull(),
  nodeIds: jsonb("node_ids").notNull().default(sql`'[]'`),
  sizeBytes: varchar("size_bytes").notNull().default("0"),
  checksum: varchar("checksum", { length: 128 }).notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFabricPocketSchema = createInsertSchema(fabricPockets).omit({ id: true, createdAt: true, updatedAt: true });
export const insertFabricVolumeSchema = createInsertSchema(fabricVolumes).omit({ id: true, createdAt: true });
export const insertFabricStorageNodeSchema = createInsertSchema(fabricStorageNodes).omit({ id: true, lastHeartbeat: true });
export const insertFabricObjectSchema = createInsertSchema(fabricObjects).omit({ id: true, createdAt: true });
export const insertFabricChunkSchema = createInsertSchema(fabricChunks).omit({ createdAt: true });

// ============================================================================
// RETENTION & LONG-TERM SUCCESS TABLES
// ============================================================================

export const customerHealthScores = pgTable("customer_health_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  score: integer("score").notNull().default(50),
  riskLevel: text("risk_level").notNull().default("healthy"),
  loginFrequencyScore: integer("login_frequency_score").default(0),
  featureAdoptionScore: integer("feature_adoption_score").default(0),
  engagementScore: integer("engagement_score").default(0),
  paymentHealthScore: integer("payment_health_score").default(0),
  daysSinceLastLogin: integer("days_since_last_login"),
  featuresUsed: integer("features_used").default(0),
  totalSessions: integer("total_sessions").default(0),
  reEngagementEmailSentAt: timestamp("re_engagement_email_sent_at"),
  computedAt: timestamp("computed_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("customer_health_scores_risk_level_idx").on(t.riskLevel),
  index("customer_health_scores_days_since_last_login_idx").on(t.daysSinceLastLogin),
  index("customer_health_scores_re_engagement_sent_idx").on(t.reEngagementEmailSentAt),
]);

export const insertCustomerHealthScoreSchema = createInsertSchema(customerHealthScores).omit({ id: true, createdAt: true });
export type CustomerHealthScore = typeof customerHealthScores.$inferSelect;

export const npsResponses = pgTable("nps_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  score: integer("score").notNull(),
  comment: text("comment"),
  triggerContext: text("trigger_context").default("30_day"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("nps_responses_user_id_idx").on(t.userId),
  index("nps_responses_score_idx").on(t.score),
]);

export const insertNpsResponseSchema = createInsertSchema(npsResponses).omit({ id: true, createdAt: true });
export type NpsResponse = typeof npsResponses.$inferSelect;

export const cancellationFeedback = pgTable("cancellation_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  reason: text("reason").notNull(),
  elaboration: text("elaboration"),
  competitorMentioned: text("competitor_mentioned"),
  wouldReturn: boolean("would_return"),
  planAtCancellation: text("plan_at_cancellation"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("cancellation_feedback_user_id_idx").on(t.userId),
  index("cancellation_feedback_created_at_idx").on(t.createdAt),
]);

export const insertCancellationFeedbackSchema = createInsertSchema(cancellationFeedback).omit({ id: true, createdAt: true });
export type CancellationFeedback = typeof cancellationFeedback.$inferSelect;

export const featureEvents = pgTable("feature_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  featureName: text("feature_name").notNull(),
  action: text("action").notNull().default("used"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("feature_events_user_feature_idx").on(t.userId, t.featureName),
  index("feature_events_created_idx").on(t.createdAt),
]);

export const insertFeatureEventSchema = createInsertSchema(featureEvents).omit({ id: true, createdAt: true });
export type FeatureEvent = typeof featureEvents.$inferSelect;

export const dunningState = pgTable("dunning_state", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  stripeInvoiceId: text("stripe_invoice_id").notNull().unique(),
  currentStep: integer("current_step").notNull().default(0),
  nextEmailAt: timestamp("next_email_at"),
  resolvedAt: timestamp("resolved_at"),
  resolvedReason: text("resolved_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("dunning_state_stripe_invoice_id_idx").on(t.stripeInvoiceId),
  index("dunning_state_resolved_at_partial_idx").on(t.resolvedAt).where(sql`resolved_at IS NULL`),
  index("dunning_state_next_email_at_idx").on(t.nextEmailAt),
]);

export const insertDunningStateSchema = createInsertSchema(dunningState).omit({ id: true, createdAt: true });
export type DunningState = typeof dunningState.$inferSelect;

// ============================================================================
// FAN HUB / FAN CRM TABLES
// ============================================================================

export const fanSubscribers = pgTable("fan_subscribers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  email: text("email").notNull(),
  name: text("name"),
  phone: text("phone"),
  source: text("source").default("manual"),
  tags: jsonb("tags").default([]),
  totalSpent: real("total_spent").default(0),
  location: text("location"),
  isVip: boolean("is_vip").default(false),
  notes: text("notes"),
  lastActive: timestamp("last_active"),
  joinedAt: timestamp("joined_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("fan_subscribers_user_id_idx").on(t.userId),
  index("fan_subscribers_email_idx").on(t.userId, t.email),
]);

export const fanMessages = pgTable("fan_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  segmentFilter: jsonb("segment_filter").default({}),
  recipientCount: integer("recipient_count").default(0),
  openCount: integer("open_count").default(0),
  clickCount: integer("click_count").default(0),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("fan_messages_user_id_idx").on(t.userId),
]);

export const insertFanSubscriberSchema = createInsertSchema(fanSubscribers).omit({ id: true, createdAt: true, joinedAt: true });
export const insertFanMessageSchema = createInsertSchema(fanMessages).omit({ id: true, createdAt: true });
export type FanSubscriber = typeof fanSubscribers.$inferSelect;
export type FanMessage = typeof fanMessages.$inferSelect;

// ============================================================================
// PRESS KIT (EPK) TABLE
// ============================================================================

export const pressKits = pgTable("press_kits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  artistName: text("artist_name"),
  bio: text("bio"),
  shortBio: text("short_bio"),
  genres: jsonb("genres").default([]),
  contactEmail: text("contact_email"),
  bookingEmail: text("booking_email"),
  website: text("website"),
  socialLinks: jsonb("social_links").default({}),
  photos: jsonb("photos").default([]),
  pressQuotes: jsonb("press_quotes").default([]),
  achievements: jsonb("achievements").default([]),
  technicalRider: text("technical_rider"),
  hospitalityRider: text("hospitality_rider"),
  isPublic: boolean("is_public").default(false),
  slug: text("slug").unique(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("press_kits_user_id_idx").on(t.userId),
  index("press_kits_slug_idx").on(t.slug),
]);

export const insertPressKitSchema = createInsertSchema(pressKits).omit({ id: true, createdAt: true });
export type PressKit = typeof pressKits.$inferSelect;

// ============================================================================
// PLAYLIST PITCHING TABLE
// ============================================================================

export const playlistPitches = pgTable("playlist_pitches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  trackTitle: text("track_title").notNull(),
  artistName: text("artist_name").notNull(),
  genre: text("genre"),
  mood: text("mood"),
  bpm: integer("bpm"),
  description: text("description"),
  targetPlaylistUrl: text("target_playlist_url"),
  curatorName: text("curator_name"),
  curatorEmail: text("curator_email"),
  status: text("status").default("draft"),
  submittedAt: timestamp("submitted_at"),
  responseAt: timestamp("response_at"),
  responseNote: text("response_note"),
  followUpAt: timestamp("follow_up_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("playlist_pitches_user_id_idx").on(t.userId),
  index("playlist_pitches_status_idx").on(t.status),
]);

export const insertPlaylistPitchSchema = createInsertSchema(playlistPitches).omit({ id: true, createdAt: true, updatedAt: true });
export type PlaylistPitch = typeof playlistPitches.$inferSelect;

// ============================================================================
// SHOWS / TOUR MANAGEMENT TABLES
// ============================================================================

export const shows = pgTable("shows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  venue: text("venue"),
  city: text("city"),
  state: text("state"),
  country: text("country").default("US"),
  date: timestamp("date").notNull(),
  endTime: timestamp("end_time"),
  ticketUrl: text("ticket_url"),
  capacity: integer("capacity"),
  ticketsSold: integer("tickets_sold").default(0),
  revenue: real("revenue").default(0),
  status: text("status").default("upcoming"),
  notes: text("notes"),
  isPublic: boolean("is_public").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("shows_user_id_idx").on(t.userId),
  index("shows_date_idx").on(t.date),
  index("shows_status_idx").on(t.status),
]);

export const setlists = pgTable("setlists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  showId: varchar("show_id").references(() => shows.id),
  name: text("name").notNull(),
  tracks: jsonb("tracks").default([]),
  totalDuration: integer("total_duration").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("setlists_user_id_idx").on(t.userId),
  index("setlists_show_id_idx").on(t.showId),
]);

export const insertShowSchema = createInsertSchema(shows).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSetlistSchema = createInsertSchema(setlists).omit({ id: true, createdAt: true, updatedAt: true });
export type Show = typeof shows.$inferSelect;
export type Setlist = typeof setlists.$inferSelect;

// ============================================================================
// MERCH STORE TABLES
// ============================================================================

export const merchItems = pgTable("merch_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  price: real("price").notNull(),
  salePrice: real("sale_price"),
  imageUrl: text("image_url"),
  category: text("category").default("clothing"),
  variants: jsonb("variants").default([]),
  inventory: integer("inventory").default(0),
  sku: text("sku"),
  isActive: boolean("is_active").default(true),
  isDigital: boolean("is_digital").default(false),
  downloadUrl: text("download_url"),
  soldCount: integer("sold_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("merch_items_user_id_idx").on(t.userId),
  index("merch_items_category_idx").on(t.category),
]);

export const merchOrders = pgTable("merch_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  buyerEmail: text("buyer_email"),
  buyerName: text("buyer_name"),
  items: jsonb("items").default([]),
  total: real("total").default(0),
  status: text("status").default("pending"),
  trackingNumber: text("tracking_number"),
  shippingAddress: jsonb("shipping_address").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("merch_orders_user_id_idx").on(t.userId),
  index("merch_orders_status_idx").on(t.status),
]);

export const insertMerchItemSchema = createInsertSchema(merchItems).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMerchOrderSchema = createInsertSchema(merchOrders).omit({ id: true, createdAt: true, updatedAt: true });
export type MerchItem = typeof merchItems.$inferSelect;
export type MerchOrder = typeof merchOrders.$inferSelect;

// ============================================================================
// SYNC LICENSING TABLE
// ============================================================================

export const syncSubmissions = pgTable("sync_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  trackTitle: text("track_title").notNull(),
  artistName: text("artist_name").notNull(),
  genre: text("genre"),
  mood: text("mood"),
  bpm: integer("bpm"),
  duration: integer("duration"),
  description: text("description"),
  usageTypes: jsonb("usage_types").default([]),
  isExclusive: boolean("is_exclusive").default(false),
  price: real("price"),
  previewUrl: text("preview_url"),
  submissionTarget: text("submission_target"),
  status: text("status").default("available"),
  licensedTo: text("licensed_to"),
  licensedAt: timestamp("licensed_at"),
  licenseFee: real("license_fee"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("sync_submissions_user_id_idx").on(t.userId),
  index("sync_submissions_status_idx").on(t.status),
]);

export const insertSyncSubmissionSchema = createInsertSchema(syncSubmissions).omit({ id: true, createdAt: true, updatedAt: true });
export type SyncSubmission = typeof syncSubmissions.$inferSelect;

// ============================================================================
// PUBLISHING RIGHTS TABLE
// ============================================================================

export const publishingRights = pgTable("publishing_rights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  trackTitle: text("track_title").notNull(),
  iswc: text("iswc"),
  isrc: text("isrc"),
  upc: text("upc"),
  coWriters: jsonb("co_writers").default([]),
  publisherName: text("publisher_name"),
  proName: text("pro_name"),
  proRegistrationId: text("pro_registration_id"),
  publishingSplit: real("publishing_split").default(50),
  writerSplit: real("writer_split").default(50),
  copyrightYear: integer("copyright_year"),
  status: text("status").default("pending"),
  notes: text("notes"),
  registeredAt: timestamp("registered_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("publishing_rights_user_id_idx").on(t.userId),
  index("publishing_rights_status_idx").on(t.status),
]);

export const insertPublishingRightSchema = createInsertSchema(publishingRights).omit({ id: true, createdAt: true, updatedAt: true });
export type PublishingRight = typeof publishingRights.$inferSelect;

// ============================================================================
// LABEL / A&R SUBMISSION TRACKER
// ============================================================================

export const labelSubmissions = pgTable("label_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  trackTitle: text("track_title").notNull(),
  artistName: text("artist_name"),
  labelName: text("label_name").notNull(),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactRole: text("contact_role"),
  submissionMethod: text("submission_method").default("email"),
  demoUrl: text("demo_url"),
  submittedAt: timestamp("submitted_at"),
  followUpAt: timestamp("follow_up_at"),
  responseAt: timestamp("response_at"),
  status: text("status").default("draft"),
  responseNote: text("response_note"),
  notes: text("notes"),
  priority: text("priority").default("medium"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("label_submissions_user_id_idx").on(t.userId),
  index("label_submissions_status_idx").on(t.status),
]);

export const insertLabelSubmissionSchema = createInsertSchema(labelSubmissions).omit({ id: true, createdAt: true, updatedAt: true });
export type LabelSubmission = typeof labelSubmissions.$inferSelect;
export type InsertLabelSubmission = typeof labelSubmissions.$inferInsert;

// ============================================================================
// RADIO / DJ / BLOG OUTREACH TRACKER
// ============================================================================

export const radioPitches = pgTable("radio_pitches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  trackTitle: text("track_title").notNull(),
  targetName: text("target_name").notNull(),
  targetType: text("target_type").default("radio"),
  contactEmail: text("contact_email"),
  contactUrl: text("contact_url"),
  genre: text("genre"),
  pitchNote: text("pitch_note"),
  demoUrl: text("demo_url"),
  submittedAt: timestamp("submitted_at"),
  followUpAt: timestamp("follow_up_at"),
  responseAt: timestamp("response_at"),
  status: text("status").default("draft"),
  responseNote: text("response_note"),
  featureUrl: text("feature_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("radio_pitches_user_id_idx").on(t.userId),
  index("radio_pitches_status_idx").on(t.status),
]);

export const insertRadioPitchSchema = createInsertSchema(radioPitches).omit({ id: true, createdAt: true, updatedAt: true });
export type RadioPitch = typeof radioPitches.$inferSelect;
export type InsertRadioPitch = typeof radioPitches.$inferInsert;

// ============================================================================
// VENUE / BOOKING CONTACTS CRM
// ============================================================================

export const venueContacts = pgTable("venue_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  venueName: text("venue_name").notNull(),
  city: text("city"),
  state: text("state"),
  country: text("country"),
  capacity: integer("capacity"),
  venueType: text("venue_type").default("club"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  contactRole: text("contact_role"),
  bookingEmail: text("booking_email"),
  website: text("website"),
  guaranteeMin: integer("guarantee_min"),
  guaranteeMax: integer("guarantee_max"),
  deal: text("deal"),
  status: text("status").default("prospect"),
  lastContactedAt: timestamp("last_contacted_at"),
  notes: text("notes"),
  rating: integer("rating").default(0),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("venue_contacts_user_id_idx").on(t.userId),
]);

export const insertVenueContactSchema = createInsertSchema(venueContacts).omit({ id: true, createdAt: true, updatedAt: true });
export type VenueContact = typeof venueContacts.$inferSelect;
export type InsertVenueContact = typeof venueContacts.$inferInsert;

// ============================================================================
// PROJECT BUDGET PLANNER
// ============================================================================

export const projectBudgets = pgTable("project_budgets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  projectId: varchar("project_id"),
  projectName: text("project_name").notNull(),
  budgetType: text("budget_type").default("album"),
  totalBudget: real("total_budget").default(0),
  currency: text("currency").default("USD"),
  status: text("status").default("planning"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("project_budgets_user_id_idx").on(t.userId),
]);

export const insertProjectBudgetSchema = createInsertSchema(projectBudgets).omit({ id: true, createdAt: true, updatedAt: true });
export type ProjectBudget = typeof projectBudgets.$inferSelect;

export const budgetLineItems = pgTable("budget_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  budgetId: varchar("budget_id").notNull(),
  userId: varchar("user_id").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  estimated: real("estimated").default(0),
  actual: real("actual"),
  vendor: text("vendor"),
  status: text("status").default("planned"),
  paidAt: timestamp("paid_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("budget_line_items_budget_id_idx").on(t.budgetId),
]);

export const insertBudgetLineItemSchema = createInsertSchema(budgetLineItems).omit({ id: true, createdAt: true });
export type BudgetLineItem = typeof budgetLineItems.$inferSelect;

// ============================================================================
// SAMPLE CLEARANCE TRACKER
// ============================================================================

export const sampleClearances = pgTable("sample_clearances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  trackTitle: text("track_title").notNull(),
  sampleSource: text("sample_source").notNull(),
  sampleArtist: text("sample_artist"),
  sampleLabel: text("sample_label"),
  samplePublisher: text("sample_publisher"),
  sampleStartTime: text("sample_start_time"),
  sampleDuration: integer("sample_duration"),
  contactEmail: text("contact_email"),
  contactName: text("contact_name"),
  clearanceType: text("clearance_type").default("master_and_sync"),
  status: text("status").default("needed"),
  fee: real("fee"),
  royaltyRate: real("royalty_rate"),
  clearedAt: timestamp("cleared_at"),
  expiresAt: timestamp("expires_at"),
  notes: text("notes"),
  documentUrl: text("document_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("sample_clearances_user_id_idx").on(t.userId),
  index("sample_clearances_status_idx").on(t.status),
]);

export const insertSampleClearanceSchema = createInsertSchema(sampleClearances).omit({ id: true, createdAt: true, updatedAt: true });
export type SampleClearance = typeof sampleClearances.$inferSelect;

// ============================================================================
// MUSIC VIDEO PRODUCTION TRACKER
// ============================================================================

export const musicVideoProductions = pgTable("music_video_productions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  trackTitle: text("track_title").notNull(),
  director: text("director"),
  productionCompany: text("production_company"),
  budget: real("budget"),
  shootDate: timestamp("shoot_date"),
  editDeadline: timestamp("edit_deadline"),
  releaseDate: timestamp("release_date"),
  platform: text("platform").default("youtube"),
  videoUrl: text("video_url"),
  thumbnailUrl: text("thumbnail_url"),
  stage: text("stage").default("concept"),
  views: integer("views").default(0),
  notes: text("notes"),
  locations: text("locations").array(),
  crew: jsonb("crew").default([]),
  callSheets: jsonb("call_sheets").default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("music_video_productions_user_id_idx").on(t.userId),
]);

export const insertMusicVideoProductionSchema = createInsertSchema(musicVideoProductions).omit({ id: true, createdAt: true, updatedAt: true });
export type MusicVideoProduction = typeof musicVideoProductions.$inferSelect;

// ============================================================================
// SONGWRITING / LYRICS SESSIONS
// ============================================================================

export const songwritingSessions = pgTable("songwriting_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  title: text("title").notNull(),
  status: text("status").default("in_progress"),
  genre: text("genre"),
  mood: text("mood"),
  bpm: integer("bpm"),
  key: text("key"),
  timeSignature: text("time_signature").default("4/4"),
  lyrics: text("lyrics"),
  structure: jsonb("structure").default([]),
  coWriters: text("co_writers").array(),
  aiAssisted: boolean("ai_assisted").default(false),
  tags: text("tags").array(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("songwriting_sessions_user_id_idx").on(t.userId),
]);

export const insertSongwritingSessionSchema = createInsertSchema(songwritingSessions).omit({ id: true, createdAt: true, updatedAt: true });
export type SongwritingSession = typeof songwritingSessions.$inferSelect;

// ============================================================================
// FAN EMAIL CAMPAIGNS
// ============================================================================

export const fanCampaigns = pgTable("fan_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  campaignType: text("campaign_type").default("newsletter"),
  status: text("status").default("draft"),
  segmentFilter: jsonb("segment_filter").default({}),
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  recipientCount: integer("recipient_count").default(0),
  openCount: integer("open_count").default(0),
  clickCount: integer("click_count").default(0),
  unsubscribeCount: integer("unsubscribe_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("fan_campaigns_user_id_idx").on(t.userId),
  index("fan_campaigns_status_idx").on(t.status),
]);

export const insertFanCampaignSchema = createInsertSchema(fanCampaigns).omit({ id: true, createdAt: true, updatedAt: true });
export type FanCampaign = typeof fanCampaigns.$inferSelect;

// ============================================================================
// CUSTOM WORKFLOW AUTOMATIONS
// ============================================================================

export const customWorkflows = pgTable("custom_workflows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description").default(""),
  triggerEvent: text("trigger_event").notNull(),
  triggerConditions: jsonb("trigger_conditions").default({}),
  actions: jsonb("actions").notNull().default([]),
  enabled: boolean("enabled").default(false),
  runCount: integer("run_count").default(0),
  lastRunAt: timestamp("last_run_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("custom_workflows_user_id_idx").on(t.userId),
  index("custom_workflows_enabled_idx").on(t.enabled),
]);

export const insertCustomWorkflowSchema = createInsertSchema(customWorkflows).omit({ id: true, createdAt: true, updatedAt: true });
export type CustomWorkflow = typeof customWorkflows.$inferSelect;
export type InsertCustomWorkflow = typeof customWorkflows.$inferInsert;

// ============================================================================
// JWT & REFRESH TOKENS (for Bearer-token / mobile API auth)
// ============================================================================

export const jwtTokens = pgTable("jwt_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  accessToken: text("access_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revoked: boolean("revoked").default(false),
  revokedAt: timestamp("revoked_at"),
  revokedReason: text("revoked_reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("jwt_tokens_user_id_idx").on(t.userId),
  index("jwt_tokens_revoked_idx").on(t.revoked),
]);

export const insertJwtTokenSchema = createInsertSchema(jwtTokens).omit({ id: true, createdAt: true });
export type JwtToken = typeof jwtTokens.$inferSelect;
export type InsertJWTToken = typeof jwtTokens.$inferInsert;

export const refreshTokens = pgTable("refresh_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  revoked: boolean("revoked").default(false),
  revokedAt: timestamp("revoked_at"),
  revokedReason: text("revoked_reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("refresh_tokens_user_id_idx").on(t.userId),
  index("refresh_tokens_token_idx").on(t.token),
]);

export const insertRefreshTokenSchema = createInsertSchema(refreshTokens).omit({ id: true, createdAt: true });
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type InsertRefreshToken = typeof refreshTokens.$inferInsert;

// ============================================================================
// MAX AI ASSISTANT — Persistent Conversation History
// ============================================================================

export const assistantConversations = pgTable("assistant_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("assistant_conversations_user_id_idx").on(t.userId),
]);

export const insertAssistantConversationSchema = createInsertSchema(assistantConversations).omit({ id: true, createdAt: true, updatedAt: true });
export type AssistantConversation = typeof assistantConversations.$inferSelect;
export type InsertAssistantConversation = typeof assistantConversations.$inferInsert;

export const assistantMessages = pgTable("assistant_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull(),
  role: varchar("role", { length: 16 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("assistant_messages_conversation_id_idx").on(t.conversationId),
]);

export const insertAssistantMessageSchema = createInsertSchema(assistantMessages).omit({ id: true, createdAt: true });
export type AssistantMessage = typeof assistantMessages.$inferSelect;
export type InsertAssistantMessage = typeof assistantMessages.$inferInsert;

// ============================================================================
// FINANCIAL CONFIG — database-driven rates (admin-editable, no deploy needed)
// ============================================================================

export const platformRoyaltyRates = pgTable("platform_royalty_rates", {
  id:                  serial("id").primaryKey(),
  platform:            text("platform").notNull().unique(),
  displayName:         text("display_name").notNull(),
  baseRatePerStream:   real("base_rate_per_stream").notNull(),
  premiumMultiplier:   real("premium_multiplier").default(1.0).notNull(),
  territoryMultipliers:jsonb("territory_multipliers"),
  notes:               text("notes"),
  updatedAt:           timestamp("updated_at").defaultNow(),
});
export const insertPlatformRoyaltyRateSchema = createInsertSchema(platformRoyaltyRates).omit({ id: true, updatedAt: true });
export type PlatformRoyaltyRate = typeof platformRoyaltyRates.$inferSelect;
export type InsertPlatformRoyaltyRate = typeof platformRoyaltyRates.$inferInsert;

export const taxTreatyRates = pgTable("tax_treaty_rates", {
  id:               serial("id").primaryKey(),
  countryCode:      text("country_code").notNull().unique(),
  countryName:      text("country_name").notNull(),
  withholdingRate:  real("withholding_rate").notNull(),
  treatyRate:       real("treaty_rate").notNull(),
  hasTreaty:        boolean("has_treaty").default(true).notNull(),
  notes:            text("notes"),
  updatedAt:        timestamp("updated_at").defaultNow(),
});
export const insertTaxTreatyRateSchema = createInsertSchema(taxTreatyRates).omit({ id: true, updatedAt: true });
export type TaxTreatyRate = typeof taxTreatyRates.$inferSelect;
export type InsertTaxTreatyRate = typeof taxTreatyRates.$inferInsert;

// ============================================================================
// STUDIO SAMPLES — database-backed sample library
// ============================================================================

export const studioSamples = pgTable("studio_samples", {
  id:          text("id").primaryKey(),
  name:        text("name").notNull(),
  category:    text("category").notNull(),
  subcategory: text("subcategory"),
  tags:        text("tags").array(),
  tempo:       integer("tempo"),
  key:         text("key"),
  duration:    real("duration"),
  audioUrl:    text("audio_url").notNull(),
  isBuiltIn:   boolean("is_built_in").default(true).notNull(),
  userId:      varchar("user_id"),
  createdAt:   timestamp("created_at").defaultNow(),
});
export const insertStudioSampleSchema = createInsertSchema(studioSamples).omit({ createdAt: true });
export type StudioSample = typeof studioSamples.$inferSelect;
export type InsertStudioSample = typeof studioSamples.$inferInsert;

// ============================================================================
// LABEL SETTINGS — ISRC registrant, UPC company prefix, etc.
// ============================================================================

export const labelSettings = pgTable("label_settings", {
  id:                 serial("id").primaryKey(),
  key:                text("key").notNull().unique(),
  value:              text("value").notNull(),
  description:        text("description"),
  updatedAt:          timestamp("updated_at").defaultNow(),
});
export const insertLabelSettingSchema = createInsertSchema(labelSettings).omit({ id: true, updatedAt: true });
export type LabelSetting = typeof labelSettings.$inferSelect;
export type InsertLabelSetting = typeof labelSettings.$inferInsert;

// ============================================================================
// LISTING STEMS — Individual stem files for beat/track marketplace listings
// ============================================================================
export const listingStems = pgTable("listing_stems", {
  id:            varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  listingId:     varchar("listing_id").notNull(),
  userId:        varchar("user_id").notNull(),
  stemName:      text("stem_name").notNull(),
  stemType:      text("stem_type").notNull().default("other"),
  fileUrl:       text("file_url").notNull(),
  fileSize:      integer("file_size").default(0),
  format:        text("format").default("wav"),
  sampleRate:    integer("sample_rate"),
  bitDepth:      integer("bit_depth"),
  price:         text("price"),
  downloadCount: integer("download_count").default(0),
  createdAt:     timestamp("created_at").defaultNow(),
});

export const insertListingStemSchema = createInsertSchema(listingStems).omit({ id: true, createdAt: true, downloadCount: true });
export type ListingStem = typeof listingStems.$inferSelect;
export type InsertListingStem = z.infer<typeof insertListingStemSchema>;
