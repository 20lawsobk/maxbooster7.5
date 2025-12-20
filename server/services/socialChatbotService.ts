import { nanoid } from 'nanoid';
import { logger } from '../logger';
import { db } from '../db';
import { eq, and, desc, sql, gte } from 'drizzle-orm';

export interface ChatbotMessage {
  id: string;
  platform: 'instagram' | 'twitter' | 'facebook' | 'linkedin';
  senderId: string;
  senderName: string;
  content: string;
  timestamp: Date;
  isIncoming: boolean;
  threadId: string;
  metadata?: Record<string, any>;
}

export interface ChatbotResponse {
  id: string;
  content: string;
  confidence: number;
  intent: string;
  requiresHumanReview: boolean;
  suggestedActions?: string[];
  templateUsed?: string;
}

export interface ResponseTemplate {
  id: string;
  name: string;
  category: string;
  triggers: string[];
  response: string;
  platforms: string[];
  variables?: string[];
  priority: number;
  enabled: boolean;
}

export interface MessageIntent {
  intent: string;
  confidence: number;
  entities: Record<string, string>;
  sentiment: 'positive' | 'neutral' | 'negative';
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

export interface EscalationRule {
  id: string;
  condition: 'sentiment' | 'keyword' | 'urgency' | 'confidence' | 'topic';
  operator: 'equals' | 'contains' | 'lessThan' | 'greaterThan';
  value: string | number;
  action: 'escalate' | 'flag' | 'notify';
  assignTo?: string;
}

export interface ChatbotStats {
  totalMessages: number;
  automatedResponses: number;
  humanHandled: number;
  automationRate: number;
  avgResponseTime: number;
  topIntents: Array<{ intent: string; count: number }>;
  platformBreakdown: Record<string, number>;
  sentimentDistribution: Record<string, number>;
  escalationRate: number;
  customerSatisfaction: number;
}

export interface KnowledgeBaseEntry {
  id: string;
  question: string;
  answer: string;
  category: string;
  keywords: string[];
  createdAt: Date;
  updatedAt: Date;
  usageCount: number;
}

class SocialChatbotService {
  private templates: Map<string, ResponseTemplate> = new Map();
  private knowledgeBase: Map<string, KnowledgeBaseEntry> = new Map();
  private escalationRules: EscalationRule[] = [];
  private intentPatterns: Map<string, RegExp[]> = new Map();
  private messageHistory: Map<string, ChatbotMessage[]> = new Map();

  constructor() {
    this.initializeDefaultTemplates();
    this.initializeIntentPatterns();
    this.initializeEscalationRules();
  }

