/**
 * Audit trail durability — verifies that safety audit events emitted through
 * the WAL-buffered logger actually persist to the canonical audit_logs table
 * (shared/schema.ts contract), including the drifted-field mapping into
 * `details` (category/severity/target/wal_id) and severity→risk mapping.
 *
 * A critical-severity event forces an immediate flush, so the test does not
 * depend on the periodic flush timer.
 */
import { describe, it, expect } from "vitest";
import { audit } from "../server/safety/auditLogger";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

describe("Audit log persistence (canonical contract)", () => {
  it("persists a critical audit event to audit_logs and maps fields", async () => {
    const marker = `audit_test_${Date.now()}`;

    const walId = await audit({
      category: "security",
      severity: "critical",
      action: marker,
      ipAddress: "203.0.113.7",
      targetId: "target-123",
      targetType: "test_resource",
      success: false,
      errorMessage: "synthetic failure for persistence test",
      details: { probe: true },
    });
    expect(walId).toBeTruthy();

    // Critical events flush immediately; poll briefly for the row.
    let row: Record<string, unknown> | undefined;
    for (let i = 0; i < 10 && !row; i++) {
      const res = await db.execute(
        sql`SELECT * FROM audit_logs WHERE action = ${marker} LIMIT 1`,
      );
      row = res?.rows?.[0] as Record<string, unknown> | undefined;
      if (!row) await new Promise((r) => setTimeout(r, 500));
    }

    expect(row, "audit row must be durably persisted").toBeTruthy();
    expect(row!.ip).toBe("203.0.113.7");
    expect(row!.result).toBe("failure");
    expect(row!.risk).toBe("critical");
    expect(row!.resource).toBe("test_resource");
    const details = row!.details as Record<string, unknown>;
    expect(details.wal_id).toBe(walId);
    expect(details.category).toBe("security");
    expect(details.severity).toBe("critical");
    expect(details.target_id).toBe("target-123");
    expect(details.error_message).toContain("synthetic failure");
    expect(details.probe).toBe(true);

    // Idempotency: a WAL retry with the same wal_id must not duplicate.
    const dup = await db.execute(
      sql`SELECT COUNT(*)::int AS n FROM audit_logs WHERE details->>'wal_id' = ${walId}`,
    );
    expect((dup?.rows?.[0] as { n: number }).n).toBe(1);

    // Cleanup
    await db.execute(sql`DELETE FROM audit_logs WHERE action = ${marker}`);
  });
});
