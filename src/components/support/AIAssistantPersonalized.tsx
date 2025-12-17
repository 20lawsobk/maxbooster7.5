import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Sparkles, X, Send, Lightbulb, Music, TrendingUp, Zap, Minimize2, Maximize2, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Suggestion {
  icon: typeof Lightbulb;
  text: string;
  color: string;
}

const QUICK_SUGGESTIONS: Suggestion[] = [
  { icon: Music, text: 'How do I use the DAW?', color: 'text-purple-400' },
  { icon: TrendingUp, text: 'How does distribution work?', color: 'text-blue-400' },
  { icon: Zap, text: 'Tell me about AI features', color: 'text-amber-400' },
  { icon: Lightbulb, text: 'How to monetize my music?', color: 'text-green-400' },
];

const AI_RESPONSES: Record<string, string> = {
  default: "I'm here to help you get the most out of Max Booster! I can answer questions about the Studio, distribution, social media autopilot, advertising campaigns, marketplace features, and more. What would you like to know?",
  daw: "The Max Booster Studio is a full-featured DAW (Digital Audio Workstation) inspired by Studio One. You can:\n\n• Create and manage unlimited projects\n• Record audio and MIDI tracks\n• Use AI mixing and mastering\n• Apply professional effects and plugins\n• Export in multiple formats\n\nTo get started, click 'Studio' in the sidebar and create a new project!",
  distribution: "Max Booster offers unlimited music distribution to 150+ platforms including Spotify, Apple Music, Amazon Music, and more. You keep 100% of your royalties!\n\nTo distribute:\n1. Go to Distribution in the sidebar\n2. Upload your finished track\n3. Add metadata (title, artist, cover art)\n4. Select platforms\n5. Submit for review\n\nYour music will go live within 2-3 business days!",
  ai: "Max Booster includes powerful AI features:\n\n• **AI Mix**: Automatic EQ, compression, and spatial positioning\n• **AI Master**: Professional loudness optimization and finishing\n• **AI Generator**: Create beats and melodies from text descriptions\n• **Social Media Autopilot**: 24/7 automated content posting\n• **Ad Campaign Autopilot**: Organic growth optimization\n\nAll AI is 100% custom-built in-house - no external APIs!",
  monetize: "Here's how to monetize your music on Max Booster:\n\n• **Distribution**: Earn streaming royalties (100% yours!)\n• **Beat Marketplace**: Sell beats and samples to other artists\n• **Licensing**: Offer exclusive and non-exclusive licenses\n• **Analytics**: Track revenue and optimize your strategy\n\nThe platform handles all payments via Stripe and provides detailed financial reports!",
  social: "The Social Media Autopilot runs 24/7 and:\n\n• Automatically posts to Instagram, Twitter, Facebook, YouTube\n• Creates engaging content from your music\n• Uses AI to optimize posting times\n• Analyzes performance metrics\n• Grows your audience organically\n\nJust connect your accounts in Settings → Social Media!",
  advertising: "The Advertising Autopilot is zero-cost organic growth:\n\n• Creates viral-optimized content\n• Posts across all platforms\n• A/B tests different strategies\n• Learns from your best-performing content\n• No ad spend required!\n\nIt's like having a marketing team working 24/7 for free!",
  marketplace: "The P2P Marketplace lets you:\n\n• Sell beats, samples, and loops\n• Offer exclusive and non-exclusive licenses\n• Set your own prices\n• Get paid via Stripe Connect\n• Build a customer base\n\nTo start selling, go to Marketplace → List Item and upload your products!",
  desktop: "Your desktop apps are ready to download!\n\nAs a subscriber, you have access to:\n• Windows desktop app\n• macOS desktop app\n• Linux desktop app\n\nVisit Desktop App in the sidebar to download for your platform. All the same features you love, in a native desktop application!",
  analytics: "The Analytics dashboard shows:\n\n• **Streaming Stats**: Real-time plays, listeners, revenue\n• **Social Media Performance**: Engagement, growth, best posts\n• **Ad Campaign Results**: Reach, conversions, ROI\n• **Marketplace Sales**: Revenue, best-sellers, customer insights\n• **AI Predictions**: Future trends and recommendations\n\nAll your data in one place, updated in real-time!",
  settings: "You can customize Max Booster in Settings:\n\n• **Profile**: Update your artist info and branding\n• **Social Accounts**: Connect Instagram, Twitter, Facebook, YouTube\n• **Distribution**: Manage your label and artist profiles\n• **Billing**: View subscription and payment methods\n• **Notifications**: Control email and push notifications\n\nClick the gear icon in the sidebar to access Settings!",
};

