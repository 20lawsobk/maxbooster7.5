import { Router, Request, Response } from 'express';
import { db } from '../db.ts';
import { storage } from '../storage.ts';
import { eq, ilike, or, and, desc, sql, count, gte, lte, asc, sum } from 'drizzle-orm';
import { users, projects, beats, releases, studioProjects, storefronts, analytics, socialCampaigns, searchHistory, filterPresets } from '../../shared/schema.ts';
import { logger } from '../logger.js';

const router = Router();

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightMatch(text: string, query: string): string {
  const safeText = escapeHtml(text);
  const safeQuery = escapeRegex(query);
  return safeText.replace(new RegExp(`(${safeQuery})`, 'gi'), '<mark>$1</mark>');
}

interface SearchQuery {
  q: string;
  type?: 'all' | 'tracks' | 'beats' | 'users' | 'projects' | 'releases';
  limit?: number;
  offset?: number;
  genre?: string;
  bpm_min?: number;
  bpm_max?: number;
  price_min?: number;
  price_max?: number;
  key?: string;
  mood?: string;
  sort?: 'relevance' | 'newest' | 'popular' | 'price_low' | 'price_high';
}

interface SearchHistoryItem {
  query: string;
  timestamp: Date;
  resultCount: number;
}

interface TrendingSearch {
  query: string;
  searchCount: number;
  trend: 'up' | 'down' | 'stable';
}

const trendingSearchesCache: TrendingSearch[] = [];
const autocompleteCache = new Map<string, string[]>();

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

function fuzzyMatch(query: string, target: string, threshold = 0.3): boolean {
  const normalizedQuery = query.toLowerCase().trim();
  const normalizedTarget = target.toLowerCase().trim();
  
  if (normalizedTarget.includes(normalizedQuery)) {
    return true;
  }
  
  const distance = levenshteinDistance(normalizedQuery, normalizedTarget);
  const maxLen = Math.max(normalizedQuery.length, normalizedTarget.length);
  const similarity = 1 - (distance / maxLen);
  
  return similarity >= (1 - threshold);
}

function calculateRelevanceScore(query: string, item: any): number {
  const normalizedQuery = query.toLowerCase().trim();
  let score = 0;
  
  const title = (item.title || item.name || item.username || '').toLowerCase();
  const description = (item.description || item.bio || '').toLowerCase();
  const genre = (item.genre || '').toLowerCase();
  const tags = Array.isArray(item.tags) ? item.tags.join(' ').toLowerCase() : '';
  
  if (title === normalizedQuery) score += 100;
  else if (title.startsWith(normalizedQuery)) score += 75;
  else if (title.includes(normalizedQuery)) score += 50;
  else if (fuzzyMatch(normalizedQuery, title)) score += 25;
  
  if (description.includes(normalizedQuery)) score += 20;
  if (genre.includes(normalizedQuery)) score += 15;
  if (tags.includes(normalizedQuery)) score += 10;
  
  score += Math.min((item.plays || 0) / 1000, 30);
  score += Math.min((item.downloads || 0) / 100, 20);
  
  return score;
}

async function searchBeats(query: string, filters: any, limit: number, offset: number) {
  const conditions: any[] = [];
  
  if (query) {
    conditions.push(
      or(
        ilike(beats.title, `%${query}%`),
        ilike(beats.description, `%${query}%`),
        ilike(beats.genre, `%${query}%`)
      )
    );
  }
  
  if (filters.genre) {
    conditions.push(eq(beats.genre, filters.genre));
  }
  
  if (filters.key) {
    conditions.push(eq(beats.key, filters.key));
  }
  
  if (filters.bpm_min) {
    conditions.push(gte(beats.bpm, filters.bpm_min));
  }
  
  if (filters.bpm_max) {
    conditions.push(lte(beats.bpm, filters.bpm_max));
  }
  
  if (filters.price_min) {
    conditions.push(gte(beats.price, filters.price_min));
  }
  
  if (filters.price_max) {
    conditions.push(lte(beats.price, filters.price_max));
  }
  
  conditions.push(eq(beats.isPublished, true));
  
  let orderBy: any = desc(beats.createdAt);
  if (filters.sort === 'popular') orderBy = desc(beats.plays);
  else if (filters.sort === 'price_low') orderBy = asc(beats.price);
  else if (filters.sort === 'price_high') orderBy = desc(beats.price);
  
  const results = await db.select()
    .from(beats)
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);
  
  const [{ value: total }] = await db.select({ value: count() })
    .from(beats)
    .where(and(...conditions));
  
  return {
    items: results.map(beat => ({
      ...beat,
      type: 'beat' as const,
      relevanceScore: query ? calculateRelevanceScore(query, beat) : 0,
    })),
    total,
  };
}

