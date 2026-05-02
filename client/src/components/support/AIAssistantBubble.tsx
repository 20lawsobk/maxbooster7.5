import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sparkles, X, Send, Lightbulb, Music, TrendingUp, Zap,
  Minimize2, Maximize2, Trash2, ChevronUp, Loader2,
} from 'lucide-react';
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
    ? `Hey ${username}! I'm Max — built in-house by the B-Lawz Music team. I remember our full conversation history across every session, so feel free to ask follow-up questions anytime. What can I help you with today?`
    : "Hey there! I'm Max, your in-house AI assistant. Ask me anything about Max Booster — Studio, distribution, royalties, marketplace, social media, advertising, and more. What do you want to know?",
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
  const [hasMore, setHasMore] = useState(false);
  const [totalMessages, setTotalMessages] = useState(0);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const shouldScrollToBottom = useRef(true);

  // Scroll to bottom when new messages arrive (but not when loading older)
  useEffect(() => {
    if (shouldScrollToBottom.current && bottomAnchorRef.current) {
      bottomAnchorRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping]);

  const mapRow = (m: Record<string, unknown>): Message => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    timestamp: new Date(m.createdAt),
  });

  const loadHistory = useCallback(async () => {
    if (historyLoaded) return;
    setHistoryLoaded(true);

    if (!user) {
      setMessages([WELCOME_MESSAGE()]);
      return;
    }

    try {
      shouldScrollToBottom.current = true;
      const data = await apiFetch('/api/assistant/history');
      const prior: Message[] = (data.messages || []).map(mapRow);
      setHasMore(data.hasMore ?? false);
      setTotalMessages(data.total ?? prior.length);

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
    if (isOpen) loadHistory();
  }, [isOpen, loadHistory]);

  const loadOlderMessages = async () => {
    if (isLoadingOlder || !hasMore) return;

    // Find the oldest message ID as the cursor
    const currentMessages = messages.filter((m) => m.id !== 'welcome');
    if (currentMessages.length === 0) return;
    const oldestId = currentMessages[0].id;

    // Capture current scroll height so we can restore position after prepending
    const scrollEl = scrollRef.current;
    const scrollHeightBefore = scrollEl?.scrollHeight ?? 0;

    setIsLoadingOlder(true);
    shouldScrollToBottom.current = false;

    try {
      const data = await apiFetch(`/api/assistant/history?before=${encodeURIComponent(oldestId)}`);
      const older: Message[] = (data.messages || []).map(mapRow);

      if (older.length > 0) {
        setHasMore(data.hasMore ?? false);
        setMessages((prev) => [...older, ...prev]);

        // After React renders the prepended messages, restore scroll position
        requestAnimationFrame(() => {
          if (scrollEl) {
            const newScrollHeight = scrollEl.scrollHeight;
            scrollEl.scrollTop = newScrollHeight - scrollHeightBefore;
          }
          shouldScrollToBottom.current = true;
        });
      } else {
        setHasMore(false);
        shouldScrollToBottom.current = true;
      }
    } catch {
      shouldScrollToBottom.current = true;
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const handleSendMessage = async (messageText?: string) => {
    const textToSend = (messageText || inputValue).trim();
    if (!textToSend || isTyping) return;

    const optimisticUser: Message = {
      id: `optimistic-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date(),
    };

    shouldScrollToBottom.current = true;
    setMessages((prev) => [...prev, optimisticUser]);
    setInputValue('');
    setIsTyping(true);

    try {
      const data = await apiFetch('/api/assistant/chat', {
        method: 'POST',
        body: JSON.stringify({ message: textToSend }),
      });

      // Replace the optimistic message with the server-persisted one (has real ID)
      const realUserMessage: Message = {
        id: data.messageId || optimisticUser.id,
        role: 'user',
        content: textToSend,
        timestamp: optimisticUser.timestamp,
      };

      const aiMessage: Message = {
        id: data.assistantMessageId || `ai-${Date.now()}`,
        role: 'assistant',
        content: data.content,
        timestamp: new Date(),
      };

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticUser.id),
        realUserMessage,
        aiMessage,
      ]);
      setTotalMessages((t) => t + 2);
    } catch {
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticUser.id),
        optimisticUser,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: "I'm having trouble connecting right now. Please check your connection and try again.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleClearHistory = async () => {
    if (!user) {
      setMessages([WELCOME_MESSAGE()]);
      setHasMore(false);
      setTotalMessages(0);
      return;
    }
    try {
      await apiFetch('/api/assistant/history', { method: 'DELETE' });
    } catch {
      // ignore
    }
    setHistoryLoaded(false);
    setHasMore(false);
    setTotalMessages(0);
    setMessages([WELCOME_MESSAGE(user.username ?? undefined)]);
  };

  const handleOpen = () => {
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
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

  const nonWelcomeCount = messages.filter((m) => m.id !== 'welcome').length;
  const showSuggestions = nonWelcomeCount === 0 && !isTyping;

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
                <div className="text-xs text-gray-400 font-normal">
                  In-House AI
                  {user && totalMessages > 0 && (
                    <span className="ml-1 text-cyan-400/70">
                      · {totalMessages.toLocaleString()} msg{totalMessages !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            </CardTitle>
            <div className="flex items-center gap-1">
              {user && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-gray-400 hover:text-red-400"
                  onClick={handleClearHistory}
                  title="Clear all conversation history"
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

                {/* ── Load older messages button ── */}
                {hasMore && (
                  <div className="flex justify-center pb-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 gap-1.5"
                      onClick={loadOlderMessages}
                      disabled={isLoadingOlder}
                    >
                      {isLoadingOlder ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Loading earlier messages…
                        </>
                      ) : (
                        <>
                          <ChevronUp className="h-3 w-3" />
                          Load earlier messages
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {/* ── Message list ── */}
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

                {/* ── Typing indicator ── */}
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

                {/* ── Quick suggestions (only on empty chat) ── */}
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

                {/* Invisible anchor so we can scroll to bottom */}
                <div ref={bottomAnchorRef} />
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
                  placeholder="Ask me anything…"
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
                {user
                  ? 'Infinite history saved · All messages persisted'
                  : 'In-house AI · Sign in to save your conversation'}
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
