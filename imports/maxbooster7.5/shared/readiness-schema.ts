// Structural parity with readiness migrations >=0020. Custom commerce functions
// and triggers remain migration-only: schema push is NOT a migration substitute.
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, bigint, uuid, index, uniqueIndex, unique, primaryKey, foreignKey, check } from "drizzle-orm/pg-core";
import { users, artistProfiles } from "./schema";

const tz = (name: string) => timestamp(name, { withTimezone: true });
const money = (name: string) => bigint(name, { mode: "bigint" });

export const authSessionEpochs = pgTable("auth_session_epochs", {
  userId: varchar("user_id").primaryKey(),
  generation: money("generation").notNull().default(sql`1`),
  lastTotpStep: money("last_totp_step"),
  lastTotpSecretHash: text("last_totp_secret_hash"),
}, t => [check("auth_session_epochs_generation_check", sql`${t.generation} > 0`),
  foreignKey({ columns: [t.userId], foreignColumns: [users.id], name: "auth_session_epochs_user_id_fkey" }).onDelete("cascade")]);

export const accountErasureRequests = pgTable("account_erasure_requests", {
  userId: varchar("user_id").primaryKey(),
  requestId: uuid("request_id").notNull().defaultRandom(),
  requestedAt: tz("requested_at").notNull().defaultNow(),
  notBefore: tz("not_before").notNull().default(sql`now() + interval '30 days'`),
  status: text("status").notNull().default("pending_policy"),
  policyVersion: text("policy_version"), completedAt: tz("completed_at"),
}, t => [check("account_erasure_requests_status_check", sql`${t.status} IN ('pending_policy','cancelled','processing','completed')`),
  uniqueIndex("account_erasure_request_id_idx").on(t.requestId)]);

// Evidence survives cancellation/reopening and eventual users-row removal.
export const accountErasureSteps = pgTable("account_erasure_steps", {
  requestId: uuid("request_id").notNull(), systemId: text("system_id").notNull(),
  inventoryVersion: text("inventory_version").notNull(), policyVersion: text("policy_version").notNull(),
  approvalRef: text("approval_ref").notNull(), approvedBy: text("approved_by").notNull(),
  createdAt: tz("created_at").notNull().defaultNow(),
  status: text("status").notNull().default("pending"), attempts: integer("attempts").notNull().default(0),
  leaseId: uuid("lease_id"), leaseUntil: tz("lease_until"), retryAt: tz("retry_at"),
  receiptRef: text("receipt_ref"), acknowledgedAt: tz("acknowledged_at"),
}, t => [
  primaryKey({ columns: [t.requestId, t.systemId], name: "account_erasure_steps_pkey" }),
  check("account_erasure_steps_status_check", sql`${t.status} IN ('pending','running','retry','acknowledged')`),
  check("account_erasure_steps_check", sql`${t.status} <> 'acknowledged' OR (${t.receiptRef} IS NOT NULL AND ${t.acknowledgedAt} IS NOT NULL)`),
  index("account_erasure_steps_retry_idx").on(t.status, t.retryAt, t.leaseUntil),
]);

export const integrationNotificationDigest = pgTable("integration_notification_digest", {
  id: uuid("id").primaryKey(), userId: varchar("user_id").notNull(),
  type: text("type").notNull(), title: text("title").notNull(), message: text("message").notNull(),
  link: text("link"), frequency: text("frequency").notNull(), dueAt: tz("due_at").notNull(),
  state: text("state").notNull(), owner: uuid("owner"), providerId: text("provider_id"), error: text("error"),
  createdAt: tz("created_at").notNull().defaultNow(), updatedAt: tz("updated_at").notNull().defaultNow(),
}, t => [
  foreignKey({ columns: [t.userId], foreignColumns: [users.id], name: "integration_notification_digest_user_id_fkey" }).onDelete("cascade"),
  check("integration_notification_digest_frequency_check", sql`${t.frequency} IN ('daily','weekly')`),
  check("integration_notification_digest_state_check", sql`${t.state} IN ('pending','started','accepted','rejected','unknown','suppressed')`),
  index("integration_notification_digest_due").on(t.dueAt, t.id).where(sql`${t.state} = 'pending'`),
  index("integration_notification_digest_owner").on(t.owner).where(sql`${t.owner} IS NOT NULL`),
  index("integration_notification_digest_user_due").on(t.userId, t.dueAt).where(sql`${t.state} = 'pending'`),
]);

