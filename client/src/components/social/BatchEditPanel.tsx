import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Trash2,
  Send,
  Calendar,
  Tag,
  X,
  CheckSquare,
  Loader2,
  ChevronDown,
} from "lucide-react";

export interface BatchUpdate {
  status?: string;
  scheduledAt?: string | null;
  platform?: string;
}

interface BatchEditPanelProps {
  selectedCount: number;
  onClearSelection: () => void;
  onSelectAll: () => void;
  totalCount: number;
  onBatchUpdate: (updates: BatchUpdate) => void;
  onBatchDelete: () => void;
  onBatchPublish: () => void;
  isLoading?: boolean;
}

const PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "twitter", label: "Twitter / X" },
  { value: "tiktok", label: "TikTok" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "youtube", label: "YouTube" },
  { value: "threads", label: "Threads" },
];

const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
];

export function BatchEditPanel({
  selectedCount,
  onClearSelection,
  onSelectAll,
  totalCount,
  onBatchUpdate,
  onBatchDelete,
  onBatchPublish,
  isLoading = false,
}: BatchEditPanelProps) {
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  if (selectedCount === 0) return null;

  const handleReschedule = () => {
    if (!rescheduleDate) return;
    const iso = rescheduleTime
      ? new Date(`${rescheduleDate}T${rescheduleTime}`).toISOString()
      : new Date(`${rescheduleDate}T09:00`).toISOString();
    onBatchUpdate({ scheduledAt: iso, status: "scheduled" });
    setRescheduleOpen(false);
    setRescheduleDate("");
    setRescheduleTime("");
  };

  const handleStatusChange = (status: string) => {
    onBatchUpdate({ status });
  };

  const handlePlatformChange = (platform: string) => {
    onBatchUpdate({ platform });
  };

  return (
    <>
      <div className="sticky top-0 z-30 bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-800 rounded-xl shadow-lg px-4 py-3 flex flex-wrap items-center gap-3">
        {/* Selection count + clear */}
        <div className="flex items-center gap-2 mr-2">
          <CheckSquare className="h-4 w-4 text-blue-600" />
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 font-semibold text-sm">
            {selectedCount} selected
          </Badge>
          {selectedCount < totalCount && (
            <button
              onClick={onSelectAll}
              className="text-xs text-blue-600 hover:underline"
            >
              Select all {totalCount}
            </button>
          )}
          <button
            onClick={onClearSelection}
            className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-0.5"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        </div>

        <div className="h-5 border-l border-gray-300 dark:border-gray-600" />

        {/* Reschedule */}
        <Popover open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading}
              className="gap-1"
            >
              <Calendar className="h-3.5 w-3.5" />
              Reschedule
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-4" align="start">
            <p className="text-sm font-semibold mb-3">
              Reschedule {selectedCount} post{selectedCount > 1 ? "s" : ""}
            </p>
            <div className="space-y-3">
              <div>
                <Label className="text-xs mb-1 block">Date</Label>
                <Input
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Time (optional)</Label>
                <Input
                  type="time"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                size="sm"
                disabled={!rescheduleDate}
                onClick={handleReschedule}
              >
                Apply to {selectedCount} post{selectedCount > 1 ? "s" : ""}
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Status change */}
        <Select onValueChange={handleStatusChange} disabled={isLoading}>
          <SelectTrigger className="h-8 w-36 text-sm">
            <Tag className="h-3.5 w-3.5 mr-1 opacity-70" />
            <SelectValue placeholder="Set status" />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Platform change */}
        <Select onValueChange={handlePlatformChange} disabled={isLoading}>
          <SelectTrigger className="h-8 w-40 text-sm">
            <SelectValue placeholder="Move to platform" />
          </SelectTrigger>
          <SelectContent>
            {PLATFORMS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="h-5 border-l border-gray-300 dark:border-gray-600" />

        {/* Publish now */}
        <Button
          size="sm"
          variant="outline"
          disabled={isLoading}
          onClick={onBatchPublish}
          className="gap-1 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Publish Now
        </Button>

        {/* Delete */}
        <Button
          size="sm"
          variant="outline"
          disabled={isLoading}
          onClick={() => setDeleteDialogOpen(true)}
          className="gap-1 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedCount} post{selectedCount > 1 ? "s" : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {selectedCount} scheduled post
              {selectedCount > 1 ? "s" : ""} from your calendar. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDeleteDialogOpen(false);
                onBatchDelete();
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete {selectedCount} post{selectedCount > 1 ? "s" : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