async function searchUsers(query: string, limit: number, offset: number) {
  if (!query) {
    return { items: [], total: 0 };
  }
  
  const results = await db.select({
    id: users.id,
    username: users.username,
    firstName: users.firstName,
    lastName: users.lastName,
    avatarUrl: users.avatarUrl,
    bio: users.bio,
    location: users.location,
  })
    .from(users)
    .where(
      or(
        ilike(users.username, `%${query}%`),
        ilike(users.firstName, `%${query}%`),
        ilike(users.lastName, `%${query}%`),
        ilike(users.bio, `%${query}%`)
      )
    )
    .limit(limit)
    .offset(offset);
  
  const [{ value: total }] = await db.select({ value: count() })
    .from(users)
    .where(
      or(
        ilike(users.username, `%${query}%`),
        ilike(users.firstName, `%${query}%`),
        ilike(users.lastName, `%${query}%`)
      )
    );
  
  return {
    items: results.map(user => ({
      ...user,
      type: 'user' as const,
      relevanceScore: calculateRelevanceScore(query, user),
    })),
    total,
  };
}

async function searchProjects(query: string, userId: string | undefined, limit: number, offset: number) {
  const conditions: any[] = [];
  
  if (query) {
    conditions.push(
      or(
        ilike(projects.title, `%${query}%`),
        ilike(projects.description, `%${query}%`),
        ilike(projects.genre, `%${query}%`)
      )
    );
  }
  
  if (userId) {
    conditions.push(eq(projects.userId, userId));
  }
  
  const results = await db.select()
    .from(projects)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(projects.updatedAt))
    .limit(limit)
    .offset(offset);
  
  const [{ value: total }] = await db.select({ value: count() })
    .from(projects)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  
  return {
    items: results.map(project => ({
      ...project,
      type: 'project' as const,
      relevanceScore: query ? calculateRelevanceScore(query, project) : 0,
    })),
    total,
  };
}

async function searchReleases(query: string, limit: number, offset: number) {
  if (!query) {
    return { items: [], total: 0 };
  }
  
  const results = await db.select()
    .from(releases)
    .where(ilike(releases.title, `%${query}%`))
    .orderBy(desc(releases.createdAt))
    .limit(limit)
    .offset(offset);
  
  const [{ value: total }] = await db.select({ value: count() })
    .from(releases)
    .where(ilike(releases.title, `%${query}%`));
  
  return {
    items: results.map(release => ({
      ...release,
      type: 'release' as const,
      relevanceScore: calculateRelevanceScore(query, release),
    })),
    total,
  };
}

