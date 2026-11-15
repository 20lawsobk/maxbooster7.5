import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve(process.cwd(), "shared/schema.ts"), "utf8");
const migration = readFileSync(
  resolve(process.cwd(), "migrations/0006_dmca_workflow_contract.sql"),
  "utf8",
);
const journal = JSON.parse(
  readFileSync(resolve(process.cwd(), "migrations/meta/_journal.json"), "utf8"),
);

describe("DMCA database contract", () => {
  it("declares every workflow field in both Drizzle schema and migration", () => {
    const columns = [
      ["contentOwnerId", "content_owner_id"],
      ["claimantAddress", "claimant_address"],
      ["claimantPhone", "claimant_phone"],
      ["originalWorkUrl", "original_work_url"],
      ["originalWorkDescription", "original_work_description"],
      ["infringingUrl", "infringing_url"],
      ["goodFaithStatement", "good_faith_statement"],
      ["accuracyStatement", "accuracy_statement"],
      ["perjuryStatement", "perjury_statement"],
      ["relatedNoticeId", "related_notice_id"],
      ["counterNoticeReason", "counter_notice_reason"],
      ["counterNoticeEmailState", "counter_notice_email_state"],
      ["counterNoticeEmailMessageId", "counter_notice_email_message_id"],
      ["counterNoticeEmailAttemptedAt", "counter_notice_email_attempted_at"],
      ["processedAt", "processed_at"],
      ["processedBy", "processed_by"],
      ["adminNotes", "admin_notes"],
      ["strikeNumber", "strike_number"],
      ["isActive", "is_active"],
      ["revokedAt", "revoked_at"],
      ["revokedBy", "revoked_by"],
      ["revokeReason", "revoke_reason"],
      ["dmcaNoticeId", "dmca_notice_id"],
      ["releasedAt", "released_at"],
      ["releasedBy", "released_by"],
    ];

    for (const [property, column] of columns) {
      expect(schema, `Drizzle property ${property}`).toContain(`${property}: `);
      expect(migration, `migration column ${column}`).toContain(`"${column}"`);
    }
  });

  it("registers the migration exactly once in Drizzle's journal", () => {
    const entries = journal.entries.filter(
      (entry: { tag: string }) => entry.tag === "0006_dmca_workflow_contract",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].idx).toBe(6);
    expect(entries[0].breakpoints).toBe(true);
  });

  it("adds columns idempotently and does not drop or rewrite existing legal records", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS");
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).toContain('"counter_notice_email_state"');
    expect(migration).toContain('"related_notice_id"');
  });
});
