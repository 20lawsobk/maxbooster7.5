import { db } from '../db';
import { eq, and, or, like, desc, asc, sql } from 'drizzle-orm';

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  helpful: number;
  notHelpful: number;
  isPublished: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  category: string;
  tags: string[];
  readTime: number;
  viewCount: number;
  isPublished: boolean;
  authorId: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupportTicket {
  id: string;
  userId: number;
  subject: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting_on_customer' | 'resolved' | 'closed';
  assignedTo: number | null;
  messages: TicketMessage[];
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  senderId: number;
  senderType: 'user' | 'agent' | 'system';
  message: string;
  attachments: string[];
  createdAt: Date;
}

export interface SearchOptions {
  query: string;
  category?: string;
  limit?: number;
  offset?: number;
}

export interface CreateTicketData {
  userId: number;
  subject: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

export interface UpdateTicketData {
  status?: SupportTicket['status'];
  priority?: SupportTicket['priority'];
  assignedTo?: number | null;
}

const defaultFAQs: FAQItem[] = [
  {
    id: 'faq-1',
    question: 'How do I create my first music project?',
    answer: 'Navigate to the Studio page and click "New Project". You can upload audio files, use our virtual instruments, or start from scratch. Our AI will help optimize your mix and master your track.',
    category: 'getting-started',
    helpful: 156,
    notHelpful: 8,
    isPublished: true,
    order: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'faq-2',
    question: 'What subscription plan should I choose?',
    answer: 'We offer three plans: Monthly ($49/month) for flexibility, Yearly ($468/year) to save 20%, and Lifetime ($699 one-time) for unlimited access forever. All plans include full access to all features, unlimited distribution, and 100% royalties.',
    category: 'account',
    helpful: 243,
    notHelpful: 12,
    isPublished: true,
    order: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'faq-3',
    question: 'How do I distribute my music to streaming platforms?',
    answer: 'Go to the Distribution page, upload your music and artwork, fill in the metadata, select your platforms (Spotify, Apple Music, etc.), and submit for review. Your music will typically go live within 1-3 business days.',
    category: 'distribution',
    helpful: 189,
    notHelpful: 5,
    isPublished: true,
    order: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'faq-4',
    question: 'Do you take a percentage of my royalties?',
    answer: 'No! You keep 100% of your royalties. We only charge a subscription fee - there are no hidden fees or revenue sharing. Your earnings are yours to keep.',
    category: 'royalties',
    helpful: 312,
    notHelpful: 4,
    isPublished: true,
    order: 4,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'faq-5',
    question: 'What can the AI Mixer do?',
    answer: 'Our proprietary AI analyzes your tracks and automatically balances levels, applies EQ, compression, and spatial effects. It learns from professional mixing techniques to give your music a polished, radio-ready sound.',
    category: 'studio',
    helpful: 198,
    notHelpful: 15,
    isPublished: true,
    order: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'faq-6',
    question: 'When will I receive my royalty payments?',
    answer: 'Streaming platforms typically pay royalties 60-90 days after streams occur. We process payouts monthly once you reach the minimum threshold of $10. You can track your earnings in real-time on the Royalties page.',
    category: 'royalties',
    helpful: 145,
    notHelpful: 8,
    isPublished: true,
    order: 6,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'faq-7',
    question: 'Which social media platforms are supported?',
    answer: 'Max Booster integrates with Instagram, Facebook, Twitter/X, TikTok, YouTube, LinkedIn, and Threads. You can schedule posts, track engagement, and automate your music marketing across all platforms.',
    category: 'social',
    helpful: 178,
    notHelpful: 6,
    isPublished: true,
    order: 7,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'faq-8',
    question: 'Can I cancel my subscription anytime?',
    answer: 'Yes! Monthly and yearly subscriptions can be canceled anytime from the Settings page. Your access continues until the end of your billing period. Lifetime subscriptions are non-refundable.',
    category: 'account',
    helpful: 134,
    notHelpful: 2,
    isPublished: true,
    order: 8,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const ticketStore = new Map<string, SupportTicket>();

export class HelpCenterService {
  async getAllFAQs(category?: string): Promise<FAQItem[]> {
    let faqs = [...defaultFAQs];
    
    if (category) {
      faqs = faqs.filter(faq => faq.category === category);
    }
    
    return faqs.sort((a, b) => a.order - b.order);
  }

  async searchFAQs(options: SearchOptions): Promise<FAQItem[]> {
    const { query, category, limit = 20, offset = 0 } = options;
    const searchTerms = query.toLowerCase().split(' ');
    
    let faqs = defaultFAQs.filter(faq => {
      if (!faq.isPublished) return false;
      
      const matchesQuery = searchTerms.some(term =>
        faq.question.toLowerCase().includes(term) ||
        faq.answer.toLowerCase().includes(term)
      );
      
      const matchesCategory = !category || faq.category === category;
      
      return matchesQuery && matchesCategory;
    });

    const scoredFAQs = faqs.map(faq => {
      let score = 0;
      searchTerms.forEach(term => {
        if (faq.question.toLowerCase().includes(term)) score += 10;
        if (faq.answer.toLowerCase().includes(term)) score += 5;
      });
      score += faq.helpful - faq.notHelpful;
      return { faq, score };
    });

    scoredFAQs.sort((a, b) => b.score - a.score);
    
    return scoredFAQs.slice(offset, offset + limit).map(item => item.faq);
  }

  async getFAQById(id: string): Promise<FAQItem | null> {
    return defaultFAQs.find(faq => faq.id === id) || null;
  }

  async createFAQ(data: Omit<FAQItem, 'id' | 'helpful' | 'notHelpful' | 'createdAt' | 'updatedAt'>): Promise<FAQItem> {
    const faq: FAQItem = {
      ...data,
      id: `faq-${Date.now()}`,
      helpful: 0,
      notHelpful: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    defaultFAQs.push(faq);
    return faq;
  }

  async updateFAQ(id: string, data: Partial<FAQItem>): Promise<FAQItem | null> {
    const index = defaultFAQs.findIndex(faq => faq.id === id);
    if (index === -1) return null;
    
    defaultFAQs[index] = {
      ...defaultFAQs[index],
      ...data,
      updatedAt: new Date(),
    };
    
    return defaultFAQs[index];
  }

  async recordFAQFeedback(id: string, helpful: boolean): Promise<void> {
    const faq = defaultFAQs.find(f => f.id === id);
    if (faq) {
      if (helpful) {
        faq.helpful++;
      } else {
        faq.notHelpful++;
      }
      faq.updatedAt = new Date();
    }
  }

  async deleteFAQ(id: string): Promise<boolean> {
    const index = defaultFAQs.findIndex(faq => faq.id === id);
    if (index === -1) return false;
    defaultFAQs.splice(index, 1);
    return true;
  }

  async createSupportTicket(data: CreateTicketData): Promise<SupportTicket> {
    const ticketId = `ticket-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const ticket: SupportTicket = {
      id: ticketId,
      userId: data.userId,
      subject: data.subject,
      description: data.description,
      category: data.category,
      priority: data.priority,
      status: 'open',
      assignedTo: null,
      messages: [
        {
          id: `msg-${Date.now()}`,
          ticketId,
          senderId: data.userId,
          senderType: 'user',
          message: data.description,
          attachments: [],
          createdAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      resolvedAt: null,
    };
    
    ticketStore.set(ticketId, ticket);
    
    return ticket;
  }

  async getTicketById(id: string): Promise<SupportTicket | null> {
    return ticketStore.get(id) || null;
  }

  async getTicketsByUserId(userId: number): Promise<SupportTicket[]> {
    const tickets: SupportTicket[] = [];
    ticketStore.forEach(ticket => {
      if (ticket.userId === userId) {
        tickets.push(ticket);
      }
    });
    return tickets.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getAllTickets(filters?: {
    status?: SupportTicket['status'];
    priority?: SupportTicket['priority'];
    category?: string;
    assignedTo?: number;
  }): Promise<SupportTicket[]> {
    let tickets = Array.from(ticketStore.values());
    
    if (filters) {
      if (filters.status) {
        tickets = tickets.filter(t => t.status === filters.status);
      }
      if (filters.priority) {
        tickets = tickets.filter(t => t.priority === filters.priority);
      }
      if (filters.category) {
        tickets = tickets.filter(t => t.category === filters.category);
      }
      if (filters.assignedTo !== undefined) {
        tickets = tickets.filter(t => t.assignedTo === filters.assignedTo);
      }
    }
    
    return tickets.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateTicket(id: string, data: UpdateTicketData): Promise<SupportTicket | null> {
    const ticket = ticketStore.get(id);
    if (!ticket) return null;
    
    const updatedTicket: SupportTicket = {
      ...ticket,
      ...data,
      updatedAt: new Date(),
      resolvedAt: data.status === 'resolved' ? new Date() : ticket.resolvedAt,
    };
    
    ticketStore.set(id, updatedTicket);
    return updatedTicket;
  }

  async addTicketMessage(
    ticketId: string,
    senderId: number,
    senderType: 'user' | 'agent' | 'system',
    message: string,
    attachments: string[] = []
  ): Promise<TicketMessage | null> {
    const ticket = ticketStore.get(ticketId);
    if (!ticket) return null;
    
    const ticketMessage: TicketMessage = {
      id: `msg-${Date.now()}`,
      ticketId,
      senderId,
      senderType,
      message,
      attachments,
      createdAt: new Date(),
    };
    
    ticket.messages.push(ticketMessage);
    ticket.updatedAt = new Date();
    
    if (senderType === 'agent') {
      ticket.status = 'in_progress';
    } else if (senderType === 'user' && ticket.status === 'waiting_on_customer') {
      ticket.status = 'in_progress';
    }
    
    ticketStore.set(ticketId, ticket);
    return ticketMessage;
  }

  async getCategories(): Promise<{ id: string; label: string; count: number }[]> {
    const categoryCounts = new Map<string, number>();
    
    defaultFAQs.forEach(faq => {
      const count = categoryCounts.get(faq.category) || 0;
      categoryCounts.set(faq.category, count + 1);
    });
    
    const categories = [
      { id: 'getting-started', label: 'Getting Started' },
      { id: 'distribution', label: 'Music Distribution' },
      { id: 'studio', label: 'AI Studio' },
      { id: 'royalties', label: 'Royalties & Earnings' },
      { id: 'social', label: 'Social Media' },
      { id: 'account', label: 'Account & Billing' },
    ];
    
    return categories.map(cat => ({
      ...cat,
      count: categoryCounts.get(cat.id) || 0,
    }));
  }

  async getTicketStats(): Promise<{
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    avgResolutionTime: number;
  }> {
    const tickets = Array.from(ticketStore.values());
    
    let totalResolutionTime = 0;
    let resolvedCount = 0;
    
    tickets.forEach(ticket => {
      if (ticket.resolvedAt) {
        totalResolutionTime += ticket.resolvedAt.getTime() - ticket.createdAt.getTime();
        resolvedCount++;
      }
    });
    
    return {
      total: tickets.length,
      open: tickets.filter(t => t.status === 'open').length,
      inProgress: tickets.filter(t => t.status === 'in_progress' || t.status === 'waiting_on_customer').length,
      resolved: tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length,
      avgResolutionTime: resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0,
    };
  }
}

export const helpCenterService = new HelpCenterService();