export const integrationCatalogJobs = pgTable("integration_catalog_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: varchar("profile_id").notNull(),
  userId: varchar("user_id").notNull(),
  state: text("state").notNull().default("pending"), attempts: integer("attempts").notNull().default(0),
  leaseOwner: uuid("lease_owner"), leaseUntil: tz("lease_until"),
  availableAt: tz("available_at").notNull().defaultNow(), createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow(), result: jsonb("result"), error: text("error"),
}, t => [unique("integration_catalog_jobs_profile_id_key").on(t.profileId),
  foreignKey({ columns: [t.profileId], foreignColumns: [artistProfiles.id], name: "integration_catalog_jobs_profile_id_fkey" }).onDelete("cascade"),
  foreignKey({ columns: [t.userId], foreignColumns: [users.id], name: "integration_catalog_jobs_user_id_fkey" }).onDelete("cascade"),
  check("integration_catalog_jobs_state_check", sql`${t.state} IN ('pending','running','completed','failed')`),
  index("integration_catalog_jobs_claim_idx").on(t.state, t.availableAt, t.leaseUntil)]);

export const integrationCatalogTransfers = pgTable("integration_catalog_transfers", {
  id: text("id").primaryKey(), userId: varchar("user_id").notNull(),
  progress: jsonb("progress").notNull(), updatedAt: tz("updated_at").notNull().defaultNow(),
}, t => [index("integration_catalog_transfers_user_idx").on(t.userId, t.updatedAt.desc().nullsFirst()),
  foreignKey({ columns: [t.userId], foreignColumns: [users.id], name: "integration_catalog_transfers_user_id_fkey" }).onDelete("cascade")]);

export const commerceWebhookReceipts = pgTable("commerce_webhook_receipts", {
  eventId: text("event_id").primaryKey(), eventType: text("event_type").notNull(), completedAt: tz("completed_at").notNull().defaultNow(),
});
export const commerceWebhookInbox = pgTable("commerce_webhook_inbox", {
  eventId: text("event_id").primaryKey(), eventType: text("event_type").notNull(), payload: jsonb("payload").notNull(),
  state: text("state").notNull().default("pending"), leaseUntil: tz("lease_until"), leaseToken: text("lease_token"),
  attempts: integer("attempts").notNull().default(0), error: text("error"), receivedAt: tz("received_at").notNull().defaultNow(),
});
export const integrationDistributionSubmissions = pgTable("integration_distribution_submissions", {
  provider: text("provider").notNull(), userId: varchar("user_id").notNull(),
  releaseId: varchar("release_id").notNull(), payloadHash: text("payload_hash").notNull(),
  owner: uuid("owner").notNull().unique("integration_distribution_submissions_owner_key"),
  state: text("state").notNull(), checkpoint: jsonb("checkpoint").notNull().default(sql`'{}'::jsonb`),
  result: jsonb("result"), error: text("error"), createdAt: tz("created_at").notNull().defaultNow(), updatedAt: tz("updated_at").notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.provider, t.userId, t.releaseId], name: "integration_distribution_submissions_pkey" }),
  foreignKey({ columns: [t.userId], foreignColumns: [users.id], name: "integration_distribution_submissions_user_id_fkey" }).onDelete("cascade"),
  check("integration_distribution_submissions_provider_check", sql`${t.provider} IN ('labelgrid','toolost')`),
  check("integration_distribution_submissions_state_check", sql`${t.state} IN ('started','completed','unknown')`)]);

export const commerceJournals = pgTable("commerce_journals", {
  id: text("id").primaryKey(), currency: text("currency").notNull(), source: text("source").notNull(), createdAt: tz("created_at").notNull().defaultNow(),
});
export const commerceEntries = pgTable("commerce_entries", {
  journalId: text("journal_id").notNull(),
  line: integer("line").notNull(), account: text("account").notNull(), userId: text("user_id"), amountCents: money("amount_cents").notNull(),
}, t => [primaryKey({ columns: [t.journalId, t.line], name: "commerce_entries_pkey" }), index("commerce_entries_account").on(t.userId, t.account),
  foreignKey({ columns: [t.journalId], foreignColumns: [commerceJournals.id], name: "commerce_entries_journal_id_fkey" })]);
