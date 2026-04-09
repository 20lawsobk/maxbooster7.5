/**
 * Bootstrap Route — /api/bootstrap
 *
 * Returns all data the authenticated user's Dashboard needs in a single
 * parallel query.  Called once per session at app startup; the React app
 * pre-populates its query cache with the response so every page renders
 * instantly without waiting for individual API calls.
 *
 * Response is tagged `private, max-age=30, stale-while-revalidate=60` so
 * the browser can serve a cached copy immediately and refresh in the background.
 */

import { Router, Request, Response } from 'express';
import { db, dbRead } from '../db.js';
import {
  users,
  projects,
  notifications,
  releases,
} from '../../shared/schema.js';
import { eq, desc, and } from 'drizzle-orm';
import { requireAuthOnly } from '../middleware/auth.js';
import { logger } from '../logger.js';

const router = Router();

interface AuthenticatedRequest extends Request {
  user?: { id: string; email?: string; role?: string };
}

router.get('/', requireAuthOnly, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;

  try {
    // All bootstrap queries are read-only — route to the read replica for speed
    const reader = dbRead ?? db;

    const [userResult, projectsResult, notificationsResult, releasesResult] =
      await Promise.allSettled([
        reader
          .select({
            id: users.id,
            email: users.email,
            username: users.username,
            firstName: users.firstName,
            lastName: users.lastName,
            artistName: users.artistName,
            bio: users.bio,
            avatarUrl: users.avatarUrl,
            profileImageUrl: users.profileImageUrl,
            role: users.role,
            subscriptionTier: users.subscriptionTier,
            subscriptionStatus: users.subscriptionStatus,
            subscriptionEndsAt: users.subscriptionEndsAt,
            trialEndsAt: users.trialEndsAt,
            onboardingCompleted: users.onboardingCompleted,
            onboardingStep: users.onboardingStep,
            preferences: users.preferences,
            notificationSettings: users.notificationSettings,
            twoFactorEnabled: users.twoFactorEnabled,
            emailVerified: users.emailVerified,
            socialLinks: users.socialLinks,
            website: users.website,
            location: users.location,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1),

        reader
          .select()
          .from(projects)
          .where(eq(projects.userId, userId))
          .orderBy(desc(projects.updatedAt))
          .limit(12),

        reader
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, userId),
              eq(notifications.isRead, false)
            )
          )
          .orderBy(desc(notifications.createdAt))
          .limit(20),

        reader
          .select()
          .from(releases)
          .where(eq(releases.userId, userId))
          .orderBy(desc(releases.createdAt))
          .limit(5),
      ]);

    const user        = userResult.status === 'fulfilled'        ? (userResult.value[0]        ?? null) : null;
    const projectList = projectsResult.status === 'fulfilled'    ? projectsResult.value         : [];
    const notifList   = notificationsResult.status === 'fulfilled' ? notificationsResult.value   : [];
    const releaseList = releasesResult.status === 'fulfilled'    ? releasesResult.value          : [];

    res.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
    res.json({
      user,
      projects:      projectList,
      notifications: notifList,
      releases:      releaseList,
      _ts:           Date.now(),
    });
  } catch (err) {
    logger.warn('[Bootstrap] Failed to load initial data:', err);
    res.status(500).json({ error: 'bootstrap_failed' });
  }
});

export default router;
