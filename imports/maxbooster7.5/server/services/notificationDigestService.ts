import { randomUUID } from "node:crypto";
import { pool } from "../db.js";
import { emailService } from "./emailService.js";
import { notificationAllowed } from "./notificationPreferences.js";

export function digestFrequency(settings: any): "daily" | "weekly" | undefined {
  const frequency = settings?.email?.frequency;
  return frequency === "daily" || frequency === "weekly" ? frequency : undefined;
}

/** Digest eligibility is independent of quiet hours at event creation. */
export function digestAllowed(settings: any, type: string, now = new Date(), checkQuiet = false) {
  return !!digestFrequency(settings) && notificationAllowed({
    ...settings,
    email: { ...settings.email, frequency: "instant" },
    ...(checkQuiet ? {} : { quietHours: { enabled: false } }),
  }, type, "email", now);
}

export async function enqueueNotificationDigest(input: {
  userId: string; type: string; title: string; message: string; link?: string;
}, settings: unknown): Promise<boolean> {
  if (!digestAllowed(settings, input.type)) return false;
  const frequency = digestFrequency(settings);
  // Fixed UTC windows are explicit, reproducible across replicas and restarts.
  const width = frequency === "weekly" ? 7 * 86400000 : 86400000;
  const due = new Date((Math.floor(Date.now() / width) + 1) * width);
  await pool.query(
    `INSERT INTO integration_notification_digest
     (id,user_id,type,title,message,link,frequency,due_at,state)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending')`,
    [randomUUID(), input.userId, input.type, input.title, input.message, input.link ?? null, frequency, due],
  );
  return true;
}

/** One bounded batch per invocation. Started/unknown batches are NEVER resent.
 * The scheduler may retry pending work, not ambiguous external acceptance.
 */
export async function runNotificationDigestBatch(): Promise<void> {
  const client = await pool.connect();
  const owner = randomUUID();
  let entries: any[] = [];
  let email: string | undefined;
  try {
    await client.query("BEGIN");
    const first = await client.query(
      `SELECT user_id FROM integration_notification_digest
       WHERE state='pending' AND due_at<=now() ORDER BY due_at,id
       FOR UPDATE SKIP LOCKED LIMIT 1`,
    );
    if (!first.rows.length) { await client.query("COMMIT"); return; }
    const userId = first.rows[0].user_id;
    const user = (await client.query(
      `SELECT email,notification_settings FROM users WHERE id=$1`, [userId],
    )).rows[0];
    const pending = (await client.query(
      `SELECT * FROM integration_notification_digest WHERE user_id=$1
       AND state='pending' AND due_at<=now() ORDER BY due_at,id
       FOR UPDATE SKIP LOCKED LIMIT 100`, [userId],
    )).rows;
    for (const entry of pending) {
      const prefs = user?.notification_settings;
      if (!user?.email || !digestAllowed(prefs, entry.type)) {
        await client.query(`UPDATE integration_notification_digest SET state='suppressed',updated_at=now() WHERE id=$1`, [entry.id]);
      } else if (digestAllowed(prefs, entry.type, new Date(), true)) {
        entries.push(entry);
      } else {
        // Quiet hours defer instead of dropping mail or starving other users.
        await client.query(`UPDATE integration_notification_digest SET due_at=now()+interval '15 minutes',updated_at=now() WHERE id=$1`, [entry.id]);
      }
    }
    email = user?.email;
    if (entries.length) {
      await client.query(
        `UPDATE integration_notification_digest SET state='started',owner=$1,updated_at=now()
         WHERE id=ANY($2::uuid[])`, [owner, entries.map(entry => entry.id)],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  if (!entries.length || !email) return;
  // A missing sender is an explicit deployment error, never a fabricated sender.
  const sender = process.env.SENDGRID_FROM_EMAIL;
  if (!sender) {
    await pool.query(`UPDATE integration_notification_digest SET state='rejected',error=$2,updated_at=now() WHERE owner=$1`,
      [owner, "Notification digest sender is not configured"]);
    throw new Error("Notification digest sender is not configured");
  }
  const result = await emailService.sendOnce({
    operationKey: `notification-digest:${owner}`, to: email, from: sender,
    subject: "Your Max Booster notification digest",
    text: entries.map(entry => `${entry.title}\n${entry.message}${entry.link ? `\n${entry.link}` : ""}`).join("\n\n"),
  });
  await pool.query(
    `UPDATE integration_notification_digest SET state=$2,provider_id=$3,error=$4,updated_at=now() WHERE owner=$1`,
    [owner, result.status, result.status === "accepted" ? result.messageId : null,
      result.status === "accepted" ? null : result.error],
  );
}