export const commerceAllocations = pgTable("commerce_allocations", {
  id: text("id").primaryKey(), sourceId: text("source_id").notNull(), userId: text("user_id").notNull(),
  currency: text("currency").notNull(), amountCents: money("amount_cents").notNull(),
  reversedCents: money("reversed_cents").notNull().default(sql`0`), drawnCents: money("drawn_cents").notNull().default(sql`0`),
  createdAt: tz("created_at").notNull().defaultNow(),
}, t => [unique("commerce_allocations_source_id_user_id_key").on(t.sourceId, t.userId),
  check("commerce_allocations_amount_cents_check", sql`${t.amountCents} >= 0`),
  check("commerce_allocations_check", sql`${t.reversedCents} >= 0 AND ${t.reversedCents} <= ${t.amountCents}`),
  check("commerce_allocations_check1", sql`${t.drawnCents} >= 0 AND ${t.drawnCents} <= ${t.amountCents}`)]);
export const commerceOperations = pgTable("commerce_operations", {
  id: text("id").primaryKey(), kind: text("kind").notNull(), userId: text("user_id").notNull(), currency: text("currency").notNull(),
  amountCents: money("amount_cents").notNull(), state: text("state").notNull().default("pending"), payload: jsonb("payload").notNull(),
  transferId: text("transfer_id"), providerId: text("provider_id"), leaseUntil: tz("lease_until"), leaseToken: text("lease_token"),
  attempts: integer("attempts").notNull().default(0), error: text("error"),
  createdAt: tz("created_at").notNull().defaultNow(), updatedAt: tz("updated_at").notNull().defaultNow(),
}, t => [check("commerce_operations_amount_cents_check", sql`${t.amountCents} > 0`), index("commerce_operations_pending").on(t.state, t.leaseUntil)]);
export const commerceDraws = pgTable("commerce_draws", {
  operationId: text("operation_id").notNull(),
  allocationId: text("allocation_id").notNull(),
  amountCents: money("amount_cents").notNull(), compensatedCentsAtDraw: money("compensated_cents_at_draw").notNull().default(sql`0`),
}, t => [primaryKey({ columns: [t.operationId, t.allocationId], name: "commerce_draws_pkey" }), check("commerce_draws_amount_cents_check", sql`${t.amountCents} > 0`),
  foreignKey({ columns: [t.operationId], foreignColumns: [commerceOperations.id], name: "commerce_draws_operation_id_fkey" }),
  foreignKey({ columns: [t.allocationId], foreignColumns: [commerceAllocations.id], name: "commerce_draws_allocation_id_fkey" })]);
