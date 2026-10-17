// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  FacebookIcon,
  InstagramIcon,
  YouTubeIcon,
  TikTokIcon,
  LinkedInIcon,
  ThreadsIcon,
  GoogleIcon,
} from "@/components/ui/brand-icons";
import {
  MessageCircle,
  Calendar,
  Clock,
  Hash,
  AtSign,
  MapPin,
  FileText,
} from "lucide-react";

interface SchedulePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSchedule: (data: SchedulePostData) => Promise<unknown>;
  initialData?: Partial<SchedulePostData>;
}

export interface SchedulePostData {
  title: string;
  scheduledFor: string;
  platforms: string[];
  postType: string;
  content: string;
  mediaUrls: string[];
  hashtags: string[];
  mentions: string[];
  location: string;
  status: "draft" | "scheduled";
}

const PLATFORMS = [
  { id: "facebook", name: "Facebook", icon: FacebookIcon, color: "#1877F2" },
  { id: "instagram", name: "Instagram", icon: InstagramIcon, color: "#E4405F" },
  { id: "twitter", name: "Twitter (X)", icon: MessageCircle, color: "#000000" },
  { id: "youtube", name: "YouTube", icon: YouTubeIcon, color: "#FF0000" },
  { id: "tiktok", name: "TikTok", icon: TikTokIcon, color: "#000000" },
  { id: "linkedin", name: "LinkedIn", icon: LinkedInIcon, color: "#0077B5" },
  { id: "threads", name: "Threads", icon: ThreadsIcon, color: "#000000" },
  {
    id: "googlebusiness",
    name: "Google Business",
    icon: GoogleIcon,
    color: "#4285F4",
  },
];

const POST_TYPES = [
  { value: "post", label: "Post" },
  { value: "story", label: "Story" },
  { value: "reel", label: "Reel" },
  { value: "video", label: "Video" },
];

function createScheduleFormData(
  initialData?: Partial<SchedulePostData>,
): SchedulePostData {
  return {
    title: initialData?.title ?? "",
    scheduledFor: initialData?.scheduledFor ?? "",
    platforms: [...(initialData?.platforms ?? [])],
    postType: initialData?.postType ?? "post",
    content: initialData?.content ?? "",
    mediaUrls: [...(initialData?.mediaUrls ?? [])],
    hashtags: [...(initialData?.hashtags ?? [])],
    mentions: [...(initialData?.mentions ?? [])],
    location: initialData?.location ?? "",
    status: initialData?.status === "scheduled" ? "scheduled" : "draft",
  };
}

