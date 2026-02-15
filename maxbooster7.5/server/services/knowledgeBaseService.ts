import { db } from '../db';
import {
  knowledgeBaseArticles,
  type InsertKnowledgeBaseArticle,
  type UpdateKnowledgeBaseArticle,
} from '@shared/schema';
import { eq, and, desc, or, sql, ilike } from 'drizzle-orm';
import { logger } from '../logger.js';

export class KnowledgeBaseService {
  async createArticle(articleData: InsertKnowledgeBaseArticle) {
    const [article] = await db.insert(knowledgeBaseArticles).values(articleData).returning();
    return article;
  }

  async getArticleById(articleId: string) {
    const [article] = await db
      .select()
      .from(knowledgeBaseArticles)
      .where(eq(knowledgeBaseArticles.id, articleId))
      .limit(1);

    if (article) {
      await db
        .update(knowledgeBaseArticles)
        .set({ views: sql`${knowledgeBaseArticles.views} + 1` })
        .where(eq(knowledgeBaseArticles.id, articleId));

      return { ...article, views: article.views + 1 };
    }

    return null;
  }

  async searchArticles(query?: string, category?: string, limit: number = 20) {
    let dbQuery = db
      .select()
      .from(knowledgeBaseArticles)
      .where(eq(knowledgeBaseArticles.isPublished, true));

    const conditions = [];

    if (query) {
      conditions.push(
        or(
          ilike(knowledgeBaseArticles.title, `%${query}%`),
          ilike(knowledgeBaseArticles.content, `%${query}%`)
        )
      );
    }

    if (category) {
      conditions.push(eq(knowledgeBaseArticles.category, category));
    }

    if (conditions.length > 0) {
      dbQuery = dbQuery.where(and(...conditions));
    }

    const articles = await dbQuery.orderBy(desc(knowledgeBaseArticles.views)).limit(limit);

    return articles;
  }

  async getAllArticles(includeUnpublished: boolean = false) {
    let query = db.select().from(knowledgeBaseArticles);

    if (!includeUnpublished) {
      query = query.where(eq(knowledgeBaseArticles.isPublished, true));
    }

    return await query.orderBy(desc(knowledgeBaseArticles.createdAt));
  }

  async getArticlesByCategory(category: string) {
    return await db
      .select()
      .from(knowledgeBaseArticles)
      .where(
        and(
          eq(knowledgeBaseArticles.category, category),
          eq(knowledgeBaseArticles.isPublished, true)
        )
      )
      .orderBy(desc(knowledgeBaseArticles.views));
  }

  async getPopularArticles(limit: number = 10) {
    return await db
      .select()
      .from(knowledgeBaseArticles)
      .where(eq(knowledgeBaseArticles.isPublished, true))
      .orderBy(desc(knowledgeBaseArticles.views))
      .limit(limit);
  }

  async getMostHelpfulArticles(limit: number = 10) {
    return await db
      .select()
      .from(knowledgeBaseArticles)
      .where(eq(knowledgeBaseArticles.isPublished, true))
      .orderBy(desc(knowledgeBaseArticles.helpfulCount))
      .limit(limit);
  }

