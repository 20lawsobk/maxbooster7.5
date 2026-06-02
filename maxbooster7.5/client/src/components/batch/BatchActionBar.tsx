import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBatchSelectContext } from "./BatchSelectProvider";
import {
  X,
  Trash2,
  Edit,
  Download,
  Upload,
  MoreHorizontal,
  CheckCircle,
  Send,
  Calendar,
  Copy,
  RefreshCw,
  FileText,
  Settings,
  Share2,
  Archive,
  Tag,
} from "lucide-react";

export type BatchAction = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  variant?: "default" | "destructive" | "outline";
  disabled?: boolean;
  hidden?: boolean;
  onClick: (selectedIds: string[]) => void;
};

export interface BatchActionBarProps {
  actions?: BatchAction[];
  onDelete?: (ids: string[]) => void;
  onEdit?: (ids: string[]) => void;
  onExport?: (ids: string[]) => void;
  onStatusChange?: (ids: string[], status: string) => void;
  showDefaultActions?: boolean;
  className?: string;
  position?: "top" | "bottom" | "floating";
}

export function BatchActionBar({
  actions = [],
  onDelete,
  onEdit,
  onExport,
  onStatusChange,
  showDefaultActions = true,
  className,
  position = "floating",
}: BatchActionBarProps) {
  const { selectedIds, selectedCount, clearSelection, resource } =
    useBatchSelectContext();

  if (selectedCount === 0) return null;

  const selectedArray = Array.from(selectedIds);

  const mergedActions: BatchAction[] = showDefaultActions
    ? [
        {
          id: "edit",
          label: "Edit",
          icon: <Edit className="h-4 w-4" />,
          onClick: () => onEdit?.(selectedArray),
          hidden: !onEdit,
        },
        {
          id: "export",
          label: "Export",
          icon: <Download className="h-4 w-4" />,
          onClick: () => onExport?.(selectedArray),
          hidden: !onExport,
        },
        ...actions,
        {
          id: "delete",
          label: "Delete",
          icon: <Trash2 className="h-4 w-4" />,
          variant: "destructive",
          onClick: () => onDelete?.(selectedArray),
          hidden: !onDelete,
        },
      ].filter((a) => !a.hidden)
    : actions.filter((a) => !a.hidden);

  const visibleActions = mergedActions.slice(0, 4);
  const moreActions = mergedActions.slice(4);

  const positionClasses = {
    top: "sticky top-0 z-40",
    bottom: "sticky bottom-0 z-40",
    floating: "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 shadow-lg",
  };

  return (
    <TooltipProvider>
      <div
        className={cn(
          "flex items-center gap-2 px-4 py-3 bg-background/95 backdrop-blur-sm border rounded-lg",
          positionClasses[position],
          className,
        )}
        role="toolbar"
        aria-label="Batch actions"
      >
        <Badge variant="secondary" className="font-medium">
          {selectedCount} selected
        </Badge>

        <div className="h-4 w-px bg-border" />

        <div className="flex items-center gap-1">
          {visibleActions.map((action) => (
            <Tooltip key={action.id}>
              <TooltipTrigger asChild>
                <Button
                  variant={action.variant || "outline"}
                  size="sm"
                  onClick={() => action.onClick(selectedArray)}
                  disabled={action.disabled}
                  className="gap-2"
                >
                  {action.icon}
                  <span className="hidden sm:inline">{action.label}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{action.label}</p>
              </TooltipContent>
            </Tooltip>
          ))}

          {moreActions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {moreActions.map((action, index) => (
                  <DropdownMenuItem
                    key={action.id}
                    onClick={() => action.onClick(selectedArray)}
                    disabled={action.disabled}
                    className={
                      action.variant === "destructive" ? "text-destructive" : ""
                    }
                  >
                    {action.icon}
                    <span className="ml-2">{action.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="h-4 w-px bg-border" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Clear selection</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

export function DistributionBatchActionBar({
  onSubmit,
  onWithdraw,
  ...props
}: BatchActionBarProps & {
  onSubmit?: (ids: string[]) => void;
  onWithdraw?: (ids: string[]) => void;
}) {
  const distributionActions: BatchAction[] = [
    {
      id: "submit",
      label: "Submit",
      icon: <Send className="h-4 w-4" />,
      onClick: (ids) => onSubmit?.(ids),
      hidden: !onSubmit,
    },
    {
      id: "withdraw",
      label: "Withdraw",
      icon: <Archive className="h-4 w-4" />,
      onClick: (ids) => onWithdraw?.(ids),
      hidden: !onWithdraw,
    },
  ].filter((a) => !a.hidden);

  return <BatchActionBar {...props} actions={distributionActions} />;
}

export function SocialBatchActionBar({
  onSchedule,
  onPublish,
  ...props
}: BatchActionBarProps & {
  onSchedule?: (ids: string[]) => void;
  onPublish?: (ids: string[]) => void;
}) {
  const socialActions: BatchAction[] = [
    {
      id: "schedule",
      label: "Schedule",
      icon: <Calendar className="h-4 w-4" />,
      onClick: (ids) => onSchedule?.(ids),
      hidden: !onSchedule,
    },
    {
      id: "publish",
      label: "Publish Now",
      icon: <Send className="h-4 w-4" />,
      onClick: (ids) => onPublish?.(ids),
      hidden: !onPublish,
    },
  ].filter((a) => !a.hidden);

  return <BatchActionBar {...props} actions={socialActions} />;
}

export function MarketplaceBatchActionBar({
  onUpdatePrice,
  onDuplicate,
  ...props
}: BatchActionBarProps & {
  onUpdatePrice?: (ids: string[]) => void;
  onDuplicate?: (ids: string[]) => void;
}) {
  const marketplaceActions: BatchAction[] = [
    {
      id: "updatePrice",
      label: "Update Price",
      icon: <Tag className="h-4 w-4" />,
      onClick: (ids) => onUpdatePrice?.(ids),
      hidden: !onUpdatePrice,
    },
    {
      id: "duplicate",
      label: "Duplicate",
      icon: <Copy className="h-4 w-4" />,
      onClick: (ids) => onDuplicate?.(ids),
      hidden: !onDuplicate,
    },
  ].filter((a) => !a.hidden);

  return <BatchActionBar {...props} actions={marketplaceActions} />;
}

export function StudioBatchActionBar({
  onProcess,
  onNormalize,
  ...props
}: BatchActionBarProps & {
  onProcess?: (ids: string[]) => void;
  onNormalize?: (ids: string[]) => void;
}) {
  const studioActions: BatchAction[] = [
    {
      id: "process",
      label: "Process",
      icon: <RefreshCw className="h-4 w-4" />,
      onClick: (ids) => onProcess?.(ids),
      hidden: !onProcess,
    },
    {
      id: "normalize",
      label: "Normalize",
      icon: <Settings className="h-4 w-4" />,
      onClick: (ids) => onNormalize?.(ids),
      hidden: !onNormalize,
    },
  ].filter((a) => !a.hidden);

  return <BatchActionBar {...props} actions={studioActions} />;
}
