import { db } from "../db";
import { storefrontTemplates } from "../../shared/schema";
import { logger } from "../logger.js";
import { count } from "drizzle-orm";

const TEMPLATES = [
  {
    name: "Beat Producer Pro",
    slug: "beat-producer-pro",
    description:
      "Dark, professional theme built for beat sellers. Bold grid layout with purple & gold accents — maximises impulse purchases.",
    isPremium: false,
    configuration: {
      colors: {
        primary: "#7C3AED",
        secondary: "#F59E0B",
        background: "#0F0F13",
        text: "#F9FAFB",
      },
      fonts: { heading: "Space Grotesk", body: "Inter" },
      layout: { headerStyle: "centered", gridColumns: 4 },
      bio: "Premium beats crafted for artists who demand the best. Unlimited tags, WAV + MP3 included.",
    },
  },
  {
    name: "Hip-Hop Underground",
    slug: "hip-hop-underground",
    description:
      "Street-ready black & red aesthetic. Left-aligned layout with raw energy — perfect for trap, drill, and boom-bap producers.",
    isPremium: false,
    configuration: {
      colors: {
        primary: "#EF4444",
        secondary: "#DC2626",
        background: "#000000",
        text: "#FFFFFF",
      },
      fonts: { heading: "Oswald", body: "Inter" },
      layout: { headerStyle: "left", gridColumns: 3 },
      bio: "Hard-hitting beats straight from the underground. Exclusive licenses available.",
    },
  },
  {
    name: "Electronic / EDM",
    slug: "electronic-edm",
    description:
      "Neon-lit dark canvas with cyan & pink gradients. Four-column grid designed for high-volume electronic beat catalogues.",
    isPremium: false,
    configuration: {
      colors: {
        primary: "#06B6D4",
        secondary: "#EC4899",
        background: "#05070F",
        text: "#E0F2FE",
      },
      fonts: { heading: "Rajdhani", body: "Inter" },
      layout: { headerStyle: "centered", gridColumns: 4 },
      bio: "Electronic beats for DJs, producers, and sync placements. Stems available on all tracks.",
    },
  },
  {
    name: "R&B / Soul",
    slug: "rnb-soul",
    description:
      "Warm, intimate feel with deep brown tones and gold. Two-column layout that lets your music breathe and tell a story.",
    isPremium: false,
    configuration: {
      colors: {
        primary: "#D97706",
        secondary: "#92400E",
        background: "#1A0F00",
        text: "#FEF3C7",
      },
      fonts: { heading: "Playfair Display", body: "Lora" },
      layout: { headerStyle: "centered", gridColumns: 2 },
      bio: "Soulful beats with emotion and depth. Built for artists who feel every note.",
    },
  },
  {
    name: "Pop Commercial",
    slug: "pop-commercial",
    description:
      "Clean white canvas with vibrant hot-pink accents. Bright, chart-ready aesthetic that appeals to mainstream artists and labels.",
    isPremium: false,
    configuration: {
      colors: {
        primary: "#EC4899",
        secondary: "#8B5CF6",
        background: "#FFFFFF",
        text: "#111827",
      },
      fonts: { heading: "Poppins", body: "Inter" },
      layout: { headerStyle: "centered", gridColumns: 3 },
      bio: "Radio-ready beats for top-charting artists. Cleared for all commercial use.",
    },
  },
  {
    name: "Chill / Lo-Fi",
    slug: "chill-lo-fi",
    description:
      "Soft beige and terracotta tones with a vintage paper feel. Two-column layout perfect for lo-fi, jazz hop, and chill producers.",
    isPremium: false,
    configuration: {
      colors: {
        primary: "#C2714F",
        secondary: "#A16207",
        background: "#F5F0E8",
        text: "#292524",
      },
      fonts: { heading: "DM Serif Display", body: "DM Sans" },
      layout: { headerStyle: "left", gridColumns: 2 },
      bio: "Mellow beats for studying, creating, and unwinding. 100% royalty-free.",
    },
  },
  {
    name: "Rock / Alternative",
    slug: "rock-alternative",
    description:
      "High-contrast dark gray with fiery orange. Three-column grid that conveys raw energy — ideal for rock, metal, and punk producers.",
    isPremium: false,
    configuration: {
      colors: {
        primary: "#F97316",
        secondary: "#EA580C",
        background: "#1C1C1E",
        text: "#F4F4F5",
      },
      fonts: { heading: "Bebas Neue", body: "Inter" },
      layout: { headerStyle: "left", gridColumns: 3 },
      bio: "Raw power for artists who refuse to compromise. Full stems & stems packs available.",
    },
  },
];

export async function seedStorefrontTemplates() {
  try {
    const [{ value: existing }] = await db
      .select({ value: count() })
      .from(storefrontTemplates);

    if (existing > 0) {
      logger.info(
        `Storefront templates already seeded (${existing} found) — skipping.`,
      );
      return;
    }

    await db.insert(storefrontTemplates).values(
      TEMPLATES?.map((t) => ({
        name: t.name,
        slug: t.slug,
        description: t.description,
        isPremium: t.isPremium,
        isActive: true,
        configuration: t.configuration,
      })),
    );

    logger.info(`Seeded ${TEMPLATES?.length} storefront templates.`);
  } catch (error: unknown) {
    logger.warn({ err: error }, "Failed to seed storefront templates:");
    throw error;
  }
}
