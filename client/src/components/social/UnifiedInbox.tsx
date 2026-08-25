// @ts-nocheck
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Inbox, Send, Archive, Clock, CheckCircle, MoreHorizontal, Search, User, Users, MessageSquare, AlertTriangle, Smile, Meh, Frown, Trash2, Eye, Tag, RefreshCw } from "lucide-react";
import {
  FacebookIcon,
  InstagramIcon,
  YouTubeIcon,
  TikTokIcon,
  LinkedInIcon,
  TwitterIcon,
} from "@/components/ui/brand-icons";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Message {
  id: string;
  platform:
    | "twitter"
    | "instagram"
    | "facebook"
    | "tiktok"
    | "youtube"
    | "linkedin";
  type: "comment" | "mention" | "dm" | "reply";
  content: string;
  author: {
    id: string;
    name: string;
    username: string;
    avatar?: string;
    followers?: number;
    verified?: boolean;
  };
  postContent?: string;
  postUrl?: string;
  replyContent?: string | null;
  replyDelivered?: boolean | null;
  sentiment: "positive" | "neutral" | "negative";
  priority: "high" | "medium" | "low";
  status: "unread" | "read" | "replied" | "archived" | "snoozed";
  assignedTo?: string;
  tags: string[];
  threadId?: string;
  parentMessageId?: string;
  replies?: Message[];
  createdAt: string;
  readAt?: string;
  repliedAt?: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface ReplyTemplate {
  id: string;
  name: string;
  content: string;
  category: string;
}

const PLATFORM_CONFIG = {
  twitter: { icon: TwitterIcon, color: "#000000", name: "Twitter" },
  instagram: { icon: InstagramIcon, color: "#E4405F", name: "Instagram" },
  facebook: { icon: FacebookIcon, color: "#1877F2", name: "Facebook" },
  tiktok: { icon: TikTokIcon, color: "#000000", name: "TikTok" },
  youtube: { icon: YouTubeIcon, color: "#FF0000", name: "YouTube" },
  linkedin: { icon: LinkedInIcon, color: "#0077B5", name: "LinkedIn" },
};

const SENTIMENT_CONFIG = {
  positive: { icon: Smile, color: "text-green-500", bg: "bg-green-500/20" },
  neutral: { icon: Meh, color: "text-yellow-500", bg: "bg-yellow-500/20" },
  negative: { icon: Frown, color: "text-red-500", bg: "bg-red-500/20" },
};

const PRIORITY_CONFIG = {
  high: {
    color: "text-red-500",
    bg: "bg-red-500/20",
    border: "border-red-500",
  },
  medium: {
    color: "text-yellow-500",
    bg: "bg-yellow-500/20",
    border: "border-yellow-500",
  },
  low: {
    color: "text-gray-500",
    bg: "bg-gray-500/20",
    border: "border-gray-500",
  },
};

export function UnifiedInbox() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [selectedPriority, setSelectedPriority] = useState<string>("all");
  const [selectedSentiment, setSelectedSentiment] = useState<string>("all");
  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showSnoozeDialog, setShowSnoozeDialog] = useState(false);
  const [snoozeUntil, setSnoozeUntil] = useState("");

  const {
    data: messagesData,
    isError: messagesError,
    isFetching: messagesFetching,
    refetch: refetchMessages,
  } = useQuery({
    queryKey: ["/api/social/inbox"],
  });

  const { data: templatesData } = useQuery({
    queryKey: ["/api/social/inbox/templates"],
  });
  const templates: ReplyTemplate[] = templatesData?.templates || [];

  const { data: teamData } = useQuery({
    queryKey: ["/api/social/inbox/team"],
  });
  const teamEnabled = teamData?.enabled ?? false;
  const teamMembers: TeamMember[] = teamData?.members || [];

  const messages: Message[] = messagesData?.messages || [];

  const invalidateInbox = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/social/inbox"] });
  };

  const replyMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const res = await apiRequest("POST", `/api/social/inbox/${id}/reply`, {
        content,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: data?.outcome?.title || "Reply Saved",
        description:
          data?.outcome?.message ||
          "Your reply was saved but not automatically delivered.",
      });
      // Delivery isn't automated yet, so keep the composed text visible
      // (instead of clearing it) so the user can copy it and send it
      // manually on the platform.
      if (data?.delivered) {
        setReplyContent("");
      }
      setSelectedMessage((prev) =>
        prev
          ? {
              ...prev,
              replyContent: data?.replyContent ?? prev.replyContent,
              replyDelivered: !!data?.delivered,
            }
          : prev,
      );
      invalidateInbox();
    },
    onError: (error: any) => {
      toast({
        title: "Reply Failed",
        description: error?.userMessage || "Failed to send your reply.",
        variant: "destructive",
      });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({
      id,
      assigneeId,
      assigneeName,
    }: {
      id: string;
      assigneeId: string;
      assigneeName: string;
    }) => {
      const res = await apiRequest("POST", `/api/social/inbox/${id}/assign`, {
        assigneeId,
        assigneeName,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: data?.outcome?.title || "Message Assigned",
        description: data?.outcome?.message || "Message has been assigned.",
      });
      setShowAssignDialog(false);
      invalidateInbox();
    },
    onError: (error: any) => {
      toast({
        title: "Assignment Failed",
        description: error?.userMessage || "Failed to assign the message.",
        variant: "destructive",
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/social/inbox/${id}/archive`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Message Archived" });
      invalidateInbox();
    },
    onError: (error: any) => {
      toast({
        title: "Archive Failed",
        description: error?.userMessage || "Failed to archive the message.",
        variant: "destructive",
      });
    },
  });

  const bulkActionMutation = useMutation({
    mutationFn: async ({
      action,
      messageIds,
    }: {
      action: "archive" | "read" | "unread" | "delete";
      messageIds: string[];
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/social/inbox/bulk/${action}`,
        { messageIds },
      );
      return res.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Bulk Action Applied",
        description: `${variables.messageIds.length} messages ${
          variables.action === "archive"
            ? "archived"
            : variables.action === "read"
              ? "marked as read"
              : variables.action === "unread"
                ? "marked as unread"
                : "deleted"
        }`,
      });
      invalidateInbox();
    },
    onError: (error: any) => {
      toast({
        title: "Bulk Action Failed",
        description: error?.userMessage || "Failed to update messages.",
        variant: "destructive",
      });
    },
  });

  const filteredMessages = messages.filter((msg: Message) => {
    if (activeTab === "unread" && msg.status !== "unread") return false;
    if (activeTab === "starred" && !msg.tags.includes("starred")) return false;
    if (activeTab === "archived" && msg.status !== "archived") return false;
    if (activeTab === "snoozed" && msg.status !== "snoozed") return false;

    if (selectedPlatform !== "all" && msg.platform !== selectedPlatform)
      return false;
    if (selectedPriority !== "all" && msg.priority !== selectedPriority)
      return false;
    if (selectedSentiment !== "all" && msg.sentiment !== selectedSentiment)
      return false;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        msg.content.toLowerCase().includes(query) ||
        msg.author.name.toLowerCase().includes(query) ||
        msg.author.username.toLowerCase().includes(query)
      );
    }

    return true;
  });

  const stats = {
    unread: messages.filter((m: Message) => m.status === "unread").length,
    highPriority: messages.filter(
      (m: Message) => m.priority === "high" && m.status === "unread",
    ).length,
    negative: messages.filter(
      (m: Message) => m.sentiment === "negative" && m.status === "unread",
    ).length,
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedMessages(filteredMessages.map((m: Message) => m.id));
    } else {
      setSelectedMessages([]);
    }
  };

  const handleSelectMessage = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedMessages([...selectedMessages, id]);
    } else {
      setSelectedMessages(selectedMessages.filter((m) => m !== id));
    }
  };

  const handleBulkAction = (
    action: "archive" | "read" | "unread" | "delete",
  ) => {
    if (selectedMessages.length === 0) return;
    bulkActionMutation.mutate(
      { action, messageIds: selectedMessages },
      { onSuccess: () => setSelectedMessages([]) },
    );
  };

  const handleReply = () => {
    if (!replyContent.trim() || !selectedMessage) return;
    replyMutation.mutate({ id: selectedMessage.id, content: replyContent });
  };

  const handleTemplateSelect = (template: ReplyTemplate) => {
    setReplyContent(template.content);
    setShowTemplates(false);
  };

  const handleAssign = (teamMember: TeamMember) => {
    if (!selectedMessage) return;
    assignMutation.mutate({
      id: selectedMessage.id,
      assigneeId: teamMember.id,
      assigneeName: teamMember.name,
    });
  };

  // Snoozing is UI-only preference (no server-side reminder scheduling
  // exists for the inbox yet); be explicit about that rather than pretending
  // a reminder will fire.
  const handleSnooze = () => {
    toast({
      title: "Snooze Not Available",
      description:
        "Snooze reminders aren't wired up to a backend scheduler yet — archive or reply instead.",
      variant: "destructive",
    });
    setShowSnoozeDialog(false);
    setSnoozeUntil("");
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 1000 * 60) return "Just now";
    if (diff < 1000 * 60 * 60) return `${Math.floor(diff / (1000 * 60))}m ago`;
    if (diff < 1000 * 60 * 60 * 24)
      return `${Math.floor(diff / (1000 * 60 * 60))}h ago`;
    return format(date, "MMM d");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
            Unified Inbox
          </h2>
          <p className="text-muted-foreground mt-1">
            Manage all your social media conversations in one place
          </p>
        </div>
        <Button
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: ["/api/social/inbox"] })
          }
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {messagesError && (
        <Card className="border-red-500/40 bg-red-500/10">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
              <div>
                <p className="font-medium text-red-500">
                  Failed to load inbox messages
                </p>
                <p className="text-sm text-muted-foreground">
                  This is a loading error, not an empty inbox.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetchMessages()}
              disabled={messagesFetching}
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 ${messagesFetching ? "animate-spin" : ""}`}
              />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Inbox className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-500">
                  {stats.unread}
                </p>
                <p className="text-sm text-muted-foreground">Unread Messages</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-500">
                  {stats.highPriority}
                </p>
                <p className="text-sm text-muted-foreground">High Priority</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <Frown className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-500">
                  {stats.negative}
                </p>
                <p className="text-sm text-muted-foreground">
                  Negative Sentiment
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList>
                    <TabsTrigger value="all">
                      All
                      <Badge variant="secondary" className="ml-2">
                        {messages.length}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="unread">
                      Unread
                      <Badge variant="secondary" className="ml-2">
                        {stats.unread}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="starred">Starred</TabsTrigger>
                    <TabsTrigger value="archived">Archived</TabsTrigger>
                    <TabsTrigger value="snoozed">Snoozed</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="flex items-center gap-2 mt-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search messages..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <Select
                  value={selectedPlatform}
                  onValueChange={setSelectedPlatform}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Platform" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Platforms</SelectItem>
                    {Object.entries(PLATFORM_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        {config.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={selectedPriority}
                  onValueChange={setSelectedPriority}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priority</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={selectedSentiment}
                  onValueChange={setSelectedSentiment}
                >
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Sentiment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sentiment</SelectItem>
                    <SelectItem value="positive">Positive</SelectItem>
                    <SelectItem value="neutral">Neutral</SelectItem>
                    <SelectItem value="negative">Negative</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedMessages.length > 0 && (
                <div className="flex items-center gap-2 mt-3 p-2 bg-muted rounded-lg">
                  <span className="text-sm text-muted-foreground">
                    {selectedMessages.length} selected
                  </span>
                  <div className="flex-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleBulkAction("read")}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Mark Read
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleBulkAction("archive")}
                  >
                    <Archive className="w-4 h-4 mr-1" />
                    Archive
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleBulkAction("delete")}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              )}
            </CardHeader>

            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <div className="divide-y divide-border">
                  {filteredMessages.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <Inbox className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No messages found</p>
                    </div>
                  ) : (
                    filteredMessages.map((message: Message) => {
                      const PlatformIcon =
                        PLATFORM_CONFIG[message.platform].icon;
                      const SentimentIcon =
                        SENTIMENT_CONFIG[message.sentiment].icon;

                      return (
                        <div
                          key={message.id}
                          className={`p-4 hover:bg-muted/50 cursor-pointer transition-colors ${
                            message.status === "unread" ? "bg-primary/5" : ""
                          } ${selectedMessage?.id === message.id ? "bg-muted" : ""}`}
                          onClick={() => {
                            setSelectedMessage(message);
                            // Restore any previously saved (but undelivered)
                            // draft so the user's earlier reply text is
                            // never lost when reopening the message.
                            setReplyContent(message.replyContent || "");
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={selectedMessages.includes(message.id)}
                              onCheckedChange={(checked) =>
                                handleSelectMessage(
                                  message.id,
                                  checked as boolean,
                                )
                              }
                              onClick={(e) => e.stopPropagation()}
                            />

                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                              {message.author.avatar ? (
                                <img
                                  src={message.author.avatar}
                                  alt={`${message.author.name ?? "User"} avatar`}
                                  className="w-10 h-10 rounded-full"
                                />
                              ) : (
                                <User className="w-5 h-5 text-muted-foreground" />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span
                                  className={`font-medium ${message.status === "unread" ? "text-foreground" : "text-muted-foreground"}`}
                                >
                                  {message.author.name}
                                </span>
                                {message.author.verified && (
                                  <CheckCircle className="w-4 h-4 text-blue-500" />
                                )}
                                <span className="text-xs text-muted-foreground">
                                  @{message.author.username}
                                </span>
                                <div
                                  className="w-5 h-5 rounded flex items-center justify-center"
                                  style={{
                                    backgroundColor:
                                      PLATFORM_CONFIG[message.platform].color +
                                      "20",
                                  }}
                                >
                                  <PlatformIcon
                                    className="w-3 h-3"
                                    style={{
                                      color:
                                        PLATFORM_CONFIG[message.platform].color,
                                    }}
                                  />
                                </div>
                              </div>

                              <p
                                className={`text-sm mb-2 line-clamp-2 ${message.status === "unread" ? "text-foreground" : "text-muted-foreground"}`}
                              >
                                {message.content}
                              </p>

                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge
                                  variant="outline"
                                  className={`text-xs ${PRIORITY_CONFIG[message.priority].color}`}
                                >
                                  {message.priority}
                                </Badge>
                                <Badge
                                  className={`text-xs ${SENTIMENT_CONFIG[message.sentiment].bg} ${SENTIMENT_CONFIG[message.sentiment].color}`}
                                >
                                  <SentimentIcon className="w-3 h-3 mr-1" />
                                  {message.sentiment}
                                </Badge>
                                {message.tags.slice(0, 2).map((tag) => (
                                  <Badge
                                    key={tag}
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    {tag}
                                  </Badge>
                                ))}
                                {message.tags.length > 2 && (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    +{message.tags.length - 2}
                                  </Badge>
                                )}
                              </div>
                            </div>

                            <div className="text-right flex-shrink-0">
                              <p className="text-xs text-muted-foreground mb-2">
                                {formatTime(message.createdAt)}
                              </p>
                              {message.author.followers && (
                                <p className="text-xs text-muted-foreground">
                                  {message.author.followers.toLocaleString()}{" "}
                                  followers
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {selectedMessage ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                        {selectedMessage.author.avatar ? (
                          <img
                            src={selectedMessage.author.avatar}
                            alt={`${selectedMessage.author.name ?? "User"} avatar`}
                            className="w-12 h-12 rounded-full"
                          />
                        ) : (
                          <User className="w-6 h-6 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">
                            {selectedMessage.author.name}
                          </CardTitle>
                          {selectedMessage.author.verified && (
                            <CheckCircle className="w-4 h-4 text-blue-500" />
                          )}
                        </div>
                        <CardDescription>
                          @{selectedMessage.author.username}
                        </CardDescription>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setShowAssignDialog(true)}
                        >
                          <Users className="w-4 h-4 mr-2" />
                          Assign to Team Member
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setShowSnoozeDialog(true)}
                        >
                          <Clock className="w-4 h-4 mr-2" />
                          Snooze
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() =>
                            selectedMessage &&
                            archiveMutation.mutate(selectedMessage.id)
                          }
                        >
                          <Archive className="w-4 h-4 mr-2" />
                          Archive
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-500"
                          onClick={() =>
                            selectedMessage &&
                            bulkActionMutation.mutate(
                              {
                                action: "delete",
                                messageIds: [selectedMessage.id],
                              },
                              { onSuccess: () => setSelectedMessage(null) },
                            )
                          }
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm">{selectedMessage.content}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {format(
                        new Date(selectedMessage.createdAt),
                        "MMM d, yyyy h:mm a",
                      )}
                    </p>
                  </div>

                  {selectedMessage.postContent && (
                    <div className="p-4 border rounded-lg">
                      <p className="text-xs text-muted-foreground mb-2">
                        In reply to:
                      </p>
                      <p className="text-sm">{selectedMessage.postContent}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      className={`${SENTIMENT_CONFIG[selectedMessage.sentiment].bg} ${SENTIMENT_CONFIG[selectedMessage.sentiment].color}`}
                    >
                      Sentiment: {selectedMessage.sentiment}
                    </Badge>
                    <Badge
                      className={`${PRIORITY_CONFIG[selectedMessage.priority].bg} ${PRIORITY_CONFIG[selectedMessage.priority].color}`}
                    >
                      Priority: {selectedMessage.priority}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Quick Reply</label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowTemplates(!showTemplates)}
                      >
                        <MessageSquare className="w-4 h-4 mr-1" />
                        Templates
                      </Button>
                    </div>

                    {showTemplates && (
                      <div className="p-3 border rounded-lg space-y-2 bg-muted/50">
                        {templates.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-2">
                            No reply templates yet.
                          </p>
                        ) : (
                          templates.map((template) => (
                            <button
                              key={template.id}
                              type="button"
                              onClick={() => handleTemplateSelect(template)}
                              className="w-full text-left p-2 rounded hover:bg-muted transition-colors"
                            >
                              <p className="text-sm font-medium">
                                {template.name}
                              </p>
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {template.content}
                              </p>
                            </button>
                          ))
                        )}
                      </div>
                    )}

                    {selectedMessage?.replyContent &&
                      !selectedMessage?.replyDelivered && (
                        <div className="flex items-start gap-2 p-2 rounded border border-amber-500/40 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                          <span>
                            This reply was saved but not automatically sent —
                            automated delivery to {selectedMessage.platform}{" "}
                            isn't available yet. Copy the text below and send
                            it manually.
                          </span>
                        </div>
                      )}

                    <Textarea
                      placeholder="Type your reply..."
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      rows={3}
                    />

                    <Button
                      onClick={handleReply}
                      disabled={!replyContent.trim() || replyMutation.isPending}
                      className="w-full"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {replyMutation.isPending ? "Save Reply..." : "Save Reply"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="h-[400px] flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Select a message to view details</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign to Team Member</DialogTitle>
            <DialogDescription>
              Select a team member to assign this message to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {!teamEnabled ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Team collaboration is not available on this account yet.
              </p>
            ) : teamMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No team members available. Add team members in your workspace
                settings.
              </p>
            ) : (
              teamMembers.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => handleAssign(member)}
                  disabled={assignMutation.isPending}
                  className="w-full flex items-center gap-3 text-left p-2 rounded hover:bg-muted transition-colors"
                >
                  <User className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {member.email}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSnoozeDialog} onOpenChange={setShowSnoozeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Snooze Message</DialogTitle>
            <DialogDescription>
              Choose when you want to be reminded about this message.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => setSnoozeUntil("1 hour")}
              >
                <Clock className="w-4 h-4 mr-2" />1 Hour
              </Button>
              <Button
                variant="outline"
                onClick={() => setSnoozeUntil("3 hours")}
              >
                <Clock className="w-4 h-4 mr-2" />3 Hours
              </Button>
              <Button
                variant="outline"
                onClick={() => setSnoozeUntil("Tomorrow")}
              >
                <Clock className="w-4 h-4 mr-2" />
                Tomorrow
              </Button>
              <Button
                variant="outline"
                onClick={() => setSnoozeUntil("Next week")}
              >
                <Clock className="w-4 h-4 mr-2" />
                Next Week
              </Button>
            </div>
            <Input
              type="datetime-local"
              value={snoozeUntil}
              onChange={(e) => setSnoozeUntil(e.target.value)}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSnoozeDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSnooze} disabled={!snoozeUntil}>
              Snooze
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