router.get('/', async (req: Request, res: Response) => {
  try {
    return res.redirect(307, `/api/search/unified?${new URLSearchParams(req.query as Record<string, string>).toString()}`);
  } catch (error: any) {
    logger.info('Error in search redirect:', error?.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/unified', async (req: Request, res: Response) => {
  try {
    const {
      q = '',
      type = 'all',
      limit = 20,
      offset = 0,
      genre,
      bpm_min,
      bpm_max,
      price_min,
      price_max,
      key,
      mood,
      sort = 'relevance',
    } = req.query as unknown as SearchQuery;
    
    const userId = req.user?.id;
    const numLimit = Math.min(Number(limit) || 20, 100);
    const numOffset = Number(offset) || 0;
    
    const filters = {
      genre: genre as string,
      key: key as string,
      mood: mood as string,
      bpm_min: bpm_min ? Number(bpm_min) : undefined,
      bpm_max: bpm_max ? Number(bpm_max) : undefined,
      price_min: price_min ? Number(price_min) : undefined,
      price_max: price_max ? Number(price_max) : undefined,
      sort: sort as string,
    };
    
    const results: {
      beats: { items: any[]; total: number };
      users: { items: any[]; total: number };
      projects: { items: any[]; total: number };
      releases: { items: any[]; total: number };
    } = {
      beats: { items: [], total: 0 },
      users: { items: [], total: 0 },
      projects: { items: [], total: 0 },
      releases: { items: [], total: 0 },
    };
    
    const searchPromises: Promise<void>[] = [];
    
    if (type === 'all' || type === 'beats') {
      searchPromises.push(
        searchBeats(q, filters, numLimit, numOffset).then(r => { results.beats = r; })
      );
    }
    
    if (type === 'all' || type === 'users') {
      searchPromises.push(
        searchUsers(q, numLimit, numOffset).then(r => { results.users = r; })
      );
    }
    
    if ((type === 'all' || type === 'projects') && userId) {
      searchPromises.push(
        searchProjects(q, userId, numLimit, numOffset).then(r => { results.projects = r; })
      );
    }
    
    if (type === 'all' || type === 'releases') {
      searchPromises.push(
        searchReleases(q, numLimit, numOffset).then(r => { results.releases = r; })
      );
    }
    
    await Promise.all(searchPromises);
    
    let allItems = [
      ...results.beats.items,
      ...results.users.items,
      ...results.projects.items,
      ...results.releases.items,
    ];
    
    if (sort === 'relevance' && q) {
      allItems.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    }
    
    const totalCount = results.beats.total + results.users.total + 
                       results.projects.total + results.releases.total;
    
    if (userId && q) {
      await db.insert(searchHistory).values({ userId, query: q, resultCount: totalCount }).catch(() => {});
    }
    
    res.json({
      query: q,
      totalResults: totalCount,
      categories: {
        beats: { items: results.beats.items.slice(0, 10), total: results.beats.total },
        users: { items: results.users.items.slice(0, 10), total: results.users.total },
        projects: { items: results.projects.items.slice(0, 10), total: results.projects.total },
        releases: { items: results.releases.items.slice(0, 10), total: results.releases.total },
      },
      allResults: allItems.slice(0, numLimit),
      filters: filters,
      pagination: {
        limit: numLimit,
        offset: numOffset,
        total: totalCount,
        hasMore: numOffset + numLimit < totalCount,
      },
    });
  } catch (error: any) {
    logger.error('Unified search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

router.get('/autocomplete', async (req: Request, res: Response) => {
  try {
    const { q = '', limit = 10 } = req.query;
    const query = String(q).trim().toLowerCase();
    
    if (query.length < 2) {
      return res.json({ suggestions: [] });
    }
    
    const cacheKey = query.substring(0, 3);
    let cachedSuggestions = autocompleteCache.get(cacheKey);
    
    if (!cachedSuggestions) {
      const beatTitles = await db.select({ title: beats.title })
        .from(beats)
        .where(and(ilike(beats.title, `%${query}%`), eq(beats.isPublished, true)))
        .limit(50);
      
      const usernames = await db.select({ username: users.username })
        .from(users)
        .where(ilike(users.username, `%${query}%`))
        .limit(50);
      
      const genres = await db.selectDistinct({ genre: beats.genre })
        .from(beats)
        .where(ilike(beats.genre, `%${query}%`))
        .limit(20);
      
      cachedSuggestions = [
        ...beatTitles.map(b => b.title).filter(Boolean),
        ...usernames.map(u => u.username).filter(Boolean),
        ...genres.map(g => g.genre).filter(Boolean),
      ] as string[];
      
      autocompleteCache.set(cacheKey, cachedSuggestions);
      
      setTimeout(() => autocompleteCache.delete(cacheKey), 5 * 60 * 1000);
    }
    
    const suggestions = cachedSuggestions
      .filter(s => s.toLowerCase().includes(query))
      .map(text => ({
        text,
        type: text.startsWith('@') ? 'user' : 'query',
        highlighted: highlightMatch(text, query),
      }))
      .slice(0, Number(limit));
    
    res.json({ suggestions });
  } catch (error: any) {
    logger.error('Autocomplete error:', error);
    res.status(500).json({ error: 'Autocomplete failed' });
  }
});

router.get('/trending', async (req: Request, res: Response) => {
  try {
    const trendingBeats = await db.select({
      id: beats.id,
      title: beats.title,
      genre: beats.genre,
      plays: beats.plays,
      price: beats.price,
      artworkUrl: beats.artworkUrl,
    })
      .from(beats)
      .where(eq(beats.isPublished, true))
      .orderBy(desc(beats.plays))
      .limit(10);
    
    const trendingGenres = await db.select({
      genre: beats.genre,
    })
      .from(beats)
      .where(eq(beats.isPublished, true))
      .groupBy(beats.genre)
      .limit(10);
    
    const trendingQueries: TrendingSearch[] = [
      { query: 'trap beats', searchCount: 1523, trend: 'up' },
      { query: 'lo-fi', searchCount: 1245, trend: 'up' },
      { query: 'drill type beat', searchCount: 987, trend: 'stable' },
      { query: 'r&b instrumental', searchCount: 876, trend: 'up' },
      { query: 'chill beats', searchCount: 765, trend: 'down' },
      { query: 'melodic rap', searchCount: 654, trend: 'up' },
      { query: 'hard beat', searchCount: 543, trend: 'stable' },
      { query: 'emotional', searchCount: 432, trend: 'up' },
    ];
    
    res.json({
      queries: trendingQueries,
      beats: trendingBeats,
      genres: trendingGenres.map(g => g.genre).filter(Boolean),
    });
  } catch (error: any) {
    logger.error('Trending search error:', error);
    res.status(500).json({ error: 'Failed to get trending data' });
  }
});

router.get('/history', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const rows = await db
      .select()
      .from(searchHistory)
      .where(eq(searchHistory.userId, userId))
      .orderBy(desc(searchHistory.createdAt))
      .limit(50);

    res.json({ history: rows.slice(0, 20), totalCount: rows.length });
  } catch (error: any) {
    logger.error('Search history error:', error);
    res.status(500).json({ error: 'Failed to get search history' });
  }
});

router.delete('/history', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    await db.delete(searchHistory).where(eq(searchHistory.userId, userId));

    res.json({ success: true, message: 'Search history cleared' });
  } catch (error: any) {
    logger.error('Clear search history error:', error);
    res.status(500).json({ error: 'Failed to clear search history' });
  }
});

router.delete('/history/:query', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { query } = req.params;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    await db
      .delete(searchHistory)
      .where(and(eq(searchHistory.userId, userId), eq(searchHistory.query, query)));

    res.json({ success: true, message: 'Search item removed' });
  } catch (error: any) {
    logger.error('Remove search history item error:', error);
    res.status(500).json({ error: 'Failed to remove search item' });
  }
});

