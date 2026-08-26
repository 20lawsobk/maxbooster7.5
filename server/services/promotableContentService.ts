/**
 * Promotable content resolver.
 *
 * Ad creation across the platform used to be locked to a single content
 * type (marketplace beat listings) via /veo-campaign/promote-listing, plus a
 * separate storefront-only path. This service normalizes every ownable
 * content type on the platform into one shape so a single "promote this"
 * flow can generate a real ad campaign for any of them — used by the manual
 * Advertising page, the advertising autopilot, and any automation pipeline.
 */
import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import {
  listings,
  storefronts,
  releases,
  posts,
  artistProfiles,
} from "@shared/schema";

export type PromotableContentType =
  | "beat"
  | "release"
  | "storefront"
  | "social_post"
  | "epk";

export const PROMOTABLE_CONTENT_TYPES: PromotableContentType[] = [
  "beat",
  "release",
  "storefront",
  "social_post",
  "epk",
];

export interface PromotableItem {
  id: string;
  title: string;
  subtitle?: string;
  thumbnailUrl?: string;
  status?: string;
  promotable: boolean;
  reason?: string;
}

export interface ResolvedPromotableContent {
  contentType: PromotableContentType;
  contentId: string;
  title: string;
  artist: string;
  description: string;
  category: string;
  artworkUrl: string;
  sourceUrl: string;
  sourcePlatform: string;
  veoContentType: string;
  audioUrl?: string;
  summary: Record<string, unknown>;
}

export class PromotableContentError extends Error {
  status: number;
  constructor(message: string, status = 404) {
    super(message);
    this.status = status;
    this.name = "PromotableContentError";
  }
}

function appUrl(): string {
  return (process.env.APP_URL || "https://max-booster.com").replace(
    /\/$/,
    "",
  );
}

export async function listPromotableContent(
  userId: string,
  type: PromotableContentType,
): Promise<PromotableItem[]> {
  switch (type) {
    case "beat": {
      const rows = await db
        .select()
        .from(listings)
        .where(eq(listings.userId, userId))
        .orderBy(desc(listings.createdAt))
        .limit(50);
      return rows.map((l) => ({
        id: l.id,
        title: l.title,
        subtitle: l.category || undefined,
        thumbnailUrl: l.artworkUrl || undefined,
        status: l.isPublished ? "published" : "draft",
        promotable: !!l.isPublished,
        reason: l.isPublished ? undefined : "Publish this beat before promoting it",
      }));
    }
    case "release": {
      const rows = await db
        .select()
        .from(releases)
        .where(eq(releases.userId, userId))
        .orderBy(desc(releases.createdAt))
        .limit(50);
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: r.status || undefined,
        thumbnailUrl: r.artworkUrl || undefined,
        status: r.status || undefined,
        promotable: r.status !== "draft",
        reason:
          r.status === "draft"
            ? "Finish setting up this release before promoting it"
            : undefined,
      }));
    }
    case "storefront": {
      const rows = await db
        .select()
        .from(storefronts)
        .where(eq(storefronts.userId, userId))
        .orderBy(desc(storefronts.createdAt))
        .limit(50);
      return rows.map((s) => {
        const customization = (s.customization || {}) as Record<string, any>;
        const seo = (s.seo || {}) as Record<string, any>;
        return {
          id: s.id,
          title: s.name,
          subtitle: s.slug,
          thumbnailUrl: seo?.ogImage || customization?.logo || undefined,
          status: s.isActive ? "active" : "inactive",
          promotable: !!s.isActive,
          reason: s.isActive ? undefined : "Activate this storefront before promoting it",
        };
      });
    }
    case "social_post": {
      const rows = await db
        .select()
        .from(posts)
        .where(eq(posts.userId, userId))
        .orderBy(desc(posts.createdAt))
        .limit(50);
      return rows.map((p) => ({
        id: p.id,
        title: (p.content || "").trim().slice(0, 80) || "(untitled post)",
        subtitle: p.platform || undefined,
        thumbnailUrl: p.mediaUrls?.[0] || undefined,
        status: p.status || undefined,
        promotable: p.status === "published" && !!p.publishedAt,
        reason:
          p.status === "published"
            ? undefined
            : "This post must be published before it can be promoted",
      }));
    }
    case "epk": {
      const rows = await db
        .select()
        .from(artistProfiles)
        .where(eq(artistProfiles.userId, userId))
        .orderBy(desc(artistProfiles.createdAt))
        .limit(50);
      return rows.map((a) => ({
        id: a.id,
        title: a.artistName,
        subtitle: a.isVerified ? "Verified" : "Unverified",
        thumbnailUrl: a.profileImageUrl || undefined,
        status: a.isVerified ? "verified" : "unverified",
        promotable: true,
      }));
    }
    default:
      throw new PromotableContentError(`Unknown content type: ${type}`, 400);
  }
}

