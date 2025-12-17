import { aiService } from './aiService';
import { knowledgeBaseService } from './knowledgeBaseService';
import { supportTicketService } from './supportTicketService';
import { logger } from '../logger.js';

interface SupportQuery {
  question: string;
  userId?: string;
  context?: any;
}

interface AIResponse {
  answer: string;
  confidence: number;
  suggestedArticles: unknown[];
  shouldEscalate: boolean;
  category?: string;
}

export class SupportAIService {
  private commonQuestions = new Map<string, { answer: string; category: string }>([
    // ACCOUNT & AUTHENTICATION
    [
      'how to reset password',
      {
        answer:
          "To reset your password:\n1. Go to the login page\n2. Click 'Forgot Password'\n3. Enter your email address\n4. Check your email for a reset link\n5. Follow the link and create a new password\n\nIf you don't receive the email within 5 minutes, please check your spam folder or contact support.",
        category: 'account',
      },
    ],
    [
      'how to delete account',
      {
        answer:
          "To delete your account:\n1. Go to Settings > Account\n2. Scroll to 'Delete Account' section\n3. Click 'Delete Account'\n4. Confirm deletion\n\nIMPORTANT: There's a 30-day grace period where you can cancel the deletion. After 30 days, all your data will be permanently deleted. This complies with GDPR Article 17 (Right to Erasure).",
        category: 'account',
      },
    ],
    [
      'google login',
      {
        answer:
          'Yes! You can sign in with Google:\n1. Click "Sign in with Google" on the login page\n2. Select your Google account\n3. Grant permissions\n\nYour account will be automatically created if this is your first time signing in.',
        category: 'account',
      },
    ],
    
    // STUDIO & DAW
    [
      'how to use studio',
      {
        answer:
          "Max Booster Studio is a professional DAW (Digital Audio Workstation) in your browser:\n\n**Getting Started:**\n1. Go to Studio page\n2. Create a new project or open existing\n3. Add tracks (audio, MIDI, or instrument)\n4. Record or import audio files\n5. Edit, mix, and master your music\n\n**Features:**\n- Multi-track recording and editing\n- AI-powered mixing and mastering\n- Virtual instruments and effects\n- Automation and MIDI editing\n- Export to WAV, MP3, or FLAC\n\nThe interface is inspired by Studio One 7 for professional-grade production.",
        category: 'studio',
      },
    ],
    [
      'ai mixing mastering',
      {
        answer:
          "AI Mixing & Mastering is our most powerful feature:\n\n**AI Mixer:**\n- Automatic level balancing across all tracks\n- Intelligent EQ adjustments\n- Dynamic compression\n- Stereo imaging and spatial effects\n- Genre-specific mixing presets\n\n**AI Mastering:**\n- Multi-band compression\n- Adaptive EQ\n- Stereo widening\n- Loudness optimization for streaming (Spotify, Apple Music)\n- Professional loudness standards (LUFS targeting)\n\n**How to Use:**\n1. In Studio, click 'AI Tools'\n2. Select 'AI Mix' or 'AI Master'\n3. Choose your genre/style\n4. Click 'Process' - results in seconds!\n\nSaves you thousands of dollars on professional mixing/mastering services.",
        category: 'studio',
      },
    ],
    
    // DISTRIBUTION
    [
      'how to distribute music',
      {
        answer:
          "To distribute your music to 150+ streaming platforms:\n\n**Step-by-Step:**\n1. Go to Distribution page\n2. Click 'New Release'\n3. Upload audio (WAV or FLAC recommended, 16-bit minimum)\n4. Upload artwork (3000x3000 pixels, JPG or PNG)\n5. Fill metadata: song title, artist name, genre, release date, ISRC code\n6. Select platforms (Spotify, Apple Music, YouTube, Amazon, Tidal, etc.)\n7. Set royalty splits if you have collaborators\n8. Submit for review\n\n**Timeline:**\n- Review: 24-48 hours\n- Distribution: 1-3 business days\n- Recommendation: Submit 2 weeks before release date\n\n**You keep 100% of your royalties - no commission taken!**",
        category: 'distribution',
      },
    ],
    [
      'supported platforms',
      {
        answer:
          'Max Booster distributes to 150+ platforms including:\n\n**Major Streaming:**\n- Spotify\n- Apple Music\n- YouTube Music\n- Amazon Music\n- Tidal\n- Deezer\n- Pandora\n- iHeartRadio\n\n**Social Media:**\n- TikTok\n- Instagram/Facebook\n- Snapchat\n\n**International:**\n- NetEase (China)\n- JioSaavn (India)\n- Anghami (Middle East)\n- Boomplay (Africa)\n\nAnd 130+ more! You can select platforms individually or distribute everywhere.',
        category: 'distribution',
      },
    ],
    
    // ROYALTIES & PAYMENTS
    [
      'when will i get paid',
      {
        answer:
          'Royalty payments work as follows:\n\n**Payment Schedule:**\n- Streaming platforms pay us 60-90 days after streams occur\n- We process payouts monthly\n- Minimum payout threshold: $10\n- You keep 100% of your royalties (we take 0% commission)\n\n**Tracking Earnings:**\n- View real-time earnings on Royalties page\n- See breakdown by platform, song, territory\n- Export earnings reports\n\nOnce you reach $10, payment is processed automatically on the next monthly cycle to your connected bank account or PayPal.',
        category: 'royalties',
      },
    ],
    [
      'royalty splits',
      {
        answer:
          "Royalty splits let you share earnings with collaborators:\n\n**How to Set Up:**\n1. Go to Distribution page\n2. When creating a release, click 'Royalty Splits'\n3. Add collaborators by email\n4. Set percentage split (must total 100%)\n5. Collaborators receive email invitation\n6. They accept, and royalties are automatically split\n\n**Features:**\n- Automated payment distribution\n- Real-time split tracking\n- Change splits anytime before release\n- Transparent earnings for all parties",
        category: 'royalties',
      },
    ],
    
    // MARKETPLACE
    [
      'how to sell beats',
      {
        answer:
          "Max Booster Marketplace is like BeatStars for selling your music:\n\n**Set Up Your Storefront:**\n1. Go to Marketplace page\n2. Click 'Create Storefront'\n3. Customize branding (logo, colors, banner)\n4. Add your beats/samples/presets\n\n**Upload Products:**\n1. Click 'Add Product'\n2. Upload audio file and preview\n3. Set pricing tiers (Basic, Premium, Exclusive)\n4. Add licensing terms\n5. Publish\n\n**Pricing Options:**\n- Lease licenses ($10-100)\n- Exclusive rights ($100-10,000+)\n- Sample packs\n- Presets and templates\n\n**Payment:**\n- Automatic payment processing via Stripe\n- You receive 95% of sale (5% platform fee)\n- Instant payouts to your bank account",
        category: 'marketplace',
      },
    ],
    [
      'marketplace fees',
      {
        answer:
          'Marketplace fees are simple and transparent:\n\n**Seller Fees:**\n- 5% platform fee on all sales\n- You keep 95% of revenue\n- No listing fees\n- No monthly fees\n\n**Payment Processing:**\n- Stripe fees: 2.9% + $0.30 per transaction (standard Stripe rates)\n- Instant payouts available\n\n**Example:** If you sell a beat for $50:\n- Platform fee: $2.50 (5%)\n- Your earnings: $47.50\n- Stripe fee: ~$1.50\n- Net to you: ~$46',
        category: 'marketplace',
      },
    ],
    
    // SOCIAL MEDIA & AUTO-POSTING
    [
      'social media management',
      {
        answer:
          "Max Booster connects to 8 social platforms for automated posting:\n\n**Supported Platforms:**\n1. Facebook\n2. Instagram\n3. Twitter/X\n4. TikTok\n5. YouTube\n6. LinkedIn\n7. Threads\n8. Google Business\n\n**Features:**\n- Schedule posts in advance\n- Auto-post to multiple platforms simultaneously\n- AI-generated captions and hashtags\n- Content calendar\n- Analytics and engagement tracking\n\n**How to Connect:**\n1. Go to Social Media page\n2. Click 'Connect Platform'\n3. Authorize Max Booster\n4. Start posting!\n\nAll social features are included in your subscription.",
        category: 'social-media',
      },
    ],
    [
      'auto posting',
      {
        answer:
          "Auto-posting lets you schedule content across all 8 platforms:\n\n**Schedule Posts:**\n1. Go to Social Media > Auto-Posting\n2. Create content (text, photo, video, or carousel)\n3. Select target platforms\n4. Choose date/time or 'Post Now'\n5. Click 'Schedule'\n\n**AI Content Generation:**\n- Click 'Generate with AI'\n- Choose objective: awareness, engagement, conversions, or viral\n- AI creates platform-optimized content\n- Edit and customize\n- Post or schedule\n\n**Smart Features:**\n- Optimal posting time recommendations\n- Platform-specific formatting\n- Hashtag suggestions\n- Preview before posting",
        category: 'social-media',
      },
    ],
    
    // ZERO-COST ADVERTISING AI
    [
      'advertising ai',
      {
        answer:
          "Zero-Cost Advertising AI is Max Booster's revolutionary feature:\n\n**What It Does:**\n- Generates viral content without paid ads\n- Uses your connected social profiles as organic advertising channels\n- Achieves 50-100% BETTER results than paid advertising\n- Saves you $60,000+ per year in ad spend\n\n**How It Works:**\n1. Go to Advertising AI page\n2. Connect social platforms\n3. AI analyzes your audience and content performance\n4. Generates engagement-optimized content\n5. Auto-posts at optimal times\n6. Predicts virality before posting\n\n**Features:**\n- Viral prediction scoring (0-1 scale)\n- Expected reach and engagement estimates\n- Platform algorithm compatibility scores\n- A/B testing\n- Performance analytics\n\n**100% organic - no ad budget required!**",
        category: 'advertising',
      },
    ],
    [
      'viral prediction',
      {
        answer:
          "Viral Prediction analyzes your content BEFORE you post:\n\n**What You Get:**\n- Virality Score (0-1): Probability of going viral\n- Expected Reach: Estimated audience size\n- Engagement Rate: Predicted likes, comments, shares\n- Platform Compatibility: How well it fits each platform's algorithm\n- Trust Score: Authenticity rating for organic engagement\n\n**How to Use:**\n1. Create content\n2. Click 'Predict Performance'\n3. Review scores\n4. Optimize content based on suggestions\n5. Re-predict until satisfied\n6. Post with confidence\n\n**Trained on millions of viral posts - incredibly accurate!**",
        category: 'advertising',
      },
    ],
    
    // ANALYTICS
    [
      'analytics dashboard',
      {
        answer:
          "Analytics Dashboard provides comprehensive insights:\n\n**Available Metrics:**\n- Streaming performance (plays, listeners, saves)\n- Revenue breakdown (by platform, song, territory)\n- Audience demographics (age, gender, location)\n- Social media engagement\n- Marketplace sales\n- Growth trends\n\n**Features:**\n- Real-time data updates\n- Custom date ranges\n- Export reports (CSV, PDF)\n- Predictive analytics (AI forecasting)\n- Comparative analysis\n\n**Access:**\nGo to Analytics page to view all metrics. Pro and Lifetime tiers get advanced analytics and AI insights.",
        category: 'analytics',
      },
    ],
    
    // BILLING & SUBSCRIPTIONS
    [
      'subscription plans',
      {
        answer:
          'Max Booster offers 3 subscription tiers:\n\n**Free:**\n- Limited features\n- 1 release per year\n- Basic analytics\n\n**Pro ($9.99/month):**\n- Unlimited releases\n- All AI tools\n- Advanced analytics\n- Priority support\n- All features unlocked\n\n**Lifetime ($299 one-time):**\n- Everything in Pro\n- Lifetime access (never pay again)\n- Early access to new features\n- VIP support\n\n**You keep 100% of royalties on ALL plans!**',
        category: 'billing',
      },
    ],
    [
      'how to cancel subscription',
      {
        answer:
          "To cancel your subscription:\n1. Go to Settings > Billing\n2. Click 'Manage Subscription'\n3. Select 'Cancel Subscription'\n4. Confirm cancellation\n\nYour access continues until the end of your current billing period. You can reactivate anytime before the period ends. Lifetime subscriptions cannot be canceled.",
        category: 'billing',
      },
    ],
    [
      'refund policy',
      {
        answer:
          'Max Booster offers a generous refund policy:\n\n**90-Day Money-Back Guarantee:**\n- Full refund within 90 days of purchase\n- No questions asked\n- Applies to Pro monthly and Lifetime subscriptions\n\n**How to Request:**\n1. Contact support within 90 days\n2. Specify reason (optional)\n3. Refund processed within 5-7 business days\n\n**Note:** Refunds are issued to original payment method.',
        category: 'billing',
      },
    ],
    
    // SECURITY & PRIVACY
    [
      'data privacy',
      {
        answer:
          'Max Booster is 100% GDPR and COPPA compliant:\n\n**Your Rights:**\n- Right to Access (GDPR Article 15): Export your data anytime\n- Right to Erasure (GDPR Article 17): Delete account with 30-day grace period\n- Right to Portability (GDPR Article 20): Download all your data\n- Cookie Consent (GDPR Article 7): You control cookies\n\n**Security:**\n- Bcrypt password hashing\n- Secure session management\n- HTTPS encryption\n- Regular security audits\n- DMCA Safe Harbor protection\n\n**Privacy:**\n- We never sell your data\n- Minimal data collection\n- Transparent privacy policy\n\nYour data and privacy are our top priority.',
        category: 'security',
      },
    ],
    
    // SUPPORT
    [
      'how to contact support',
      {
        answer:
          'You can contact support through:\n\n1. **Live Chat**: Click the chat button in the bottom-right corner for instant help (I am that assistant!)\n2. **Support Ticket**: Go to Help > Contact Support to create a ticket\n3. **Email**: support@maxbooster.ai\n\nResponse times:\n- Live Chat: Instant AI assistance, human escalation available\n- Support Tickets: Within 24 hours\n- Email: Within 48 hours\n\nFor urgent issues, use live chat for fastest response.',
        category: 'support',
      },
    ],
    
    // LEGAL & COMPLIANCE
    [
      'legal compliance',
      {
        answer:
          'Max Booster is fully compliant with all major regulations:\n\n**COPPA Compliance:**\n- Age 13+ verification\n- UTC-normalized birthdate validation\n- Parental consent for users under 13\n\n**GDPR Compliance:**\n- Cookie consent banner (Article 7)\n- Right to access your data (Article 15)\n- Right to erasure with 30-day grace period (Article 17)\n- Right to data portability (Article 20)\n\n**DMCA Safe Harbor:**\n- Designated agent registered at copyright.gov\n- Agent ID: DMCA-1065850\n- Protects you from copyright infringement liability\n\n**Business Entity:**\n- LLC formation complete\n- Full legal protection\n\nYou can launch and accept paid users with complete legal protection.',
        category: 'legal',
      },
    ],
  ]);

