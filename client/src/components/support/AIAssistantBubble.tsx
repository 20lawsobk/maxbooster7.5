import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, X, Send, Lightbulb, Music, TrendingUp, Zap, Minimize2, Maximize2, Trash2 } from 'lucide-react';
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
  { icon: Zap, text: 'Tell me about the AI features', color: 'text-amber-400' },
  { icon: Lightbulb, text: 'How do I monetize my music?', color: 'text-green-400' },
];

const WELCOME_MESSAGE = (username?: string): Message => ({
  id: 'welcome',
  role: 'assistant',
  content: username
    ? `Hey ${username}! I'm Max, your AI assistant — built in-house by the Max Booster team. I remember our full conversation history, so feel free to ask follow-up questions. What can I help you with today?`
    : "Hey there! I'm Max, your AI assistant, built entirely in-house by the Max Booster team. Ask me anything about the platform — Studio, distribution, royalties, marketplace, social media, advertising, and more. What do you want to know?",
  timestamp: new Date(),
});

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function AIAssistantBubble() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const loadHistory = useCallback(async () => {
    if (historyLoaded) return;
    setHistoryLoaded(true);

    if (!user) {
      setMessages([WELCOME_MESSAGE()]);
      return;
    }

    try {
      const data = await apiFetch('/api/assistant/history');
      const prior: Message[] = (data.messages || []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.createdAt),
      }));

      if (prior.length === 0) {
        setMessages([WELCOME_MESSAGE(user.username ?? undefined)]);
      } else {
        setMessages(prior);
      }
    } catch {
      setMessages([WELCOME_MESSAGE(user.username ?? undefined)]);
    }
  }, [user, historyLoaded]);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, loadHistory]);

  const handleSendMessage = async (messageText?: string) => {
    const textToSend = (messageText || inputValue).trim();
    if (!textToSend || isTyping) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    try {
      const data = await apiFetch('/api/assistant/chat', {
        method: 'POST',
        body: JSON.stringify({ message: textToSend }),
      });

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch {
      const errMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'm having trouble connecting right now. Please check your connection and try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleClearHistory = async () => {
    if (!user) {
      setMessages([WELCOME_MESSAGE()]);
      return;
    }
    try {
      await apiFetch('/api/assistant/history', { method: 'DELETE' });
    } catch {
    }
    setHistoryLoaded(false);
    setMessages([WELCOME_MESSAGE(user.username ?? undefined)]);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleOpen = () => {
    setIsOpen(true);
  };

  if (!isOpen) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={handleOpen}
          size="lg"
          className="h-14 w-14 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 shadow-lg hover:shadow-xl transition-all duration-200 group"
          data-testid="ai-assistant-bubble"
        >
          <Sparkles className="h-6 w-6 text-white group-hover:scale-110 transition-transform" />
        </Button>
        {user && (
          <div className="absolute -top-2 -right-2 h-4 w-4 bg-green-500 rounded-full border-2 border-white animate-pulse" />
        )}
      </div>
    );
  }

  const showSuggestions = messages.length <= 1 && !isTyping;

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
              <div>
                <div className="text-sm font-semibold">Max</div>
                <div className="text-xs text-gray-400 font-normal">In-House AI Assistant</div>
              </div>
            </CardTitle>
            <div className="flex items-center gap-1">
              {user && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-gray-400 hover:text-red-400"
                  onClick={handleClearHistory}
                  title="Clear conversation history"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
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
                onClick={handleClose}
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
                        "max-w-[80%] rounded-lg px-4 py-2 whitespace-pre-wrap text-sm",
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

                {showSuggestions && (
                  <div className="grid grid-cols-1 gap-2 mt-4">
                    {QUICK_SUGGESTIONS.map((suggestion, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        size="sm"
                        className="justify-start text-left h-auto py-2 px-3 border-gray-700 hover:border-cyan-500/50 hover:bg-cyan-500/10"
                        onClick={() => handleSendMessage(suggestion.text)}
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Ask me anything..."
                  className="flex-1 bg-[#252525] border-gray-700 text-white placeholder:text-gray-500"
                  disabled={isTyping}
                />
                <Button
                  onClick={() => handleSendMessage()}
                  disabled={!inputValue.trim() || isTyping}
                  size="sm"
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-2 text-xs text-gray-500 text-center">
                In-house AI • Conversation history saved {user ? '✓' : '(log in to save)'}
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
