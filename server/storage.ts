import { 
  users, 
  dspProviders, 
  projects,
  releases,
  type User, 
  type InsertUser, 
  type DSPProvider,
  type InsertProject
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

type Project = typeof projects.$inferSelect;
type Release = typeof releases.$inferSelect;

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getDistributionProvider(slug: string): Promise<DSPProvider | undefined>;
  getProjectsByUserId(userId: string): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  getReleasesByUserId(userId: string): Promise<Release[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async getDistributionProvider(slug: string): Promise<DSPProvider | undefined> {
    const [provider] = await db.select().from(dspProviders).where(eq(dspProviders.slug, slug));
    return provider || undefined;
  }

  async getProjectsByUserId(userId: string): Promise<Project[]> {
    return await db.select().from(projects).where(eq(projects.userId, userId));
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const [project] = await db
      .insert(projects)
      .values(insertProject)
      .returning();
    return project;
  }

  async getReleasesByUserId(userId: string): Promise<Release[]> {
    return await db.select().from(releases).where(eq(releases.userId, userId));
  }

  async getAutopilotConfig(userId: string): Promise<any | undefined> {
    return undefined;
  }

  async saveAutopilotConfig(userId: string, config: any): Promise<any> {
    return config;
  }

  async getUserAIModel(userId: string, modelType: string): Promise<any | undefined> {
    return undefined;
  }

  async saveUserAIModel(userId: string, modelType: string, weights: any, metadata?: any): Promise<void> {
  }

  async getUserSocialPosts(userId: string): Promise<any[]> {
    return [];
  }

  async getProducers(): Promise<any[]> {
    try {
      const allUsers = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        artistName: users.artistName,
        avatarUrl: users.avatarUrl,
      }).from(users).limit(50);
      
      return allUsers.map(u => ({
        id: u.id,
        name: u.artistName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Producer',
        avatarUrl: u.avatarUrl,
        verified: false,
        followers: 0,
        sales: 0,
      }));
    } catch (error) {
      console.error('Error getting producers:', error);
      return [];
    }
  }
}

export const storage = new DatabaseStorage();