router.get('/discover', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { category = 'all' } = req.query;
    
    const newReleases = await db.select()
      .from(beats)
      .where(eq(beats.isPublished, true))
      .orderBy(desc(beats.createdAt))
      .limit(12);
    
    const trending = await db.select()
      .from(beats)
      .where(eq(beats.isPublished, true))
      .orderBy(desc(beats.plays))
      .limit(12);
    
    const genres = ['Hip-Hop', 'Trap', 'R&B', 'Pop', 'Lo-Fi', 'Drill'];
    const curatedCollections: { name: string; description: string; items: any[] }[] = [];
    
    for (const genre of genres.slice(0, 4)) {
      const genreBeats = await db.select()
        .from(beats)
        .where(and(eq(beats.isPublished, true), eq(beats.genre, genre)))
        .orderBy(desc(beats.plays))
        .limit(6);
      
      if (genreBeats.length > 0) {
        curatedCollections.push({
          name: `Top ${genre} Beats`,
          description: `Trending ${genre} instrumentals`,
          items: genreBeats,
        });
      }
    }
    
    let personalized: any[] = [];
    
    if (userId) {
      const userHistory = await db
        .select()
        .from(searchHistory)
        .where(eq(searchHistory.userId, userId))
        .orderBy(desc(searchHistory.createdAt))
        .limit(10);
      const recentGenres = new Set<string>();
      
      for (const item of userHistory.slice(0, 10)) {
        const matchingBeats = await db.select({ genre: beats.genre })
          .from(beats)
          .where(ilike(beats.title, `%${item.query}%`))
          .limit(3);
        matchingBeats.forEach(b => b.genre && recentGenres.add(b.genre));
      }
      
      if (recentGenres.size > 0) {
        const genreArray = Array.from(recentGenres).slice(0, 3);
        for (const genre of genreArray) {
          const recommended = await db.select()
            .from(beats)
            .where(and(eq(beats.isPublished, true), eq(beats.genre, genre)))
            .orderBy(desc(beats.plays))
            .limit(4);
          personalized.push(...recommended);
        }
      }
    }
    
    res.json({
      newReleases: {
        title: 'New Releases',
        description: 'Fresh beats just dropped',
        items: newReleases,
      },
      trending: {
        title: 'Trending Now',
        description: 'Most played this week',
        items: trending,
      },
      personalized: personalized.length > 0 ? {
        title: 'For You',
        description: 'Based on your listening history',
        items: personalized.slice(0, 12),
      } : null,
      curatedCollections,
      featuredGenres: genres,
    });
  } catch (error: any) {
    logger.error('Discovery feed error:', error);
    res.status(500).json({ error: 'Failed to get discovery feed' });
  }
});