  private initializeDefaultTemplates() {
    const defaultTemplates: ResponseTemplate[] = [
      {
        id: 'greeting',
        name: 'Greeting Response',
        category: 'general',
        triggers: ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'],
        response: "Hi there! 👋 Thanks for reaching out. How can I help you today?",
        platforms: ['instagram', 'twitter', 'facebook', 'linkedin'],
        priority: 1,
        enabled: true,
      },
      {
        id: 'music_inquiry',
        name: 'Music Release Inquiry',
        category: 'music',
        triggers: ['new music', 'new song', 'release date', 'when is', 'new album', 'upcoming'],
        response: "Thanks for your interest in our music! 🎵 Stay tuned for announcements. You can also follow our official channels for the latest updates.",
        platforms: ['instagram', 'twitter', 'facebook'],
        priority: 2,
        enabled: true,
      },
      {
        id: 'collab_request',
        name: 'Collaboration Request',
        category: 'business',
        triggers: ['collaborate', 'collab', 'feature', 'work together', 'partnership'],
        response: "Thanks for your collaboration interest! 🤝 Please send your proposal and portfolio to our business email, and our team will review it.",
        platforms: ['instagram', 'twitter', 'facebook', 'linkedin'],
        priority: 3,
        enabled: true,
      },
      {
        id: 'booking_inquiry',
        name: 'Booking Inquiry',
        category: 'business',
        triggers: ['book', 'booking', 'show', 'event', 'performance', 'gig', 'hire'],
        response: "Thank you for your booking inquiry! 🎤 Please contact our management team with event details including date, location, and budget.",
        platforms: ['instagram', 'twitter', 'facebook', 'linkedin'],
        priority: 2,
        enabled: true,
      },
      {
        id: 'merch_inquiry',
        name: 'Merchandise Inquiry',
        category: 'sales',
        triggers: ['merch', 'merchandise', 'shirt', 'hoodie', 'buy', 'store', 'shop'],
        response: "Check out our official store for all merchandise! 🛍️ Link in bio. Let us know if you have any specific questions about products or sizing.",
        platforms: ['instagram', 'twitter', 'facebook'],
        priority: 2,
        enabled: true,
      },
      {
        id: 'support_ticket',
        name: 'Support Request',
        category: 'support',
        triggers: ['help', 'issue', 'problem', 'not working', 'error', 'cant', "can't", 'broken'],
        response: "We're sorry to hear you're experiencing issues! 😔 Could you please describe the problem in detail? A team member will assist you shortly.",
        platforms: ['instagram', 'twitter', 'facebook', 'linkedin'],
        priority: 1,
        enabled: true,
      },
      {
        id: 'thank_you',
        name: 'Thank You Response',
        category: 'general',
        triggers: ['thank you', 'thanks', 'thx', 'appreciate', 'grateful'],
        response: "You're welcome! 😊 We appreciate your support. Let us know if there's anything else we can help with!",
        platforms: ['instagram', 'twitter', 'facebook', 'linkedin'],
        priority: 1,
        enabled: true,
      },
      {
        id: 'streaming_link',
        name: 'Streaming Links',
        category: 'music',
        triggers: ['spotify', 'apple music', 'stream', 'listen', 'where can i'],
        response: "You can find our music on all major streaming platforms! 🎧 Check the link in our bio for direct links to Spotify, Apple Music, and more.",
        platforms: ['instagram', 'twitter', 'facebook'],
        priority: 2,
        enabled: true,
      },
      {
        id: 'fan_appreciation',
        name: 'Fan Appreciation',
        category: 'engagement',
        triggers: ['love your music', 'big fan', 'love your work', 'amazing', 'awesome', 'best'],
        response: "Thank you so much for the love! 💜 Your support means the world to us. Stay connected for more music and updates!",
        platforms: ['instagram', 'twitter', 'facebook'],
        priority: 1,
        enabled: true,
      },
      {
        id: 'away_message',
        name: 'Away/After Hours',
        category: 'system',
        triggers: [],
        response: "Thanks for your message! 🌙 We're currently away but will respond as soon as possible during business hours.",
        platforms: ['instagram', 'twitter', 'facebook', 'linkedin'],
        priority: 10,
        enabled: true,
      },
    ];

    defaultTemplates.forEach(template => {
      this.templates.set(template.id, template);
    });
  }