export const commerceSources = pgTable("commerce_sources", {
  id: text("id").primaryKey(), kind: text("kind").notNull(), paymentIntent: text("payment_intent").unique("commerce_sources_payment_intent_key"),
  currency: text("currency").notNull(), grossCents: money("gross_cents").notNull(), feeCents: money("fee_cents").notNull(),
  taxCents: money("tax_cents").notNull().default(sql`0`), compensatedTaxCents: money("compensated_tax_cents").notNull().default(sql`0`),
  refundedCents: money("refunded_cents").notNull().default(sql`0`), disputedCents: money("disputed_cents").notNull().default(sql`0`),
  pendingRefundCents: money("pending_refund_cents").notNull().default(sql`0`), compensatedCents: money("compensated_cents").notNull().default(sql`0`),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`), createdAt: tz("created_at").notNull().defaultNow(),
}, t => [check("commerce_sources_gross_cents_check", sql`${t.grossCents} > 0`),
  check("commerce_sources_fee_cents_check", sql`${t.feeCents} >= 0`), check("commerce_sources_tax_cents_check", sql`${t.taxCents} >= 0`)]);
export const commerceStatements = pgTable("commerce_statements", {
  statementId: text("statement_id").primaryKey(), userId: text("user_id").notNull(), currency: text("currency").notNull(),
  payableCents: money("payable_cents").notNull(), funded: boolean("funded").notNull().default(false),
  details: jsonb("details").notNull(), fundingRef: text("funding_ref").unique("commerce_statements_funding_ref_key"),
  createdAt: tz("created_at").notNull().defaultNow(),
});
export const commerceSchedules = pgTable("commerce_schedules", {
  userId: text("user_id").primaryKey(), nextDue: tz("next_due").notNull(),
});
export const genericExportJobs = pgTable("generic_export_jobs", {
  id: varchar("id").primaryKey(), userId: varchar("user_id").notNull(), name: text("name").notNull(),
  type: text("type").notNull(), format: text("format").notNull(), projectId: varchar("project_id"), settings: jsonb("settings").notNull(),
  status: text("status").notNull().default("queued"), progress: integer("progress").notNull().default(0),
  artifact: jsonb("artifact"), error: text("error"), retryCount: integer("retry_count").notNull().default(0),
  createdAt: tz("created_at").notNull().defaultNow(), updatedAt: tz("updated_at").notNull().defaultNow(), completedAt: tz("completed_at"),
}, t => [index("generic_export_jobs_user_created_idx").on(t.userId, t.createdAt.desc().nullsFirst()), index("generic_export_jobs_status_idx").on(t.status, t.updatedAt)]);
export const integrationSmsAttempts = pgTable("integration_sms_attempts", {
  operationKey: text("operation_key").primaryKey(), userId: varchar("user_id").notNull(),
  state: text("state").notNull(), providerId: text("provider_id").unique("integration_sms_attempts_provider_id_key"),
  providerStatus: text("provider_status"), error: text("error"), createdAt: tz("created_at").notNull().defaultNow(), updatedAt: tz("updated_at").notNull().defaultNow(),
}, t => [check("integration_sms_attempts_state_check", sql`${t.state} IN ('started','accepted','delivered','failed','unknown')`),
  foreignKey({ columns: [t.userId], foreignColumns: [users.id], name: "integration_sms_attempts_user_id_fkey" }).onDelete("cascade")]);
export const runtimeBackupCatalog = pgTable("runtime_backup_catalog", {
  key: text("key").primaryKey(), name: text("name").notNull(), createdAt: tz("created_at").notNull().defaultNow(),
  size: money("size").notNull(), checksum: text("checksum").notNull(), state: text("state").notNull(),
}, t => [check("runtime_backup_catalog_size_check", sql`${t.size} >= 0`),
  check("runtime_backup_catalog_state_check", sql`${t.state} IN ('pending','verified','deleting')`)]);
export const runtimeBackupRuns = pgTable("runtime_backup_runs", {
  day: text("day").primaryKey(), owner: text("owner").notNull(), targetIdentity: text("target_identity").notNull(), state: text("state").notNull(),
  startedAt: tz("started_at").notNull().defaultNow(), leaseUntil: tz("lease_until").notNull().default(sql`now() + interval '5 minutes'`), finishedAt: tz("finished_at"),
}, t => [check("runtime_backup_runs_state_check", sql`${t.state} IN ('running','complete','failed')`)]);
export const pgSessions = pgTable("pg_sessions", {
  sid: text("sid").primaryKey(), sess: text("sess").notNull(), expire: money("expire").notNull(),
}, t => [index("pg_sessions_expire_idx").on(t.expire)]);
export const growthSplitRevisions = pgTable("growth_split_revisions", {
  sheetId: text("sheet_id").notNull(), revision: integer("revision").notNull(), content: jsonb("content").notNull(),
  contentHash: text("content_hash").notNull(), createdAt: tz("created_at").notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.sheetId, t.revision], name: "growth_split_revisions_pkey" }),
  check("growth_split_revisions_revision_check", sql`${t.revision} > 0`)]);
export const growthSplitAssents = pgTable("growth_split_assents", {
  sheetId: text("sheet_id").notNull(), revision: integer("revision").notNull(), userId: text("user_id").notNull(),
  signatureHash: text("signature_hash").notNull(), signedAt: tz("signed_at").notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.sheetId, t.revision, t.userId], name: "growth_split_assents_pkey" }),
  foreignKey({ columns: [t.sheetId, t.revision], foreignColumns: [growthSplitRevisions.sheetId, growthSplitRevisions.revision], name: "growth_split_assents_sheet_id_revision_fkey" })]);
export const growthFanPermissions = pgTable("growth_fan_permissions", {
  artistId: text("artist_id").notNull(), email: text("email").notNull(), state: text("state").notNull(),
  tokenHash: text("token_hash"), tokenExpiresAt: tz("token_expires_at"), consentAt: tz("consent_at"), suppressedAt: tz("suppressed_at"),
}, t => [primaryKey({ columns: [t.artistId, t.email], name: "growth_fan_permissions_pkey" }),
  check("growth_fan_permissions_state_check", sql`${t.state} IN ('pending','consented','suppressed')`),
  uniqueIndex("growth_fan_token_idx").on(t.tokenHash)]);
export const growthFanCommands = pgTable("growth_fan_commands", {
  id: text("id").primaryKey(), artistId: text("artist_id").notNull(), commandKey: text("command_key").notNull(),
  subject: text("subject").notNull(), body: text("body").notNull(), createdAt: tz("created_at").notNull().defaultNow(),
}, t => [unique("growth_fan_commands_artist_id_command_key_key").on(t.artistId, t.commandKey)]);
export const growthFanRecipients = pgTable("growth_fan_recipients", {
  commandId: text("command_id").notNull(), email: text("email").notNull(),
  state: text("state").notNull().default("pending"),
  unsubscribeHash: text("unsubscribe_hash").notNull().unique("growth_fan_recipients_unsubscribe_hash_key"), unsubscribeToken: text("unsubscribe_token").notNull(),
  attemptedAt: tz("attempted_at"), completedAt: tz("completed_at"), providerMessageId: text("provider_message_id"), outcomeReason: text("outcome_reason"),
}, t => [primaryKey({ columns: [t.commandId, t.email], name: "growth_fan_recipients_pkey" }),
  foreignKey({ columns: [t.commandId], foreignColumns: [growthFanCommands.id], name: "growth_fan_recipients_command_id_fkey" }),
  check("growth_fan_recipients_state_check", sql`${t.state} IN ('pending','sending','accepted','unknown','suppressed','delivered','bounced','complained')`),
  index("growth_fan_pending_idx").on(t.commandId, t.state), index("growth_fan_receipt_idx").on(t.providerMessageId)]);
export const growthFanProviderEvents = pgTable("growth_fan_provider_events", {
  eventId: text("event_id").primaryKey(), providerMessageId: text("provider_message_id").notNull(), eventType: text("event_type").notNull(),
  occurredAt: tz("occurred_at").notNull(), receivedAt: tz("received_at").notNull().defaultNow(),
}, t => [index("growth_fan_event_receipt_idx").on(t.providerMessageId)]);
export const growthMerchPayments = pgTable("growth_merch_payments", {
  orderId: text("order_id").primaryKey(), buyerId: text("buyer_id").notNull(), commandKey: text("command_key").notNull(),
  currency: text("currency").notNull(), subtotalCents: money("subtotal_cents").notNull(),
  collectedCents: money("collected_cents").notNull().default(sql`0`), refundedCents: money("refunded_cents").notNull().default(sql`0`),
  checkoutId: text("checkout_id").unique("growth_merch_payments_checkout_id_key"), checkoutUrl: text("checkout_url"),
  state: text("state").notNull(), createdAt: tz("created_at").notNull().defaultNow(),
}, t => [unique("growth_merch_payments_buyer_id_command_key_key").on(t.buyerId, t.commandKey),
  check("growth_merch_payments_currency_check", sql`${t.currency} = 'usd'`),
  check("growth_merch_payments_subtotal_cents_check", sql`${t.subtotalCents} >= 0`),
  check("growth_merch_payments_collected_cents_check", sql`${t.collectedCents} >= 0`),
  check("growth_merch_payments_check", sql`${t.refundedCents} >= 0 AND ${t.refundedCents} <= ${t.collectedCents}`),
  check("growth_merch_payments_state_check", sql`${t.state} IN ('reserved','checkout','paid','expired','refunded')`)]);
export const growthMerchPaymentEvents = pgTable("growth_merch_payment_events", {
  eventId: text("event_id").primaryKey(), orderId: text("order_id").notNull(),
  eventType: text("event_type").notNull(), receivedAt: tz("received_at").notNull().defaultNow(),
}, t => [foreignKey({ columns: [t.orderId], foreignColumns: [growthMerchPayments.orderId], name: "growth_merch_payment_events_order_id_fkey" })]);
export const clientSyncReceipts = pgTable("client_sync_receipts", {
  ownerId: varchar("owner_id").notNull(), operationId: varchar("operation_id", { length: 160 }).notNull(),
  payloadHash: varchar("payload_hash", { length: 64 }).notNull(), receipt: jsonb("receipt").notNull(), createdAt: tz("created_at").notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.ownerId, t.operationId], name: "client_sync_receipts_pkey" }),
  foreignKey({ columns: [t.ownerId], foreignColumns: [users.id], name: "client_sync_receipts_owner_id_fkey" })]);