import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { artistProfileService } from '../services/artistProfileService.js';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../logger.js';

const router = Router();

const createProfileSchema = z.object({
  artistName: z.string().min(1).max(255),
  isNewArtist: z.boolean().default(true),
  spotifyArtistId: z.string().max(255).optional(),
  spotifyArtistUri: z.string().max(255).optional(),
  appleArtistId: z.string().max(255).optional(),
  youtubeChannelId: z.string().max(255).optional(),
  tidalArtistId: z.string().max(255).optional(),
  deezerArtistId: z.string().max(255).optional(),
  soundcloudArtistId: z.string().max(255).optional(),
  amazonMusicArtistId: z.string().max(255).optional(),
  profileImageUrl: z.string().url().max(500).optional(),
  genres: z.array(z.string()).max(10).optional(),
});

const fixerSchema = z.object({
  targetSpotifyUri: z.string().regex(/^spotify:artist:[A-Za-z0-9]+$/, {
    message: 'Must be a valid Spotify artist URI (spotify:artist:<ID>)',
  }),
  notes: z.string().max(1000).optional().default(''),
});

router.use(requireAuth);

router.get('/', async (req: Request, res: Response) => {
  try {
    const profiles = await artistProfileService.getUserProfiles(req.user!.id);
    res.json({ profiles });
  } catch (err) {
    logger.error('[ArtistProfiles] GET / error:', err);
    res.status(500).json({ error: 'Failed to fetch artist profiles' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = createProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const { spotifyArtistUri, spotifyArtistId, ...rest } = parsed.data;

    let resolvedSpotifyId = spotifyArtistId;
    let resolvedSpotifyUri = spotifyArtistUri;

    if (spotifyArtistUri && !spotifyArtistId) {
      resolvedSpotifyId = spotifyArtistUri.startsWith('spotify:artist:')
        ? spotifyArtistUri.replace('spotify:artist:', '')
        : spotifyArtistUri;
    } else if (spotifyArtistId && !spotifyArtistUri) {
      resolvedSpotifyUri = `spotify:artist:${spotifyArtistId}`;
    }

    const profile = await artistProfileService.createProfile({
      userId: req.user!.id,
      ...rest,
      spotifyArtistId: resolvedSpotifyId,
      spotifyArtistUri: resolvedSpotifyUri,
    });

    res.status(201).json({ profile });
  } catch (err: any) {
    const cause = err?.cause;
    const causeMsg: string = cause?.message ?? (typeof cause === 'string' ? cause : '') ?? '';
    logger.error('[ArtistProfiles] POST / error:', err, cause ? { cause: causeMsg } : {});

    if (causeMsg.includes('project size limit') || causeMsg.includes('storage limit') || causeMsg.includes('could not extend file')) {
      return res.status(507).json({
        error: 'Database storage limit reached',
        message: 'Your Neon database has reached its 512 MB free-tier limit and cannot accept new records. Please visit console.neon.tech to upgrade your plan or free up storage before creating artist profiles.',
        code: 'DB_STORAGE_LIMIT',
      });
    }

    res.status(500).json({ error: 'Failed to create artist profile' });
  }
});

router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }
    if (query.length > 100) {
      return res.status(400).json({ error: 'Search query too long' });
    }

    const platform = String(req.query.platform || 'all');
    const validPlatforms = ['all', 'spotify', 'apple', 'deezer'];
    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({ error: `Invalid platform. Valid options: ${validPlatforms.join(', ')}` });
    }

    let results;
    if (platform === 'spotify') {
      results = { spotify: await artistProfileService.searchSpotifyArtists(query), apple: [], deezer: [] };
    } else if (platform === 'apple') {
      results = { spotify: [], apple: await artistProfileService.searchAppleArtists(query), deezer: [] };
    } else if (platform === 'deezer') {
      results = { spotify: [], apple: [], deezer: await artistProfileService.searchDeezerArtists(query) };
    } else {
      results = await artistProfileService.searchAllPlatforms(query);
    }

    res.json({ query, platform, results });
  } catch (err) {
    logger.error('[ArtistProfiles] GET /search error:', err);
    res.status(500).json({ error: 'Artist search failed' });
  }
});

