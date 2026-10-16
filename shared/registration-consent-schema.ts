import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./schema";

export const registrationConsents = pgTable(
  "registration_consents",
  {
    userId: varchar("user_id").primaryKey(),
    birthdate: date("birthdate").notNull(),
    ageVerified: boolean("age_verified").notNull().default(false),
    tosAcceptedAt: timestamp("tos_accepted_at").notNull(),
    tosVersion: text("tos_version").notNull(),
    privacyAcceptedAt: timestamp("privacy_accepted_at").notNull(),
    privacyVersion: text("privacy_version").notNull(),
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    marketingConsentAt: timestamp("marketing_consent_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "registration_consents_user_id_fkey",
    }).onDelete("cascade"),
    check(
      "registration_consents_age_verified_check",
      sql`${table.ageVerified} = true`,
    ),
  ],
);

export const consentLogs = pgTable(
  "consent_logs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: varchar("user_id").notNull(),
    consentType: text("consent_type").notNull(),
    action: text("action").notNull(),
    version: text("version"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "consent_logs_user_id_fkey",
    }).onDelete("cascade"),
    check(
      "consent_logs_type_check",
      sql`${table.consentType} IN ('tos', 'privacy', 'marketing', 'cookies')`,
    ),
    check(
      "consent_logs_action_check",
      sql`${table.action} IN ('accepted', 'rejected', 'withdrawn')`,
    ),
    index("consent_logs_user_created_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
    index("consent_logs_type_created_idx").on(
      table.consentType,
      table.createdAt.desc(),
    ),
  ],
);
