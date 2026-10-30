import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { HardDrive, AlertTriangle, XCircle, FileAudio, FileImage, FileVideo, File, Trash2, Crown, Info, RefreshCw } from "lucide-react";

export type StorageWarningLevel =
  | "none"
  | "low"
  | "medium"
  | "critical"
  | "exceeded";

export interface StorageStats {
  used: number;
  usedFormatted: string;
  quota: number;
  quotaFormatted: string;
  available: number;
  availableFormatted: string;
  usedPercent: number;
  fileCount: number;
  warningLevel: StorageWarningLevel;
}

export interface StorageCategoryStats {
  id: string;
  name: string;
  used: number;
  usedFormatted: string;
  count: number;
  percentage: number;
}

interface StorageUsageIndicatorProps {
  onUpgrade?: () => void;
  onManageStorage?: () => void;
  onRefresh?: () => void;
  showBreakdown?: boolean;
  variant?: "full" | "compact" | "minimal";
  className?: string;
}


const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  audio: <FileAudio className="h-4 w-4" />,
  images: <FileImage className="h-4 w-4" />,
  video: <FileVideo className="h-4 w-4" />,
  other: <File className="h-4 w-4" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  audio: "bg-blue-500",
  images: "bg-green-500",
  video: "bg-purple-500",
  other: "bg-gray-500",
};

const WARNING_LEVEL_CONFIG: Record<
  StorageWarningLevel,
  {
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
    icon: React.ReactNode;
  }
> = {
  none: {
    label: "",
    color: "text-primary",
    bgColor: "bg-primary/10",
    borderColor: "border-primary/20",
    icon: null,
  },
  low: {
    label: "Running Low",
    color: "text-amber-600",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    icon: <AlertTriangle className="h-4 w-4 text-amber-600" />,
  },
  medium: {
    label: "90% Used",
    color: "text-orange-600",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/20",
    icon: <AlertTriangle className="h-4 w-4 text-orange-600" />,
  },
  critical: {
    label: "Almost Full",
    color: "text-destructive",
    bgColor: "bg-destructive/10",
    borderColor: "border-destructive/20",
    icon: <AlertTriangle className="h-4 w-4 text-destructive" />,
  },
  exceeded: {
    label: "Storage Full",
    color: "text-destructive",
    bgColor: "bg-destructive/10",
    borderColor: "border-destructive/20",
    icon: <XCircle className="h-4 w-4 text-destructive" />,
  },
};

