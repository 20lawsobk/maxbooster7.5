import { db } from "../db";
import { eq, and, or, desc, sql, ilike, ne, notInArray, inArray } from "drizzle-orm";
import {
  artistConnections,
  collaborationProjects,
  projectMembers,
  users,
  analytics,
  type ArtistConnection,
  type CollaborationProject,
  type ProjectMember,
  type User,
} from "../../shared/schema";

export interface CollaboratorMatch {
  user: Partial<User>;
  matchScore: number;
  matchReasons: string[];
}

export interface ProjectWithMembers extends CollaborationProject {
  members: (ProjectMember & { user: Partial<User> })[];
  owner: Partial<User>;
}

interface MatchingFactors {
  genre: string | null;
  skills: string[];
  followerCount: number;
  location: string | null;
  lastActive: Date | null;
}

const SKILL_COMPLEMENTS: Record<string, string[]> = {
  producer: ["vocalist", "rapper", "singer", "songwriter", "mixing engineer"],
  vocalist: ["producer", "beatmaker", "songwriter", "mixing engineer"],
  rapper: ["producer", "beatmaker", "mixing engineer"],
  singer: ["producer", "songwriter", "mixing engineer"],
  songwriter: ["producer", "vocalist", "singer"],
  beatmaker: ["vocalist", "rapper", "singer", "mixing engineer"],
  "mixing engineer": ["producer", "vocalist", "mastering engineer"],
  "mastering engineer": ["mixing engineer", "producer"],
  dj: ["producer", "vocalist"],
};

class CollaborationService {
  async sendConnectionRequest(
    fromId: string,
    toId: string,
    message?: string
  ): Promise<ArtistConnection> {
    if (fromId === toId) {
      throw new Error("Cannot send connection request to yourself");
    }

    const existingConnection = await db
      .select()
      .from(artistConnections)
      .where(
        or(
          and(
            eq(artistConnections.requesterId, fromId),
            eq(artistConnections.receiverId, toId)
          ),
          and(
            eq(artistConnections.requesterId, toId),
            eq(artistConnections.receiverId, fromId)
          )
        )
      )
      .limit(1);

    if (existingConnection.length > 0) {
      const conn = existingConnection[0];
      if (conn.status === "accepted") {
        throw new Error("Already connected with this artist");
      }
      if (conn.status === "pending") {
        throw new Error("Connection request already pending");
      }
      if (conn.status === "declined" && conn.requesterId === fromId) {
        throw new Error("Your previous connection request was declined");
      }
    }

    const [connection] = await db
      .insert(artistConnections)
      .values({
        requesterId: fromId,
        receiverId: toId,
        message,
        status: "pending",
      })
      .returning();

    return connection;
  }

  async acceptConnection(
    connectionId: string,
    userId: string
  ): Promise<ArtistConnection> {
    const [connection] = await db
      .select()
      .from(artistConnections)
      .where(eq(artistConnections.id, connectionId))
      .limit(1);

    if (!connection) {
      throw new Error("Connection request not found");
    }

    if (connection.receiverId !== userId) {
      throw new Error("Not authorized to accept this connection");
    }

    if (connection.status !== "pending") {
      throw new Error("Connection request is no longer pending");
    }

    const [updated] = await db
      .update(artistConnections)
      .set({
        status: "accepted",
        acceptedAt: new Date(),
      })
      .where(eq(artistConnections.id, connectionId))
      .returning();

    return updated;
  }

  async declineConnection(
    connectionId: string,
    userId: string
  ): Promise<ArtistConnection> {
    const [connection] = await db
      .select()
      .from(artistConnections)
      .where(eq(artistConnections.id, connectionId))
      .limit(1);

    if (!connection) {
      throw new Error("Connection request not found");
    }

    if (connection.receiverId !== userId) {
      throw new Error("Not authorized to decline this connection");
    }

    const [updated] = await db
      .update(artistConnections)
      .set({
        status: "declined",
      })
      .where(eq(artistConnections.id, connectionId))
      .returning();

    return updated;
  }

