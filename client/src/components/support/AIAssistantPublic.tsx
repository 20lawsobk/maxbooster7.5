import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { getCsrfTokenFromCookie } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, X, Send, Lightbulb, Music, TrendingUp, Zap, Minimize2, Maximize2 } from 'lucide-react';
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
  { icon: TrendingUp, text: 'How does distribution work?', color: 'text-blue-400' },
  { icon: Zap, text: 'Tell me about the AI features', color: 'text-amber-400' },
  { icon: Lightbulb, text: 'How do I sell beats?', color: 'text-green-400' },
];

const WELCOME = "Hey there! I'm Max, your AI assistant — built entirely in-house by the B-Lawz Music team. Ask me anything about Max Booster: the Studio, distribution, social media, advertising, marketplace, analytics, and more. What do you want to know?";

async function fetchChat(message: string): Promise<string> {
  const csrfToken = getCsrfTokenFromCookie();
  const res = await fetch('/api/assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
    credentials: 'include',
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.content as string;
}

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
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: WELCOME,
        timestamp: new Date(),
      }]);
    }
  }, [isOpen, messages.length]);

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
      const content = await fetchChat(textToSend);
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content,
        timestamp: new Date(),
      }]);
    } catch {
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date(),
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  if (!isOpen) {
    return (
      <div className="fixed bottom-20 lg:bottom-6 right-4 sm:right-6 z-[45]">
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
      "fixed bottom-20 lg:bottom-6 right-2 sm:right-6 z-[45] transition-all duration-200",
      isMinimized ? "w-[calc(100vw-1rem)] sm:w-80" : "w-[calc(100vw-1rem)] sm:w-96"
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
                <div className="text-xs text-gray-400 font-normal">In-House AI Assistant</div>
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
                        "max-w-[80%] rounded-lg px-4 py-2 whitespace-pre-wrap text-sm",
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
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-2 text-xs text-gray-500 text-center">
                In-house AI • Sign in to save your conversation
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
