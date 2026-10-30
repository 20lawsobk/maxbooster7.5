/** Pure, shared delivery policy. No credentials, providers or database access. */
export function notificationCategory(type: string): string {
  if (["account_security", "distribution", "social_media", "marketplace", "royalties", "collaboration", "system", "direct_interaction", "platform_generated", "content_based", "engagement_summary", "location_based", "achievements", "platform_admin"].includes(type)) return type;
  const aliases: Record<string, string> = {
    releases: "distribution", earnings: "royalties", sales: "marketplace",
    marketing: "social_media", social_token_expiring: "account_security",
    follower_milestone: "engagement_summary", social_engagement_alert: "engagement_summary",
    platform_update: "distribution", upload_complete: "distribution",
    stream_milestone: "distribution", ai_processing_complete: "distribution",
    royalty_statement_ready: "royalties", stems_purchased: "marketplace",
  };
  if (aliases[type]) return aliases[type];
  if (/^social_(like|comment|reply|mention|dm|follow|share)$/.test(type)) return "direct_interaction";
  if (/^(release_)/.test(type)) return "distribution";
  if (/^(payment_|payout_|royalty_)/.test(type)) return "royalties";
  if (/^(marketplace_|beat_)/.test(type)) return "marketplace";
  if (/^(security_|account_|subscription_)/.test(type)) return "account_security";
  if (/^social_/.test(type)) return "social_media";
  if (/^collaboration_/.test(type)) return "collaboration";
  if (/^(studio_|content_)/.test(type)) return "content_based";
  if (/^engagement_/.test(type)) return "engagement_summary";
  if (/^location_/.test(type)) return "location_based";
  if (/^platform_/.test(type)) return "platform_generated";
  if (/^admin_/.test(type)) return "platform_admin";
  if (/^(achievement_|streak_)/.test(type)) return "achievements";
  return type === "direct_interaction" ? type : "system";
}

type Channel = "email" | "push" | "inApp" | "sms";
type Settings = Record<string, any>;
const object = (value: unknown): Settings =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Settings : {};

export function normalizeNotificationPreferences(saved: unknown): Settings {
  const result = { ...object(saved) };
  for (const channel of ["email", "push", "sms", "inApp"]) {
    const value = result[channel] ?? (channel === "push" ? result.browser : undefined);
    if (value !== undefined) result[channel] = typeof value === "boolean" ? { enabled: value } : { ...object(value) };
    if (channel !== "inApp") {
      const categories = { ...object(result[channel]?.categories) };
      for (const [legacy, category] of Object.entries({ releases: "distribution", earnings: "royalties", sales: "marketplace", marketing: "social_media", system: "system" })) {
        if (result[legacy] === false) categories[category] = false;
      }
      if (result[channel] || Object.keys(categories).length) result[channel] = { ...object(result[channel]), categories };
    }
  }
  for (const legacy of ["releases", "earnings", "sales", "marketing", "system", "browser"]) {
    if (typeof result[legacy] === "boolean") delete result[legacy];
  }
  return result;
}

/** Merge partial writes without resetting opt-outs or accepting client verification claims. */
export function mergeNotificationPreferences(saved: unknown, patch: unknown): Settings {
  const old = normalizeNotificationPreferences(saved);
  const incoming = object(patch);
  const result: Settings = { ...old, ...incoming, version: 2 };
  for (const key of ["email", "push", "sms", "inApp", "quietHours"]) {
    if (incoming[key] === undefined) continue;
    if (typeof incoming[key] === "boolean") {
      result[key] = { ...object(old[key]), enabled: incoming[key] };
    } else {
      result[key] = { ...object(old[key]), ...object(incoming[key]) };
      if (old[key] === false && result[key].enabled === undefined) result[key].enabled = false;
      if (key !== "quietHours" && key !== "inApp") {
        result[key].categories = { ...object(object(old[key]).categories), ...object(object(incoming[key]).categories) };
      }
    }
  }
  if (incoming.sms !== undefined) {
    const sms = object(old.sms);
    result.sms = { ...object(result.sms), verified: sms.verified === true, phoneNumber: sms.phoneNumber ?? null };
    result.sms.consentedAt = sms.consentedAt;
    result.sms.stoppedAt = sms.stoppedAt;
    for (const field of ["pendingVerification", "pendingVerificationExpiry", "verificationMethod"]) {
      result.sms[field] = sms[field];
    }
    if (object(incoming.sms).enabled === true && object(incoming.sms).consentAccepted === true) {
      result.sms.consentedAt = new Date().toISOString();
      result.sms.stoppedAt = null;
    }
    delete result.sms.consentAccepted;
  }
  return result;
}

export function notificationAllowed(
  saved: unknown, type: string, channel: Channel, now = new Date(), urgent = false,
): boolean {
  const prefs = object(saved);
  if (prefs.muteAll === true) return false; // mute-all is never bypassed
  const category = notificationCategory(type);
  if (prefs[type] === false || prefs[category] === false) return false;
  const legacyCategory: Record<string, string> = {
    distribution: "releases", royalties: "earnings", marketplace: "sales", social_media: "marketing",
  };
  if (prefs[legacyCategory[category]] === false) return false;
  const raw = prefs[channel] ?? (channel === "push" ? prefs.browser : undefined);
  const config = object(raw);
  const enabled = typeof raw === "boolean" ? raw : config.enabled ?? (channel === "email" || channel === "inApp");
  if (enabled !== true) return false;
  if (channel === "email" && config.frequency && config.frequency !== "instant") return false;
  if (channel === "sms" && (config.verified !== true || !config.phoneNumber)) return false;
  const categories = object(config.categories);
  const defaultOff = ["platform_generated", "location_based"];
  if (channel === "push") defaultOff.push("social_media", "content_based", "engagement_summary");
  if (channel !== "inApp" && (categories[category] ?? !defaultOff.includes(category)) !== true) return false;
  const quiet = object(prefs.quietHours);
  if (quiet.enabled === true && !(urgent && quiet.allowUrgent === true)) {
    const toMinutes = (value: unknown): number => {
      if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("Invalid notification quiet-hour time");
      const [h, m] = value.split(":").map(Number);
      return h * 60 + m;
    };
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: quiet.timezone || "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now);
    const minute = Number(parts.find(p => p.type === "hour")!.value) * 60 + Number(parts.find(p => p.type === "minute")!.value);
    const start = toMinutes(quiet.startTime ?? "22:00");
    const end = toMinutes(quiet.endTime ?? "08:00");
    if (start === end || (start < end ? minute >= start && minute < end : minute >= start || minute < end)) return false;
  }
  return true;
}