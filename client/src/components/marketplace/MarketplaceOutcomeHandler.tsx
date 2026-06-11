import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, AlertCircle, Upload, Download, Music, Shield, Star, Heart, ThumbsUp, Users, TrendingUp, Clock, RefreshCw, ExternalLink, Copy, FileAudio, Sparkles, Store, BarChart3, Wallet, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type OutcomeType =
  | "beat_uploaded"
  | "upload_failed"
  | "listing_draft"
  | "listing_published"
  | "listing_updated"
  | "purchase_completed"
  | "payment_failed"
  | "license_ready"
  | "escrow_released"
  | "search_results"
  | "no_results"
  | "filter_applied"
  | "ai_recommendations"
  | "storefront_created"
  | "analytics_loaded"
  | "followers_updated"
  | "payout_requested"
  | "stems_uploaded"
  | "stem_purchased"
  | "download_ready"
  | "rating_submitted"
  | "review_posted"
  | "like_toggled";

interface OutcomeData {
  beatTitle?: string;
  price?: number;
  licenseType?: string;
  downloadUrl?: string;
  licenseUrl?: string;
  previewUrl?: string;
  error?: string;
  searchQuery?: string;
  resultCount?: number;
  filterName?: string;
  recommendations?: unknown[];
  storefrontSlug?: string;
  followerCount?: number;
  payoutAmount?: number;
  rating?: number;
  reviewId?: string;
  isLiked?: boolean;
  suggestions?: string[];
}

interface MarketplaceOutcomeHandlerProps {
  type: OutcomeType;
  data?: OutcomeData;
  onRetry?: () => void;
  onDismiss?: () => void;
  onAction?: (action: string) => void;
  className?: string;
  autoHide?: boolean;
  hideDelay?: number;
}

const outcomeConfig: Record<
  OutcomeType,
  {
    icon: React.ReactNode;
    title: string;
    variant: "success" | "error" | "warning" | "info";
    color: string;
  }
> = {
  beat_uploaded: {
    icon: Upload,
    title: "Beat Uploaded Successfully",
    variant: "success",
    color: "text-green-500",
  },
  upload_failed: {
    icon: XCircle,
    title: "Upload Failed",
    variant: "error",
    color: "text-red-500",
  },
  listing_draft: {
    icon: Clock,
    title: "Listing Saved as Draft",
    variant: "info",
    color: "text-blue-500",
  },
  listing_published: {
    icon: CheckCircle,
    title: "Listing Published",
    variant: "success",
    color: "text-green-500",
  },
  listing_updated: {
    icon: RefreshCw,
    title: "Listing Updated",
    variant: "success",
    color: "text-green-500",
  },
  purchase_completed: {
    icon: CheckCircle,
    title: "Purchase Completed",
    variant: "success",
    color: "text-green-500",
  },
  payment_failed: {
    icon: XCircle,
    title: "Payment Failed",
    variant: "error",
    color: "text-red-500",
  },
  license_ready: {
    icon: FileText,
    title: "License Ready",
    variant: "success",
    color: "text-green-500",
  },
  escrow_released: {
    icon: Shield,
    title: "Escrow Released",
    variant: "success",
    color: "text-green-500",
  },
  search_results: {
    icon: Music,
    title: "Search Results",
    variant: "info",
    color: "text-blue-500",
  },
  no_results: {
    icon: AlertCircle,
    title: "No Results Found",
    variant: "warning",
    color: "text-yellow-500",
  },
  filter_applied: {
    icon: TrendingUp,
    title: "Filter Applied",
    variant: "info",
    color: "text-blue-500",
  },
  ai_recommendations: {
    icon: Sparkles,
    title: "AI Recommendations Ready",
    variant: "success",
    color: "text-purple-500",
  },
  storefront_created: {
    icon: Store,
    title: "Storefront Created",
    variant: "success",
    color: "text-green-500",
  },
  analytics_loaded: {
    icon: BarChart3,
    title: "Analytics Loaded",
    variant: "success",
    color: "text-blue-500",
  },
  followers_updated: {
    icon: Users,
    title: "Followers Updated",
    variant: "success",
    color: "text-green-500",
  },
  payout_requested: {
    icon: Wallet,
    title: "Payout Requested",
    variant: "success",
    color: "text-green-500",
  },
  stems_uploaded: {
    icon: FileAudio,
    title: "Stems Uploaded",
    variant: "success",
    color: "text-green-500",
  },
  stem_purchased: {
    icon: Download,
    title: "Stem Purchase Confirmed",
    variant: "success",
    color: "text-green-500",
  },
  download_ready: {
    icon: Download,
    title: "Download Ready",
    variant: "success",
    color: "text-green-500",
  },
  rating_submitted: {
    icon: Star,
    title: "Rating Submitted",
    variant: "success",
    color: "text-yellow-500",
  },
  review_posted: {
    icon: ThumbsUp,
    title: "Review Posted",
    variant: "success",
    color: "text-green-500",
  },
  like_toggled: {
    icon: Heart,
    title: "Updated",
    variant: "success",
    color: "text-pink-500",
  },
};

