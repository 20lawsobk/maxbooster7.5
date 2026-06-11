import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Plus, Send, Trash2, Check, CheckCheck, Reply, Pin, PinOff, MoreHorizontal, Clock, Play, AlertCircle, Lightbulb, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface TimelineComment {
  id: string;
  content: string;
  timeStart: number;
  timeEnd?: number;
  trackId?: string;
  trackName?: string;
  author: {
    id: string;
    name: string;
    avatar?: string;
    color: string;
  };
  type: "note" | "suggestion" | "issue" | "question";
  isPinned: boolean;
  isResolved: boolean;
  createdAt: Date;
  updatedAt: Date;
  replies: CommentReply[];
}

interface CommentReply {
  id: string;
  content: string;
  author: {
    id: string;
    name: string;
    avatar?: string;
    color: string;
  };
  createdAt: Date;
}

interface FlowStateCommentsProps {
  currentTime?: number;
  projectDuration?: number;
  tracks?: Array<{ id: string; name: string }>;
  onSeekToTime?: (time: number) => void;
  currentUserId?: string;
  className?: string;
}

const COMMENT_TYPES = [
  { value: "note", label: "Note", icon: MessageSquare, color: "text-blue-400" },
  {
    value: "suggestion",
    label: "Suggestion",
    icon: Lightbulb,
    color: "text-yellow-400",
  },
  { value: "issue", label: "Issue", icon: AlertCircle, color: "text-red-400" },
  {
    value: "question",
    label: "Question",
    icon: HelpCircle,
    color: "text-purple-400",
  },
];

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
};

