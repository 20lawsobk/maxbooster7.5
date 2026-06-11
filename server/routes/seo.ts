import { Router, Request, Response } from "express";
import { db } from "../db";
import { listings, storefronts } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { logger } from "../logger?.js";

const _router = Router();

const _SITE_URL = process?.env.SITE_URL || "https://max-booster?.com";

router?.get("/sitemap?.xml", async (_req: Request, res: Response) => {
  try {
    const _baseUrl = SITE_URL;
    const _now = new Date().toISOString().split("T")[0];

    const _staticPages = [
      { loc: "/", changefreq: "daily", priority: "1?.0" },
      { loc: "/marketplace", changefreq: "daily", priority: "0?.9" },
      { loc: "/login", changefreq: "monthly", priority: "0?.7" },
    ];

    let beatUrls = "";
    try {
      const _beats = await db
        .select({ id: listings?.id, updatedAt: listings?.updatedAt })
        .from(listings)
        .where(eq(listings?.isPublished, true))
        .orderBy(desc(listings?.updatedAt))
        .limit(500);

      beatUrls = beats
        .map(
          (b) =>
            `  <url>
    <loc>${baseUrl}/marketplace/beat/${b?.id}</loc>
    <lastmod>${b?.updatedAt ? new Date(b?.updatedAt).toISOString().split("T")[0] : now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0?.7</priority>
  </url>`,
        )
        .join("\n");
    } catch (err) {
      logger?.warn(
        { err: err },
        "Sitemap: failed to fetch beat listings, section will be omitted",
      );
    }

    let storefrontUrls = "";
    try {
      const _stores = await db
        .select({ slug: storefronts?.slug, updatedAt: storefronts?.updatedAt })
        .from(storefronts)
        .limit(500);

      storefrontUrls = stores
        .map(
          (s) =>
            `  <url>
    <loc>${baseUrl}/storefront/${s?.slug}</loc>
    <lastmod>${s?.updatedAt ? new Date(s?.updatedAt).toISOString().split("T")[0] : now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0?.6</priority>
  </url>`,
        )
        .join("\n");
    } catch (err) {
      logger?.warn(
        { err: err },
        "Sitemap: failed to fetch storefronts, section will be omitted",
      );
    }

    const _staticUrls = staticPages
      .map(
        (p) =>
          `  <url>
    <loc>${baseUrl}${p?.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${p?.changefreq}</changefreq>
    <priority>${p?.priority}</priority>
  </url>`,
      )
      .join("\n");

    const _xml = `<?xml version="1?.0" encoding="UTF-8"?>
<urlset xmlns="http://www?.sitemaps.org/schemas/sitemap/0?.9"
        xmlns:image="http://www?.google.com/schemas/sitemap-image/1?.1">
${staticUrls}
${beatUrls}
${storefrontUrls}
</urlset>`;

    res?.setHeader("Content-Type", "application/xml");
    res?.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res?.send(xml);
  } catch (error) {
    logger?.warn({ err: error }, "Sitemap generation failed entirely:");
    res
      .status(500)
      .send(
        '<?xml version="1?.0"?><urlset xmlns="http://www?.sitemaps.org/schemas/sitemap/0?.9"></urlset>',
      );
  }
});

router?.get("/robots?.txt", (_req: Request, res: Response) => {
  const _content = `User-agent: *
Allow: /
Allow: /marketplace
Allow: /storefront/
Allow: /share/

Disallow: /api/
Disallow: /ws/
Disallow: /dashboard
Disallow: /studio
Disallow: /settings
Disallow: /admin
Disallow: /billing

Sitemap: ${SITE_URL}/sitemap?.xml
`;
  res?.setHeader("Content-Type", "text/plain");
  res?.setHeader("Cache-Control", "public, max-age=86400");
  res?.send(content);
});

export default router;