export function StorageUsageIndicator({
  onUpgrade,
  onManageStorage,
  onRefresh,
  showBreakdown = true,
  variant = "full",
  className,
}: StorageUsageIndicatorProps) {
  const [showDetails, setShowDetails] = useState(false);

  const { data, isLoading, refetch } = useQuery<{
    success: boolean;
    storage: StorageStats;
    categories: StorageCategoryStats[];
  }>({
    queryKey: ["/api/files/storage-usage"],
    staleTime: 60000,
  });

  const storage = data?.storage ?? {
    used: 0,
    usedFormatted: "0 B",
    quota: 5 * 1024 * 1024 * 1024,
    quotaFormatted: "5 GB",
    available: 5 * 1024 * 1024 * 1024,
    availableFormatted: "5 GB",
    usedPercent: 0,
    fileCount: 0,
    warningLevel: "none" as StorageWarningLevel,
  };

  const categories = data?.categories ?? [];
  const warningConfig = WARNING_LEVEL_CONFIG[storage.warningLevel];
  const showWarning = storage.warningLevel !== "none";

  const handleRefresh = () => {
    refetch();
    onRefresh?.();
  };

  const getProgressColor = () => {
    switch (storage.warningLevel) {
      case "exceeded":
      case "critical":
        return "bg-destructive";
      case "medium":
        return "bg-orange-500";
      case "low":
        return "bg-amber-500";
      default:
        return "bg-primary";
    }
  };

  if (variant === "minimal") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <HardDrive
          className={cn(
            "h-4 w-4",
            showWarning ? warningConfig.color : "text-muted-foreground",
          )}
        />
        <Progress value={storage.usedPercent} className="h-1.5 w-16" />
        <span className="text-xs text-muted-foreground tabular-nums">
          {storage.usedPercent}%
        </span>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex items-center gap-3 p-2 rounded-lg border",
          warningConfig.borderColor,
          className,
        )}
      >
        <div className="flex items-center gap-2">
          <HardDrive
            className={cn(
              "h-4 w-4",
              showWarning ? warningConfig.color : "text-muted-foreground",
            )}
          />
          <span className="text-sm font-medium">{storage.usedFormatted}</span>
          <span className="text-xs text-muted-foreground">
            / {storage.quotaFormatted}
          </span>
        </div>
        <Progress
          value={storage.usedPercent}
          className={cn("h-2 w-24", getProgressColor())}
        />
        {showWarning && (
          <Badge variant="outline" className={cn("gap-1", warningConfig.color)}>
            {warningConfig.icon}
            {warningConfig.label}
          </Badge>
        )}
        {storage.warningLevel !== "none" && onUpgrade && (
          <Button
            variant="outline"
            size="sm"
            onClick={onUpgrade}
            className="h-7 text-xs"
          >
            <Crown className="h-3 w-3 mr-1" />
            Upgrade
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card className={cn(className, showWarning && warningConfig.borderColor)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive
              className={cn(
                "h-5 w-5",
                showWarning ? warningConfig.color : "text-primary",
              )}
            />
            <CardTitle className="text-base">Storage</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {showWarning && (
              <Badge
                variant="outline"
                className={cn(
                  "gap-1",
                  warningConfig.color,
                  warningConfig.borderColor,
                )}
              >
                {warningConfig.icon}
                {warningConfig.label}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <RefreshCw
                className={cn("h-4 w-4", isLoading && "animate-spin")}
              />
            </Button>
            {showBreakdown && (
              <Dialog open={showDetails} onOpenChange={setShowDetails}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Info className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Storage Details</DialogTitle>
                    <DialogDescription>
                      Breakdown of your storage usage by category
                    </DialogDescription>
                  </DialogHeader>
                  <StorageBreakdownDialog
                    storage={storage}
                    categories={categories}
                    onManageStorage={() => {
                      setShowDetails(false);
                      onManageStorage?.();
                    }}
                    onUpgrade={() => {
                      setShowDetails(false);
                      onUpgrade?.();
                    }}
                  />
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {storage.usedFormatted} of {storage.quotaFormatted} used
            </span>
            <span
              className={cn(
                "font-medium tabular-nums",
                showWarning && warningConfig.color,
              )}
            >
              {storage.usedPercent}%
            </span>
          </div>
          <div className="relative h-3 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-300",
                getProgressColor(),
              )}
              style={{ width: `${Math.min(storage.usedPercent, 100)}%` }}
            />
            {storage.usedPercent >= 80 && (
              <div
                className="absolute top-0 h-full w-px bg-foreground/50"
                style={{ left: "80%" }}
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {storage.availableFormatted} available · {storage.fileCount} files
          </p>
        </div>

        {showBreakdown && categories.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Usage Breakdown
            </p>
            <div className="h-2 rounded-full overflow-hidden bg-muted flex">
              {categories
                .filter((c) => c.used > 0)
                .map((category) => (
                  <div
                    key={category.id}
                    className={cn(
                      "h-full",
                      CATEGORY_COLORS[category.id] || "bg-gray-500",
                    )}
                    style={{ width: `${category.percentage}%` }}
                    title={`${category.name}: ${category.usedFormatted}`}
                  />
                ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {categories
                .filter((c) => c.used > 0)
                .map((category) => (
                  <div
                    key={category.id}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full",
                        CATEGORY_COLORS[category.id] || "bg-gray-500",
                      )}
                    />
                    <span className="text-muted-foreground">
                      {category.name}
                    </span>
                    <span className="font-medium">
                      {category.usedFormatted}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {storage.warningLevel === "exceeded" && (
          <div
            className={cn(
              "p-3 rounded-lg",
              warningConfig.bgColor,
              "border",
              warningConfig.borderColor,
            )}
          >
            <div className="flex items-start gap-2">
              <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">
                  Storage Quota Exceeded
                </p>
                <p className="text-xs text-destructive/80 mt-0.5">
                  You cannot upload new files until you free up space or upgrade
                  your plan.
                </p>
              </div>
            </div>
          </div>
        )}

        {storage.warningLevel === "critical" && (
          <div
            className={cn(
              "p-3 rounded-lg",
              warningConfig.bgColor,
              "border",
              warningConfig.borderColor,
            )}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">
                  Storage Almost Full
                </p>
                <p className="text-xs text-destructive/80 mt-0.5">
                  Only {storage.availableFormatted} remaining. Upgrade soon to
                  avoid interruptions.
                </p>
              </div>
            </div>
          </div>
        )}

        {storage.warningLevel === "low" && (
          <div
            className={cn(
              "p-3 rounded-lg",
              warningConfig.bgColor,
              "border",
              warningConfig.borderColor,
            )}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-600">
                  Storage Running Low
                </p>
                <p className="text-xs text-amber-600/80 mt-0.5">
                  Consider upgrading your plan or removing unused files.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          {showWarning && onUpgrade && (
            <Button
              variant="default"
              size="sm"
              onClick={onUpgrade}
              className="flex-1"
            >
              <Crown className="h-4 w-4 mr-1" />
              Upgrade Storage
            </Button>
          )}
          {onManageStorage && (
            <Button
              variant={showWarning ? "outline" : "default"}
              size="sm"
              onClick={onManageStorage}
              className="flex-1"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Manage Files
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface StorageBreakdownDialogProps {
  storage: StorageStats;
  categories: StorageCategoryStats[];
  onManageStorage?: () => void;
  onUpgrade?: () => void;
}

function StorageBreakdownDialog({
  storage,
  categories,
  onManageStorage,
  onUpgrade,
}: StorageBreakdownDialogProps) {
  const sortedCategories = [...categories].sort((a, b) => b.used - a.used);
  const warningConfig = WARNING_LEVEL_CONFIG[storage.warningLevel];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>Total Used</span>
          <span className="font-medium">{storage.usedFormatted}</span>
        </div>
        <Progress value={storage.usedPercent} className="h-2" />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {storage.usedPercent}% of {storage.quotaFormatted}
          </span>
          <span>{storage.availableFormatted} available</span>
        </div>
      </div>

      <div className="space-y-3">
        {sortedCategories.map((category) => (
          <div key={category.id} className="flex items-center gap-3">
            <div
              className={cn(
                "p-2 rounded-lg",
                `${CATEGORY_COLORS[category.id]}/10`,
              )}
            >
              {CATEGORY_ICONS[category.id] || <File className="h-4 w-4" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{category.name}</span>
                <span className="text-sm">{category.usedFormatted}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Progress
                  value={category.percentage}
                  className="h-1.5 flex-1"
                />
                <span className="text-xs text-muted-foreground w-10 text-right">
                  {category.count} files
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {storage.warningLevel !== "none" && onUpgrade && (
        <div
          className={cn(
            "p-3 rounded-lg",
            warningConfig.bgColor,
            "border",
            warningConfig.borderColor,
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {warningConfig.icon}
              <span className={cn("text-sm font-medium", warningConfig.color)}>
                {warningConfig.label}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={onUpgrade}>
              <Crown className="h-3 w-3 mr-1" />
              Upgrade
            </Button>
          </div>
        </div>
      )}

      {onManageStorage && (
        <Button variant="outline" onClick={onManageStorage} className="w-full">
          <Trash2 className="h-4 w-4 mr-2" />
          Manage Files
        </Button>
      )}
    </div>
  );
}
