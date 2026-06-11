import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Send,
  Lightbulb,
  Music,
  TrendingUp,
  Zap,
  Trash2,
  ChevronUp,
  Loader2,
  Bot,
  RotateCcw,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  quickActions?: { label: string; prompt: string }[];
  proactiveSuggestions?: string[];
}

interface ApiMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

const QUICK_SUGGESTIONS = [
  {
    icon: Music,
    text: "How do I use the DAW studio?",
    color: "text-purple-400",
  },
  {
    icon: TrendingUp,
    text: "How does music distribution work?",
    color: "text-blue-400",
  },
  {
    icon: Zap,
    text: "Tell me about the AI autopilot system",
    color: "text-amber-400",
  },
  {
    icon: Lightbulb,
    text: "How do I monetize my music?",
    color: "text-green-400",
  },
  {
    icon: Sparkles,
    text: "What can Max Booster do for my career?",
    color: "text-cyan-400",
  },
  {
    icon: TrendingUp,
    text: "How does the beat marketplace work?",
    color: "text-rose-400",
  },
];


function welcomeMessage(username?: string): Message {
  return {
    id: "welcome",
    role: "assistant",
    content: username
      ? `Hey ${username}! I'm Max — your in-house AI assistant, built by the B-Lawz Music team. I remember our full conversation history across every session. Ask me anything about Max Booster — Studio, distribution, royalties, marketplace, social media, advertising, analytics, and more. What can I help you with today?`
      : "Hey there! I'm Max, your in-house AI assistant. Ask me anything about Max Booster — Studio, distribution, royalties, marketplace, social media, advertising, and more. What do you want to know?",
    timestamp: new Date(),
  };
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function Assistant() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalMessages, setTotalMessages] = useState(0);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldScrollToBottom = useRef(true);

  const mapRow = (m: ApiMessage): Message => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    timestamp: new Date(m.createdAt),
  });

  const loadHistory = useCallback(async () => {
    if (historyLoaded) return;
    setHistoryLoaded(true);
    if (!user) {
      setMessages([welcomeMessage()]);
      return;
    }
    try {
      shouldScrollToBottom.current = true;
      const data = await apiFetch("/api/assistant/history");
      const prior: Message[] = (data.messages || []).map(mapRow);
      setHasMore(data.hasMore ?? false);
      setTotalMessages(data.total ?? prior.length);
      setMessages(
        prior.length === 0
          ? [welcomeMessage(user.username ?? undefined)]
          : prior,
      );
    } catch {
      setMessages([welcomeMessage(user.username ?? undefined)]);
    }
  }, [user, historyLoaded]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (shouldScrollToBottom.current && bottomAnchorRef.current) {
      bottomAnchorRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping]);

  const loadOlderMessages = async () => {
    if (isLoadingOlder || !hasMore) return;
    const real = messages.filter((m) => m.id !== "welcome");
    if (real.length === 0) return;
    const oldestId = real[0].id;
    const scrollEl = scrollRef.current;
    const heightBefore = scrollEl?.scrollHeight ?? 0;
    setIsLoadingOlder(true);
    shouldScrollToBottom.current = false;
    try {
      const data = await apiFetch(
        `/api/assistant/history?before=${encodeURIComponent(oldestId)}`,
      );
      const older: Message[] = (data.messages || []).map(mapRow);
      if (older.length > 0) {
        setHasMore(data.hasMore ?? false);
        setMessages((prev) => [...older, ...prev]);
        requestAnimationFrame(() => {
          if (scrollEl)
            scrollEl.scrollTop = scrollEl.scrollHeight - heightBefore;
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

  const sendMessage = async (text?: string) => {
    const textToSend = (text ?? inputValue).trim();
    if (!textToSend || isTyping) return;

    const optimistic: Message = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      content: textToSend,
      timestamp: new Date(),
    };

    shouldScrollToBottom.current = true;
    setMessages((prev) => [...prev, optimistic]);
    setInputValue("");
    setIsTyping(true);

    try {
      const data = await apiFetch("/api/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ message: textToSend }),
      });

      const userMsg: Message = {
        id: data.messageId ?? optimistic.id,
        role: "user",
        content: textToSend,
        timestamp: optimistic.timestamp,
      };
      const aiMsg: Message = {
        id: data.assistantMessageId ?? `ai-${Date.now()}`,
        role: "assistant",
        content: data.content,
        timestamp: new Date(),
        quickActions: data.quickActions,
        proactiveSuggestions: data.proactiveSuggestions,
      };
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimistic.id),
        userMsg,
        aiMsg,
      ]);
      setTotalMessages((t) => t + 2);
    } catch {
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimistic.id),
        optimistic,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content:
            "I'm having trouble connecting right now. Please check your connection and try again.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsTyping(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const clearHistory = async () => {
    if (!user) {
      setMessages([welcomeMessage()]);
      setHasMore(false);
      setTotalMessages(0);
      return;
    }
    try {
      await apiFetch("/api/assistant/history", { method: "DELETE" });
    } catch {
      /* ignore */
    }
    setHistoryLoaded(false);
    setHasMore(false);
    setTotalMessages(0);
    setMessages([welcomeMessage(user.username ?? undefined)]);
  };

  const nonWelcomeCount = messages.filter((m) => m.id !== "welcome").length;
  const showSuggestions = nonWelcomeCount === 0 && !isTyping;

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)] max-w-4xl mx-auto w-full px-4 py-4 gap-0">
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white flex items-center gap-2">
                Max
                <Badge
                  variant="outline"
                  className="text-xs border-cyan-500/40 text-cyan-400 font-normal"
                >
                  In-House AI
                </Badge>
              </h1>
              <p className="text-xs text-gray-400">
                {user
                  ? totalMessages > 0
                    ? `${totalMessages.toLocaleString()} messages · Full history saved`
                    : "Full history saved across sessions"
                  : "Sign in to save your conversation history"}
              </p>
            </div>
          </div>

          {user && nonWelcomeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-400 hover:text-red-400 gap-1.5 text-xs"
              onClick={clearHistory}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear history
            </Button>
          )}
        </div>

        {/* ── Message area ── */}
        <div className="flex-1 min-h-0 rounded-xl border border-gray-700/50 bg-[#141414] overflow-hidden flex flex-col">
          <ScrollArea ref={scrollRef} className="flex-1 p-4">
            <div className="space-y-4 pb-2">
              {hasMore && (
                <div className="flex justify-center">
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

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    message.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  {message.role === "assistant" && (
                    <div className="h-7 w-7 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                      <Sparkles className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                  <div className="flex flex-col gap-2 max-w-[75%]">
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed",
                        message.role === "user"
                          ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-tr-sm"
                          : "bg-[#1e1e1e] text-gray-100 border border-gray-700/60 rounded-tl-sm",
                      )}
                    >
                      {message.content}
                    </div>

                    {message.role === "assistant" &&
                      message.quickActions &&
                      message.quickActions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 ml-1">
                          {message.quickActions.map((action, i) => (
                            <Button
                              key={i}
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 border-gray-700 hover:border-cyan-500/50 hover:bg-cyan-500/10 text-gray-300"
                              onClick={() => sendMessage(action.prompt)}
                            >
                              {action.label}
                            </Button>
                          ))}
                        </div>
                      )}

                    {message.role === "assistant" &&
                      message.proactiveSuggestions &&
                      message.proactiveSuggestions.length > 0 && (
                        <div className="flex flex-col gap-1 ml-1">
                          {message.proactiveSuggestions
                            .slice(0, 2)
                            .map((s, i) => (
                              <button
                                key={i}
                                className="text-left text-xs text-cyan-400/80 hover:text-cyan-300 flex items-center gap-1"
                                onClick={() => sendMessage(s)}
                              >
                                <RotateCcw className="h-3 w-3 flex-shrink-0" />
                                {s}
                              </button>
                            ))}
                        </div>
                      )}
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex justify-start">
                  <div className="h-7 w-7 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center mr-2 flex-shrink-0">
                    <Sparkles className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="bg-[#1e1e1e] border border-gray-700/60 rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex space-x-1.5">
                      <div
                        className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <div
                        className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <div
                        className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {showSuggestions && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-6">
                  {QUICK_SUGGESTIONS.map((s, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      className="justify-start text-left h-auto py-3 px-4 border-gray-700 hover:border-cyan-500/50 hover:bg-cyan-500/10 gap-3"
                      onClick={() => sendMessage(s.text)}
                    >
                      <s.icon
                        className={cn("h-4 w-4 flex-shrink-0", s.color)}
                      />
                      <span className="text-sm text-gray-300">{s.text}</span>
                    </Button>
                  ))}
                </div>
              )}

              <div ref={bottomAnchorRef} />
            </div>
          </ScrollArea>

          {/* ── Input ── */}
          <div className="border-t border-gray-700/50 p-4 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Ask Max anything about your music career…"
                className="flex-1 bg-[#1e1e1e] border-gray-700 text-white placeholder:text-gray-500 focus:border-cyan-500/50"
                disabled={isTyping}
              />
              <Button
                onClick={() => sendMessage()}
                disabled={!inputValue.trim() || isTyping}
                className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 px-4"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
