/**
 * COMPREHENSIVE ADMIN ACCOUNT SETUP SCRIPT
 * 
 * Creates a fully-featured admin account with all related data
 * exactly like a real paid user would have.
 * 
 * Run: npx tsx server/scripts/setupAdmin.ts
 * 
 * Environment variables:
 * - ADMIN_EMAIL (default: blawzmusic@gmail.com)
 * - ADMIN_PASSWORD (required)
 */

import { db } from '../db';
import { 
  users, 
  storefronts, 
  projects, 
  releases,
  socialAccounts,
  analytics,
  workspaces,
  workspaceMembers,
  beats,
  listings,
  notifications,
  userBrandVoices,
  contentCalendar,
  hyperFollowPages
} from '../../shared/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

async function setupAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || 'blawzmusic@gmail.com';
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    console.error('❌ ADMIN_PASSWORD environment variable must be set');
    console.error('   Example: ADMIN_PASSWORD=yourSecurePassword npx tsx server/scripts/setupAdmin.ts');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('🔐 COMPREHENSIVE ADMIN ACCOUNT SETUP');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(`   Email: ${adminEmail}`);
  console.log('');

  try {
    let adminId: string;
    const hashedPassword = await bcrypt.hash(adminPassword, 12);
    
    // Check if admin already exists
    const existingAdmin = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);

    if (existingAdmin.length > 0) {
      console.log('⚠️  Admin account already exists. Updating...');
      adminId = existingAdmin[0].id;
      
      await db.update(users)
        .set({
          password: hashedPassword,
          username: 'blawzmusic',
          role: 'admin',
          subscriptionTier: 'lifetime',
          subscriptionStatus: 'active',
          firstName: 'B-Lawz',
          lastName: 'Music',
        })
        .where(eq(users.email, adminEmail));
      
      console.log('✅ Admin account updated');
    } else {
      console.log('Creating new admin account...');
      
      const [newAdmin] = await db.insert(users).values({
        email: adminEmail,
        password: hashedPassword,
        username: 'blawzmusic',
        role: 'admin',
        subscriptionTier: 'lifetime',
        subscriptionStatus: 'active',
        firstName: 'B-Lawz',
        lastName: 'Music',
      }).returning();
      
      adminId = newAdmin.id;
      console.log('✅ Admin account created');
    }

    console.log('');
    console.log('📦 Setting up complete user profile data...');
    console.log('');

    // ========================================================================
    // STOREFRONT
    // ========================================================================
    const existingStorefront = await db.select().from(storefronts).where(eq(storefronts.userId, adminId)).limit(1);
    if (existingStorefront.length === 0) {
      await db.insert(storefronts).values({
        userId: adminId,
        name: 'B-Lawz Music Official Store',
        slug: 'blawz-music',
        templateId: 'premium-dark',
        customization: {
          primaryColor: '#8B5CF6',
          secondaryColor: '#EC4899',
          fontFamily: 'Inter',
          heroImage: '/assets/hero-bg.jpg',
          logoUrl: '/assets/blawz-logo.png',
          socialLinks: {
            instagram: 'https://instagram.com/blawzmusic',
            twitter: 'https://twitter.com/blawzmusic',
            youtube: 'https://youtube.com/@blawzmusic',
            spotify: 'https://open.spotify.com/artist/blawzmusic'
          },
          bio: 'Official store for B-Lawz Music. Premium beats, exclusive content, and more.',
        },
        isActive: true,
      });
      console.log('   ✓ Storefront created');
    } else {
      console.log('   ✓ Storefront exists');
    }

    // ========================================================================
    // WORKSPACE
    // ========================================================================
    const existingWorkspace = await db.select().from(workspaces).where(eq(workspaces.ownerId, adminId)).limit(1);
    let workspaceId: string;
    if (existingWorkspace.length === 0) {
      const [workspace] = await db.insert(workspaces).values({
        name: 'B-Lawz Music HQ',
        ownerId: adminId,
        description: 'Official workspace for B-Lawz Music team and collaborators',
        isActive: true,
        settings: {
          allowGuestAccess: false,
          requireApprovalForPosts: true,
          defaultRole: 'member',
          notifications: { email: true, push: true }
        },
      }).returning();
      workspaceId = workspace.id;
      
      // Add admin as workspace owner
      await db.insert(workspaceMembers).values({
        workspaceId: workspaceId,
        userId: adminId,
        role: 'owner',
      });
      console.log('   ✓ Workspace created');
    } else {
      workspaceId = existingWorkspace[0].id;
      console.log('   ✓ Workspace exists');
    }

    // ========================================================================
    // PROJECTS (Studio)
    // ========================================================================
    const existingProjects = await db.select().from(projects).where(eq(projects.userId, adminId)).limit(1);
    if (existingProjects.length === 0) {
      await db.insert(projects).values([
        {
          userId: adminId,
          title: 'Summer Vibes EP',
          description: 'Laid back summer beats with tropical influences',
          genre: 'Hip-Hop/R&B',
          bpm: 95,
          key: 'C Major',
          status: 'in_progress',
          isStudioProject: true,
          metadata: { 
            tracks: 5, 
            collaborators: ['Producer X', 'Artist Y'],
            targetReleaseDate: '2025-06-01'
          }
        },
        {
          userId: adminId,
          title: 'Midnight Sessions',
          description: 'Dark and moody trap beats for late night vibes',
          genre: 'Trap',
          bpm: 140,
          key: 'A Minor',
          status: 'completed',
          isStudioProject: true,
          metadata: { 
            tracks: 8, 
            collaborators: [],
            completedAt: '2024-12-01'
          }
        },
        {
          userId: adminId,
          title: 'Acoustic Sessions Vol. 1',
          description: 'Stripped down acoustic versions of popular tracks',
          genre: 'Acoustic',
          bpm: 72,
          key: 'G Major',
          status: 'draft',
          isStudioProject: true,
          metadata: { tracks: 3 }
        }
      ]);
      console.log('   ✓ Projects created (3)');
    } else {
      console.log('   ✓ Projects exist');
    }

    // ========================================================================
    // RELEASES
    // ========================================================================
    const existingReleases = await db.select().from(releases).where(eq(releases.userId, adminId)).limit(1);
    if (existingReleases.length === 0) {
      await db.insert(releases).values([
        {
          userId: adminId,
          title: 'Midnight Sessions',
          releaseDate: new Date('2024-12-15'),
          status: 'released',
          upc: '195169123456',
          artworkUrl: '/assets/releases/midnight-sessions.jpg',
          metadata: {
            label: 'B-Lawz Music',
            copyright: '2024 B-Lawz Music',
            distributor: 'Max Booster Distribution',
            platforms: ['Spotify', 'Apple Music', 'YouTube Music', 'Tidal', 'Amazon Music']
          }
        },
        {
          userId: adminId,
          title: 'Late Night Drive',
          releaseDate: new Date('2024-10-01'),
          status: 'released',
          upc: '195169123457',
          artworkUrl: '/assets/releases/late-night-drive.jpg',
          metadata: {
            label: 'B-Lawz Music',
            copyright: '2024 B-Lawz Music',
            distributor: 'Max Booster Distribution',
            platforms: ['Spotify', 'Apple Music', 'YouTube Music']
          }
        },
        {
          userId: adminId,
          title: 'Summer Vibes EP',
          releaseDate: new Date('2025-06-01'),
          status: 'scheduled',
          artworkUrl: '/assets/releases/summer-vibes.jpg',
          metadata: {
            label: 'B-Lawz Music',
            isPreOrder: true
          }
        }
      ]);
      console.log('   ✓ Releases created (3)');
    } else {
      console.log('   ✓ Releases exist');
    }

    // ========================================================================
    // SOCIAL ACCOUNTS
    // ========================================================================
    const existingSocial = await db.select().from(socialAccounts).where(eq(socialAccounts.userId, adminId)).limit(1);
    if (existingSocial.length === 0) {
      await db.insert(socialAccounts).values([
        {
          userId: adminId,
          platform: 'instagram',
          platformUserId: 'blawzmusic',
          username: 'blawzmusic',
          profileUrl: 'https://instagram.com/blawzmusic',
          followerCount: 15420,
          isActive: true,
          metadata: { verified: true, businessAccount: true }
        },
        {
          userId: adminId,
          platform: 'twitter',
          platformUserId: 'blawzmusic',
          username: 'blawzmusic',
          profileUrl: 'https://twitter.com/blawzmusic',
          followerCount: 8750,
          isActive: true,
          metadata: { verified: false }
        },
        {
          userId: adminId,
          platform: 'youtube',
          platformUserId: 'UC_blawzmusic',
          username: 'B-Lawz Music',
          profileUrl: 'https://youtube.com/@blawzmusic',
          followerCount: 25000,
          isActive: true,
          metadata: { subscribers: 25000, totalViews: 1500000 }
        },
        {
          userId: adminId,
          platform: 'tiktok',
          platformUserId: 'blawzmusic',
          username: 'blawzmusic',
          profileUrl: 'https://tiktok.com/@blawzmusic',
          followerCount: 45000,
          isActive: true,
          metadata: { verified: false, totalLikes: 850000 }
        },
        {
          userId: adminId,
          platform: 'spotify',
          platformUserId: 'artist_blawz',
          username: 'B-Lawz Music',
          profileUrl: 'https://open.spotify.com/artist/blawzmusic',
          followerCount: 12500,
          isActive: true,
          metadata: { verified: true, monthlyListeners: 45000 }
        },
        {
          userId: adminId,
          platform: 'facebook',
          platformUserId: 'blawzmusicofficial',
          username: 'B-Lawz Music',
          profileUrl: 'https://facebook.com/blawzmusicofficial',
          followerCount: 5200,
          isActive: true,
          metadata: { pageType: 'musician' }
        }
      ]);
      console.log('   ✓ Social accounts created (6 platforms)');
    } else {
      console.log('   ✓ Social accounts exist');
    }

    // ========================================================================
    // ANALYTICS DATA (Last 30 days)
    // ========================================================================
    const existingAnalytics = await db.select().from(analytics).where(eq(analytics.userId, adminId)).limit(1);
    if (existingAnalytics.length === 0) {
      const analyticsData = [];
      const today = new Date();
      
      for (let i = 30; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        
        // Generate realistic varying data
        const baseStreams = 1500 + Math.floor(Math.random() * 500);
        const weekendBoost = date.getDay() === 0 || date.getDay() === 6 ? 1.3 : 1;
        
        analyticsData.push({
          userId: adminId,
          date: date,
          streams: Math.floor(baseStreams * weekendBoost),
          revenue: parseFloat((baseStreams * weekendBoost * 0.004).toFixed(2)),
          totalListeners: Math.floor(baseStreams * weekendBoost * 0.7),
          followers: 12500 + (30 - i) * 15,
          platform: 'all',
          metadata: {
            topPlatform: 'Spotify',
            topTrack: 'Midnight Vibes',
            topCountry: 'United States'
          }
        });
      }
      
      await db.insert(analytics).values(analyticsData);
      console.log('   ✓ Analytics data created (31 days)');
    } else {
      console.log('   ✓ Analytics data exists');
    }

    // ========================================================================
    // BEATS (Marketplace Listings)
    // ========================================================================
    const existingBeats = await db.select().from(beats).where(eq(beats.userId, adminId)).limit(1);
    if (existingBeats.length === 0) {
      await db.insert(beats).values([
        {
          userId: adminId,
          title: 'Trap Symphony',
          description: 'Hard-hitting trap beat with orchestral elements',
          price: 49.99,
          genre: 'Trap',
          bpm: 145,
          key: 'D Minor',
          licenseType: 'exclusive',
          tags: ['trap', 'orchestral', 'dark', 'hard'],
          isPublished: true,
          plays: 1250,
          downloads: 45
        },
        {
          userId: adminId,
          title: 'Sunset Boulevard',
          description: 'Smooth R&B beat with guitar and piano',
          price: 29.99,
          genre: 'R&B',
          bpm: 85,
          key: 'G Major',
          licenseType: 'premium',
          tags: ['rnb', 'smooth', 'guitar', 'chill'],
          isPublished: true,
          plays: 890,
          downloads: 28
        },
        {
          userId: adminId,
          title: 'Night Rider',
          description: 'Dark drill beat with UK influence',
          price: 39.99,
          genre: 'Drill',
          bpm: 140,
          key: 'F Minor',
          licenseType: 'premium',
          tags: ['drill', 'uk', 'dark', 'aggressive'],
          isPublished: true,
          plays: 2100,
          downloads: 67
        }
      ]);
      console.log('   ✓ Beats created (3)');
    } else {
      console.log('   ✓ Beats exist');
    }

    // ========================================================================
    // LISTINGS (Products)
    // ========================================================================
    const existingListings = await db.select().from(listings).where(eq(listings.userId, adminId)).limit(1);
    if (existingListings.length === 0) {
      await db.insert(listings).values([
        {
          userId: adminId,
          title: 'Producer Sample Pack Vol. 1',
          description: 'Over 200 premium samples including drums, melodies, and FX',
          priceCents: 4999,
          currency: 'usd',
          listingType: 'one_time',
          category: 'sample_pack',
          isPublished: true,
          metadata: { 
            files: 200, 
            format: 'WAV 24-bit',
            genres: ['Hip-Hop', 'Trap', 'R&B']
          }
        },
        {
          userId: adminId,
          title: 'Mixing & Mastering Session',
          description: 'Professional mixing and mastering for your track',
          priceCents: 14999,
          currency: 'usd',
          listingType: 'service',
          category: 'service',
          isPublished: true,
          metadata: { 
            deliveryTime: '3-5 days',
            revisions: 2,
            includes: ['Mixing', 'Mastering', 'Stem Delivery']
          }
        }
      ]);
      console.log('   ✓ Listings created (2)');
    } else {
      console.log('   ✓ Listings exist');
    }

    // ========================================================================
    // BRAND VOICE
    // ========================================================================
    const existingVoice = await db.select().from(userBrandVoices).where(eq(userBrandVoices.userId, adminId)).limit(1);
    if (existingVoice.length === 0) {
      await db.insert(userBrandVoices).values({
        userId: adminId,
        voiceName: 'B-Lawz Official',
        description: 'Authentic, confident, and creative voice for B-Lawz Music brand',
        tone: 'confident',
        keywords: ['authentic', 'creative', 'passionate', 'professional'],
        examples: [
          'New heat dropping soon. Stay locked in.',
          'Appreciate all the love and support. We just getting started.',
          'This one hits different. Link in bio.'
        ],
        isDefault: true,
      } as any);
      console.log('   ✓ Brand voice created');
    } else {
      console.log('   ✓ Brand voice exists');
    }

    // ========================================================================
    // HYPERFOLLOW PAGE
    // ========================================================================
    const existingHyperFollow = await db.select().from(hyperFollowPages).where(eq(hyperFollowPages.userId, adminId)).limit(1);
    if (existingHyperFollow.length === 0) {
      await db.insert(hyperFollowPages).values({
        userId: adminId,
        title: 'B-Lawz Music - Midnight Sessions',
        slug: 'blawz-midnight-sessions',
        imageUrl: '/assets/releases/midnight-sessions.jpg',
        links: {
          spotify: 'https://open.spotify.com/album/midnight-sessions',
          appleMusic: 'https://music.apple.com/album/midnight-sessions',
          youtubeMusic: 'https://music.youtube.com/playlist?list=midnight-sessions',
          tidal: 'https://tidal.com/album/midnight-sessions',
          amazonMusic: 'https://music.amazon.com/albums/midnight-sessions',
          soundcloud: 'https://soundcloud.com/blawzmusic/sets/midnight-sessions'
        }
      });
      console.log('   ✓ HyperFollow page created');
    } else {
      console.log('   ✓ HyperFollow page exists');
    }

    // ========================================================================
    // CONTENT CALENDAR
    // ========================================================================
    const existingCalendar = await db.select().from(contentCalendar).where(eq(contentCalendar.userId, adminId)).limit(1);
    if (existingCalendar.length === 0) {
      const futureDate1 = new Date();
      futureDate1.setDate(futureDate1.getDate() + 3);
      const futureDate2 = new Date();
      futureDate2.setDate(futureDate2.getDate() + 7);
      
      await db.insert(contentCalendar).values([
        {
          userId: adminId,
          title: 'Studio Session BTS',
          contentType: 'video',
          platform: 'instagram',
          scheduledAt: futureDate1,
          status: 'scheduled',
          content: { caption: 'Late night in the studio. Something special coming soon...', hashtags: ['studiolife', 'newmusic', 'producer'] },
          tags: ['behind-the-scenes', 'studio']
        },
        {
          userId: adminId,
          title: 'New Single Announcement',
          contentType: 'image',
          platform: 'twitter',
          scheduledAt: futureDate2,
          status: 'planned',
          content: { caption: 'Big announcement coming next week. Y\'all ready?', hashtags: ['newmusic'] },
          tags: ['announcement', 'single']
        }
      ]);
      console.log('   ✓ Content calendar entries created (2)');
    } else {
      console.log('   ✓ Content calendar exists');
    }

    // ========================================================================
    // WELCOME NOTIFICATION
    // ========================================================================
    const existingNotification = await db.select().from(notifications).where(eq(notifications.userId, adminId)).limit(1);
    if (existingNotification.length === 0) {
      await db.insert(notifications).values([
        {
          userId: adminId,
          type: 'welcome',
          title: 'Welcome to Max Booster!',
          message: 'Your lifetime account is fully activated. Explore all premium features.',
          isRead: true,
          actionUrl: '/dashboard',
        },
        {
          userId: adminId,
          type: 'milestone',
          title: 'Milestone Reached: 10K Streams!',
          message: 'Congratulations! Your music has reached 10,000 streams on Spotify.',
          isRead: false,
          actionUrl: '/analytics',
        }
      ]);
      console.log('   ✓ Notifications created (2)');
    } else {
      console.log('   ✓ Notifications exist');
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('✅ ADMIN SETUP COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('');
    console.log('   Account Details:');
    console.log(`   ├── Email: ${adminEmail}`);
    console.log('   ├── Username: blawzmusic');
    console.log('   ├── Name: B-Lawz Music');
    console.log('   ├── Role: admin');
    console.log('   ├── Subscription: lifetime');
    console.log('   └── Status: active');
    console.log('');
    console.log('   Seeded Data:');
    console.log('   ├── 1 Storefront');
    console.log('   ├── 1 Workspace');
    console.log('   ├── 3 Projects');
    console.log('   ├── 3 Releases');
    console.log('   ├── 6 Social Accounts');
    console.log('   ├── 31 Days Analytics');
    console.log('   ├── 3 Beats');
    console.log('   ├── 2 Listings');
    console.log('   ├── 1 Brand Voice');
    console.log('   ├── 1 HyperFollow Page');
    console.log('   ├── 2 Content Calendar Items');
    console.log('   └── 2 Notifications');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════');
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Failed to setup admin account:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

setupAdmin();