  async getConnections(userId: string): Promise<
    (ArtistConnection & { connectedUser: Partial<User> })[]
  > {
    const connections = await db
      .select()
      .from(artistConnections)
      .where(
        and(
          eq(artistConnections.status, "accepted"),
          or(
            eq(artistConnections.requesterId, userId),
            eq(artistConnections.receiverId, userId)
          )
        )
      )
      .orderBy(desc(artistConnections.acceptedAt));

    const result = await Promise.all(
      connections.map(async (conn) => {
        const connectedUserId =
          conn.requesterId === userId ? conn.receiverId : conn.requesterId;
        const [user] = await db
          .select({
            id: users.id,
            username: users.username,
            firstName: users.firstName,
            lastName: users.lastName,
            avatarUrl: users.avatarUrl,
            bio: users.bio,
            location: users.location,
          })
          .from(users)
          .where(eq(users.id, connectedUserId))
          .limit(1);

        return {
          ...conn,
          connectedUser: user || {},
        };
      })
    );

    return result;
  }

  async getPendingRequests(
    userId: string
  ): Promise<(ArtistConnection & { requester: Partial<User> })[]> {
    const requests = await db
      .select()
      .from(artistConnections)
      .where(
        and(
          eq(artistConnections.receiverId, userId),
          eq(artistConnections.status, "pending")
        )
      )
      .orderBy(desc(artistConnections.createdAt));

    const result = await Promise.all(
      requests.map(async (req) => {
        const [requester] = await db
          .select({
            id: users.id,
            username: users.username,
            firstName: users.firstName,
            lastName: users.lastName,
            avatarUrl: users.avatarUrl,
            bio: users.bio,
            location: users.location,
          })
          .from(users)
          .where(eq(users.id, req.requesterId))
          .limit(1);

        return {
          ...req,
          requester: requester || {},
        };
      })
    );

    return result;
  }

