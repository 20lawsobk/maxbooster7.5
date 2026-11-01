import { safeFetchText } from "./safeUrlFetch.js";

export function bandcampSlug(input: string): string {
  if (typeof input !== "string") throw new Error("Invalid Bandcamp profile");
  const url = new URL(input);
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("Invalid Bandcamp profile URL");
  }
  const match = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.bandcamp\.com$/.exec(url.hostname);
  if (!match) throw new Error("Expected a Bandcamp artist URL");
  return match[1];
}

export async function fetchBandcampPage(slug: string, pathname = "/"): Promise<string> {
  if (typeof slug !== "string" || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) throw new Error("Invalid Bandcamp artist ID");
  const result = await safeFetchText(`https://${slug}.bandcamp.com${pathname}`, {
    allowedHost: host => host === `${slug}.bandcamp.com`,
    maxBytes: 2_000_000,
    timeoutMs: 12_000,
  });
  if (result.status < 200 || result.status >= 300) throw new Error(`Bandcamp returned ${result.status}`);
  return result.body;
}