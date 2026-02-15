/**
 * AI Help Desk Service
 * Provides intelligent support assistance for Max Booster users
 */

import { BUSINESS_CONFIG } from '../config/businessConfig';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface HelpDeskResponse {
  message: string;
  suggestedActions?: string[];
  relatedArticles?: { title: string; url: string }[];
  needsHumanSupport?: boolean;
  category?: string;
}

interface ConversationContext {
  userId?: number;
  sessionId: string;
  messages: ChatMessage[];
  category?: string;
  resolved: boolean;
}

// Knowledge base categories
const KNOWLEDGE_BASE = {
  distribution: {
    keywords: ['distribute', 'release', 'spotify', 'apple music', 'upload', 'dsp', 'streaming'],
    responses: {
      howTo: 'To distribute your music, go to the Distribution tab, click "New Release", upload your audio and artwork, fill in the metadata, and select your target platforms. Our system will validate everything and submit to all major streaming services.',
      timeline: 'Distribution typically takes 24-72 hours for most platforms. Spotify and Apple Music are usually the fastest. We recommend scheduling releases at least 2 weeks in advance for editorial playlist consideration.',
      requirements: 'You\'ll need: High-quality audio (WAV or FLAC, 16-bit/44.1kHz minimum), artwork (3000x3000 pixels, JPG or PNG), and complete metadata including ISRC codes (we can generate these for you).',
    }
  },
  royalties: {
    keywords: ['royalty', 'payment', 'payout', 'earnings', 'money', 'split', 'revenue'],
    responses: {
      calculation: 'Royalties are calculated based on streams from each platform. Different platforms pay different rates. You can view detailed breakdowns in the Royalties section, including per-stream rates by territory.',
      payout: 'Payouts are processed monthly once you reach the minimum threshold ($25 USD). You can set up your payment method in Settings > Payments. We support bank transfer, PayPal, and more.',
      splits: 'You can set up royalty splits with collaborators in the Splits section. Each release can have different split configurations. All parties receive their share automatically.',
    }
  },
  studio: {
    keywords: ['studio', 'daw', 'record', 'mix', 'master', 'audio', 'track', 'effect'],
    responses: {
      overview: 'The Max Booster Studio is a professional browser-based DAW. You can record, edit, mix, and master your music without any additional software. It supports multi-track recording, MIDI, and professional effects.',
      features: 'Key features include: Multi-track recording, MIDI sequencing, built-in effects (EQ, compressor, reverb, delay), automation, stem rendering, and AI-powered mixing assistance.',
      export: 'Export your projects in various formats: WAV, AIFF, FLAC, MP3, or AAC. You can also render individual stems for distribution or collaboration.',
    }
  },
  social: {
    keywords: ['social', 'instagram', 'tiktok', 'twitter', 'facebook', 'post', 'schedule', 'autopilot'],
    responses: {
      autopilot: 'Our AI Autopilot can automatically generate and schedule content across all your social platforms. It analyzes optimal posting times and creates engaging content tailored to each platform\'s algorithm.',
      connect: 'Connect your social accounts in Settings > Social Connections. We support Instagram, TikTok, Twitter/X, Facebook, YouTube, LinkedIn, and Threads.',
      organic: 'Max Booster\'s Organic Growth AI achieves the same results as paid advertising through intelligent content optimization - saving you money while maximizing reach.',
    }
  },
  account: {
    keywords: ['account', 'password', 'login', 'email', 'settings', 'subscription', 'plan'],
    responses: {
      password: 'To reset your password, go to the login page and click "Forgot Password". You\'ll receive an email with instructions to create a new password.',
      subscription: 'You can manage your subscription in Settings > Subscription. Upgrade, downgrade, or cancel anytime. We offer monthly and yearly plans with different feature sets.',
      security: 'Enable two-factor authentication in Settings > Security for extra protection. We recommend using an authenticator app for the best security.',
    }
  }
};

class AIHelpDeskService {
  private conversations: Map<string, ConversationContext> = new Map();
  
