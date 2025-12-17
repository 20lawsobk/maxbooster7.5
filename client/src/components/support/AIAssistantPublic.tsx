import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, X, Send, Lightbulb, Music, TrendingUp, Zap, Minimize2, Maximize2, LogIn } from 'lucide-react';
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
  { icon: Music, text: 'What is Max Booster?', color: 'text-purple-400' },
  { icon: TrendingUp, text: 'What features are included?', color: 'text-blue-400' },
  { icon: Zap, text: 'How does pricing work?', color: 'text-amber-400' },
  { icon: Lightbulb, text: 'How do I get started?', color: 'text-green-400' },
];

const AI_RESPONSES: Record<string, string> = {
  default: "Hi! I'm Max, your AI assistant. I can tell you all about Max Booster - the all-in-one platform for music artists. Ask me about features, pricing, or how to get started!",
  what: "Max Booster is a complete music career platform built by a solo founder for independent artists. It includes:\n\n• **AI Studio** - Professional DAW for recording and production\n• **Music Distribution** - Get on Spotify, Apple Music, and 150+ platforms\n• **Social Media Autopilot** - 24/7 automated content posting\n• **Advertising Autopilot** - Zero-cost organic growth campaigns\n• **P2P Marketplace** - Sell beats and samples\n• **Desktop Apps** - Native apps for Windows, macOS, Linux\n\nAll with 100% custom AI - no external APIs!",
  features: "Max Booster includes everything you need to grow your music career:\n\n**Studio:**\n• Full DAW with unlimited tracks\n• AI mixing and mastering\n• Professional plugins and effects\n\n**Distribution:**\n• Unlimited releases to 150+ platforms\n• Keep 100% of your royalties\n• Fast 2-3 day approval\n\n**Marketing:**\n• 24/7 social media automation\n• Zero-cost advertising campaigns\n• Advanced analytics dashboard\n\n**Marketplace:**\n• Sell beats and samples\n• Set your own prices\n• Stripe payments\n\n**Desktop Apps:**\n• Windows, macOS, Linux\n• Included with subscription\n• Full platform access",
  pricing: "Max Booster offers flexible pricing:\n\n• **Monthly**: $49/month\n• **Yearly**: $468/year (save $120!)\n• **Lifetime**: $699 one-time (best value!)\n\nAll plans include:\n✅ Unlimited distribution\n✅ Full AI Studio access\n✅ Social media & ad autopilots\n✅ P2P marketplace access\n✅ Desktop apps (all platforms)\n✅ 24/7 AI support\n✅ All future features\n\nNo hidden fees, no per-release charges!",
  started: "Getting started is easy:\n\n1. **Sign Up**: Create your free account\n2. **Choose a Plan**: Monthly, yearly, or lifetime\n3. **Connect Accounts**: Link your social media and distribution accounts\n4. **Start Creating**: Use the Studio, distribute music, or list products\n\nThe platform guides you through setup, and I'm here 24/7 to help!\n\nReady to begin? Click 'Sign Up' in the top right corner!",
  desktop: "Desktop apps are included with every Max Booster subscription!\n\nAvailable for:\n• Windows 10/11 (64-bit)\n• macOS 10.13+ (Intel & Apple Silicon)\n• Linux (Ubuntu, Fedora, Debian)\n\nOnce you subscribe, visit the Desktop App page to download for your platform. All the same features as the web version, but in a native app!",
  ai: "All AI in Max Booster is 100% custom-built in-house:\n\n• **No OpenAI** - We don't use external APIs\n• **Your Data Stays Private** - Everything processed on our servers\n• **Custom Models** - Trained specifically for music production\n• **Always Available** - No API rate limits or outages\n\nThis gives you:\n✅ Better performance\n✅ More privacy\n✅ Lower costs (passed to you!)\n✅ Features competitors can't offer",
  distribution: "Max Booster distribution gets your music on:\n\n• Spotify\n• Apple Music\n• Amazon Music\n• YouTube Music\n• Tidal\n• Deezer\n• Pandora\n• And 140+ more platforms\n\n**You keep 100% of royalties!**\n\nNo per-release fees, unlimited distribution included with your subscription. Music goes live in 2-3 business days!",
};

export function AIAssistantPublic() {
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
      const welcomeMessage: Message = {
        id: '1',
        role: 'assistant',
        content: "Hey there! 👋 I'm Max, your AI assistant. I can tell you all about Max Booster and how it can help you grow your music career. What would you like to know?",
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    }
  }, [isOpen]);

  const getAIResponse = (userMessage: string): string => {
    const lowerMessage = userMessage.toLowerCase();
    
    if (lowerMessage.includes('what is') || lowerMessage.includes('about max booster') || lowerMessage.includes('tell me about')) {
      return AI_RESPONSES.what;
    }
    if (lowerMessage.includes('feature') || lowerMessage.includes('included') || lowerMessage.includes('what can') || lowerMessage.includes('capabilities')) {
      return AI_RESPONSES.features;
    }
    if (lowerMessage.includes('price') || lowerMessage.includes('pricing') || lowerMessage.includes('cost') || lowerMessage.includes('how much')) {
      return AI_RESPONSES.pricing;
    }
    if (lowerMessage.includes('start') || lowerMessage.includes('begin') || lowerMessage.includes('sign up') || lowerMessage.includes('get started')) {
      return AI_RESPONSES.started;
    }
    if (lowerMessage.includes('desktop') || lowerMessage.includes('download') || lowerMessage.includes('windows') || lowerMessage.includes('mac') || lowerMessage.includes('linux')) {
      return AI_RESPONSES.desktop;
    }
    if (lowerMessage.includes('ai') || lowerMessage.includes('artificial intelligence') || lowerMessage.includes('openai')) {
      return AI_RESPONSES.ai;
    }
    if (lowerMessage.includes('distribution') || lowerMessage.includes('distribute') || lowerMessage.includes('spotify') || lowerMessage.includes('apple music')) {
      return AI_RESPONSES.distribution;
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

  if (!isOpen) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          size="lg"
          className="h-14 w-14 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-lg hover:shadow-xl transition-all duration-200 group"
          data-testid="ai-assistant-bubble-public"
        >
          <Sparkles className="h-6 w-6 text-white group-hover:scale-110 transition-transform" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn(
      "fixed bottom-6 right-6 z-50 transition-all duration-200",
      isMinimized ? "w-80" : "w-96"
    )}>
      <Card className="shadow-2xl border-2 border-purple-500/20 bg-[#1a1a1a]">
        <CardHeader className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-b border-purple-500/20 p-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-white">
              <div className="h-8 w-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold">Max</div>
                <div className="text-xs text-gray-400 font-normal">AI Assistant</div>
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
                          ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
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
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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
                        className="justify-start text-left h-auto py-2 px-3 border-gray-700 hover:border-purple-500/50 hover:bg-purple-500/10"
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

            <div className="border-t border-gray-700 p-4 space-y-3">
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
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="flex items-center justify-center gap-2 p-2 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/20">
                <LogIn className="h-4 w-4 text-purple-400" />
                <span className="text-xs text-gray-300">
                  <a href="/login" className="text-purple-400 hover:text-purple-300 font-medium">Sign in</a> for personalized help!
                </span>
              </div>
              
              <div className="text-xs text-gray-500 text-center">
                AI-powered help • Available 24/7
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