router.get('/similar/:beatId', async (req: Request, res: Response) => {
  try {
    const { beatId } = req.params;
    const { limit = 10 } = req.query;
    
    const [beat] = await db.select()
      .from(beats)
      .where(eq(beats.id, beatId))
      .limit(1);
    
    if (!beat) {
      return res.status(404).json({ error: 'Beat not found' });
    }
    
    const conditions: any[] = [eq(beats.isPublished, true)];
    
    if (beat.genre) {
      conditions.push(eq(beats.genre, beat.genre));
    }
    
    if (beat.bpm) {
      conditions.push(gte(beats.bpm, beat.bpm - 15));
      conditions.push(lte(beats.bpm, beat.bpm + 15));
    }
    
    const similar = await db.select()
      .from(beats)
      .where(and(...conditions))
      .orderBy(desc(beats.plays))
      .limit(Number(limit) + 1);
    
    const filtered = similar.filter(b => b.id !== beatId).slice(0, Number(limit));
    
    res.json({
      sourceBeat: {
        id: beat.id,
        title: beat.title,
        genre: beat.genre,
        bpm: beat.bpm,
      },
      similar: filtered,
      matchCriteria: {
        genre: beat.genre,
        bpmRange: beat.bpm ? `${beat.bpm - 15} - ${beat.bpm + 15}` : null,
      },
    });
  } catch (error: any) {
    logger.error('Similar beats error:', error);
    res.status(500).json({ error: 'Failed to find similar beats' });
  }
});

router.post('/filter-presets', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { name, filters, context = 'global' } = req.body;
    if (!name || !filters) return res.status(400).json({ error: 'Name and filters are required' });

    const [inserted] = await db
      .insert(filterPresets)
      .values({ userId, name, filters, context })
      .returning();

    res.json({ success: true, preset: inserted });
  } catch (error: any) {
    logger.error('Save filter preset error:', error);
    res.status(500).json({ error: 'Failed to save filter preset' });
  }
});

router.get('/filter-presets', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { context = 'global' } = req.query;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const builtInPresets: Record<string, any[]> = {
      marketplace: [
        { id: 'preset_trap', name: 'Trap Vibes', filters: { genre: 'Trap', bpm_min: 130, bpm_max: 160 }, isBuiltIn: true },
        { id: 'preset_chill', name: 'Chill Lo-Fi', filters: { genre: 'Lo-Fi', bpm_min: 70, bpm_max: 95 }, isBuiltIn: true },
        { id: 'preset_drill', name: 'UK Drill', filters: { genre: 'Drill', bpm_min: 140, bpm_max: 145 }, isBuiltIn: true },
        { id: 'preset_rnb', name: 'Smooth R&B', filters: { genre: 'R&B', bpm_min: 60, bpm_max: 100 }, isBuiltIn: true },
        { id: 'preset_budget', name: 'Budget Friendly', filters: { price_max: 50 }, isBuiltIn: true },
        { id: 'preset_premium', name: 'Premium Exclusives', filters: { price_min: 200, exclusive_only: true }, isBuiltIn: true },
      ],
      analytics: [
        { id: 'preset_7days', name: 'Last 7 Days', filters: { dateRange: '7d' }, isBuiltIn: true },
        { id: 'preset_30days', name: 'Last 30 Days', filters: { dateRange: '30d' }, isBuiltIn: true },
        { id: 'preset_spotify', name: 'Spotify Only', filters: { platform: 'spotify' }, isBuiltIn: true },
        { id: 'preset_youtube', name: 'YouTube Only', filters: { platform: 'youtube' }, isBuiltIn: true },
      ],
      distribution: [
        { id: 'preset_live', name: 'Live Releases', filters: { status: 'live' }, isBuiltIn: true },
        { id: 'preset_pending', name: 'Pending Approval', filters: { status: 'pending' }, isBuiltIn: true },
        { id: 'preset_draft', name: 'Drafts', filters: { status: 'draft' }, isBuiltIn: true },
      ],
      social: [
        { id: 'preset_scheduled', name: 'Scheduled Posts', filters: { status: 'scheduled' }, isBuiltIn: true },
        { id: 'preset_published', name: 'Published', filters: { status: 'published' }, isBuiltIn: true },
        { id: 'preset_instagram', name: 'Instagram Posts', filters: { platform: 'instagram' }, isBuiltIn: true },
        { id: 'preset_twitter', name: 'Twitter/X Posts', filters: { platform: 'twitter' }, isBuiltIn: true },
      ],
      global: [
        { id: 'preset_trap', name: 'Trap Vibes', filters: { genre: 'Trap', bpm_min: 130, bpm_max: 160 }, isBuiltIn: true },
        { id: 'preset_chill', name: 'Chill Lo-Fi', filters: { genre: 'Lo-Fi', bpm_min: 70, bpm_max: 95 }, isBuiltIn: true },
      ],
    };

    const contextKey = String(context);
    const contextPresets = builtInPresets[contextKey] || builtInPresets.global;
    const userPresets = await db
      .select()
      .from(filterPresets)
      .where(and(eq(filterPresets.userId, userId), eq(filterPresets.context, contextKey)))
      .orderBy(desc(filterPresets.createdAt));

    res.json({ presets: [...contextPresets, ...userPresets] });
  } catch (error: any) {
    logger.error('Get filter presets error:', error);
    res.status(500).json({ error: 'Failed to get filter presets' });
  }
});

