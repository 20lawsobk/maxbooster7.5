import { db } from "../db";
import { achievements } from "../../shared/schema";
import { count, inArray } from "drizzle-orm";
import { logger } from "../logger.js";

const defaultAchievements = [
  {
    name: "First Upload",
    description: "Upload your first track to the platform",
    category: "milestone",
    points: 10,
    tier: "bronze",
    requirement: { type: "first", eventType: "upload" },
    sortOrder: 1,
  },
  {
    name: "First Sale",
    description: "Make your first sale on the marketplace",
    category: "sales",
    points: 25,
    tier: "bronze",
    requirement: { type: "first", eventType: "sale" },
    sortOrder: 2,
  },
  {
    name: "Rising Star",
    description: "Reach 1,000 total streams",
    category: "streaming",
    points: 50,
    tier: "bronze",
    requirement: {
      type: "streams",
      threshold: 1000,
      eventType: "stream_milestone",
    },
    sortOrder: 3,
  },
  {
    name: "Getting Popular",
    description: "Reach 10,000 total streams",
    category: "streaming",
    points: 100,
    tier: "silver",
    requirement: {
      type: "streams",
      threshold: 10000,
      eventType: "stream_milestone",
    },
    sortOrder: 4,
  },
  {
    name: "Chart Climber",
    description: "Reach 100,000 total streams",
    category: "streaming",
    points: 250,
    tier: "gold",
    requirement: {
      type: "streams",
      threshold: 100000,
      eventType: "stream_milestone",
    },
    sortOrder: 5,
  },
  {
    name: "Streaming Sensation",
    description: "Reach 1,000,000 total streams",
    category: "streaming",
    points: 1000,
    tier: "platinum",
    requirement: {
      type: "streams",
      threshold: 1000000,
      eventType: "stream_milestone",
    },
    sortOrder: 6,
  },
  {
    name: "Social Butterfly",
    description: "Connect all your social media accounts",
    category: "social",
    points: 30,
    tier: "silver",
    requirement: { type: "socials", threshold: 5, eventType: "social_connect" },
    sortOrder: 7,
  },
  {
    name: "Collaborator",
    description: "Complete 5 collaborations with other artists",
    category: "collaboration",
    points: 75,
    tier: "silver",
    requirement: { type: "collabs", threshold: 5, eventType: "collaboration" },
    sortOrder: 8,
  },
  {
    name: "Trendsetter",
    description: "Have a post go viral with over 10K engagement",
    category: "social",
    points: 150,
    tier: "gold",
    requirement: { type: "viral", eventType: "viral_post" },
    sortOrder: 9,
  },
  {
    name: "Week Warrior",
    description: "Maintain a 7-day login streak",
    category: "streak",
    points: 20,
    tier: "bronze",
    requirement: { type: "streak", threshold: 7, eventType: "streak" },
    sortOrder: 10,
  },
  {
    name: "Monthly Master",
    description: "Maintain a 30-day login streak",
    category: "streak",
    points: 75,
    tier: "silver",
    requirement: { type: "streak", threshold: 30, eventType: "streak" },
    sortOrder: 11,
  },
  {
    name: "Century Club",
    description: "Maintain a 100-day login streak",
    category: "streak",
    points: 200,
    tier: "gold",
    requirement: { type: "streak", threshold: 100, eventType: "streak" },
    sortOrder: 12,
  },
  {
    name: "Prolific Producer",
    description: "Upload 10 tracks",
    category: "milestone",
    points: 50,
    tier: "silver",
    requirement: { type: "uploads", threshold: 10, eventType: "upload" },
    sortOrder: 13,
  },
  {
    name: "Catalog King",
    description: "Upload 50 tracks",
    category: "milestone",
    points: 150,
    tier: "gold",
    requirement: { type: "uploads", threshold: 50, eventType: "upload" },
    sortOrder: 14,
  },
  {
    name: "Top Seller",
    description: "Make 10 sales on the marketplace",
    category: "sales",
    points: 100,
    tier: "silver",
    requirement: { type: "sales", threshold: 10, eventType: "sale" },
    sortOrder: 15,
  },
  {
    name: "Sales Machine",
    description: "Make 100 sales on the marketplace",
    category: "sales",
    points: 500,
    tier: "platinum",
    requirement: { type: "sales", threshold: 100, eventType: "sale" },
    sortOrder: 16,
  },
];

export async function seedAchievements() {
  logger.info("Seeding achievements...");

  try {
    const names = defaultAchievements.map((a) => a.name);
    const [{ total }] = await db
      .select({ total: count() })
      .from(achievements)
      .where(inArray(achievements.name, names));

    if (Number(total) >= names.length) {
      logger.info("Achievements already seeded, skipping...");
      logger.info("Achievement seeding complete!");
      return;
    }

    const existing = await db
      .select({ name: achievements.name })
      .from(achievements)
      .where(inArray(achievements.name, names));
    const existingNames = new Set(existing.map((r) => r.name));

    const toInsert = defaultAchievements
      .filter((a) => !existingNames.has(a.name))
      .map((a) => ({ ...a, isActive: true }));

    if (toInsert.length > 0) {
      await db.insert(achievements).values(toInsert);
      logger.info(`Created ${toInsert.length} achievement(s)`);
    }

    logger.info("Achievement seeding complete!");
  } catch (error) {
    logger.warn("Error seeding achievements:", error);
    throw error;
  }
}


const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith("seedAchievements.ts") ||
    process.argv[1].includes("seedAchievements"));

if (isMainModule) {
  seedAchievements()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