export function FlowStateComments({
  currentTime = 0,
  projectDuration = 210,
  tracks = [
    { id: "track-1", name: "Lead Vocals" },
    { id: "track-2", name: "Drums" },
    { id: "track-3", name: "Bass" },
    { id: "track-4", name: "Keys" },
  ],
  onSeekToTime,
  currentUserId = "user-1",
  className,
}: FlowStateCommentsProps) {
  const { toast } = useToast();
  const [comments, setComments] = useState<TimelineComment[]>([
    {
      id: "c1",
      content: "The vocal needs more presence here. Try boosting around 3kHz.",
      timeStart: 32.5,
      timeEnd: 38.2,
      trackId: "track-1",
      trackName: "Lead Vocals",
      author: { id: "user-2", name: "Alex Producer", color: "#f97316" },
      type: "suggestion",
      isPinned: true,
      isResolved: false,
      createdAt: new Date(Date.now() - 3600000),
      updatedAt: new Date(Date.now() - 3600000),
      replies: [
        {
          id: "r1",
          content: "Good point! I'll try a 2dB boost with a narrow Q.",
          author: { id: "user-1", name: "You", color: "#3b82f6" },
          createdAt: new Date(Date.now() - 1800000),
        },
      ],
    },
    {
      id: "c2",
      content: "Kick drum is clashing with the bass. Consider sidechaining.",
      timeStart: 45.0,
      trackId: "track-2",
      trackName: "Drums",
      author: { id: "user-3", name: "Sam Mixer", color: "#22c55e" },
      type: "issue",
      isPinned: false,
      isResolved: true,
      createdAt: new Date(Date.now() - 7200000),
      updatedAt: new Date(Date.now() - 3600000),
      replies: [],
    },
    {
      id: "c3",
      content: "Love this section! The arrangement really builds nicely.",
      timeStart: 65.0,
      timeEnd: 80.0,
      author: { id: "user-2", name: "Alex Producer", color: "#f97316" },
      type: "note",
      isPinned: false,
      isResolved: false,
      createdAt: new Date(Date.now() - 86400000),
      updatedAt: new Date(Date.now() - 86400000),
      replies: [],
    },
    {
      id: "c4",
      content: "Should we add a break here or keep the energy going?",
      timeStart: 120.0,
      author: { id: "user-1", name: "You", color: "#3b82f6" },
      type: "question",
      isPinned: false,
      isResolved: false,
      createdAt: new Date(Date.now() - 1800000),
      updatedAt: new Date(Date.now() - 1800000),
      replies: [],
    },
  ]);

  const [isAddingComment, setIsAddingComment] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [newCommentType, setNewCommentType] =
    useState<TimelineComment["type"]>("note");
  const [newCommentTrack, setNewCommentTrack] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterResolved, setFilterResolved] = useState<string>("all");
  const [selectedComment, setSelectedComment] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [showReplyFor, setShowReplyFor] = useState<string | null>(null);

  const filteredComments = useMemo(() => {
    return comments
      .filter((c) => {
        if (filterType !== "all" && c.type !== filterType) return false;
        if (filterResolved === "resolved" && !c.isResolved) return false;
        if (filterResolved === "unresolved" && c.isResolved) return false;
        return true;
      })
      .sort((a, b) => a.timeStart - b.timeStart);
  }, [comments, filterType, filterResolved]);

  const addComment = () => {
    if (!newComment.trim()) return;

    const comment: TimelineComment = {
      id: `c${Date.now()}`,
      content: newComment,
      timeStart: currentTime,
      trackId: newCommentTrack || undefined,
      trackName: tracks.find((t) => t.id === newCommentTrack)?.name,
      author: { id: currentUserId, name: "You", color: "#3b82f6" },
      type: newCommentType,
      isPinned: false,
      isResolved: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      replies: [],
    };

    setComments((prev) => [...prev, comment]);
    setNewComment("");
    setIsAddingComment(false);
    toast({
      title: "Comment added",
      description: `At ${formatTime(currentTime)}`,
    });
  };

  const addReply = (commentId: string) => {
    if (!replyContent.trim()) return;

    const reply: CommentReply = {
      id: `r${Date.now()}`,
      content: replyContent,
      author: { id: currentUserId, name: "You", color: "#3b82f6" },
      createdAt: new Date(),
    };

    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, replies: [...c.replies, reply], updatedAt: new Date() }
          : c,
      ),
    );

    setReplyContent("");
    setShowReplyFor(null);
    toast({ title: "Reply added" });
  };

  const toggleResolved = (commentId: string) => {
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, isResolved: !c.isResolved, updatedAt: new Date() }
          : c,
      ),
    );
  };

  const togglePinned = (commentId: string) => {
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId ? { ...c, isPinned: !c.isPinned } : c,
      ),
    );
  };

  const deleteComment = (commentId: string) => {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    toast({ title: "Comment deleted" });
  };

  const getTypeIcon = (type: TimelineComment["type"]) => {
    const config = COMMENT_TYPES.find((t) => t.value === type)!;
    const Icon = config.icon;
    return <Icon className={cn("w-4 h-4", config.color)} />;
  };

  const formatTimeAgo = (date: Date): string => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const unresolvedCount = comments.filter((c) => !c.isResolved).length;
  const pinnedComments = filteredComments.filter((c) => c.isPinned);
  const unpinnedComments = filteredComments.filter((c) => !c.isPinned);

  return (
    <div
      className={cn("flex flex-col h-full bg-zinc-950 text-white", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-sky-500/20 to-blue-500/20 rounded-lg">
            <MessageSquare className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h2 className="font-semibold">Timeline Comments</h2>
            <p className="text-xs text-zinc-500">
              {comments.length} comments • {unresolvedCount} unresolved
            </p>
          </div>
        </div>
        <Button
          onClick={() => setIsAddingComment(true)}
          className="bg-sky-500 hover:bg-sky-600"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add at {formatTime(currentTime)}
        </Button>
      </div>

      {/* Timeline Visualization */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="relative h-12 bg-zinc-900 rounded-lg overflow-hidden">
          {/* Track lanes hint */}
          <div className="absolute inset-0 flex flex-col">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex-1 border-b border-zinc-800 last:border-b-0"
              />
            ))}
          </div>

          {/* Comment markers */}
          {comments.map((comment) => {
            const left = (comment.timeStart / projectDuration) * 100;
            const width = comment.timeEnd
              ? ((comment.timeEnd - comment.timeStart) / projectDuration) * 100
              : 1;

            return (
              <div
                key={comment.id}
                className={cn(
                  "absolute top-0 bottom-0 cursor-pointer transition-opacity hover:opacity-100",
                  comment.isResolved ? "opacity-30" : "opacity-80",
                  selectedComment === comment.id && "ring-2 ring-white",
                )}
                style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                onClick={() => {
                  setSelectedComment(comment.id);
                  onSeekToTime?.(comment.timeStart);
                }}
              >
                <div
                  className={cn(
                    "h-full rounded-sm",
                    comment.type === "note" && "bg-blue-500/50",
                    comment.type === "suggestion" && "bg-yellow-500/50",
                    comment.type === "issue" && "bg-red-500/50",
                    comment.type === "question" && "bg-purple-500/50",
                  )}
                />
              </div>
            );
          })}

          {/* Current time indicator */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white z-10"
            style={{ left: `${(currentTime / projectDuration) * 100}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs text-zinc-500">
          <span>0:00</span>
          <span>{formatTime(projectDuration)}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-32 h-8 bg-zinc-900 border-zinc-700 text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {COMMENT_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterResolved} onValueChange={setFilterResolved}>
          <SelectTrigger className="w-32 h-8 bg-zinc-900 border-zinc-700 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="unresolved">Unresolved</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-zinc-500 ml-auto">
          Showing {filteredComments.length} of {comments.length}
        </span>
      </div>

      {/* Comments List */}
      <div className="flex-1 overflow-auto p-4">
        {filteredComments.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500">
            <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">No Comments</p>
            <p className="text-sm mt-1">
              Add a comment at the current time position
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Pinned comments first */}
            {pinnedComments.length > 0 && (
              <>
                <h4 className="text-xs text-zinc-500 uppercase tracking-wide flex items-center gap-1">
                  <Pin className="w-3 h-3" /> Pinned
                </h4>
                {pinnedComments.map((comment) => (
                  <CommentCard
                    key={comment.id}
                    comment={comment}
                    isSelected={selectedComment === comment.id}
                    onSelect={() => setSelectedComment(comment.id)}
                    onSeek={() => onSeekToTime?.(comment.timeStart)}
                    onToggleResolved={() => toggleResolved(comment.id)}
                    onTogglePinned={() => togglePinned(comment.id)}
                    onDelete={() => deleteComment(comment.id)}
                    onReply={() => setShowReplyFor(comment.id)}
                    showReplyFor={showReplyFor}
                    replyContent={replyContent}
                    setReplyContent={setReplyContent}
                    onSubmitReply={() => addReply(comment.id)}
                    getTypeIcon={getTypeIcon}
                    formatTimeAgo={formatTimeAgo}
                  />
                ))}
                <h4 className="text-xs text-zinc-500 uppercase tracking-wide mt-4">
                  All Comments
                </h4>
              </>
            )}
            {unpinnedComments.map((comment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                isSelected={selectedComment === comment.id}
                onSelect={() => setSelectedComment(comment.id)}
                onSeek={() => onSeekToTime?.(comment.timeStart)}
                onToggleResolved={() => toggleResolved(comment.id)}
                onTogglePinned={() => togglePinned(comment.id)}
                onDelete={() => deleteComment(comment.id)}
                onReply={() => setShowReplyFor(comment.id)}
                showReplyFor={showReplyFor}
                replyContent={replyContent}
                setReplyContent={setReplyContent}
                onSubmitReply={() => addReply(comment.id)}
                getTypeIcon={getTypeIcon}
                formatTimeAgo={formatTimeAgo}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Comment Panel */}
      <AnimatePresence>
        {isAddingComment && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-zinc-800 overflow-hidden"
          >
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Badge variant="secondary">
                  <Clock className="w-3 h-3 mr-1" />
                  {formatTime(currentTime)}
                </Badge>
                <Select
                  value={newCommentType}
                  onValueChange={(v) =>
                    setNewCommentType(v as TimelineComment["type"])
                  }
                >
                  <SelectTrigger className="w-32 h-8 bg-zinc-900 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={newCommentTrack || "none"}
                  onValueChange={(v) =>
                    setNewCommentTrack(v === "none" ? null : v)
                  }
                >
                  <SelectTrigger className="w-40 h-8 bg-zinc-900 border-zinc-700">
                    <SelectValue placeholder="Select track" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No specific track</SelectItem>
                    {tracks.map((track) => (
                      <SelectItem key={track.id} value={track.id}>
                        {track.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                placeholder="Write your comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="bg-zinc-900 border-zinc-700 min-h-[80px]"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsAddingComment(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-sky-500 hover:bg-sky-600"
                  onClick={addComment}
                  disabled={!newComment.trim()}
                >
                  <Send className="w-4 h-4 mr-1" />
                  Add Comment
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface CommentCardProps {
  comment: TimelineComment;
  isSelected: boolean;
  onSelect: () => void;
  onSeek: () => void;
  onToggleResolved: () => void;
  onTogglePinned: () => void;
  onDelete: () => void;
  onReply: () => void;
  showReplyFor: string | null;
  replyContent: string;
  setReplyContent: (content: string) => void;
  onSubmitReply: () => void;
  getTypeIcon: (type: TimelineComment["type"]) => React.ReactNode;
  formatTimeAgo: (date: Date) => string;
}

function CommentCard({
  comment,
  isSelected,
  onSelect,
  onSeek,
  onToggleResolved,
  onTogglePinned,
  onDelete,
  onReply,
  showReplyFor,
  replyContent,
  setReplyContent,
  onSubmitReply,
  getTypeIcon,
  formatTimeAgo,
}: CommentCardProps) {
  return (
    <Card
      className={cn(
        "bg-zinc-900 border-zinc-800 transition-all",
        isSelected && "border-sky-500/50",
        comment.isResolved && "opacity-60",
      )}
      onClick={onSelect}
    >
      <div className="p-3">
        <div className="flex items-start gap-3">
          <Avatar className="w-8 h-8">
            <AvatarImage src={comment.author.avatar} />
            <AvatarFallback style={{ backgroundColor: comment.author.color }}>
              {comment.author.name.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{comment.author.name}</span>
              {getTypeIcon(comment.type)}
              <Button
                size="sm"
                variant="ghost"
                className="h-5 px-1 text-xs text-sky-400 hover:text-sky-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek();
                }}
              >
                <Play className="w-3 h-3 mr-1" />
                {formatTime(comment.timeStart)}
                {comment.timeEnd && ` - ${formatTime(comment.timeEnd)}`}
              </Button>
              {comment.trackName && (
                <Badge variant="secondary" className="text-xs">
                  {comment.trackName}
                </Badge>
              )}
              <span className="text-xs text-zinc-500 ml-auto">
                {formatTimeAgo(comment.createdAt)}
              </span>
            </div>
            <p
              className={cn(
                "text-sm mt-1",
                comment.isResolved && "line-through text-zinc-500",
              )}
            >
              {comment.content}
            </p>

            {/* Replies */}
            {comment.replies.length > 0 && (
              <div className="mt-3 pl-4 border-l-2 border-zinc-700 space-y-2">
                {comment.replies.map((reply) => (
                  <div key={reply.id} className="flex items-start gap-2">
                    <Avatar className="w-6 h-6">
                      <AvatarFallback
                        style={{ backgroundColor: reply.author.color }}
                      >
                        {reply.author.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">
                          {reply.author.name}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {formatTimeAgo(reply.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300">{reply.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Reply input */}
            {showReplyFor === comment.id && (
              <div className="mt-3 flex gap-2">
                <Input
                  placeholder="Write a reply..."
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-sm h-8"
                  onClick={(e) => e.stopPropagation()}
                />
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSubmitReply();
                  }}
                  disabled={!replyContent.trim()}
                >
                  <Send className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>

          {/* Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onReply}>
                <Reply className="w-4 h-4 mr-2" />
                Reply
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleResolved}>
                {comment.isResolved ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Mark Unresolved
                  </>
                ) : (
                  <>
                    <CheckCheck className="w-4 h-4 mr-2" />
                    Mark Resolved
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onTogglePinned}>
                {comment.isPinned ? (
                  <>
                    <PinOff className="w-4 h-4 mr-2" />
                    Unpin
                  </>
                ) : (
                  <>
                    <Pin className="w-4 h-4 mr-2" />
                    Pin
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-red-400">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}

export default FlowStateComments;