router.put('/filter-presets', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { id, name, filters } = req.body;
    if (!id || !name) return res.status(400).json({ error: 'ID and name are required' });

    const [updated] = await db
      .update(filterPresets)
      .set({ name, ...(filters && { filters }), updatedAt: new Date() })
      .where(and(eq(filterPresets.id, id), eq(filterPresets.userId, userId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Preset not found' });

    res.json({ success: true, preset: updated });
  } catch (error: any) {
    logger.error('Update filter preset error:', error);
    res.status(500).json({ error: 'Failed to update filter preset' });
  }
});

router.delete('/filter-presets/:presetId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { presetId } = req.params;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    await db
      .delete(filterPresets)
      .where(and(eq(filterPresets.id, presetId), eq(filterPresets.userId, userId)));

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Delete filter preset error:', error);
    res.status(500).json({ error: 'Failed to delete filter preset' });
  }
});

router.post('/filter-presets/:presetId/default', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { presetId } = req.params;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const [target] = await db
      .select()
      .from(filterPresets)
      .where(and(eq(filterPresets.id, presetId), eq(filterPresets.userId, userId)));

    if (!target) return res.status(404).json({ error: 'Preset not found' });

    await db
      .update(filterPresets)
      .set({ isDefault: false })
      .where(and(eq(filterPresets.userId, userId), eq(filterPresets.context, target.context)));

    await db
      .update(filterPresets)
      .set({ isDefault: !target.isDefault })
      .where(eq(filterPresets.id, presetId));

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Set default preset error:', error);
    res.status(500).json({ error: 'Failed to set default preset' });
  }
});

router.get('/suggestions', async (req: Request, res: Response) => {
  try {
    const { q = '', limit = 10, context = 'global' } = req.query;
    const query = String(q).trim().toLowerCase();
    
    if (query.length < 2) {
      return res.json({ suggestions: [] });
    }
    
    const suggestions: any[] = [];
    
    const beatTitles = await db.select({ title: beats.title, genre: beats.genre })
      .from(beats)
      .where(and(ilike(beats.title, `%${query}%`), eq(beats.isPublished, true)))
      .limit(5);
    
    beatTitles.forEach(b => {
      if (b.title) {
        suggestions.push({
          text: b.title,
          type: 'beat',
          highlighted: highlightMatch(b.title, query),
        });
      }
    });
    
    const usernames = await db.select({ username: users.username })
      .from(users)
      .where(ilike(users.username, `%${query}%`))
      .limit(3);
    
    usernames.forEach(u => {
      if (u.username) {
        suggestions.push({
          text: u.username,
          type: 'user',
          highlighted: highlightMatch(u.username, query),
        });
      }
    });
    
    const genres = await db.selectDistinct({ genre: beats.genre })
      .from(beats)
      .where(ilike(beats.genre, `%${query}%`))
      .limit(3);
    
    genres.forEach(g => {
      if (g.genre) {
        suggestions.push({
          text: g.genre,
          type: 'genre',
          highlighted: highlightMatch(g.genre, query),
        });
      }
    });
    
    if (context === 'social' && query.startsWith('#')) {
      suggestions.unshift({
        text: query,
        type: 'hashtag',
        highlighted: escapeHtml(query),
      });
    }
    
    res.json({ suggestions: suggestions.slice(0, Number(limit)) });
  } catch (error: any) {
    logger.error('Suggestions error:', error);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

router.get('/distribution', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { q = '', status, platform, limit = 20, offset = 0 } = req.query;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const conditions: any[] = [eq(releases.userId, userId)];
    
    if (q) {
      conditions.push(ilike(releases.title, `%${q}%`));
    }
    
    if (status && status !== 'all') {
      conditions.push(eq(releases.status, status as string));
    }
    
    const results = await db.select()
      .from(releases)
      .where(and(...conditions))
      .orderBy(desc(releases.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));
    
    const [{ value: total }] = await db.select({ value: count() })
      .from(releases)
      .where(and(...conditions));
    
    const statusCounts = {
      all: 0,
      draft: 0,
      pending: 0,
      live: 0,
      rejected: 0,
    };
    
    const allReleases = await db.select({ status: releases.status })
      .from(releases)
      .where(eq(releases.userId, userId));
    
    allReleases.forEach(r => {
      statusCounts.all++;
      if (r.status && statusCounts[r.status as keyof typeof statusCounts] !== undefined) {
        statusCounts[r.status as keyof typeof statusCounts]++;
      }
    });
    
    res.json({
      results,
      total,
      statusCounts,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        hasMore: Number(offset) + Number(limit) < total,
      },
    });
  } catch (error: any) {
    logger.error('Distribution search error:', error);
    res.status(500).json({ error: 'Distribution search failed' });
  }
});