  async answerQuestion(query: SupportQuery): Promise<AIResponse> {
    const normalizedQuestion = query.question.toLowerCase().trim();

    const directAnswer = this.findDirectAnswer(normalizedQuestion);
    if (directAnswer) {
      const articles = await this.findRelevantArticles(normalizedQuestion);
      return {
        answer: directAnswer.answer,
        confidence: 0.95,
        suggestedArticles: articles,
        shouldEscalate: false,
        category: directAnswer.category,
      };
    }

    const articles = await knowledgeBaseService.searchArticles(query.question, undefined, 5);

    if (articles.length > 0) {
      const topArticle = articles[0];
      const snippet = this.extractSnippet(topArticle.content, query.question);

      return {
        answer: `Based on our knowledge base:\n\n${snippet}\n\nFor more details, please check the full article: "${topArticle.title}"`,
        confidence: 0.75,
        suggestedArticles: articles,
        shouldEscalate: false,
        category: topArticle.category,
      };
    }

    const complexityScore = this.analyzeComplexity(query.question);
    if (complexityScore > 0.7) {
      return {
        answer:
          "This seems like a complex question that would benefit from human support. I've escalated this to our support team who will provide a detailed response. In the meantime, you might find these articles helpful:",
        confidence: 0.4,
        suggestedArticles: await knowledgeBaseService.getPopularArticles(3),
        shouldEscalate: true,
      };
    }

    try {
      const aiGeneratedAnswer = await this.generateAIAnswer(query.question);
      return {
        answer: aiGeneratedAnswer,
        confidence: 0.6,
        suggestedArticles: articles,
        shouldEscalate: false,
      };
    } catch (error: unknown) {
      logger.error('AI generation failed:', error);
      return {
        answer:
          "I apologize, but I'm having trouble understanding your question. Our support team can help! Would you like to create a support ticket or try rephrasing your question?",
        confidence: 0.3,
        suggestedArticles: [],
        shouldEscalate: true,
      };
    }
  }

