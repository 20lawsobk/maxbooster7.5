/** Provider cursors are untrusted, including when the first page is authenticated. */
export async function collectSpotifyPages<T>(
  initialUrl: string,
  token: string,
  request: (url: string, options: { headers: Record<string, string>; redirect: "error" }) => Promise<{
    ok: boolean; status: number; json(): Promise<unknown>;
  }>,
): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<string>();
  let next: string | null = initialUrl;
  while (next) {
    const url = new URL(next);
    if (url.origin !== "https://api.spotify.com" || !url.pathname.startsWith("/v1/") ||
        url.username || url.password || url.hash) throw new Error("Invalid Spotify pagination URL");
    if (seen.has(url.href)) throw new Error("Spotify pagination cursor repeated");
    if (seen.size >= 1000) throw new Error("Spotify pagination safety limit reached; catalog is incomplete");
    seen.add(url.href);
    const response = await request(url.href, { headers: { Authorization: `Bearer ${token}` }, redirect: "error" });
    if (!response.ok) throw new Error(`Spotify catalog page failed (${response.status})`);
    const page = await response.json() as { items?: T[]; next?: unknown };
    if (!page || !Array.isArray(page.items) ||
        (page.next !== null && typeof page.next !== "string")) {
      throw new Error("Malformed Spotify catalog page");
    }
    items.push(...page.items);
    next = page.next as string | null;
    if (next === "") throw new Error("Malformed Spotify pagination cursor");
  }
  return items;
}