router.get('/analytics/search', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { dateRange, platform, metric } = req.query;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const dateRanges: Record<string, number> = {
      '7d': 7,
      '14d': 14,
      '30d': 30,
      '90d': 90,
      '365d': 365,
    };
    
    const days = dateRanges[dateRange as string] || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const platforms = platform ? [platform as string] : ['spotify', 'apple_music', 'youtube', 'soundcloud'];
    const metrics = metric ? [metric as string] : ['streams', 'downloads', 'revenue', 'listeners'];
    
    const endDate = new Date();
    const previousStartDate = new Date(startDate);
    previousStartDate.setDate(previousStartDate.getDate() - days);
    
    const platformData = await Promise.all(
      platforms.map(async (p) => {
        const currentPeriodData = await db.select({
          totalStreams: sum(analytics.streams),
          totalRevenue: sum(analytics.revenue),
          totalListeners: sum(analytics.totalListeners),
        })
          .from(analytics)
          .where(
            and(
              eq(analytics.userId, userId),
              eq(analytics.platform, p),
              gte(analytics.date, startDate),
              lte(analytics.date, endDate)
            )
          );
        
        const previousPeriodData = await db.select({
          totalStreams: sum(analytics.streams),
          totalRevenue: sum(analytics.revenue),
          totalListeners: sum(analytics.totalListeners),
        })
          .from(analytics)
          .where(
            and(
              eq(analytics.userId, userId),
              eq(analytics.platform, p),
              gte(analytics.date, previousStartDate),
              lte(analytics.date, startDate)
            )
          );
        
        const current = currentPeriodData[0] || { totalStreams: null, totalRevenue: null, totalListeners: null };
        const previous = previousPeriodData[0] || { totalStreams: null, totalRevenue: null, totalListeners: null };
        
        const calculateChange = (curr: number, prev: number): number => {
          if (prev === 0) return curr > 0 ? 100 : 0;
          return ((curr - prev) / prev) * 100;
        };
        
        const currentStreams = Number(current.totalStreams) || 0;
        const previousStreams = Number(previous.totalStreams) || 0;
        const currentRevenue = Number(current.totalRevenue) || 0;
        const previousRevenue = Number(previous.totalRevenue) || 0;
        const currentListeners = Number(current.totalListeners) || 0;
        const previousListeners = Number(previous.totalListeners) || 0;
        
        const metricsResult: Record<string, { current: number; previous: number; change: number }> = {};
        
        if (metrics.includes('streams')) {
          metricsResult.streams = {
            current: currentStreams,
            previous: previousStreams,
            change: calculateChange(currentStreams, previousStreams),
          };
        }
        
        if (metrics.includes('downloads')) {
          metricsResult.downloads = {
            current: 0,
            previous: 0,
            change: 0,
          };
        }
        
        if (metrics.includes('revenue')) {
          metricsResult.revenue = {
            current: currentRevenue,
            previous: previousRevenue,
            change: calculateChange(currentRevenue, previousRevenue),
          };
        }
        
        if (metrics.includes('listeners')) {
          metricsResult.listeners = {
            current: currentListeners,
            previous: previousListeners,
            change: calculateChange(currentListeners, previousListeners),
          };
        }
        
        return {
          platform: p,
          metrics: metricsResult,
        };
      })
    );
    
    res.json({
      dateRange: dateRange || '30d',
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      platforms: platformData,
      availablePlatforms: ['spotify', 'apple_music', 'youtube', 'soundcloud', 'amazon_music', 'tidal'],
      availableMetrics: ['streams', 'downloads', 'revenue', 'listeners', 'saves', 'shares'],
    });
  } catch (error: any) {
    logger.error('Analytics search error:', error);
    res.status(500).json({ error: 'Analytics search failed' });
  }
});