export function MarketplaceOutcomeHandler({
  type,
  data = {},
  onRetry,
  onDismiss,
  onAction,
  className,
  autoHide = false,
  hideDelay = 5000,
}: MarketplaceOutcomeHandlerProps) {
  const { toast } = useToast();
  const [visible, setVisible] = useState(true);
  const [copied, setCopied] = useState(false);
  const config = outcomeConfig[type];
  const Icon = config.icon;

  useEffect(() => {
    if (autoHide && hideDelay > 0) {
      const timer = setTimeout(() => {
        setVisible(false);
        onDismiss?.();
      }, hideDelay);
      return () => clearTimeout(timer);
    }
  }, [autoHide, hideDelay, onDismiss]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  };

  if (!visible) return null;

  const renderContent = () => {
    switch (type) {
      case "beat_uploaded":
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Your beat "{data.beatTitle}" has been uploaded and is ready for
              preview.
            </p>
            {data.previewUrl && (
              <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                <Music className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm truncate flex-1">
                  {data.previewUrl}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onAction?.("preview")}
                >
                  Preview
                </Button>
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onAction?.("publish")}>
                Publish Now
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction?.("edit")}
              >
                Edit Details
              </Button>
            </div>
          </div>
        );

      case "upload_failed":
        return (
          <div className="space-y-3">
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Upload Failed</AlertTitle>
              <AlertDescription>
                {data.error ||
                  "An error occurred during upload. Please try again."}
              </AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <Button size="sm" onClick={onRetry}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry Upload
              </Button>
              <Button size="sm" variant="outline" onClick={onDismiss}>
                Cancel
              </Button>
            </div>
          </div>
        );

      case "purchase_completed":
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
              <CheckCircle className="w-8 h-8 text-green-500" />
              <div>
                <p className="font-medium">Purchase Successful!</p>
                <p className="text-sm text-muted-foreground">
                  {data.beatTitle} - {data.licenseType} License
                </p>
              </div>
              <Badge variant="secondary" className="ml-auto">
                ${data.price?.toFixed(2)}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => onAction.("download")} className="w-full">
                <Download className="w-4 h-4 mr-2" />
                Download Beat
              </Button>
              <Button
                variant="outline"
                onClick={() => onAction?.("license")}
                className="w-full"
              >
                <FileText className="w-4 h-4 mr-2" />
                View License
              </Button>
            </div>
          </div>
        );

      case "payment_failed":
        return (
          <div className="space-y-3">
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Payment Failed</AlertTitle>
              <AlertDescription>
                {data.error ||
                  "We were unable to process your payment. Please check your payment details and try again."}
              </AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <Button size="sm" onClick={onRetry}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry Payment
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction?.("change_payment")}
              >
                Change Payment Method
              </Button>
            </div>
          </div>
        );

      case "license_ready":
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <FileText className="w-6 h-6 text-blue-500" />
              <div className="flex-1">
                <p className="font-medium">{data.licenseType} License</p>
                <p className="text-sm text-muted-foreground">
                  {data.beatTitle}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onAction?.("download_license")}>
                <Download className="w-4 h-4 mr-2" />
                Download License
              </Button>
              {data.licenseUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(data.licenseUrl!)}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  {copied ? "Copied!" : "Copy Link"}
                </Button>
              )}
            </div>
          </div>
        );

      case "escrow_released":
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
              <Shield className="w-8 h-8 text-green-500" />
              <div>
                <p className="font-medium">Escrow Funds Released</p>
                <p className="text-sm text-muted-foreground">
                  ${data.price?.toFixed(2)} has been released to the seller
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              The transaction for "{data.beatTitle}" has been completed
              successfully.
            </p>
          </div>
        );

      case "no_results":
        return (
          <div className="space-y-4 text-center py-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                <Music className="w-8 h-8 text-muted-foreground" />
              </div>
            </div>
            <div>
              <p className="font-medium">
                No beats found for "{data.searchQuery}"
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Try adjusting your search or filters
              </p>
            </div>
            {data.suggestions && data.suggestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Suggestions:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {data.suggestions.map((suggestion, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      onClick={() => onAction?.(`search:${suggestion}`)}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case "ai_recommendations":
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              <p className="font-medium">
                AI has found {data.recommendations?.length || 0} beats for you
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Based on your listening history and preferences
            </p>
            <Button
              size="sm"
              onClick={() => onAction?.("view_recommendations")}
            >
              View Recommendations
            </Button>
          </div>
        );

      case "storefront_created":
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
              <Store className="w-8 h-8 text-green-500" />
              <div>
                <p className="font-medium">Storefront Created!</p>
                <p className="text-sm text-muted-foreground">
                  Your store is now live
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
              <span className="text-sm">/store/{data.storefrontSlug}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copyToClipboard(`/store/${data.storefrontSlug}`)}
              >
                <Copy className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onAction?.("view_storefront")}
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          </div>
        );

      case "followers_updated":
        return (
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <Users className="w-6 h-6 text-blue-500" />
            <div>
              <p className="font-medium">Followers Updated</p>
              <p className="text-sm text-muted-foreground">
                You now have {data.followerCount} followers
              </p>
            </div>
          </div>
        );

      case "payout_requested":
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
              <Wallet className="w-8 h-8 text-green-500" />
              <div>
                <p className="font-medium">Payout Requested</p>
                <p className="text-sm text-muted-foreground">
                  ${data.payoutAmount?.toFixed(2)} will be transferred in 3-5
                  business days
                </p>
              </div>
            </div>
          </div>
        );

      case "rating_submitted":
        return (
          <div className="flex items-center gap-3 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={cn(
                    "w-5 h-5",
                    star <= (data.rating || 0)
                      ? "text-yellow-500 fill-yellow-500"
                      : "text-gray-300",
                  )}
                />
              ))}
            </div>
            <p className="font-medium">
              Rating submitted - {data.rating} stars
            </p>
          </div>
        );

      case "like_toggled":
        return (
          <div className="flex items-center gap-3 p-3 bg-pink-50 dark:bg-pink-950/20 rounded-lg">
            <Heart
              className={cn(
                "w-6 h-6",
                data.isLiked ? "text-pink-500 fill-pink-500" : "text-gray-400",
              )}
            />
            <p className="font-medium">
              {data.isLiked ? "Added to favorites" : "Removed from favorites"}
            </p>
          </div>
        );

      case "stems_uploaded":
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
              <FileAudio className="w-8 h-8 text-green-500" />
              <div>
                <p className="font-medium">Stems Uploaded Successfully</p>
                <p className="text-sm text-muted-foreground">
                  Your stems are now available for purchase
                </p>
              </div>
            </div>
            <Button size="sm" onClick={() => onAction?.("manage_stems")}>
              Manage Stems
            </Button>
          </div>
        );

      case "download_ready":
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
              <Download className="w-8 h-8 text-blue-500" />
              <div>
                <p className="font-medium">Download Ready</p>
                <p className="text-sm text-muted-foreground">
                  Your files are ready to download
                </p>
              </div>
            </div>
            {data.downloadUrl && (
              <Button onClick={() => window.open(data.downloadUrl, "_blank")}>
                <Download className="w-4 h-4 mr-2" />
                Download Now
              </Button>
            )}
          </div>
        );

      default:
        return (
          <p className="text-sm text-muted-foreground">
            {data.beatTitle || "Operation completed successfully"}
          </p>
        );
    }
  };

  return (
    <Card
      className={cn(
        "border-l-4",
        {
          "border-l-green-500": config.variant === "success",
          "border-l-red-500": config.variant === "error",
          "border-l-yellow-500": config.variant === "warning",
          "border-l-blue-500": config.variant === "info",
        },
        className,
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={cn("w-5 h-5", config.color)} />
            <CardTitle className="text-lg">{config.title}</CardTitle>
          </div>
          {onDismiss && (
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              ×
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>{renderContent()}</CardContent>
    </Card>
  );
}

export function useMarketplaceOutcome() {
  const { toast } = useToast();

  const showOutcome = (type: OutcomeType, data?: OutcomeData) => {
    const config = outcomeConfig[type];

    toast({
      title: config.title,
      description: data.beatTitle || "Operation completed",
      variant: config.variant === "error" ? "destructive" : "default",
    });
  };

  return { showOutcome };
}

export default MarketplaceOutcomeHandler;