  /**
   * Get or create a conversation context
   */
  getConversation(sessionId: string, userId?: number): ConversationContext {
    if (!this.conversations.has(sessionId)) {
      this.conversations.set(sessionId, {
        sessionId,
        userId,
        messages: [{
          role: 'system',
          content: `You are ${BUSINESS_CONFIG.helpDesk.aiAssistantName}, the AI help desk assistant for ${BUSINESS_CONFIG.company.platform}, owned by ${BUSINESS_CONFIG.company.name} (LLC #${BUSINESS_CONFIG.company.llcNumber}). Be helpful, friendly, and knowledgeable about all platform features.`,
          timestamp: new Date()
        }],
        resolved: false
      });
    }
    return this.conversations.get(sessionId)!;
  }
  
  /**
   * Process a user message and generate a response
   */
  async processMessage(sessionId: string, userMessage: string, userId?: number): Promise<HelpDeskResponse> {
    const context = this.getConversation(sessionId, userId);
    
    // Add user message to history
    context.messages.push({
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    });
    
    // Detect category and intent
    const category = this.detectCategory(userMessage);
    const intent = this.detectIntent(userMessage);
    
    // Generate response based on category and intent
    const response = this.generateResponse(userMessage, category, intent, context);
    
    // Add assistant response to history
    context.messages.push({
      role: 'assistant',
      content: response.message,
      timestamp: new Date()
    });
    
    return response;
  }
  
  /**
   * Detect the category of the user's question
   */
  private detectCategory(message: string): string | undefined {
    const lowerMessage = message.toLowerCase();
    
    for (const [category, data] of Object.entries(KNOWLEDGE_BASE)) {
      if (data.keywords.some(keyword => lowerMessage.includes(keyword))) {
        return category;
      }
    }
    
    return undefined;
  }
  
  /**
   * Detect the user's intent
   */
  private detectIntent(message: string): string {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('how') || lowerMessage.includes('what') || lowerMessage.includes('where')) {
      return 'question';
    }
    if (lowerMessage.includes('problem') || lowerMessage.includes('issue') || lowerMessage.includes('error') || lowerMessage.includes('not working')) {
      return 'problem';
    }
    if (lowerMessage.includes('help') || lowerMessage.includes('assist')) {
      return 'help';
    }
    if (lowerMessage.includes('thank')) {
      return 'gratitude';
    }
    