export function AIAssistantPersonalized() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const userName = user?.username || user?.firstName || 'there';
      const welcomeMessage: Message = {
        id: '1',
        role: 'assistant',
        content: `Hey ${userName}! 👋 I'm Max, your personal AI assistant. I'm here to help you navigate Max Booster and grow your music career. What can I help you with today?`,
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    }
  }, [isOpen, user]);

  const getAIResponse = (userMessage: string): string => {
    const lowerMessage = userMessage.toLowerCase();
    
    if (lowerMessage.includes('daw') || lowerMessage.includes('studio') || lowerMessage.includes('record') || lowerMessage.includes('mix')) {
      return AI_RESPONSES.daw;
    }
    if (lowerMessage.includes('distribution') || lowerMessage.includes('distribute') || lowerMessage.includes('spotify') || lowerMessage.includes('apple music')) {
      return AI_RESPONSES.distribution;
    }
    if (lowerMessage.includes('ai') || lowerMessage.includes('artificial intelligence')) {
      return AI_RESPONSES.ai;
    }
    if (lowerMessage.includes('monetize') || lowerMessage.includes('money') || lowerMessage.includes('earn') || lowerMessage.includes('revenue')) {
      return AI_RESPONSES.monetize;
    }
    if (lowerMessage.includes('social') || lowerMessage.includes('instagram') || lowerMessage.includes('twitter') || lowerMessage.includes('facebook')) {
      return AI_RESPONSES.social;
    }
    if (lowerMessage.includes('advertising') || lowerMessage.includes('ad') || lowerMessage.includes('marketing') || lowerMessage.includes('growth')) {
      return AI_RESPONSES.advertising;
    }
    if (lowerMessage.includes('marketplace') || lowerMessage.includes('sell') || lowerMessage.includes('beats')) {
      return AI_RESPONSES.marketplace;
    }
    if (lowerMessage.includes('desktop') || lowerMessage.includes('download') || lowerMessage.includes('app')) {
      return AI_RESPONSES.desktop;
    }
    if (lowerMessage.includes('analytics') || lowerMessage.includes('stats') || lowerMessage.includes('data') || lowerMessage.includes('metrics')) {
      return AI_RESPONSES.analytics;
    }
    if (lowerMessage.includes('settings') || lowerMessage.includes('account') || lowerMessage.includes('profile') || lowerMessage.includes('preferences')) {
      return AI_RESPONSES.settings;
    }
    
    return AI_RESPONSES.default;
  };

  const handleSendMessage = (messageText?: string) => {
    const textToSend = messageText || inputValue.trim();
    if (!textToSend) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: getAIResponse(textToSend),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiResponse]);
      setIsTyping(false);
    }, 800);
  };

  const handleSuggestionClick = (suggestion: Suggestion) => {
    handleSendMessage(suggestion.text);
  };

  const userName = user?.username || user?.firstName || 'User';
  const userTier = user?.subscriptionTier || 'free';

  if (!isOpen) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          size="lg"
          className="h-14 w-14 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 shadow-lg hover:shadow-xl transition-all duration-200 group"
          data-testid="ai-assistant-bubble-personalized"
        >
          <Sparkles className="h-6 w-6 text-white group-hover:scale-110 transition-transform" />
        </Button>
        <div className="absolute -top-2 -right-2 h-4 w-4 bg-green-500 rounded-full border-2 border-white animate-pulse" />
      </div>
    );
  }

  return (
    <div className={cn(
      "fixed bottom-6 right-6 z-50 transition-all duration-200",
      isMinimized ? "w-80" : "w-96"
    )}>
      <Card className="shadow-2xl border-2 border-cyan-500/20 bg-[#1a1a1a]">
        <CardHeader className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-b border-cyan-500/20 p-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-white">
              <div className="h-8 w-8 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">Max</div>
                <div className="text-xs text-gray-400 font-normal flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {userName}
                  {userTier !== 'free' && (
                    <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 h-4 border-cyan-500/30 text-cyan-400">
                      {userTier}
                    </Badge>
                  )}
                </div>
              </div>
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                onClick={() => setIsMinimized(!isMinimized)}
              >
                {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        
        {!isMinimized && (
          <CardContent className="p-0">
            <ScrollArea ref={scrollRef} className="h-96 p-4">
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex",
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg px-4 py-2 whitespace-pre-wrap",
                        message.role === 'user'
                          ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
                          : 'bg-[#252525] text-gray-100 border border-gray-700'
                      )}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}
                
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-[#252525] text-gray-100 border border-gray-700 rounded-lg px-4 py-2">
                      <div className="flex space-x-2">
                        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}

                {messages.length === 1 && !isTyping && (
                  <div className="grid grid-cols-1 gap-2 mt-4">
                    {QUICK_SUGGESTIONS.map((suggestion, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        size="sm"
                        className="justify-start text-left h-auto py-2 px-3 border-gray-700 hover:border-cyan-500/50 hover:bg-cyan-500/10"
                        onClick={() => handleSuggestionClick(suggestion)}
                      >
                        <suggestion.icon className={cn("h-4 w-4 mr-2 flex-shrink-0", suggestion.color)} />
                        <span className="text-xs text-gray-300">{suggestion.text}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="border-t border-gray-700 p-4">
              <div className="flex items-center gap-2">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Ask me anything..."
                  className="flex-1 bg-[#252525] border-gray-700 text-white placeholder:text-gray-500"
                />
                <Button
                  onClick={() => handleSendMessage()}
                  disabled={!inputValue.trim()}
                  size="sm"
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-2 text-xs text-gray-500 text-center">
                Personalized AI help • Available 24/7
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
