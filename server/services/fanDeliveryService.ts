import { createHash, randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { sendTransactionalNoRetry } from "./fanMailAdapter";

const rows = (r: any): any[] => r.rows ?? r;
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const escape = (s: string) => s.replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
function origin() {
  const url = new URL(process.env.APP_URL || process.env.PUBLIC_APP_URL || "");
  if (url.protocol !== "https:") throw new Error("HTTPS APP_URL is required for fan consent links");
  return url.origin;
}
export async function requestFanConsent(artistId: string, subscriberId: string) {
  const base = origin();
  const token = randomBytes(32).toString("hex");
  const result = await db.transaction(async tx => {
    const fan = rows(await tx.execute(sql`SELECT lower(trim(s.email)) AS email,
      coalesce(u.artist_name,u.username) AS artist_name FROM fan_subscribers s
      JOIN users u ON u.id=s.user_id WHERE s.id = ${subscriberId} AND s.user_id = ${artistId}`))[0];
    if (!fan) throw new Error("Subscriber not found");
    if (!fan.artist_name) throw new Error("Set your artist name before requesting fan consent");
    // Rate limit invitations and never silently re-enable suppressed contacts.
    const permission = rows(await tx.execute(sql`INSERT INTO growth_fan_permissions
      (artist_id,email,state,token_hash,token_expires_at)
      VALUES (${artistId},${fan.email},'pending',${digest(token)},now()+interval '24 hours')
      ON CONFLICT (artist_id,email) DO UPDATE SET token_hash=EXCLUDED.token_hash,
        token_expires_at=EXCLUDED.token_expires_at
      WHERE growth_fan_permissions.state = 'pending'
        AND growth_fan_permissions.token_expires_at < now()
      RETURNING email`))[0];
    if (!permission) throw new Error("Contact is already consented, suppressed, or has a pending invitation");
    return { ...permission, artistName: fan.artist_name };
  });
  const receipt = await sendTransactionalNoRetry({
    commandKey: `fan-consent:${digest(token)}`,
    to: result.email, subject: "Confirm artist email updates",
    html: `<p>${escape(result.artistName)} requested permission to send you updates via Max Booster.</p>
      <p><a href="${base}/api/fan-hub/consent/${token}">Review and confirm subscription</a></p>
      <p>If you did not request updates, ignore this message. It expires in 24 hours.</p>`,
  });
  return receipt;
}
export async function confirmFanConsent(token: string) {
  const result = rows(await db.execute(sql`UPDATE growth_fan_permissions SET
    state='consented',consent_at=now(),token_hash=NULL,token_expires_at=NULL
    WHERE token_hash=${digest(token)} AND state='pending' AND token_expires_at>now()
    RETURNING email`));
  return result.length > 0;
}
export async function unsubscribeFan(token: string) {
  return db.transaction(async tx => {
    const recipient = rows(await tx.execute(sql`SELECT r.email,c.artist_id
      FROM growth_fan_recipients r JOIN growth_fan_commands c ON c.id=r.command_id
      WHERE r.unsubscribe_hash=${digest(token)}`))[0];
    if (!recipient) return false;
    await tx.execute(sql`UPDATE growth_fan_permissions SET state='suppressed',
      suppressed_at=now(),token_hash=NULL WHERE artist_id=${recipient.artist_id}
      AND email=${recipient.email}`);
    await tx.execute(sql`UPDATE growth_fan_recipients SET state='suppressed'
      WHERE state='pending' AND email=${recipient.email} AND command_id IN
        (SELECT id FROM growth_fan_commands WHERE artist_id=${recipient.artist_id})`);
    return true;
  });
}
export async function enqueueFanDelivery(
  artistId: string, commandKey: string, subject: string, body: string,
) {
  origin(); // Reject misconfiguration before reserving a command.
  return db.transaction(async tx => {
    const id = randomUUID();
    await tx.execute(sql`INSERT INTO growth_fan_commands(id,artist_id,command_key,subject,body)
      VALUES (${id},${artistId},${commandKey},${subject},${body})
      ON CONFLICT (artist_id,command_key) DO NOTHING`);
    const command = rows(await tx.execute(sql`SELECT * FROM growth_fan_commands
      WHERE artist_id=${artistId} AND command_key=${commandKey} FOR UPDATE`))[0];
    if (command.subject !== subject || command.body !== body)
      throw new Error("Idempotency key is already bound to different message content");
    if (command.id !== id) return command.id as string;
    const audience = rows(await tx.execute(sql`SELECT DISTINCT lower(trim(s.email)) AS email
      FROM fan_subscribers s JOIN growth_fan_permissions p ON p.artist_id=s.user_id
        AND p.email=lower(trim(s.email)) AND p.state='consented'
      WHERE s.user_id=${artistId}`));
    if (!audience.length) throw new Error("No consented subscribers are eligible for this broadcast");
    for (const fan of audience) {
      const token = randomBytes(32).toString("hex");
      await tx.execute(sql`INSERT INTO growth_fan_recipients
        (command_id,email,unsubscribe_hash,unsubscribe_token)
        VALUES (${id},${fan.email},${digest(token)},${token})`);
    }
    return id;
  });
}

// Each claim commits BEFORE the external effect. Never retry an uncertain effect.
// An operator/worker can resume pending rows using this same entry point.
export async function processFanDelivery(commandId: string, artistId: string, limit = 50) {
  const base = origin();
  const command = rows(await db.execute(sql`SELECT * FROM growth_fan_commands
    WHERE id=${commandId} AND artist_id=${artistId}`))[0];
  if (!command) throw new Error("Message not found");
  for (let i = 0; i < Math.min(limit, 50); i++) {
    const recipient = await db.transaction(async tx => {
      const fan = rows(await tx.execute(sql`SELECT r.* FROM growth_fan_recipients r
        WHERE r.command_id=${commandId} AND r.state='pending'
        ORDER BY r.email LIMIT 1 FOR UPDATE SKIP LOCKED`))[0];
      if (!fan) return null;
      const permitted = rows(await tx.execute(sql`SELECT state FROM growth_fan_permissions
        WHERE artist_id=${artistId} AND email=${fan.email} FOR UPDATE`))[0]?.state === "consented";
      await tx.execute(sql`UPDATE growth_fan_recipients
        SET state=${permitted ? "sending" : "suppressed"},attempted_at=now()
        WHERE command_id=${commandId} AND email=${fan.email}`);
      return { ...fan, permitted };
    });
    if (!recipient) break;
    if (!recipient.permitted) continue;
    let receipt: Awaited<ReturnType<typeof sendTransactionalNoRetry>>;
    try {
      receipt = await sendTransactionalNoRetry({
        commandKey: `fan:${digest(`${commandId}:${recipient.email}`)}`,
        to: recipient.email, subject: command.subject,
        html: `<div>${escape(command.body).replace(/\n/g, "<br>")}</div>
          <p><a href="${base}/api/fan-hub/unsubscribe/${recipient.unsubscribe_token}">Unsubscribe from this artist</a></p>`,
      });
    } catch (error) {
      receipt = { status: "unknown", reason: error instanceof Error ? error.message : "Unknown transport failure" };
    }
    await db.transaction(async tx => {
      if (receipt.status === "accepted")
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${receipt.providerMessageId}))`);
      await tx.execute(sql`UPDATE growth_fan_recipients
        SET state=${receipt.status},completed_at=now(),
          provider_message_id=${receipt.status === "accepted" ? receipt.providerMessageId : null},
          outcome_reason=${receipt.status === "unknown" ? receipt.reason : null}
        WHERE command_id=${commandId} AND email=${recipient.email} AND state='sending'`);
      if (receipt.status === "accepted") await reconcileFanMailReceipt(tx, receipt.providerMessageId);
    });
  }
  return getFanDelivery(commandId, artistId);
}
export async function getFanDelivery(commandId: string, artistId: string) {
  const result = rows(await db.execute(sql`SELECT r.state,count(*)::integer AS count
    FROM growth_fan_recipients r JOIN growth_fan_commands c ON c.id=r.command_id
    WHERE c.id=${commandId} AND c.artist_id=${artistId} GROUP BY r.state`));
  const counts = Object.fromEntries(result.map(r => [r.state, Number(r.count)]));
  return { id: commandId, acceptedCount: counts.accepted ?? 0,
    pendingCount: counts.pending ?? 0, unknownCount: (counts.unknown ?? 0) + (counts.sending ?? 0),
    suppressedCount: counts.suppressed ?? 0, deliveredCount: counts.delivered ?? 0,
    bouncedCount: counts.bounced ?? 0, complainedCount: counts.complained ?? 0,
    status: counts.pending ? "pending" : (counts.unknown || counts.sending) ? "needs_reconciliation" : "processed" };
}

export async function drainPendingFanDeliveries(commandLimit = 10) {
  const commands = rows(await db.execute(sql`SELECT c.id,c.artist_id FROM growth_fan_commands c
    WHERE EXISTS (SELECT 1 FROM growth_fan_recipients r WHERE r.command_id=c.id AND r.state='pending')
    ORDER BY c.created_at LIMIT ${Math.max(1, Math.min(commandLimit, 10))}`));
  const outcomes = [];
  for (const command of commands)
    outcomes.push(await processFanDelivery(command.id, command.artist_id, 50));
  return outcomes;
}

/** Notification webhook owner MUST authenticate provider signature before calling. */
export async function applyVerifiedFanMailEvent(event: {
  eventId: string; providerMessageId: string;
  type: "delivered" | "bounced" | "complained"; occurredAt: Date;
}) {
  if (!event.eventId || !event.providerMessageId || !Number.isFinite(event.occurredAt.getTime()))
    throw new Error("Invalid provider mail event");
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${event.providerMessageId}))`);
    // Keep unmatched events too: provider callback can precede local receipt commit.
    await tx.execute(sql`INSERT INTO growth_fan_provider_events
      (event_id,provider_message_id,event_type,occurred_at)
      VALUES (${event.eventId},${event.providerMessageId},${event.type},${event.occurredAt})
      ON CONFLICT (event_id) DO NOTHING`);
    await reconcileFanMailReceipt(tx, event.providerMessageId);
  });
}
async function reconcileFanMailReceipt(tx: any, providerMessageId: string) {
  const events = rows(await tx.execute(sql`SELECT event_type FROM growth_fan_provider_events
    WHERE provider_message_id=${providerMessageId}`));
  const state = events.some(e => e.event_type === "complained") ? "complained" :
    events.some(e => e.event_type === "bounced") ? "bounced" :
    events.some(e => e.event_type === "delivered") ? "delivered" : null;
  if (!state) return;
  const recipients = rows(await tx.execute(sql`UPDATE growth_fan_recipients SET state=${state}
    WHERE provider_message_id=${providerMessageId} RETURNING email,command_id`));
  if (state !== "delivered") {
    for (const recipient of recipients) {
      await tx.execute(sql`UPDATE growth_fan_permissions SET state='suppressed',
        suppressed_at=now(),token_hash=NULL WHERE email=${recipient.email}`);
      await tx.execute(sql`UPDATE growth_fan_recipients SET state='suppressed'
        WHERE email=${recipient.email} AND state='pending'`);
    }
  }
}