  async updateArticle(articleId: string, updates: UpdateKnowledgeBaseArticle) {
    const [updatedArticle] = await db
      .update(knowledgeBaseArticles)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeBaseArticles.id, articleId))
      .returning();

    return updatedArticle;
  }

  async markHelpful(articleId: string, isHelpful: boolean) {
    const field = isHelpful
      ? knowledgeBaseArticles.helpfulCount
      : knowledgeBaseArticles.notHelpfulCount;

    await db
      .update(knowledgeBaseArticles)
      .set({ [isHelpful ? 'helpfulCount' : 'notHelpfulCount']: sql`${field} + 1` })
      .where(eq(knowledgeBaseArticles.id, articleId));
  }

  async deleteArticle(articleId: string) {
    await db.delete(knowledgeBaseArticles).where(eq(knowledgeBaseArticles.id, articleId));
  }

  async getCategories() {
    const categories = await db
      .select({
        category: knowledgeBaseArticles.category,
        count: sql<number>`count(*)::int`,
      })
      .from(knowledgeBaseArticles)
      .where(eq(knowledgeBaseArticles.isPublished, true))
      .groupBy(knowledgeBaseArticles.category);

    return categories;
  }

  async getKBStats() {
    const totalArticles = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(knowledgeBaseArticles)
      .where(eq(knowledgeBaseArticles.isPublished, true));

    const totalViews = await db
      .select({ total: sql<number>`sum(${knowledgeBaseArticles.views})::int` })
      .from(knowledgeBaseArticles);

    const avgHelpfulness = await db
      .select({
        avg: sql<number>`
          AVG(
            CASE 
              WHEN (${knowledgeBaseArticles.helpfulCount} + ${knowledgeBaseArticles.notHelpfulCount}) > 0 
              THEN ${knowledgeBaseArticles.helpfulCount}::float / (${knowledgeBaseArticles.helpfulCount} + ${knowledgeBaseArticles.notHelpfulCount})
              ELSE 0
            END
          )::numeric(3,2)
        `,
      })
      .from(knowledgeBaseArticles);

    return {
      totalArticles: totalArticles[0]?.count || 0,
      totalViews: totalViews[0]?.total || 0,
      avgHelpfulness: avgHelpfulness[0]?.avg || 0,
    };
  }

  async seedDefaultArticles() {
    const existingArticles = await db.select().from(knowledgeBaseArticles).limit(1);
    if (existingArticles.length > 0) {
      return;
    }

    const defaultArticles: InsertKnowledgeBaseArticle[] = [
      {
        title: 'Getting Started with Max Booster',
        content: `# Getting Started with Max Booster

Welcome to Max Booster! This guide will help you get started with our platform.

## Creating Your First Project
1. Navigate to the Studio page
2. Click "New Project"
3. Upload audio files or start from scratch
4. Use our AI tools to enhance your music

## Distributing Your Music
1. Go to the Distribution page
2. Upload your music and artwork
3. Fill in the metadata
4. Select platforms (Spotify, Apple Music, etc.)
5. Submit for review

## Managing Royalties
Track your earnings in real-time on the Royalties page. We process payouts monthly once you reach the $10 minimum threshold.`,
        category: 'Getting Started',
        tags: ['beginner', 'setup', 'basics'],
        isPublished: true,
      },
      {
        title: 'How to Distribute Music to Streaming Platforms',
        content: `# How to Distribute Music to Streaming Platforms

Max Booster makes music distribution simple and straightforward.

## Supported Platforms
- Spotify
- Apple Music
- YouTube Music
- Amazon Music
- Tidal
- Deezer
- TikTok
- Instagram
- 150+ more platforms

## Distribution Process
1. **Prepare Your Music**: Ensure your audio files meet platform requirements (WAV or FLAC, 16-bit minimum)
2. **Create Artwork**: 3000x3000 pixels, JPG or PNG
3. **Fill Metadata**: Song title, artist name, genre, release date
4. **Select Platforms**: Choose where you want your music distributed
5. **Submit**: Review and submit for distribution

## Timeline
Most releases go live within 1-3 business days. Submit at least 2 weeks before your desired release date for best results.`,
        category: 'Distribution',
        tags: ['distribution', 'spotify', 'apple music', 'streaming'],
        isPublished: true,
      },
      {
        title: 'Understanding Royalties and Payments',
        content: `# Understanding Royalties and Payments

Learn how royalties work and when you'll get paid.

## How Royalties Are Calculated
Royalties vary by platform based on:
- Subscription vs free tier streams
- Country of listener
- Total platform streams
- Your track's share of total streams

## Payment Schedule
- Streaming platforms pay 60-90 days after streams occur
- We process payouts monthly
- Minimum payout threshold: $10
- You keep 100% of your royalties

## Tracking Earnings
View real-time earnings on the Royalties page:
- Earnings per platform
- Earnings per song
- Earnings per territory
- Historical data and trends`,
        category: 'Royalties',
        tags: ['royalties', 'payments', 'earnings', 'money'],
        isPublished: true,
      },
      {
        title: 'Using AI Music Tools',
        content: `# Using AI Music Tools

Max Booster provides powerful AI tools to enhance your music production.

## AI Mixer
Our AI analyzes your tracks and automatically:
- Balances levels
- Applies EQ
- Adds compression
- Creates spatial effects

## AI Mastering
Professional mastering includes:
- Multi-band compression
- EQ adjustments
- Stereo widening
- Loudness optimization for streaming platforms

## AI Content Generation
Create social media content:
- Post captions
- Hashtag suggestions
- Release announcements
- Engagement-optimized content`,
        category: 'AI Tools',
        tags: ['ai', 'mixing', 'mastering', 'content generation'],
        isPublished: true,
      },
      {
        title: 'Troubleshooting Common Issues',
        content: `# Troubleshooting Common Issues

Solutions to frequently encountered problems.

## Upload Issues
**Problem**: File upload fails
**Solution**: 
- Check file format (WAV, FLAC, MP3)
- Ensure file size is under 500MB
- Try a different browser
- Check your internet connection

## Distribution Delays
**Problem**: Release not going live on time
**Solution**:
- Allow 1-3 business days for processing
- Check for metadata errors
- Verify artwork meets requirements
- Contact support if delayed beyond 7 days

## Payment Issues
**Problem**: Haven't received payment
**Solution**:
- Check that you've reached $10 minimum
- Verify payment method is set up
- Allow 60-90 days for platform royalties
- Review earnings dashboard for details

## Account Access
**Problem**: Can't log in
**Solution**:
- Use "Forgot Password" to reset
- Check email for verification link
- Clear browser cache and cookies
- Contact support if issue persists`,
        category: 'Troubleshooting',
        tags: ['troubleshooting', 'help', 'issues', 'problems'],
        isPublished: true,
      },
    ];

    await db.insert(knowledgeBaseArticles).values(defaultArticles);
    logger.info('✅ Seeded default knowledge base articles');
  }
}

export const knowledgeBaseService = new KnowledgeBaseService();