export function SchedulePostDialog({
  open,
  onOpenChange,
  onSchedule,
  initialData,
}: SchedulePostDialogProps) {
  const [formData, setFormData] = useState<SchedulePostData>(() =>
    createScheduleFormData(initialData),
  );
  const initialDataKey = JSON.stringify(initialData ?? null);
  const savingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hashtagInput, setHashtagInput] = useState("");
  const [mentionInput, setMentionInput] = useState("");

  useEffect(() => {
    if (open && !savingRef.current) {
      setFormData(
        createScheduleFormData(
          JSON.parse(initialDataKey) ?? undefined,
        ),
      );
      setSubmitError(null);
      setHashtagInput("");
      setMentionInput("");
    }
  }, [open, initialDataKey]);

  const handlePlatformToggle = (platformId: string) => {
    setFormData((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(platformId)
        ? prev.platforms.filter((p) => p !== platformId)
        : [...prev.platforms, platformId],
    }));
  };

  const addHashtag = () => {
    if (hashtagInput.trim()) {
      const tag = hashtagInput.trim().startsWith("#")
        ? hashtagInput.trim()
        : `#${hashtagInput.trim()}`;
      setFormData((prev) => ({
        ...prev,
        hashtags: [...prev.hashtags, tag],
      }));
      setHashtagInput("");
    }
  };

  const removeHashtag = (tag: string) => {
    setFormData((prev) => ({
      ...prev,
      hashtags: prev.hashtags.filter((h) => h !== tag),
    }));
  };

  const addMention = () => {
    if (mentionInput.trim()) {
      const mention = mentionInput.trim().startsWith("@")
        ? mentionInput.trim()
        : `@${mentionInput.trim()}`;
      setFormData((prev) => ({
        ...prev,
        mentions: [...prev.mentions, mention],
      }));
      setMentionInput("");
    }
  };

  const removeMention = (mention: string) => {
    setFormData((prev) => ({
      ...prev,
      mentions: prev.mentions.filter((m) => m !== mention),
    }));
  };

  const handleSubmit = async (status: "draft" | "scheduled") => {
    // State alone does not guard a second click before React rerenders.
    if (savingRef.current) return;
    if (!formData.content.trim() || formData.platforms.length === 0) return;
    if (status === "scheduled" && (!formData.title.trim() || !formData.scheduledFor)) return;
    savingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const persistence = onSchedule({ ...formData, status });
      if (!persistence || typeof persistence.then !== "function") {
        throw new Error("The save handler did not return a persistence promise. Your input has been kept.");
      }
      await persistence;
      setFormData(createScheduleFormData());
      setHashtagInput("");
      setMentionInput("");
      onOpenChange(false);
    } catch (error) {
      setSubmitError(error instanceof Error && error.message
        ? error.message
        : "The post could not be saved. Your input has been kept. Please try again.");
    } finally {
      savingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!savingRef.current) onOpenChange(nextOpen);
  };

  const characterCount = formData.content.length;
  const characterLimit = 280;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        aria-busy={isSubmitting}
        onInteractOutside={(event) => {
          if (savingRef.current) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (savingRef.current) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Schedule Post</DialogTitle>
        </DialogHeader>

        <fieldset disabled={isSubmitting} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Post Title</Label>
            <Input
              id="title"
              placeholder="Enter post title..."
              value={formData.title}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, title: e.target.value }))
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Date
              </Label>
              <Input
                id="date"
                type="date"
                value={formData.scheduledFor.split("T")[0]}
                onChange={(e) => {
                  const time = formData.scheduledFor.split("T")[1] || "12:00";
                  setFormData((prev) => ({
                    ...prev,
                    scheduledFor: `${e.target.value}T${time}`,
                  }));
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="time" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Time
              </Label>
              <Input
                id="time"
                type="time"
                value={formData.scheduledFor.split("T")[1] || ""}
                onChange={(e) => {
                  const date =
                    formData.scheduledFor.split("T")[0] ||
                    new Date().toISOString().split("T")[0];
                  setFormData((prev) => ({
                    ...prev,
                    scheduledFor: `${date}T${e.target.value}`,
                  }));
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Platforms</Label>
            <div className="grid grid-cols-2 gap-2">
              {PLATFORMS.map((platform) => {
                const Icon = platform.icon;
                return (
                  <div
                    key={platform.id}
                    className="flex items-center space-x-2"
                  >
                    <Checkbox
                      disabled={isSubmitting}
                      id={platform.id}
                      checked={formData.platforms.includes(platform.id)}
                      onCheckedChange={() => handlePlatformToggle(platform.id)}
                    />
                    <Label
                      htmlFor={platform.id}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Icon size={16} style={{ color: platform.color }} />
                      {platform.name}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="postType">Post Type</Label>
            <Select
              disabled={isSubmitting}
              value={formData.postType}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, postType: value }))
              }
            >
              <SelectTrigger id="postType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POST_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="content"
              className="flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Content
              </span>
              <span
                className={`text-xs ${characterCount > characterLimit ? "text-red-500" : "text-gray-500"}`}
              >
                {characterCount} / {characterLimit}
              </span>
            </Label>
            <Textarea
              id="content"
              placeholder="What's happening?"
              value={formData.content}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, content: e.target.value }))
              }
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hashtags" className="flex items-center gap-2">
              <Hash className="h-4 w-4" />
              Hashtags
            </Label>
            <div className="flex gap-2">
              <Input
                id="hashtags"
                placeholder="Add hashtag..."
                value={hashtagInput}
                onChange={(e) => setHashtagInput(e.target.value)}
                onKeyPress={(e) =>
                  e.key === "Enter" && (e.preventDefault(), addHashtag())
                }
              />
              <Button type="button" onClick={addHashtag} variant="outline">
                Add
              </Button>
            </div>
            {formData.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.hashtags.map((tag, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => !savingRef.current && removeHashtag(tag)}
                  >
                    {tag} ×
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="mentions" className="flex items-center gap-2">
              <AtSign className="h-4 w-4" />
              Mentions
            </Label>
            <div className="flex gap-2">
              <Input
                id="mentions"
                placeholder="Add mention..."
                value={mentionInput}
                onChange={(e) => setMentionInput(e.target.value)}
                onKeyPress={(e) =>
                  e.key === "Enter" && (e.preventDefault(), addMention())
                }
              />
              <Button type="button" onClick={addMention} variant="outline">
                Add
              </Button>
            </div>
            {formData.mentions.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.mentions.map((mention, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => !savingRef.current && removeMention(mention)}
                  >
                    {mention} ×
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="location" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Location
            </Label>
            <Input
              id="location"
              placeholder="Add location..."
              value={formData.location}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, location: e.target.value }))
              }
            />
          </div>
        </fieldset>

        {submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}
        {isSubmitting && <p role="status" className="text-sm text-muted-foreground">Saving your post. Please wait…</p>}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => handleSubmit("draft")}
            disabled={isSubmitting || !formData.content.trim() || formData.platforms.length === 0}
          >
            {isSubmitting ? "Saving…" : "Save Draft"}
          </Button>
          <Button
            onClick={() => handleSubmit("scheduled")}
            disabled={
              isSubmitting ||
              !formData.title ||
              !formData.scheduledFor ||
              !formData.content.trim() ||
              formData.platforms.length === 0
            }
          >
            {isSubmitting ? "Saving…" : "Schedule Post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
