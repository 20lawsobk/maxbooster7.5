import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  Reply,
  Check,
  X,
  MoreHorizontal,
  AtSign,
  Send,
  ChevronDown,
  ChevronUp,
  Clock,
  Trash2,
  Edit2,
  Pin,
  Flag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export type CommentOutcomeType =
  | "comment_added"
  | "comment_replied"
  | "comment_resolved"
  | "mention_notification_sent"
  | "mention_resolved"
  | "thread_collapsed"
  | "thread_expanded";

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  mentions: string[];
  timestamp?: number;
  createdAt: Date;
  editedAt?: Date;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  isPinned?: boolean;
  replies: Comment[];
}

export interface MentionableUser {
  id: string;
  name: string;
  avatar?: string;
  email?: string;
}

interface CommentThreadProps {
  projectId: string;
  elementId?: string;
  comments: Comment[];
  currentUserId: string;
  mentionableUsers: MentionableUser[];
  onAddComment: (
    content: string,
    mentions: string[],
    parentId?: string,
  ) => Promise<void>;
  onResolve: (commentId: string) => Promise<void>;
  onDelete?: (commentId: string) => Promise<void>;
  onEdit?: (commentId: string, content: string) => Promise<void>;
  onPin?: (commentId: string, pinned: boolean) => Promise<void>;
  onOutcome?: (type: CommentOutcomeType, details?: Record<string, any>) => void;
  compact?: boolean;
  className?: string;
}

