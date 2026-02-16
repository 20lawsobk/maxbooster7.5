import express, { type Express, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { db } from './db';
import { listings, storefronts, users } from '@shared/schema';
import { eq } from 'drizzle-orm';

const SITE_URL = 'https://maxbooster.replit.app';

async function getMetaForPath(reqPath: string): Promise<{ title: string; description: string; image: string; url: string } | null> {
  try {
    const beatMatch = reqPath.match(/^\/marketplace\/beat\/(\d+)/);
    if (beatMatch) {
      const beatId = parseInt(beatMatch[1]);
      const [beat] = await db.select().from(listings).where(eq(listings.id, beatId)).limit(1);
      if (beat) {
        const metadata = beat.metadata as Record<string, any> | null;
        return {
          title: `${beat.title} - Beat on Max Booster Marketplace`,
          description: `${beat.title} by ${beat.sellerName || 'Producer'} | ${metadata?.genre || 'Beat'} | ${metadata?.bpm ? metadata.bpm + ' BPM' : ''} | $${beat.price || '0'} | License and download on Max Booster`,
          image: beat.artworkUrl || `${SITE_URL}/og-image.png`,
          url: `${SITE_URL}/marketplace/beat/${beatId}`,
        };
      }
    }

    const storefrontMatch = reqPath.match(/^\/storefront\/([^/]+)/);
    if (storefrontMatch) {
      const slug = storefrontMatch[1];
      const [store] = await db.select().from(storefronts).where(eq(storefronts.slug, slug)).limit(1);
      if (store) {
        return {
          title: `${store.displayName || store.slug} - Producer Storefront on Max Booster`,
          description: store.bio || `Browse beats and music from ${store.displayName || store.slug} on Max Booster Marketplace`,
          image: store.bannerUrl || store.avatarUrl || `${SITE_URL}/og-image.png`,
          url: `${SITE_URL}/storefront/${slug}`,
        };
      }
    }

    if (reqPath === '/marketplace') {
      return {
        title: 'Beat Marketplace - Max Booster',
        description: 'Browse and license beats from top producers. Find the perfect beat for your next hit with advanced AI-powered discovery, instant licensing, and secure payments.',
        image: `${SITE_URL}/og-image.png`,
        url: `${SITE_URL}/marketplace`,
      };
    }
  } catch {}
  return null;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function injectMeta(html: string, meta: { title: string; description: string; image: string; url: string }): string {
  const escapedTitle = escapeHtml(meta.title);
  const escapedDesc = escapeHtml(meta.description);
  const escapedImage = escapeHtml(meta.image);
  const escapedUrl = escapeHtml(meta.url);

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapedTitle}</title>`);

  html = html.replace(
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${escapedDesc}" />`
  );

  html = html.replace(
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${escapedUrl}" />`
  );

  html = html.replace(
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${escapedTitle}" />`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*" \/>/,
    `<meta property="og:description" content="${escapedDesc}" />`
  );
  html = html.replace(
    /<meta property="og:image" content="[^"]*" \/>/,
    `<meta property="og:image" content="${escapedImage}" />`
  );
  html = html.replace(
    /<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="${escapedUrl}" />`
  );

  html = html.replace(
    /<meta name="twitter:title" content="[^"]*" \/>/,
    `<meta name="twitter:title" content="${escapedTitle}" />`
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*" \/>/,
    `<meta name="twitter:description" content="${escapedDesc}" />`
  );
  html = html.replace(
    /<meta name="twitter:image" content="[^"]*" \/>/,
    `<meta name="twitter:image" content="${escapedImage}" />`
  );
  html = html.replace(
    /<meta name="twitter:url" content="[^"]*" \/>/,
    `<meta name="twitter:url" content="${escapedUrl}" />`
  );

  return html;
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else if (filePath.match(/\.(js|css)$/)) {
        if (filePath.match(/assets\/.*-[a-f0-9]{8}\.(js|css)$/)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
        }
      } else if (filePath.match(/\.(woff2?|ttf|eot)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=604800');
      } else if (filePath.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    },
  }));

  const indexPath = path.resolve(distPath, "index.html");
  const baseHtml = fs.readFileSync(indexPath, 'utf-8');

  app.use("/{*splat}", async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    const meta = await getMetaForPath(req.originalUrl);
    if (meta) {
      const injected = injectMeta(baseHtml, meta);
      return res.send(injected);
    }

    res.sendFile(indexPath);
  });
}