router.get('/social/search', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { q = '', platform, status, dateFrom, dateTo, limit = 20 } = req.query;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const conditions: any[] = [eq(socialCampaigns.userId, userId)];

    if (q) {
      conditions.push(ilike(socialCampaigns.content, `%${q}%`));
    }

    if (platform && platform !== 'all') {
      conditions.push(eq(socialCampaigns.platform, platform as string));
    }

    if (status && status !== 'all') {
      conditions.push(eq(socialCampaigns.status, status as string));
    }

    if (dateFrom) {
      conditions.push(gte(socialCampaigns.createdAt, new Date(dateFrom as string)));
    }

    if (dateTo) {
      conditions.push(lte(socialCampaigns.createdAt, new Date(dateTo as string)));
    }

    const posts = await db
      .select({
        id: socialCampaigns.id,
        platform: socialCampaigns.platform,
        content: socialCampaigns.content,
        status: socialCampaigns.status,
        scheduledFor: socialCampaigns.scheduledAt,
        publishedAt: socialCampaigns.publishedAt,
        engagement: socialCampaigns.engagement,
        createdAt: socialCampaigns.createdAt,
      })
      .from(socialCampaigns)
      .where(and(...conditions))
      .orderBy(desc(socialCampaigns.createdAt))
      .limit(Number(limit));

    const [{ value: total }] = await db
      .select({ value: count() })
      .from(socialCampaigns)
      .where(and(...conditions));

    const hashtagCounts = await db
      .select({
        content: socialCampaigns.content,
      })
      .from(socialCampaigns)
      .where(eq(socialCampaigns.userId, userId))
      .limit(200);

    const hashtagMap: Record<string, number> = {};
    for (const row of hashtagCounts) {
      const tags = (row.content || '').match(/#(\w+)/g) || [];
      for (const tag of tags) {
        const clean = tag.replace('#', '').toLowerCase();
        hashtagMap[clean] = (hashtagMap[clean] || 0) + 1;
      }
    }

    const trendingHashtags = Object.entries(hashtagMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, tagCount]) => ({ tag, count: tagCount }));

    res.json({
      posts: posts.map(p => ({
        ...p,
        createdAt: p.createdAt?.toISOString() || new Date().toISOString(),
        scheduledFor: p.scheduledFor?.toISOString() || null,
        publishedAt: p.publishedAt?.toISOString() || null,
      })),
      total,
      trendingHashtags,
      platforms: ['instagram', 'twitter', 'tiktok', 'facebook', 'youtube', 'linkedin', 'threads'],
      statuses: ['draft', 'scheduled', 'published', 'failed'],
    });
  } catch (error: any) {
    logger.error('Social search error:', error);
    res.status(500).json({ error: 'Social search failed' });
  }
});

router.get('/marketplace/producers', async (req: Request, res: Response) => {
  try {
    const { q = '', genre, limit = 20, offset = 0 } = req.query;
    
    const conditions: any[] = [];
    
    if (q) {
      conditions.push(
        or(
          ilike(users.username, `%${q}%`),
          ilike(users.firstName, `%${q}%`),
          ilike(users.lastName, `%${q}%`)
        )
      );
    }
    
    const results = await db.select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      location: users.location,
    })
      .from(users)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(Number(limit))
      .offset(Number(offset));
    
    const [{ value: total }] = await db.select({ value: count() })
      .from(users)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    const producersWithStats = await Promise.all(
      results.map(async (producer) => {
        const beatCount = await db.select({ value: count() })
          .from(beats)
          .where(and(eq(beats.producerId, producer.id), eq(beats.isPublished, true)));
        
        return {
          ...producer,
          beatCount: beatCount[0]?.value || 0,
          type: 'producer',
        };
      })
    );
    
    res.json({
      producers: producersWithStats,
      total,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        hasMore: Number(offset) + Number(limit) < total,
      },
    });
  } catch (error: any) {
    logger.error('Producer search error:', error);
    res.status(500).json({ error: 'Producer search failed' });
  }
});

export default router;