export function CommentThread({
  projectId,
  elementId,
  comments,
  currentUserId,
  mentionableUsers,
  onAddComment,
  onResolve,
  onDelete,
  onEdit,
  onPin,
  onOutcome,
  compact = false,
  className,
}: CommentThreadProps) {
  const { toast } = useToast();
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [collapsedThreads, setCollapsedThreads] = useState<Set<string>>(
    new Set(),
  );
  const [showMentionPopover, setShowMentionPopover] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [currentMentions, setCurrentMentions] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

  const handleAddComment = useCallback(
    async (parentId?: string) => {
      const content = parentId ? replyContent : newComment;
      if (!content.trim()) return;

      setIsSubmitting(true);
      try {
        await onAddComment(content, currentMentions, parentId);

        if (parentId) {
          setReplyContent("");
          setReplyingTo(null);
          onOutcome?.("comment_replied", { parentId });
        } else {
          setNewComment("");
          onOutcome?.("comment_added", { projectId, elementId });
        }

        if (currentMentions.length > 0) {
          onOutcome?.("mention_notification_sent", {
            mentions: currentMentions,
            count: currentMentions.length,
          });
          toast({
            title: "Mentions Sent",
            description: `${currentMentions.length} user(s) have been notified`,
          });
        }

        setCurrentMentions([]);
      } catch (error) {
        toast({
          title: "Failed to add comment",
          description: "Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      newComment,
      replyContent,
      currentMentions,
      onAddComment,
      onOutcome,
      projectId,
      elementId,
      toast,
    ],
  );

  const handleResolve = useCallback(
    async (commentId: string) => {
      try {
        await onResolve(commentId);
        toast({
          title: "Comment Resolved",
          description: (
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-400" />
              <span>Comment marked as resolved</span>
            </div>
          ),
        });
        onOutcome?.("comment_resolved", { commentId });
      } catch (error) {
        toast({
          title: "Failed to resolve",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    },
    [onResolve, onOutcome, toast],
  );

  const toggleThread = useCallback(
    (commentId: string) => {
      setCollapsedThreads((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(commentId)) {
          newSet.delete(commentId);
          onOutcome?.("thread_expanded", { commentId });
        } else {
          newSet.add(commentId);
          onOutcome?.("thread_collapsed", { commentId });
        }
        return newSet;
      });
    },
    [onOutcome],
  );

  const insertMention = useCallback(
    (user: MentionableUser) => {
      const textarea = replyingTo
        ? replyTextareaRef.current
        : textareaRef.current;
      const content = replyingTo ? replyContent : newComment;
      const setContent = replyingTo ? setReplyContent : setNewComment;

      const mentionIndex = content.lastIndexOf("@");
      if (mentionIndex !== -1) {
        const beforeMention = content.slice(0, mentionIndex);
        const newContent = `${beforeMention}@${user.name} `;
        setContent(newContent);
        setCurrentMentions((prev) => [...prev, user.id]);
      }

      setShowMentionPopover(false);
      setMentionFilter("");
      textarea?.focus();
    },
    [newComment, replyContent, replyingTo],
  );

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>, isReply: boolean) => {
      const value = e.target.value;
      if (isReply) {
        setReplyContent(value);
      } else {
        setNewComment(value);
      }

      const atIndex = value.lastIndexOf("@");
      if (atIndex !== -1 && (atIndex === 0 || value[atIndex - 1] === " ")) {
        const query = value.slice(atIndex + 1).split(" ")[0];
        setMentionFilter(query);
        setShowMentionPopover(true);
      } else {
        setShowMentionPopover(false);
      }
    },
    [],
  );

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  const renderComment = (comment: Comment, isReply = false) => {
    const isCollapsed = collapsedThreads.has(comment.id);
    const hasReplies = comment.replies.length > 0;
    const isOwn = comment.userId === currentUserId;

    return (
      <motion.div
        key={comment.id}
        layout
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "group",
          isReply && "ml-8 border-l-2 border-zinc-800 pl-4",
        )}
      >
        <div
          className={cn(
            "p-3 rounded-lg transition-colors",
            comment.resolved
              ? "bg-green-500/5 border border-green-500/20"
              : "bg-zinc-900",
            comment.isPinned && "ring-1 ring-amber-500/30",
          )}
        >
          <div className="flex items-start gap-3">
            <Avatar className="w-8 h-8">
              <AvatarImage src={comment.userAvatar} />
              <AvatarFallback className="text-xs">
                {(comment.userName || "?").charAt(0)}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {comment.userName}
                  </span>
                  {isOwn && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      You
                    </Badge>
                  )}
                  {comment.isPinned && (
                    <Pin className="w-3 h-3 text-amber-400" />
                  )}
                  {comment.resolved && (
                    <Badge className="bg-green-500/20 text-green-400 text-[10px]">
                      <Check className="w-3 h-3 mr-1" />
                      Resolved
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-xs text-zinc-500 mr-2">
                    {formatTime(comment.createdAt)}
                  </span>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="bg-zinc-900 border-zinc-800"
                    >
                      {!comment.resolved && (
                        <DropdownMenuItem
                          onClick={() => handleResolve(comment.id)}
                        >
                          <Check className="w-4 h-4 mr-2" />
                          Resolve
                        </DropdownMenuItem>
                      )}
                      {!isReply && (
                        <DropdownMenuItem
                          onClick={() => setReplyingTo(comment.id)}
                        >
                          <Reply className="w-4 h-4 mr-2" />
                          Reply
                        </DropdownMenuItem>
                      )}
                      {onPin && (
                        <DropdownMenuItem
                          onClick={() => onPin(comment.id, !comment.isPinned)}
                        >
                          <Pin className="w-4 h-4 mr-2" />
                          {comment.isPinned ? "Unpin" : "Pin"}
                        </DropdownMenuItem>
                      )}
                      {isOwn && onEdit && (
                        <DropdownMenuItem>
                          <Edit2 className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        <Flag className="w-4 h-4 mr-2" />
                        Report
                      </DropdownMenuItem>
                      {isOwn && onDelete && (
                        <DropdownMenuItem
                          className="text-red-400"
                          onClick={() => onDelete(comment.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <p className="text-sm text-zinc-300 mt-1 whitespace-pre-wrap">
                {comment.content.split(/(@\w+)/g).map((part, i) => {
                  if (part.startsWith("@")) {
                    return (
                      <span key={i} className="text-blue-400 font-medium">
                        {part}
                      </span>
                    );
                  }
                  return part;
                })}
              </p>

              {comment.timestamp !== undefined && (
                <div className="flex items-center gap-1 mt-2 text-xs text-zinc-500">
                  <Clock className="w-3 h-3" />
                  At {Math.floor(comment.timestamp / 60)}:
                  {String(comment.timestamp % 60).padStart(2, "0")}
                </div>
              )}

              {!isReply && !comment.resolved && (
                <div className="flex items-center gap-2 mt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setReplyingTo(comment.id)}
                  >
                    <Reply className="w-3 h-3 mr-1" />
                    Reply
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-green-400"
                    onClick={() => handleResolve(comment.id)}
                  >
                    <Check className="w-3 h-3 mr-1" />
                    Resolve
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {hasReplies && (
          <div className="mt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-zinc-500"
              onClick={() => toggleThread(comment.id)}
            >
              {isCollapsed ? (
                <>
                  <ChevronDown className="w-3 h-3 mr-1" />
                  Show {comment.replies.length} repl
                  {comment.replies.length > 1 ? "ies" : "y"}
                </>
              ) : (
                <>
                  <ChevronUp className="w-3 h-3 mr-1" />
                  Hide replies
                </>
              )}
            </Button>

            <AnimatePresence>
              {!isCollapsed && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 space-y-2"
                >
                  {comment.replies.map((reply) => renderComment(reply, true))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {replyingTo === comment.id && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 ml-8"
          >
            <div className="relative">
              <Textarea
                ref={replyTextareaRef}
                value={replyContent}
                onChange={(e) => handleTextChange(e, true)}
                placeholder="Write a reply... Use @ to mention"
                className="min-h-[60px] bg-zinc-900 border-zinc-700 text-sm resize-none pr-20"
              />
              <div className="absolute bottom-2 right-2 flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => {
                    setReplyingTo(null);
                    setReplyContent("");
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleAddComment(comment.id)}
                  disabled={!replyContent.trim() || isSubmitting}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>
    );
  };

  const filteredUsers = mentionableUsers.filter((user) =>
    user.name.toLowerCase().includes(mentionFilter.toLowerCase()),
  );

  const unresolvedCount = comments.filter((c) => !c.resolved).length;
  const resolvedCount = comments.filter((c) => c.resolved).length;

  return (
    <div
      className={cn("bg-zinc-950 rounded-lg border border-zinc-800", className)}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-medium">Comments</span>
          {unresolvedCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {unresolvedCount} open
            </Badge>
          )}
          {resolvedCount > 0 && (
            <Badge
              variant="outline"
              className="text-xs text-green-400 border-green-400/30"
            >
              {resolvedCount} resolved
            </Badge>
          )}
        </div>
      </div>

      <ScrollArea className={cn(compact ? "h-48" : "h-72")}>
        <div className="p-3 space-y-3">
          {comments.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No comments yet</p>
              <p className="text-xs">Be the first to add a comment</p>
            </div>
          ) : (
            comments
              .filter((c) => !c.resolved)
              .map((comment) => renderComment(comment))
          )}

          {resolvedCount > 0 && (
            <div className="pt-4 border-t border-zinc-800">
              <p className="text-xs text-zinc-500 mb-2">Resolved comments</p>
              <div className="space-y-2 opacity-60">
                {comments
                  .filter((c) => c.resolved)
                  .map((comment) => renderComment(comment))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-zinc-800">
        <div className="relative">
          <Popover
            open={showMentionPopover}
            onOpenChange={setShowMentionPopover}
          >
            <PopoverTrigger asChild>
              <div className="relative">
                <Textarea
                  ref={textareaRef}
                  value={newComment}
                  onChange={(e) => handleTextChange(e, false)}
                  placeholder="Add a comment... Use @ to mention"
                  className="min-h-[60px] bg-zinc-900 border-zinc-700 text-sm resize-none pr-20"
                />
                <div className="absolute bottom-2 right-2 flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      const textarea = textareaRef.current;
                      if (textarea) {
                        const pos = textarea.selectionStart;
                        const before = newComment.slice(0, pos);
                        const after = newComment.slice(pos);
                        setNewComment(before + "@" + after);
                        setTimeout(() => {
                          textarea.focus();
                          textarea.setSelectionRange(pos + 1, pos + 1);
                        }, 0);
                        setShowMentionPopover(true);
                      }
                    }}
                  >
                    <AtSign className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleAddComment()}
                    disabled={!newComment.trim() || isSubmitting}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-64 p-0 bg-zinc-900 border-zinc-800"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <ScrollArea className="max-h-48">
                {filteredUsers.length === 0 ? (
                  <div className="p-3 text-sm text-zinc-500">
                    No users found
                  </div>
                ) : (
                  filteredUsers.map((user) => (
                    <button
                      key={user.id}
                      className="flex items-center gap-2 w-full p-2 hover:bg-zinc-800 transition-colors"
                      onClick={() => insertMention(user)}
                    >
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback className="text-xs">
                          {(user.name || "?").charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 text-left">
                        <p className="text-sm">{user.name}</p>
                        {user.email && (
                          <p className="text-xs text-zinc-500">{user.email}</p>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}

export default CommentThread;
