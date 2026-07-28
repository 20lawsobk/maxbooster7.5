import { useState, useCallback, memo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Download, FileAudio, FileText, FileSpreadsheet, Archive, Loader2, Clock, Search, Filter, MoreVertical, Trash2, RefreshCw, Share2, Calendar, HardDrive, Eye, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";

export type ExportHistoryStatus =
  | "completed"
  | "failed"
  | "expired"
  | "processing";
export type ExportHistoryType =
  | "audio"
  | "stems"
  | "analytics"
  | "royalties"
  | "contracts"
  | "backup";

export interface ExportHistoryItem {
  id: string;
  name: string;
  type: ExportHistoryType;
  format: string;
  status: ExportHistoryStatus;
  createdAt: Date;
  completedAt?: Date;
  expiresAt?: Date;
  fileSize?: number;
  downloadUrl?: string;
  downloadCount: number;
  settings?: Record<string, unknown>;
  error?: string;
  projectId?: string;
  projectName?: string;
}

interface ExportHistoryProps {
  className?: string;
  onReExport?: (item: ExportHistoryItem) => void;
  onShare?: (item: ExportHistoryItem) => void;
}

const TYPE_CONFIG: Record<
  ExportHistoryType,
  {
    icon: React.ElementType;
    color: string;
    bgColor: string;
    label: string;
  }
> = {
  audio: {
    icon: FileAudio,
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
    label: "Audio",
  },
  stems: {
    icon: Archive,
    color: "text-purple-400",
    bgColor: "bg-purple-500/20",
    label: "Stems",
  },
  analytics: {
    icon: FileSpreadsheet,
    color: "text-green-400",
    bgColor: "bg-green-500/20",
    label: "Analytics",
  },
  royalties: {
    icon: FileText,
    color: "text-amber-400",
    bgColor: "bg-amber-500/20",
    label: "Royalties",
  },
  contracts: {
    icon: FileText,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/20",
    label: "Contracts",
  },
  backup: {
    icon: HardDrive,
    color: "text-pink-400",
    bgColor: "bg-pink-500/20",
    label: "Backup",
  },
};

const STATUS_CONFIG: Record<
  ExportHistoryStatus,
  {
    color: string;
    bgColor: string;
    label: string;
  }
> = {
  completed: {
    color: "text-green-400",
    bgColor: "bg-green-500/20",
    label: "Completed",
  },
  failed: { color: "text-red-400", bgColor: "bg-red-500/20", label: "Failed" },
  expired: {
    color: "text-zinc-500",
    bgColor: "bg-zinc-500/20",
    label: "Expired",
  },
  processing: {
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
    label: "Processing",
  },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const ExportHistoryItemRow = memo(function ExportHistoryItemRow({
  item,
  onDownload,
  onDelete,
  onReExport,
  onShare,
  onViewDetails,
}: {
  item: ExportHistoryItem;
  onDownload: (item: ExportHistoryItem) => void;
  onDelete: (id: string) => void;
  onReExport?: (item: ExportHistoryItem) => void;
  onShare?: (item: ExportHistoryItem) => void;
  onViewDetails: (item: ExportHistoryItem) => void;
}) {
  const typeConfig = TYPE_CONFIG[item.type];
  const statusConfig = STATUS_CONFIG[item.status];
  const TypeIcon = typeConfig.icon;

  const isDownloadable = item.status === "completed" && item.downloadUrl;
  const isExpired =
    item.status === "expired" ||
    (item.expiresAt && new Date(item.expiresAt) < new Date());

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={cn(
        "flex items-center gap-4 p-4 rounded-lg border transition-all",
        item.status === "completed" &&
          "bg-zinc-900 border-zinc-800 hover:border-zinc-700",
        item.status === "failed" && "bg-red-950/20 border-red-900/30",
        item.status === "expired" &&
          "bg-zinc-900/50 border-zinc-800 opacity-60",
        item.status === "processing" && "bg-blue-950/20 border-blue-900/30",
      )}
    >
      <div
        className={cn(
          "w-12 h-12 rounded-lg flex items-center justify-center shrink-0",
          typeConfig.bgColor,
        )}
      >
        <TypeIcon className={cn("h-6 w-6", typeConfig.color)} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium truncate">{item.name}</span>
          <Badge variant="outline" className="text-[10px] uppercase shrink-0">
            {item.format}
          </Badge>
          <Badge
            variant="secondary"
            className={cn(
              "text-[10px] shrink-0",
              statusConfig.color,
              statusConfig.bgColor,
            )}
          >
            {statusConfig.label}
          </Badge>
        </div>

        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
          </span>
          {item.fileSize && (
            <span className="flex items-center gap-1">
              <HardDrive className="h-3 w-3" />
              {formatFileSize(item.fileSize)}
            </span>
          )}
          {item.downloadCount > 0 && (
            <span className="flex items-center gap-1">
              <Download className="h-3 w-3" />
              {item.downloadCount} downloads
            </span>
          )}
          {item.projectName && (
            <span className="truncate">Project: {item.projectName}</span>
          )}
        </div>

        {item.status === "failed" && item.error && (
          <div className="flex items-center gap-1 mt-1 text-xs text-red-400">
            <AlertCircle className="h-3 w-3" />
            {item.error}
          </div>
        )}

        {isExpired && item.expiresAt && (
          <div className="flex items-center gap-1 mt-1 text-xs text-zinc-500">
            <Clock className="h-3 w-3" />
            Expired{" "}
            {formatDistanceToNow(new Date(item.expiresAt), { addSuffix: true })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {isDownloadable && !isExpired && (
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700"
            onClick={() => onDownload(item)}
          >
            <Download className="h-4 w-4 mr-1" />
            Download
          </Button>
        )}

        {item.status === "failed" && onReExport && (
          <Button
            size="sm"
            variant="outline"
            className="border-zinc-700"
            onClick={() => onReExport(item)}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Retry
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="bg-zinc-900 border-zinc-700"
          >
            <DropdownMenuItem
              onClick={() => onViewDetails(item)}
              className="gap-2"
            >
              <Eye className="h-4 w-4" />
              View Details
            </DropdownMenuItem>
            {isDownloadable && !isExpired && onShare && (
              <DropdownMenuItem onClick={() => onShare(item)} className="gap-2">
                <Share2 className="h-4 w-4" />
                Share Link
              </DropdownMenuItem>
            )}
            {onReExport && (
              <DropdownMenuItem
                onClick={() => onReExport(item)}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Re-export
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="bg-zinc-700" />
            <DropdownMenuItem
              onClick={() => onDelete(item.id)}
              className="gap-2 text-red-400"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
});

export function ExportHistory({
  className,
  onReExport,
  onShare,
}: ExportHistoryProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ExportHistoryType | "all">(
    "all",
  );
  const [statusFilter, setStatusFilter] = useState<ExportHistoryStatus | "all">(
    "all",
  );
  const [selectedItem, setSelectedItem] = useState<ExportHistoryItem | null>(
    null,
  );
  const [showDetails, setShowDetails] = useState(false);

  const { data: exportHistory = [], isLoading } = useQuery<ExportHistoryItem[]>(
    {
      queryKey: ["/api/export/history"],
    },
  );

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/export/history/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/export/history"] });
      toast({
        title: "Export Deleted",
        description: "The export has been removed from history",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: "Failed to delete export",
      });
    },
  });

  const handleDownload = useCallback(
    (item: ExportHistoryItem) => {
      if (item.downloadUrl) {
        const link = document.createElement("a");
        link.href = item.downloadUrl;
        link.download = `${item.name}.${item.format}`;
        link.click();

        toast({
          title: "Download Started",
          description: `Downloading ${item.name}`,
        });
      }
    },
    [toast],
  );

  const handleViewDetails = useCallback((item: ExportHistoryItem) => {
    setSelectedItem(item);
    setShowDetails(true);
  }, []);

  const filteredHistory = exportHistory.filter((item) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (
        !item.name.toLowerCase().includes(query) &&
        !item.projectName?.toLowerCase().includes(query)
      ) {
        return false;
      }
    }
    if (typeFilter !== "all" && item.type !== typeFilter) return false;
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    return true;
  });

  const stats = {
    total: exportHistory.length,
    completed: exportHistory.filter((e) => e.status === "completed").length,
    failed: exportHistory.filter((e) => e.status === "failed").length,
    totalSize: exportHistory
      .filter((e) => e.fileSize)
      .reduce((sum, e) => sum + (e.fileSize || 0), 0),
  };

  return (
    <>
      <Card className={cn("bg-zinc-950 border-zinc-800", className)}>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-400" />
                Export History
              </CardTitle>
              <CardDescription className="mt-1">
                {stats.completed} completed · {stats.failed} failed ·{" "}
                {formatFileSize(stats.totalSize)} total
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Search exports..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-zinc-900 border-zinc-700"
              />
            </div>
            <Select
              value={typeFilter}
              onValueChange={(v) =>
                setTypeFilter(v as ExportHistoryType | "all")
              }
            >
              <SelectTrigger className="w-36 bg-zinc-900 border-zinc-700">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(TYPE_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) =>
                setStatusFilter(v as ExportHistoryStatus | "all")
              }
            >
              <SelectTrigger className="w-36 bg-zinc-900 border-zinc-700">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                <SelectItem value="all">All Status</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 text-zinc-500 animate-spin" />
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-4">
                <Clock className="h-8 w-8 text-zinc-600" />
              </div>
              <h3 className="font-medium text-zinc-400">No Export History</h3>
              <p className="text-sm text-zinc-600 mt-1">
                {searchQuery || typeFilter !== "all" || statusFilter !== "all"
                  ? "No exports match your filters"
                  : "Your export history will appear here"}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[500px] pr-4">
              <AnimatePresence mode="popLayout">
                <div className="space-y-3">
                  {filteredHistory.map((item) => (
                    <ExportHistoryItemRow
                      key={item.id}
                      item={item}
                      onDownload={handleDownload}
                      onDelete={(id) => deleteMutation.mutate(id)}
                      onReExport={onReExport}
                      onShare={onShare}
                      onViewDetails={handleViewDetails}
                    />
                  ))}
                </div>
              </AnimatePresence>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Export Details</DialogTitle>
            <DialogDescription>
              Detailed information about this export
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-zinc-500">Name</label>
                  <p className="font-medium">{selectedItem.name}</p>
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Format</label>
                  <p className="font-medium uppercase">{selectedItem.format}</p>
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Type</label>
                  <p className="font-medium">
                    {TYPE_CONFIG[selectedItem.type].label}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Status</label>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "mt-1",
                      STATUS_CONFIG[selectedItem.status].color,
                    )}
                  >
                    {STATUS_CONFIG[selectedItem.status].label}
                  </Badge>
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Created</label>
                  <p className="font-medium">
                    {format(new Date(selectedItem.createdAt), "PPpp")}
                  </p>
                </div>
                {selectedItem.completedAt && (
                  <div>
                    <label className="text-xs text-zinc-500">Completed</label>
                    <p className="font-medium">
                      {format(new Date(selectedItem.completedAt), "PPpp")}
                    </p>
                  </div>
                )}
                {selectedItem.fileSize && (
                  <div>
                    <label className="text-xs text-zinc-500">File Size</label>
                    <p className="font-medium">
                      {formatFileSize(selectedItem.fileSize)}
                    </p>
                  </div>
                )}
                <div>
                  <label className="text-xs text-zinc-500">Downloads</label>
                  <p className="font-medium">{selectedItem.downloadCount}</p>
                </div>
                {selectedItem.expiresAt && (
                  <div>
                    <label className="text-xs text-zinc-500">Expires</label>
                    <p className="font-medium">
                      {format(new Date(selectedItem.expiresAt), "PPpp")}
                    </p>
                  </div>
                )}
                {selectedItem.projectName && (
                  <div className="col-span-2">
                    <label className="text-xs text-zinc-500">Project</label>
                    <p className="font-medium">{selectedItem.projectName}</p>
                  </div>
                )}
              </div>

              {selectedItem.settings &&
                Object.keys(selectedItem.settings).length > 0 && (
                  <>
                    <Separator className="bg-zinc-800" />
                    <div>
                      <label className="text-xs text-zinc-500 mb-2 block">
                        Export Settings
                      </label>
                      <div className="bg-zinc-900 p-3 rounded-lg text-xs font-mono">
                        {Object.entries(selectedItem.settings).map(
                          ([key, value]) => (
                            <div
                              key={key}
                              className="flex justify-between py-0.5"
                            >
                              <span className="text-zinc-500">{key}:</span>
                              <span>{String(value)}</span>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </>
                )}

              {selectedItem.error && (
                <>
                  <Separator className="bg-zinc-800" />
                  <div className="p-3 bg-red-950/30 border border-red-900/50 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-400">
                          Error
                        </p>
                        <p className="text-xs text-red-300/80 mt-0.5">
                          {selectedItem.error}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              className="border-zinc-700"
              onClick={() => setShowDetails(false)}
            >
              Close
            </Button>
            {selectedItem?.status === "completed" &&
              selectedItem?.downloadUrl && (
                <Button onClick={() => handleDownload(selectedItem)}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ExportHistory;