router.get('/by-release/:releaseId', async (req: Request, res: Response) => {
  try {
    const { releaseId } = req.params;
    const profiles = await artistProfileService.getProfilesByRelease(releaseId);
    res.json({ profiles });
  } catch (err) {
    logger.error('[ArtistProfiles] GET /by-release error:', err);
    res.status(500).json({ error: 'Failed to fetch profiles for release' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const profile = await artistProfileService.getProfile(req.params.id, req.user!.id);
    if (!profile) return res.status(404).json({ error: 'Artist profile not found' });
    res.json({ profile });
  } catch (err) {
    logger.error('[ArtistProfiles] GET /:id error:', err);
    res.status(500).json({ error: 'Failed to fetch artist profile' });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const parsed = createProfileSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const profile = await artistProfileService.updateProfile(req.params.id, req.user!.id, parsed.data);
    if (!profile) return res.status(404).json({ error: 'Artist profile not found' });
    res.json({ profile });
  } catch (err) {
    logger.error('[ArtistProfiles] PATCH /:id error:', err);
    res.status(500).json({ error: 'Failed to update artist profile' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await artistProfileService.deleteProfile(req.params.id, req.user!.id);
    if (!deleted) return res.status(404).json({ error: 'Artist profile not found' });
    res.json({ success: true });
  } catch (err) {
    logger.error('[ArtistProfiles] DELETE /:id error:', err);
    res.status(500).json({ error: 'Failed to delete artist profile' });
  }
});

router.post('/:id/fixer', async (req: Request, res: Response) => {
  try {
    const parsed = fixerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const profile = await artistProfileService.submitFixerRequest(
      req.params.id,
      req.user!.id,
      parsed.data.targetSpotifyUri,
      parsed.data.notes,
    );

    if (!profile) return res.status(404).json({ error: 'Artist profile not found' });
    res.json({ profile, message: 'Fixer request submitted. Re-mapping will be applied to future releases.' });
  } catch (err: any) {
    logger.error('[ArtistProfiles] POST /:id/fixer error:', err);
    if (err.message?.includes('Invalid Spotify artist URI')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to submit fixer request' });
  }
});

router.get('/:id/profile-hub', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await artistProfileService.profileHub(req.params.id, req.user!.id);
    res.json(result);
  } catch (err: any) {
    logger.error('[ArtistProfiles] GET /:id/profile-hub error:', err);
    if (err.message === 'Artist profile not found') return res.status(404).json({ error: err.message });
    res.status(500).json({ error: 'Profile hub failed' });
  }
});

router.post('/:id/auto-discover', requireAuth, async (req: Request, res: Response) => {
  try {
    // Optional UPC from DistroKid / distributor — bypasses name-search for exact platform IDs
    const upc = typeof req.body?.upc === 'string' ? req.body.upc.replace(/[^0-9]/g, '') : undefined;
    const result = await artistProfileService.autoDiscover(req.params.id, req.user!.id, upc || undefined);
    res.json(result);
  } catch (err: any) {
    logger.error('[ArtistProfiles] POST /:id/auto-discover error:', err);
    if (err.message === 'Artist profile not found') return res.status(404).json({ error: err.message });
    res.status(500).json({ error: 'Auto-discover failed' });
  }
});

router.post('/:id/auto-sync', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await artistProfileService.autoSync(req.params.id, req.user!.id);
    res.json(result);
  } catch (err: any) {
    logger.error('[ArtistProfiles] POST /:id/auto-sync error:', err);
    if (err.message === 'Artist profile not found') return res.status(404).json({ error: err.message });
    res.status(500).json({ error: 'Auto-sync failed' });
  }
});

router.post('/:id/link-release/:releaseId', async (req: Request, res: Response) => {
  try {
    const profile = await artistProfileService.getProfile(req.params.id, req.user!.id);
    if (!profile) return res.status(404).json({ error: 'Artist profile not found' });

    await artistProfileService.linkProfileToRelease(req.params.id, req.params.releaseId);
    res.json({ success: true });
  } catch (err) {
    logger.error('[ArtistProfiles] POST /:id/link-release error:', err);
    res.status(500).json({ error: 'Failed to link release to artist profile' });
  }
});

router.post('/:id/verify', async (req: Request, res: Response) => {
  try {
    const profile = await artistProfileService.getProfile(req.params.id, req.user!.id);
    if (!profile) return res.status(404).json({ error: 'Artist profile not found' });
    if (!profile.spotifyArtistId) {
      return res.status(400).json({ error: 'No Spotify artist ID to verify' });
    }

    const spotifyData = await artistProfileService.verifySpotifyArtist(profile.spotifyArtistId);
    if (!spotifyData) {
      return res.status(422).json({ error: 'Spotify artist ID could not be verified. Check that the ID is correct.' });
    }

    const verified = await artistProfileService.updateProfile(req.params.id, req.user!.id, {
      isVerified: true,
      verifiedAt: new Date(),
      verifiedPlatforms: ['spotify'],
      profileImageUrl: spotifyData.imageUrl ?? profile.profileImageUrl ?? undefined,
      genres: spotifyData.genres.length > 0 ? spotifyData.genres : (profile.genres ?? undefined),
    });

    res.json({ profile: verified, spotifyData });
  } catch (err) {
    logger.error('[ArtistProfiles] POST /:id/verify error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

export default router;