  private findDirectAnswer(question: string): { answer: string; category: string } | null {
    for (const [key, value] of this.commonQuestions) {
      if (question.includes(key) || this.calculateSimilarity(question, key) > 0.7) {
        return value;
      }
    }
    return null;
  }

  private async findRelevantArticles(question: string) {
    const keywords = this.extractKeywords(question);
    const articles = await knowledgeBaseService.searchArticles(keywords.join(' '), undefined, 3);
    return articles.map((a) => ({
      id: a.id,
      title: a.title,
      category: a.category,
      views: a.views,
    }));
  }

  private extractSnippet(content: string, query: string): string {
    const sentences = content.split(/[.!?]+/).map((s) => s.trim());

    const queryWords = query.toLowerCase().split(/\s+/);
    let bestSentence = sentences[0] || content.substring(0, 200);
    let maxScore = 0;

    for (const sentence of sentences) {
      if (sentence.length < 20) continue;
      const sentenceLower = sentence.toLowerCase();
      const score = queryWords.filter((word) => sentenceLower.includes(word)).length;
      if (score > maxScore) {
        maxScore = score;
        bestSentence = sentence;
      }
    }

    return bestSentence.length > 300 ? bestSentence.substring(0, 297) + '...' : bestSentence;
  }

  private analyzeComplexity(question: string): number {
    const indicators = [
      question.includes('why'),
      question.includes('how come'),
      question.includes('explain'),
      question.includes('detailed'),
      question.includes('specific'),
      question.split(' ').length > 20,
      question.includes('?') && question.split('?').length > 2,
    ];

    return indicators.filter((i) => i).length / indicators.length;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);
    const commonWords = words1.filter((w) => words2.includes(w));
    return commonWords.length / Math.max(words1.length, words2.length);
  }

  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'how',
      'what',
      'when',
      'where',
      'why',
      'is',
      'are',
      'can',
      'do',
      'does',
      'my',
      'i',
      'me',
    ]);

    const words = text
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9]/g, ''))
      .filter((w) => w.length > 2 && !stopWords.has(w));

    return Array.from(new Set(words));
  }

  private async generateAIAnswer(question: string): Promise<string> {
    try {
      const prompt = `You are a helpful customer support assistant for Max Booster, a music distribution and production platform.

User question: ${question}

Provide a clear, concise, and helpful answer. If you're not certain about the answer, acknowledge that and suggest contacting support for more details.

Answer:`;

      const response = await aiService.generateSocialContent({
        platform: 'twitter',
        contentType: 'post',
        customPrompt: prompt,
      });

      return response.content;
    } catch (error: unknown) {
      throw new Error('Failed to generate AI answer');
    }
  }

  async categorizeTicket(subject: string, description: string): Promise<string> {
    const text = `${subject} ${description}`.toLowerCase();

    const categories = {
      billing: ['payment', 'subscription', 'refund', 'charge', 'billing', 'invoice', 'price'],
      distribution: ['distribute', 'release', 'platform', 'spotify', 'apple music', 'upload'],
      royalties: ['royalty', 'payment', 'earnings', 'payout', 'revenue', 'money'],
      technical: ['error', 'bug', 'crash', 'not working', 'broken', 'issue', 'problem'],
      account: ['password', 'login', 'email', 'account', 'profile', 'access'],
      features: ['how to', 'feature', 'ai', 'tool', 'studio', 'mixer'],
    };

    let bestCategory = 'general';
    let maxScore = 0;

    for (const [category, keywords] of Object.entries(categories)) {
      const score = keywords.filter((keyword) => text.includes(keyword)).length;
      if (score > maxScore) {
        maxScore = score;
        bestCategory = category;
      }
    }

    return bestCategory;
  }

  async suggestResponse(ticketId: string): Promise<string> {
    const ticket = await supportTicketService.getTicketById(ticketId);
    if (!ticket) {
      throw new Error('Ticket not found');
    }

    const response = await this.answerQuestion({
      question: `${ticket.subject}. ${ticket.description}`,
    });

    return response.answer;
  }
}

export const supportAIService = new SupportAIService();