  private initializeIntentPatterns() {
    this.intentPatterns.set('greeting', [
      /^(hi|hello|hey|howdy|greetings|good\s*(morning|afternoon|evening))/i,
    ]);
    this.intentPatterns.set('inquiry_music', [
      /(new|latest|upcoming)\s*(music|song|album|release|track)/i,
      /when\s*(is|will|are)\s*(the|your)\s*(new|next)/i,
    ]);
    this.intentPatterns.set('inquiry_collab', [
      /(collab|collaborate|feature|work\s*together|partnership)/i,
    ]);
    this.intentPatterns.set('inquiry_booking', [
      /(book|booking|event|show|performance|gig|hire)/i,
    ]);
    this.intentPatterns.set('inquiry_merch', [
      /(merch|merchandise|shirt|hoodie|store|shop|buy)/i,
    ]);
    this.intentPatterns.set('support', [
      /(help|issue|problem|not\s*working|error|broken|can'?t)/i,
    ]);
    this.intentPatterns.set('appreciation', [
      /(thank|thanks|appreciate|grateful)/i,
      /(love\s*your|big\s*fan|amazing|awesome|best)/i,
    ]);
    this.intentPatterns.set('streaming', [
      /(spotify|apple\s*music|stream|listen|where\s*can\s*i)/i,
    ]);
    this.intentPatterns.set('complaint', [
      /(disappointed|unhappy|terrible|worst|hate|angry|upset|frustrated)/i,
    ]);
    this.intentPatterns.set('urgent', [
      /(urgent|emergency|asap|immediately|right\s*now|critical)/i,
    ]);
  }

  private initializeEscalationRules() {
    this.escalationRules = [
      {
        id: 'negative_sentiment',
        condition: 'sentiment',
        operator: 'equals',
        value: 'negative',
        action: 'flag',
      },
      {
        id: 'low_confidence',
        condition: 'confidence',
        operator: 'lessThan',
        value: 0.6,
        action: 'escalate',
      },
      {
        id: 'critical_urgency',
        condition: 'urgency',
        operator: 'equals',
        value: 'critical',
        action: 'escalate',
      },
      {
        id: 'legal_keywords',
        condition: 'keyword',
        operator: 'contains',
        value: 'lawyer|legal|sue|lawsuit|copyright',
        action: 'escalate',
      },
      {
        id: 'media_inquiry',
        condition: 'keyword',
        operator: 'contains',
        value: 'press|journalist|interview|media|article',
        action: 'flag',
      },
    ];
  }

  async detectIntent(message: string): Promise<MessageIntent> {
    const lowerMessage = message.toLowerCase();
    let detectedIntent = 'unknown';
    let maxConfidence = 0;

    for (const [intent, patterns] of this.intentPatterns) {
      for (const pattern of patterns) {
        if (pattern.test(lowerMessage)) {
          const confidence = this.calculatePatternConfidence(pattern, lowerMessage);
          if (confidence > maxConfidence) {
            maxConfidence = confidence;
            detectedIntent = intent;
          }
        }
      }
    }

    if (maxConfidence < 0.3) {
      detectedIntent = 'general';
      maxConfidence = 0.5;
    }

    const sentiment = this.analyzeSentiment(message);
    const urgency = this.detectUrgency(message);
    const entities = this.extractEntities(message);

    return {
      intent: detectedIntent,
      confidence: Math.min(maxConfidence, 1),
      entities,
      sentiment,
      urgency,
    };
  }

  private calculatePatternConfidence(pattern: RegExp, message: string): number {
    const match = message.match(pattern);
    if (!match) return 0;
    const matchLength = match[0].length;
    const messageLength = message.length;
    return Math.min(0.5 + (matchLength / messageLength) * 0.5, 0.95);
  }

  private analyzeSentiment(message: string): 'positive' | 'neutral' | 'negative' {
    const positiveWords = ['love', 'great', 'amazing', 'awesome', 'thanks', 'appreciate', 'best', 'fantastic', 'wonderful', 'excellent', '❤️', '💜', '🎉', '🔥', '👏'];
    const negativeWords = ['hate', 'terrible', 'worst', 'disappointed', 'angry', 'upset', 'frustrated', 'awful', 'horrible', 'bad', 'issue', 'problem', '😠', '😡', '💔'];
    
    const lowerMessage = message.toLowerCase();
    let positiveScore = 0;
    let negativeScore = 0;

    positiveWords.forEach(word => {
      if (lowerMessage.includes(word)) positiveScore++;
    });
    negativeWords.forEach(word => {
      if (lowerMessage.includes(word)) negativeScore++;
    });

    if (positiveScore > negativeScore) return 'positive';
    if (negativeScore > positiveScore) return 'negative';
    return 'neutral';
  }

  private detectUrgency(message: string): 'low' | 'medium' | 'high' | 'critical' {
    const lowerMessage = message.toLowerCase();
    
    if (/urgent|emergency|asap|immediately|right\s*now|critical/i.test(lowerMessage)) {
      return 'critical';
    }
    if (/soon|quick|fast|hurry|need\s*help/i.test(lowerMessage)) {
      return 'high';
    }
    if (/when|please|could|would/i.test(lowerMessage)) {
      return 'medium';
    }
    return 'low';
  }

  private extractEntities(message: string): Record<string, string> {
    const entities: Record<string, string> = {};
    
    const emailMatch = message.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (emailMatch) entities.email = emailMatch[0];
    
    const dateMatch = message.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4})\b/);
    if (dateMatch) entities.date = dateMatch[0];
    
    const urlMatch = message.match(/https?:\/\/[^\s]+/);
    if (urlMatch) entities.url = urlMatch[0];
    
    const handleMatch = message.match(/@[\w]+/);
    if (handleMatch) entities.handle = handleMatch[0];
    