  async getSuggestedCollaborators(
    userId: string,
    limit: number = 10
  ): Promise<CollaboratorMatch[]> {
    const [currentUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!currentUser) {
      throw new Error("User not found");
    }

    const existingConnections = await db
      .select({
        requesterId: artistConnections.requesterId,
        receiverId: artistConnections.receiverId,
      })
      .from(artistConnections)
      .where(
        or(
          eq(artistConnections.requesterId, userId),
          eq(artistConnections.receiverId, userId)
        )
      );

    const excludeIds = new Set([userId]);
    existingConnections.forEach((conn) => {
      excludeIds.add(conn.requesterId);
      excludeIds.add(conn.receiverId);
    });

    const potentialMatches = await db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
        location: users.location,
        createdAt: users.createdAt,
        onboardingData: users.onboardingData,
      })
      .from(users)
      .where(notInArray(users.id, Array.from(excludeIds)))
      .limit(100);

    const userFactors = this.extractMatchingFactors(currentUser);
    const scoredMatches: CollaboratorMatch[] = potentialMatches.map((match) => {
      const matchFactors = this.extractMatchingFactors(match as any);
      const { score, reasons } = this.calculateMatchScore(
        userFactors,
        matchFactors
      );

      return {
        user: {
          id: match.id,
          username: match.username,
          firstName: match.firstName,
          lastName: match.lastName,
          avatarUrl: match.avatarUrl,
          bio: match.bio,
          location: match.location,
        },
        matchScore: score,
        matchReasons: reasons,
      };
    });

    scoredMatches.sort((a, b) => b.matchScore - a.matchScore);
    return scoredMatches.slice(0, limit);
  }

  private extractMatchingFactors(user: any): MatchingFactors {
    const onboardingData = user.onboardingData || {};
    const skills: string[] = [];

    if (onboardingData.artistType) {
      skills.push(onboardingData.artistType.toLowerCase());
    }
    if (onboardingData.skills) {
      skills.push(
        ...onboardingData.skills.map((s: string) => s.toLowerCase())
      );
    }

    return {
      genre: onboardingData.primaryGenre || onboardingData.genre || null,
      skills,
      followerCount: onboardingData.followerCount || 0,
      location: user.location || null,
      lastActive: user.createdAt || null,
    };
  }

  private calculateMatchScore(
    user: MatchingFactors,
    match: MatchingFactors
  ): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];

    if (
      user.genre &&
      match.genre &&
      user.genre.toLowerCase() === match.genre.toLowerCase()
    ) {
      score += 30;
      reasons.push(`Same genre: ${user.genre}`);
    }

    for (const userSkill of user.skills) {
      const complements = SKILL_COMPLEMENTS[userSkill] || [];
      for (const matchSkill of match.skills) {
        if (complements.includes(matchSkill)) {
          score += 25;
          reasons.push(`Complementary skills: ${userSkill} + ${matchSkill}`);
          break;
        }
      }
    }

    if (user.followerCount > 0 && match.followerCount > 0) {
      const ratio =
        Math.min(user.followerCount, match.followerCount) /
        Math.max(user.followerCount, match.followerCount);
      if (ratio > 0.5) {
        score += Math.round(20 * ratio);
        reasons.push("Similar audience size");
      }
    }

    if (
      user.location &&
      match.location &&
      user.location.toLowerCase() === match.location.toLowerCase()
    ) {
      score += 15;
      reasons.push(`Same location: ${user.location}`);
    }

    if (match.lastActive) {
      const daysSinceActive = Math.floor(
        (Date.now() - new Date(match.lastActive).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceActive < 7) {
        score += 10;
        reasons.push("Recently active");
      } else if (daysSinceActive < 30) {
        score += 5;
        reasons.push("Active this month");
      }
    }

    return { score, reasons };
  }

  async createProject(
    userId: string,
    data: {
      title: string;
      description?: string;
      genre?: string;
      lookingFor?: string[];
      maxMembers?: number;
      isPublic?: boolean;
    }
  ): Promise<CollaborationProject> {
    const [project] = await db
      .insert(collaborationProjects)
      .values({
        ownerId: userId,
        title: data.title,
        description: data.description,
        genre: data.genre,
        lookingFor: data.lookingFor,
        maxMembers: data.maxMembers || 10,
        isPublic: data.isPublic !== false,
        status: "open",
      })
      .returning();

    await db.insert(projectMembers).values({
      projectId: project.id,
      userId,
      role: "owner",
      status: "active",
    });

    return project;
  }

  async getProjects(
    userId?: string,
    filters?: { genre?: string; status?: string; ownOnly?: boolean }
  ): Promise<ProjectWithMembers[]> {
    let query = db.select().from(collaborationProjects);

    if (filters?.ownOnly && userId) {
      query = query.where(eq(collaborationProjects.ownerId, userId)) as any;
    } else if (filters?.status) {
      query = query.where(
        eq(collaborationProjects.status, filters.status)
      ) as any;
    }

    const projects = await query.orderBy(desc(collaborationProjects.createdAt));

    const result = await Promise.all(
      projects.map(async (project) => {
        const members = await db
          .select()
          .from(projectMembers)
          .where(eq(projectMembers.projectId, project.id));

        const membersWithUsers = await Promise.all(
          members.map(async (member) => {
            const [user] = await db
              .select({
                id: users.id,
                username: users.username,
                firstName: users.firstName,
                lastName: users.lastName,
                avatarUrl: users.avatarUrl,
              })
              .from(users)
              .where(eq(users.id, member.userId))
              .limit(1);

            return { ...member, user: user || {} };
          })
        );

        const [owner] = await db
          .select({
            id: users.id,
            username: users.username,
            firstName: users.firstName,
            lastName: users.lastName,
            avatarUrl: users.avatarUrl,
          })
          .from(users)
          .where(eq(users.id, project.ownerId))
          .limit(1);

        return {
          ...project,
          members: membersWithUsers,
          owner: owner || {},
        };
      })
    );

    return result;
  }

  async joinProject(
    userId: string,
    projectId: string,
    role: string = "member"
  ): Promise<ProjectMember> {
    const [project] = await db
      .select()
      .from(collaborationProjects)
      .where(eq(collaborationProjects.id, projectId))
      .limit(1);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.status !== "open") {
      throw new Error("Project is not accepting new members");
    }

    const existingMember = await db
      .select()
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId)
        )
      )
      .limit(1);

    if (existingMember.length > 0) {
      throw new Error("Already a member of this project");
    }

    const currentMembers = await db
      .select()
      .from(projectMembers)
      .where(eq(projectMembers.projectId, projectId));

    if (currentMembers.length >= (project.maxMembers || 10)) {
      throw new Error("Project has reached maximum members");
    }

    const [member] = await db
      .insert(projectMembers)
      .values({
        projectId,
        userId,
        role,
        status: "active",
      })
      .returning();

    return member;
  }

  async leaveProject(userId: string, projectId: string): Promise<void> {
    const [project] = await db
      .select()
      .from(collaborationProjects)
      .where(eq(collaborationProjects.id, projectId))
      .limit(1);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId === userId) {
      throw new Error("Project owner cannot leave. Transfer ownership or delete the project.");
    }

    await db
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId)
        )
      );
  }

  async searchArtists(
    query: string,
    filters?: {
      genre?: string;
      location?: string;
      skills?: string[];
    },
    limit: number = 20
  ): Promise<Partial<User>[]> {
    let whereConditions: any[] = [];

    if (query) {
      whereConditions.push(
        or(
          ilike(users.username, `%${query}%`),
          ilike(users.firstName, `%${query}%`),
          ilike(users.lastName, `%${query}%`),
          ilike(users.bio, `%${query}%`)
        )
      );
    }

    if (filters?.location) {
      whereConditions.push(ilike(users.location, `%${filters.location}%`));
    }

    const results = await db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
        location: users.location,
        onboardingData: users.onboardingData,
      })
      .from(users)
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .limit(limit);

    let filteredResults = results;

    if (filters?.genre) {
      filteredResults = results.filter((user) => {
        const data = user.onboardingData as any;
        const userGenre = data?.primaryGenre || data?.genre;
        return (
          userGenre &&
          userGenre.toLowerCase().includes(filters.genre!.toLowerCase())
        );
      });
    }

    if (filters?.skills && filters.skills.length > 0) {
      filteredResults = filteredResults.filter((user) => {
        const data = user.onboardingData as any;
        const userSkills = [
          data?.artistType?.toLowerCase(),
          ...(data?.skills || []).map((s: string) => s.toLowerCase()),
        ].filter(Boolean);

        return filters.skills!.some((skill) =>
          userSkills.includes(skill.toLowerCase())
        );
      });
    }

    return filteredResults.map(({ onboardingData, ...rest }) => rest);
  }

  async getConnectionStatus(
    userId: string,
    otherUserId: string
  ): Promise<{ status: string | null; connectionId: string | null }> {
    const [connection] = await db
      .select()
      .from(artistConnections)
      .where(
        or(
          and(
            eq(artistConnections.requesterId, userId),
            eq(artistConnections.receiverId, otherUserId)
          ),
          and(
            eq(artistConnections.requesterId, otherUserId),
            eq(artistConnections.receiverId, userId)
          )
        )
      )
      .limit(1);

    if (!connection) {
      return { status: null, connectionId: null };
    }

    return { status: connection.status, connectionId: connection.id };
  }

  async removeConnection(connectionId: string, userId: string): Promise<void> {
    const [connection] = await db
      .select()
      .from(artistConnections)
      .where(eq(artistConnections.id, connectionId))
      .limit(1);

    if (!connection) {
      throw new Error("Connection not found");
    }

    if (
      connection.requesterId !== userId &&
      connection.receiverId !== userId
    ) {
      throw new Error("Not authorized to remove this connection");
    }

    await db
      .delete(artistConnections)
      .where(eq(artistConnections.id, connectionId));
  }
}

export const collaborationService = new CollaborationService();