export async function resolvePromotableContent(
  userId: string,
  type: PromotableContentType,
  contentId?: string,
): Promise<ResolvedPromotableContent> {
  switch (type) {
    case "beat": {
      if (!contentId)
        throw new PromotableContentError("Missing contentId for beat", 400);
      const [listing] = await db
        .select()
        .from(listings)
        .where(and(eq(listings.id, contentId), eq(listings.userId, userId)))
        .limit(1);
      if (!listing)
        throw new PromotableContentError(
          "Beat listing not found or you do not own it",
          404,
        );
      if (!listing.isPublished)
        throw new PromotableContentError(
          "Listing must be published before promoting",
          403,
        );

      let storefrontName = "My Store";
      if (listing.storefrontId) {
        const [store] = await db
          .select()
          .from(storefronts)
          .where(eq(storefronts.id, listing.storefrontId))
          .limit(1);
        if (store) storefrontName = store.name;
      }

      const metadata = (listing.metadata || {}) as Record<string, any>;
      const category = listing.category || metadata?.genre || "";
      const priceDisplay = listing.priceCents
        ? `$${(Number(listing.priceCents) / 100).toFixed(2)}`
        : "";

      let description = `Check out "${listing.title}" by ${storefrontName}.`;
      if (listing.description)
        description += ` ${listing.description.slice(0, 150)}.`;
      if (category) description += ` Genre: ${category}.`;
      if (priceDisplay) description += ` Available now for ${priceDisplay}.`;
      description += " Get it before it's gone!";

      return {
        contentType: "beat",
        contentId: listing.id,
        title: listing.title,
        artist: storefrontName,
        description,
        category,
        artworkUrl: listing.artworkUrl || "",
        sourceUrl: `${appUrl()}/marketplace/beat/${listing.id}`,
        sourcePlatform: "maxbooster",
        veoContentType: "music",
        audioUrl: listing.audioUrl || undefined,
        summary: {
          id: listing.id,
          title: listing.title,
          category,
          price: priceDisplay,
          storefrontName,
        },
      };
    }
    case "release": {
      if (!contentId)
        throw new PromotableContentError("Missing contentId for release", 400);
      const [release] = await db
        .select()
        .from(releases)
        .where(and(eq(releases.id, contentId), eq(releases.userId, userId)))
        .limit(1);
      if (!release)
        throw new PromotableContentError(
          "Release not found or you do not own it",
          404,
        );
      if (release.status === "draft")
        throw new PromotableContentError(
          "Release must be finished before promoting",
          403,
        );

      const metadata = (release.metadata || {}) as Record<string, any>;
      const artistName = metadata?.artistName || "Independent Artist";
      const genre = metadata?.genre || "";
      let description = `New release "${release.title}" from ${artistName}.`;
      if (genre) description += ` Genre: ${genre}.`;
      if (release.releaseDate)
        description += ` Out ${new Date(release.releaseDate).toLocaleDateString()}.`;
      description += " Stream it now.";

      return {
        contentType: "release",
        contentId: release.id,
        title: release.title,
        artist: artistName,
        description,
        category: genre,
        artworkUrl: release.artworkUrl || "",
        sourceUrl: `${appUrl()}/distribution/releases/${release.id}`,
        sourcePlatform: "maxbooster",
        veoContentType: "music",
        summary: { id: release.id, title: release.title, status: release.status },
      };
    }
    case "storefront": {
      let storefront;
      if (contentId) {
        [storefront] = await db
          .select()
          .from(storefronts)
          .where(
            and(eq(storefronts.id, contentId), eq(storefronts.userId, userId)),
          )
          .limit(1);
      } else {
        [storefront] = await db
          .select()
          .from(storefronts)
          .where(eq(storefronts.userId, userId))
          .orderBy(desc(storefronts.createdAt))
          .limit(1);
      }
      if (!storefront)
        throw new PromotableContentError(
          "Storefront not found or you do not own it",
          404,
        );
      if (!storefront.isActive)
        throw new PromotableContentError("Storefront is not active", 403);

      const customization = (storefront.customization || {}) as Record<
        string,
        any
      >;
      const seo = (storefront.seo || {}) as Record<string, any>;

      const storeListings = await db
        .select()
        .from(listings)
        .where(
          and(
            eq(listings.storefrontId, storefront.id),
            eq(listings.isPublished, true),
          ),
        )
        .limit(10);
      const listingCount = storeListings.length;
      const genres = [
        ...new Set(storeListings.map((l) => l.category).filter(Boolean)),
      ];
      const topListings = storeListings
        .slice(0, 3)
        .map((l) => l.title)
        .join(", ");

      const description = seo?.description || customization?.bio || "";
      const title = seo?.title || storefront.name || "My Storefront";
      const artworkUrl =
        seo?.ogImage || customization?.banner || customization?.logo || "";

      let story = `Promote ${title}.`;
      if (description) story += ` ${description.slice(0, 200)}.`;
      if (listingCount > 0)
        story += ` Featuring ${listingCount} beats${topListings ? ` including ${topListings}` : ""}.`;
      if (genres.length > 0) story += ` Genres: ${genres.join(", ")}.`;
      story += " Drive traffic and sales to the storefront.";

      return {
        contentType: "storefront",
        contentId: storefront.id,
        title,
        artist: storefront.name,
        description: story,
        category: genres.join(", "),
        artworkUrl,
        sourceUrl: `${appUrl()}/storefront/${storefront.slug}`,
        sourcePlatform: "website",
        veoContentType: "website",
        summary: {
          id: storefront.id,
          name: storefront.name,
          slug: storefront.slug,
          listingCount,
          genres,
        },
      };
    }
    case "social_post": {
      if (!contentId)
        throw new PromotableContentError(
          "Missing contentId for social_post",
          400,
        );
      const [post] = await db
        .select()
        .from(posts)
        .where(and(eq(posts.id, contentId), eq(posts.userId, userId)))
        .limit(1);
      if (!post)
        throw new PromotableContentError(
          "Post not found or you do not own it",
          404,
        );
      if (post.status !== "published" || !post.publishedAt)
        throw new PromotableContentError(
          "Post must be published before promoting",
          403,
        );

      const title = (post.content || "").trim().slice(0, 80) || "Your post";
      const description = post.content || "Check out this post.";

      return {
        contentType: "social_post",
        contentId: post.id,
        title,
        artist: "",
        description,
        category: post.platform || "",
        artworkUrl: post.mediaUrls?.[0] || "",
        sourceUrl: post.platformPostId
          ? `${appUrl()}/social/posts/${post.id}`
          : `${appUrl()}/social`,
        sourcePlatform: post.platform || "website",
        veoContentType: "social",
        summary: { id: post.id, platform: post.platform },
      };
    }
    case "epk": {
      let profile;
      if (contentId) {
        [profile] = await db
          .select()
          .from(artistProfiles)
          .where(
            and(
              eq(artistProfiles.id, contentId),
              eq(artistProfiles.userId, userId),
            ),
          )
          .limit(1);
      } else {
        [profile] = await db
          .select()
          .from(artistProfiles)
          .where(eq(artistProfiles.userId, userId))
          .orderBy(desc(artistProfiles.createdAt))
          .limit(1);
      }
      if (!profile)
        throw new PromotableContentError(
          "Artist profile not found or you do not own it",
          404,
        );

      const genres = (profile.genres as string[] | null) || [];
      let description = `Follow ${profile.artistName}.`;
      if (profile.profileBio) description += ` ${profile.profileBio.slice(0, 200)}.`;
      if (genres.length > 0) description += ` Genres: ${genres.join(", ")}.`;

      return {
        contentType: "epk",
        contentId: profile.id,
        title: profile.artistName,
        artist: profile.artistName,
        description,
        category: genres.join(", "),
        artworkUrl: profile.profileImageUrl || "",
        sourceUrl: `${appUrl()}/artist/${profile.id}`,
        sourcePlatform: "website",
        veoContentType: "website",
        summary: { id: profile.id, artistName: profile.artistName },
      };
    }
    default:
      throw new PromotableContentError(`Unknown content type: ${type}`, 400);
  }
}