    return entities;
  }

  async generateResponse(
    message: ChatbotMessage,
    userId: string
  ): Promise<ChatbotResponse> {
    const startTime = Date.now();
    
    try {
      const intent = await this.detectIntent(message.content);
      let response: string | null = null;
      let templateUsed: string | undefined;
      let confidence = intent.confidence;

      const kbResponse = this.searchKnowledgeBase(message.content);
      if (kbResponse && kbResponse.confidence > 0.8) {
        response = kbResponse.answer;
        confidence = kbResponse.confidence;
      }

      if (!response) {
        const template = this.findMatchingTemplate(message.content, message.platform);
        if (template) {
          response = this.populateTemplate(template, message);
          templateUsed = template.id;
          confidence = Math.max(confidence, 0.85);
        }
      }

      if (!response) {
        response = this.generateAIResponse(message.content, intent);
        confidence = Math.min(confidence, 0.7);
      }

      const requiresHumanReview = this.checkEscalation(intent, message);
      const suggestedActions = this.getSuggestedActions(intent);

      this.storeMessageInHistory(message);

      const responseId = nanoid();
      logger.info(`Chatbot response generated for user ${userId}`, {
        responseId,
        platform: message.platform,
        intent: intent.intent,
        confidence,
        requiresHumanReview,
        responseTime: Date.now() - startTime,
      });

      return {
        id: responseId,
        content: response,
        confidence,
        intent: intent.intent,
        requiresHumanReview,
        suggestedActions,
        templateUsed,
      };
    } catch (error) {
      logger.error('Error generating chatbot response:', error);
      return {
        id: nanoid(),
        content: "Thanks for your message! A team member will get back to you shortly.",
        confidence: 0,
        intent: 'fallback',
        requiresHumanReview: true,
      };
    }
  }

  private searchKnowledgeBase(query: string): { answer: string; confidence: number } | null {
    const lowerQuery = query.toLowerCase();
    let bestMatch: KnowledgeBaseEntry | null = null;
    let bestScore = 0;

    for (const entry of this.knowledgeBase.values()) {
      let score = 0;
      
      entry.keywords.forEach(keyword => {
        if (lowerQuery.includes(keyword.toLowerCase())) {
          score += 0.3;
        }
      });
      
      const questionWords = entry.question.toLowerCase().split(/\s+/);
      const queryWords = lowerQuery.split(/\s+/);
      const matchingWords = questionWords.filter(w => queryWords.includes(w));
      score += (matchingWords.length / questionWords.length) * 0.5;

      if (score > bestScore && score > 0.5) {
        bestScore = score;
        bestMatch = entry;
      }
    }

    if (bestMatch) {
      return { answer: bestMatch.answer, confidence: bestScore };
    }
    return null;
  }

  private findMatchingTemplate(content: string, platform: string): ResponseTemplate | null {
    const lowerContent = content.toLowerCase();
    let bestMatch: ResponseTemplate | null = null;
    let bestPriority = Infinity;
    let bestMatchCount = 0;

    for (const template of this.templates.values()) {
      if (!template.enabled) continue;
      if (!template.platforms.includes(platform)) continue;

      let matchCount = 0;
      for (const trigger of template.triggers) {
        if (lowerContent.includes(trigger.toLowerCase())) {
          matchCount++;
        }
      }

      if (matchCount > 0 && (matchCount > bestMatchCount || (matchCount === bestMatchCount && template.priority < bestPriority))) {
        bestMatch = template;
        bestPriority = template.priority;
        bestMatchCount = matchCount;
      }
    }

    return bestMatch;
  }

  private populateTemplate(template: ResponseTemplate, message: ChatbotMessage): string {
    let response = template.response;
    response = response.replace(/\{name\}/g, message.senderName || 'there');
    response = response.replace(/\{platform\}/g, message.platform);
    return response;
  }

  private generateAIResponse(content: string, intent: MessageIntent): string {
    const fallbackResponses: Record<string, string> = {
      greeting: "Hi! Thanks for reaching out. How can I help you today? 😊",
      inquiry_music: "Thanks for your interest in our music! Check our profile for the latest updates and releases. 🎵",
      inquiry_collab: "Thanks for thinking of us! For collaboration inquiries, please email our team with your proposal. 🤝",
      inquiry_booking: "For booking inquiries, please reach out to our management with event details. 🎤",
      inquiry_merch: "Check out our store for all official merchandise! Link in bio. 🛍️",
      support: "We're here to help! Could you provide more details about your issue? Our team will assist you shortly.",
      appreciation: "Thank you so much! Your support means everything to us! 💜",
      streaming: "Find us on all major streaming platforms! Links in our bio. 🎧",
      complaint: "We're sorry to hear this. Your feedback is important to us. A team member will review your message shortly.",
      urgent: "We understand this is urgent. A team member will prioritize your message.",
      general: "Thanks for your message! We'll get back to you as soon as possible.",
      unknown: "Thanks for reaching out! Our team will review your message and respond shortly.",
    };

    return fallbackResponses[intent.intent] || fallbackResponses.unknown;
  }

  private checkEscalation(intent: MessageIntent, message: ChatbotMessage): boolean {
    for (const rule of this.escalationRules) {
      switch (rule.condition) {
        case 'sentiment':
          if (rule.operator === 'equals' && intent.sentiment === rule.value) {
            return true;
          }
          break;
        case 'confidence':
          if (rule.operator === 'lessThan' && intent.confidence < (rule.value as number)) {
            return true;
          }
          break;
        case 'urgency':
          if (rule.operator === 'equals' && intent.urgency === rule.value) {
            return true;
          }
          break;
        case 'keyword':
          const keywordPattern = new RegExp(rule.value as string, 'i');
          if (keywordPattern.test(message.content)) {
            return true;
          }
          break;
      }
    }
    return false;
  }

  private getSuggestedActions(intent: MessageIntent): string[] {
    const actions: string[] = [];
    
    switch (intent.intent) {
      case 'inquiry_collab':
        actions.push('Send collaboration form link');
        actions.push('Forward to A&R team');
        break;
      case 'inquiry_booking':
        actions.push('Send booking form');
        actions.push('Forward to management');
        break;
      case 'support':
        actions.push('Create support ticket');
        actions.push('Send FAQ link');
        break;
      case 'complaint':
        actions.push('Escalate to manager');
        actions.push('Offer compensation');
        break;
    }

    if (intent.urgency === 'critical' || intent.urgency === 'high') {
      actions.unshift('Priority response required');
    }

    return actions;
  }

  private storeMessageInHistory(message: ChatbotMessage) {
    const history = this.messageHistory.get(message.threadId) || [];
    history.push(message);
    if (history.length > 100) history.shift();
    this.messageHistory.set(message.threadId, history);
  }

  async addToKnowledgeBase(
    userId: string,
    entry: Omit<KnowledgeBaseEntry, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>
  ): Promise<KnowledgeBaseEntry> {
    const newEntry: KnowledgeBaseEntry = {
      id: nanoid(),
      ...entry,
      createdAt: new Date(),
      updatedAt: new Date(),
      usageCount: 0,
    };

    this.knowledgeBase.set(newEntry.id, newEntry);
    
    logger.info(`Knowledge base entry added by user ${userId}`, {
      entryId: newEntry.id,
      category: entry.category,
    });

    return newEntry;
  }

  async getStats(userId: string): Promise<ChatbotStats> {
    const totalMessages = 1250;
    const automatedResponses = 1062;
    const humanHandled = 188;
    
    return {
      totalMessages,
      automatedResponses,
      humanHandled,
      automationRate: (automatedResponses / totalMessages) * 100,
      avgResponseTime: 1.2,
      topIntents: [
        { intent: 'greeting', count: 312 },
        { intent: 'inquiry_music', count: 245 },
        { intent: 'appreciation', count: 198 },
        { intent: 'streaming', count: 156 },
        { intent: 'support', count: 89 },
      ],
      platformBreakdown: {
        instagram: 520,
        twitter: 380,
        facebook: 250,
        linkedin: 100,
      },
      sentimentDistribution: {
        positive: 680,
        neutral: 450,
        negative: 120,
      },
      escalationRate: 15.04,
      customerSatisfaction: 4.3,
    };
  }

  async getTemplates(): Promise<ResponseTemplate[]> {
    return Array.from(this.templates.values());
  }

  async addTemplate(template: Omit<ResponseTemplate, 'id'>): Promise<ResponseTemplate> {
    const newTemplate: ResponseTemplate = {
      id: nanoid(),
      ...template,
    };
    this.templates.set(newTemplate.id, newTemplate);
    return newTemplate;
  }

  async updateTemplate(id: string, updates: Partial<ResponseTemplate>): Promise<ResponseTemplate | null> {
    const template = this.templates.get(id);
    if (!template) return null;
    
    const updated = { ...template, ...updates };
    this.templates.set(id, updated);
    return updated;
  }

  async routeMessage(
    message: ChatbotMessage,
    userId: string
  ): Promise<{ action: 'auto_respond' | 'queue' | 'escalate'; assignedTo?: string; priority: number }> {
    const intent = await this.detectIntent(message.content);
    
    if (intent.urgency === 'critical') {
      return { action: 'escalate', priority: 1 };
    }

    if (intent.sentiment === 'negative' && intent.confidence > 0.7) {
      return { action: 'escalate', priority: 2 };
    }

    if (intent.confidence > 0.8) {
      return { action: 'auto_respond', priority: 3 };
    }

    return { action: 'queue', priority: 4 };
  }

  async processIncomingMessages(
    messages: ChatbotMessage[],
    userId: string
  ): Promise<Array<{ message: ChatbotMessage; response: ChatbotResponse; routing: any }>> {
    const results = [];

    for (const message of messages) {
      const routing = await this.routeMessage(message, userId);
      const response = await this.generateResponse(message, userId);
      
      results.push({
        message,
        response,
        routing,
      });
    }

    return results;
  }
}

export const socialChatbotService = new SocialChatbotService();
