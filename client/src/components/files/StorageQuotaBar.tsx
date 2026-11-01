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
import {
  HardDrive,
  AlertTriangle,
  XCircle,
  TrendingUp,
  FileAudio,
  FileImage,
  FileVideo,
  File,
  Trash2,
  Crown,
  Zap,
  Info,
} from "lucide-react";

export interface StorageCategory {
  name: string;
  used: number;
  icon: React.ReactNode;
  color: string;
}

export interface StorageQuota {
  used: number;
  limit: number;
  categories: StorageCategory[];
}

interface StorageQuotaBarProps {
  used?: number;
  limit?: number;
  categories?: StorageCategory[];
  warningThreshold?: number;
  criticalThreshold?: number;
  onUpgrade?: () => void;
  onManageStorage?: () => void;
  showBreakdown?: boolean;
  compact?: boolean;
  className?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

const DEFAULT_CATEGORIES: StorageCategory[] = [
  {
    name: "Audio",
    used: 0,
    icon: <FileAudio className="h-4 w-4" />,
    color: "bg-blue-500",
  },
  {
    name: "Images",
    used: 0,
    icon: <FileImage className="h-4 w-4" />,
    color: "bg-green-500",
  },
  {
    name: "Videos",
    used: 0,
    icon: <FileVideo className="h-4 w-4" />,
    color: "bg-purple-500",
  },
  {
    name: "Other",
    used: 0,
    icon: <File className="h-4 w-4" />,
    color: "bg-gray-500",
  },
];

export function StorageQuotaBar({
  used: propUsed,
  limit: propLimit,
  categories: propCategories,
  warningThreshold = 80,
  criticalThreshold = 95,
  onUpgrade,
  onManageStorage,
  showBreakdown = true,
  compact = false,
  className,
}: StorageQuotaBarProps) {
  const [showDetails, setShowDetails] = useState(false);

  const { data: quotaData } = useQuery<StorageQuota>({
    queryKey: ["/api/storage/quota"],
    enabled: propUsed === undefined || propLimit === undefined,
    staleTime: 60000,
  });

  const used = propUsed ?? quotaData?.used ?? 0;
  const limit = propLimit ?? quotaData?.limit ?? 5 * 1024 * 1024 * 1024;
  const categories =
    propCategories ?? quotaData?.categories ?? DEFAULT_CATEGORIES;

  const usedPercentage = Math.min((used / limit) * 100, 100);
  const available = Math.max(limit - used, 0);
  const isWarning =
    usedPercentage >= warningThreshold && usedPercentage < criticalThreshold;
  const isCritical = usedPercentage >= criticalThreshold;
  const isExceeded = used >= limit;

  const getProgressColor = () => {
    if (isCritical || isExceeded) return "bg-destructive";
    if (isWarning) return "bg-amber-500";
    return "bg-primary";
  };

  const getStatusBadge = () => {
    if (isExceeded) {
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          Storage Full
        </Badge>
      );
    }
    if (isCritical) {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          Almost Full
        </Badge>
      );
    }
    if (isWarning) {
      return (
        <Badge
          variant="outline"
          className="gap-1 border-amber-500 text-amber-600"
        >
          <AlertTriangle className="h-3 w-3" />
          Running Low
        </Badge>
      );
    }
    return null;
  };

  if (compact) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <div className="flex items-center gap-2">
          <HardDrive
            className={cn(
              "h-4 w-4",
              isExceeded || isCritical
                ? "text-destructive"
                : isWarning
                  ? "text-amber-500"
                  : "text-muted-foreground",
            )}
          />
          <span className="text-sm font-medium">{formatBytes(used)}</span>
          <span className="text-xs text-muted-foreground">
            / {formatBytes(limit)}
          </span>
        </div>
        <Progress
          value={usedPercentage}
          className={cn("h-2 w-24", getProgressColor())}
        />
        {getStatusBadge()}
        {(isWarning || isCritical || isExceeded) && onUpgrade && (
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
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive
              className={cn(
                "h-5 w-5",
                isExceeded || isCritical
                  ? "text-destructive"
                  : isWarning
                    ? "text-amber-500"
                    : "text-primary",
              )}
            />
            <CardTitle className="text-base">Storage</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge()}
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
                  <StorageBreakdown
                    categories={categories}
                    total={used}
                    limit={limit}
                    onManageStorage={onManageStorage}
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
              {formatBytes(used)} of {formatBytes(limit)} used
            </span>
            <span
              className={cn(
                "font-medium tabular-nums",
                isExceeded || isCritical
                  ? "text-destructive"
                  : isWarning
                    ? "text-amber-600"
                    : "",
              )}
            >
              {usedPercentage.toFixed(1)}%
            </span>
          </div>
          <div className="relative">
            <Progress value={usedPercentage} className="h-3" />
            <div
              className={cn(
                "absolute inset-0 rounded-full",
                getProgressColor(),
              )}
              style={{ width: `${usedPercentage}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {formatBytes(available)} available
          </p>
        </div>

        {showBreakdown && categories.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Usage Breakdown
            </p>
            <div className="h-2 rounded-full overflow-hidden bg-muted flex">
              {categories
                .filter((c) => c.used > 0)
                .map((category, _index) => (
                  <div
                    key={category.name}
                    className={cn("h-full", category.color)}
                    style={{ width: `${(category.used / limit) * 100}%` }}
                    title={`${category.name}: ${formatBytes(category.used)}`}
                  />
                ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {categories
                .filter((c) => c.used > 0)
                .map((category) => (
                  <div
                    key={category.name}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <div
                      className={cn("w-2 h-2 rounded-full", category.color)}
                    />
                    <span className="text-muted-foreground">
                      {category.name}
                    </span>
                    <span className="font-medium">
                      {formatBytes(category.used)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {isExceeded && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="flex items-start gap-2">
              <XCircle className="h-4 w-4 text-destructive mt-0.5" />
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

        {isWarning && !isCritical && !isExceeded && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
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

        {isCritical && !isExceeded && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">
                  Storage Almost Full
                </p>
                <p className="text-xs text-destructive/80 mt-0.5">
                  Only {formatBytes(available)} remaining. Upgrade soon to avoid
                  interruptions.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          {(isWarning || isCritical || isExceeded) && onUpgrade && (
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
              variant={
                isWarning || isCritical || isExceeded ? "outline" : "default"
              }
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

interface StorageBreakdownProps {
  categories: StorageCategory[];
  total: number;
  limit: number;
  onManageStorage?: () => void;
}

function StorageBreakdown({
  categories,
  total,
  limit,
  onManageStorage,
}: StorageBreakdownProps) {
  const sortedCategories = [...categories].sort((a, b) => b.used - a.used);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>Total Used</span>
          <span className="font-medium">{formatBytes(total)}</span>
        </div>
        <Progress value={(total / limit) * 100} className="h-2" />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {((total / limit) * 100).toFixed(1)}% of {formatBytes(limit)}
          </span>
          <span>{formatBytes(limit - total)} available</span>
        </div>
      </div>

      <div className="space-y-3">
        {sortedCategories.map((category) => (
          <div key={category.name} className="flex items-center gap-3">
            <div
              className={cn(
                "p-2 rounded-lg",
                category.color.replace("bg-", "bg-") + "/10",
              )}
            >
              {category.icon}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{category.name}</span>
                <span className="text-sm">{formatBytes(category.used)}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Progress
                  value={total > 0 ? (category.used / (total || 1)) * 100 : 0}
                  className="h-1.5 flex-1"
                />
                <span className="text-xs text-muted-foreground w-10 text-right">
                  {total > 0 ? ((category.used / (total || 1)) * 100).toFixed(0) : 0}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {onManageStorage && (
        <Button variant="outline" onClick={onManageStorage} className="w-full">
          <Trash2 className="h-4 w-4 mr-2" />
          Manage Files
        </Button>
      )}
    </div>
  );
}

interface UpgradePromptProps {
  currentPlan?: string;
  currentStorage: number;
  plans?: { name: string; storage: number; price: string }[];
  onUpgrade: (plan: string) => void;
  className?: string;
}

export function UpgradePrompt({
  currentPlan = "Free",
  currentStorage,
  plans = [
    { name: "Pro", storage: 50 * 1024 * 1024 * 1024, price: "$9.99/mo" },
    { name: "Studio", storage: 200 * 1024 * 1024 * 1024, price: "$24.99/mo" },
    {
      name: "Enterprise",
      storage: 1024 * 1024 * 1024 * 1024,
      price: "Contact us",
    },
  ],
  onUpgrade,
  className,
}: UpgradePromptProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-full bg-primary/10">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Need More Storage?</CardTitle>
            <p className="text-sm text-muted-foreground">
              Currently on {currentPlan} ({formatBytes(currentStorage)})
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className="flex items-center justify-between p-3 rounded-lg border hover:border-primary/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">{plan.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatBytes(plan.storage)} storage
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-medium">{plan.price}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onUpgrade(plan.name)}
                className="mt-1"
              >
                Upgrade
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