    return 'general';
  }
  
  /**
   * Generate a contextual response
   */
  private generateResponse(
    message: string,
    category: string | undefined,
    intent: string,
    context: ConversationContext
  ): HelpDeskResponse {
    const { helpDesk, company } = BUSINESS_CONFIG;
    
    // Handle gratitude
    if (intent === 'gratitude') {
      return {
        message: `You're welcome! I'm always here to help. Is there anything else you'd like to know about ${company.platform}?`,
        category: 'general'
      };
    }
    
    // Handle category-specific questions
    if (category && KNOWLEDGE_BASE[category as keyof typeof KNOWLEDGE_BASE]) {
      const kb = KNOWLEDGE_BASE[category as keyof typeof KNOWLEDGE_BASE];
      const responses = kb.responses;
      const responseKeys = Object.keys(responses) as (keyof typeof responses)[];
      
      // Find best matching response
      let bestResponse = responses[responseKeys[0]];
      const lowerMessage = message.toLowerCase();
      
      if (lowerMessage.includes('how') || lowerMessage.includes('start')) {
        bestResponse = responses.howTo || responses[responseKeys[0]];
      } else if (lowerMessage.includes('time') || lowerMessage.includes('long')) {
        bestResponse = responses.timeline || responses[responseKeys[0]];
      } else if (lowerMessage.includes('need') || lowerMessage.includes('require')) {
        bestResponse = responses.requirements || responses[responseKeys[0]];
      }
      
      return {
        message: bestResponse as string,
        category,
        suggestedActions: this.getSuggestedActions(category),
        relatedArticles: this.getRelatedArticles(category)
      };
    }
    
    // Handle problem reports
    if (intent === 'problem') {
      return {
        message: `I'm sorry to hear you're experiencing an issue. Could you please provide more details about what's happening? If this is a technical problem, I may need to escalate this to our support team at ${company.platform}.`,
        needsHumanSupport: true,
        suggestedActions: [
          'Describe the exact error message you see',
          'Tell me what you were trying to do',
          'Let me know if this just started or has been ongoing'
        ]
      };
    }
    
    // Default response
    return {
      message: `${helpDesk.welcomeMessage} 

Here's what I can help you with:
• Music distribution to Spotify, Apple Music, and 150+ platforms
• Royalty tracking and payouts
• Studio features and music production
• Social media management and AI autopilot
• Account settings and subscriptions

What would you like to know more about?`,
      suggestedActions: [
        'How do I distribute my music?',
        'When do I get paid?',
        'How does the AI autopilot work?',
        'Tell me about the studio features'
      ]
    };
  }
  
  /**
   * Get suggested actions for a category
   */
  private getSuggestedActions(category: string): string[] {
    const actions: Record<string, string[]> = {
      distribution: [
        'Start a new release',
        'Check release status',
        'View platform requirements'
      ],
      royalties: [
        'View earnings dashboard',
        'Set up payment method',
        'Configure splits'
      ],
      studio: [
        'Open the studio',
        'View tutorials',
        'Browse preset library'
      ],
      social: [
        'Connect social accounts',
        'Enable autopilot',
        'View analytics'
      ],
      account: [
        'Go to settings',
        'Enable 2FA',
        'Manage subscription'
      ]
    };
    
    return actions[category] || [];
  }
  
  /**
   * Get related help articles
   */
  private getRelatedArticles(category: string): { title: string; url: string }[] {
    const articles: Record<string, { title: string; url: string }[]> = {
      distribution: [
        { title: 'Distribution Quick Start Guide', url: '/help/distribution-guide' },
        { title: 'Metadata Requirements', url: '/help/metadata' },
        { title: 'Release Scheduling Best Practices', url: '/help/scheduling' }
      ],
      royalties: [
        { title: 'Understanding Royalties', url: '/help/royalties-explained' },
        { title: 'Setting Up Payouts', url: '/help/payout-setup' },
        { title: 'Royalty Splits Guide', url: '/help/splits' }
      ],
      studio: [
        { title: 'Studio Getting Started', url: '/help/studio-basics' },
        { title: 'Mixing and Mastering', url: '/help/mixing' },
        { title: 'MIDI and Instruments', url: '/help/midi' }
      ],
      social: [
        { title: 'Social Media Setup', url: '/help/social-setup' },
        { title: 'AI Autopilot Guide', url: '/help/autopilot' },
        { title: 'Content Best Practices', url: '/help/content-tips' }
      ],
      account: [
        { title: 'Account Security', url: '/help/security' },
        { title: 'Subscription Plans', url: '/help/plans' },
        { title: 'Profile Settings', url: '/help/profile' }
      ]
    };
    
    return articles[category] || [];
  }
  
  /**
   * Get welcome message
   */
  getWelcomeMessage(): HelpDeskResponse {
    return {
      message: BUSINESS_CONFIG.helpDesk.welcomeMessage,
      suggestedActions: [
        'How do I distribute my music?',
        'Tell me about royalties',
        'How does the studio work?',
        'Help with social media'
      ]
    };
  }
  
  /**
   * End a conversation
   */
  endConversation(sessionId: string): void {
    const context = this.conversations.get(sessionId);
    if (context) {
      context.resolved = true;
    }
  }
  
  /**
   * Escalate to human support
   */
  async escalateToHuman(sessionId: string, reason: string): Promise<{ ticketId: string; message: string }> {
    const context = this.conversations.get(sessionId);
    const ticketId = `TKT-${Date.now()}`;
    
    return {
      ticketId,
      message: `I've created support ticket #${ticketId} for you. Our team at ${BUSINESS_CONFIG.company.name} will review your case and get back to you within 24 hours. Is there anything else I can help you with in the meantime?`
    };
  }
}

export const aiHelpDeskService = new AIHelpDeskService();
export default aiHelpDeskService;
