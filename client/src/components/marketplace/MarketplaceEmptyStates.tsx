import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Music,
  Search,
  ShoppingCart,
  Users,
  TrendingUp,
  Upload,
  Heart,
  Download,
  DollarSign,
  Store,
  FileAudio,
  Star,
  Filter,
  RefreshCw,
  Sparkles,
  Zap,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  onAction?: (action: string) => void;
  className?: string;
}

interface SearchEmptyStateProps extends EmptyStateProps {
  searchQuery?: string;
  suggestions?: string[];
  filterApplied?: boolean;
}

export function NoBeatsFoundEmptyState({
  searchQuery,
  suggestions = ["Trap", "Hip-Hop", "R&B", "Lo-Fi", "Pop"],
  filterApplied = false,
  onAction,
  className,
}: SearchEmptyStateProps) {
  return (
    <div className={cn("py-12", className)}>
      <EmptyState
        icon={Search}
        title={
          searchQuery ? `No beats found for "${searchQuery}"` : "No beats found"
        }
        description={
          filterApplied
            ? "Try adjusting your filters or search with different keywords"
            : "Explore popular genres or try a different search term"
        }
        variant="card"
        size="lg"
      />

      {suggestions.length > 0 && (
        <div className="mt-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            Popular searches:
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                size="sm"
                onClick={() => onAction?.(`search:${suggestion}`)}
                className="hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300"
              >
                {suggestion}
              </Button>
            ))}
          </div>
        </div>
      )}

      {filterApplied && (
        <div className="mt-4 text-center">
          <Button variant="ghost" onClick={() => onAction?.("clear_filters")}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Clear all filters
          </Button>
        </div>
      )}
    </div>
  );
}

export function EmptyCartState({ onAction, className }: EmptyStateProps) {
  return (
    <div className={cn("py-8", className)}>
      <EmptyState
        icon={ShoppingCart}
        title="Your cart is empty"
        description="Browse the marketplace and add some beats to get started"
        actionLabel="Browse Beats"
        onAction={() => onAction?.("browse")}
        variant="minimal"
        size="md"
      />
    </div>
  );
}

export function NoPurchasesState({ onAction, className }: EmptyStateProps) {
  return (
    <div className={cn("py-12", className)}>
      <EmptyState
        icon={Download}
        title="No purchases yet"
        description="Your purchased beats and licenses will appear here"
        actionLabel="Browse Marketplace"
        onAction={() => onAction?.("browse")}
        variant="card"
        size="lg"
      />
    </div>
  );
}

export function NoMyBeatsState({ onAction, className }: EmptyStateProps) {
  return (
    <div className={cn("py-12", className)}>
      <EmptyState
        icon={Music}
        title="No beats uploaded yet"
        description="Start selling by uploading your first beat to the marketplace"
        actionLabel="Upload Beat"
        onAction={() => onAction?.("upload")}
        secondaryActionLabel="Bulk Upload"
        onSecondaryAction={() => onAction?.("bulk_upload")}
        variant="card"
        size="lg"
      />

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
        <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 border-purple-200 dark:border-purple-800">
          <CardContent className="p-4 text-center">
            <Upload className="w-8 h-8 mx-auto mb-2 text-purple-600" />
            <h4 className="font-medium text-sm">Easy Upload</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Drag & drop audio files
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4 text-center">
            <DollarSign className="w-8 h-8 mx-auto mb-2 text-blue-600" />
            <h4 className="font-medium text-sm">Set Your Price</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Custom license tiers
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-800">
          <CardContent className="p-4 text-center">
            <TrendingUp className="w-8 h-8 mx-auto mb-2 text-green-600" />
            <h4 className="font-medium text-sm">Track Sales</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Real-time analytics
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function NoProducersFoundState({
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("py-12", className)}>
      <EmptyState
        icon={Users}
        title="No producers found"
        description="Try adjusting your search or browse all producers"
        actionLabel="View All Producers"
        onAction={() => onAction?.("view_all")}
        variant="card"
        size="md"
      />
    </div>
  );
}

export function NoFavoritesState({ onAction, className }: EmptyStateProps) {
  return (
    <div className={cn("py-12", className)}>
      <EmptyState
        icon={Heart}
        title="No favorites yet"
        description="Like beats to save them to your favorites for easy access"
        actionLabel="Explore Beats"
        onAction={() => onAction?.("browse")}
        variant="card"
        size="md"
      />
    </div>
  );
}

export function NoAnalyticsDataState({ className }: EmptyStateProps) {
  return (
    <div className={cn("py-12", className)}>
      <EmptyState
        icon={TrendingUp}
        title="No analytics data yet"
        description="Your sales and performance data will appear here once you start selling"
        variant="card"
        size="md"
      />
    </div>
  );
}

export function NoStorefrontState({ onAction, className }: EmptyStateProps) {
  return (
    <div className={cn("py-12", className)}>
      <EmptyState
        icon={Store}
        title="Create your storefront"
        description="Build a custom page to showcase your beats and connect with fans"
        actionLabel="Create Storefront"
        onAction={() => onAction?.("create_storefront")}
        variant="card"
        size="lg"
      />

      <div className="mt-8 flex flex-wrap gap-3 justify-center">
        <Badge variant="outline" className="text-sm py-1.5 px-3">
          <Globe className="w-4 h-4 mr-2" />
          Custom URL
        </Badge>
        <Badge variant="outline" className="text-sm py-1.5 px-3">
          <Sparkles className="w-4 h-4 mr-2" />
          Themes & Branding
        </Badge>
        <Badge variant="outline" className="text-sm py-1.5 px-3">
          <Users className="w-4 h-4 mr-2" />
          Membership Tiers
        </Badge>
      </div>
    </div>
  );
}

export function NoStemsState({ onAction, className }: EmptyStateProps) {
  return (
    <div className={cn("py-12", className)}>
      <EmptyState
        icon={FileAudio}
        title="No stems uploaded"
        description="Upload individual track stems to offer more value to your customers"
        actionLabel="Upload Stems"
        onAction={() => onAction?.("upload_stems")}
        variant="card"
        size="md"
      />
    </div>
  );
}

export function NoReviewsState({ className }: EmptyStateProps) {
  return (
    <div className={cn("py-8", className)}>
      <EmptyState
        icon={Star}
        title="No reviews yet"
        description="Be the first to leave a review for this beat"
        variant="minimal"
        size="sm"
      />
    </div>
  );
}

export function NoAIRecommendationsState({
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("py-8", className)}>
      <EmptyState
        icon={Sparkles}
        title="No recommendations yet"
        description="Listen to more beats to get personalized AI recommendations"
        actionLabel="Explore Beats"
        onAction={() => onAction?.("browse")}
        variant="minimal"
        size="md"
      />
    </div>
  );
}

export function NoEscrowTransactionsState({ className }: EmptyStateProps) {
  return (
    <div className={cn("py-12", className)}>
      <EmptyState
        icon={DollarSign}
        title="No escrow transactions"
        description="Secure transactions with escrow protection will appear here"
        variant="card"
        size="md"
      />
    </div>
  );
}

export function NoContractsState({ onAction, className }: EmptyStateProps) {
  return (
    <div className={cn("py-12", className)}>
      <EmptyState
        icon={Music}
        title="No custom contracts"
        description="Create custom license templates for your beats"
        actionLabel="Create Contract"
        onAction={() => onAction?.("create_contract")}
        variant="card"
        size="md"
      />
    </div>
  );
}

export function NoCollaborationsState({
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("py-12", className)}>
      <EmptyState
        icon={Users}
        title="No collaborations yet"
        description="Connect with other producers and artists to create together"
        actionLabel="Find Collaborators"
        onAction={() => onAction?.("find_collaborators")}
        variant="card"
        size="md"
      />
    </div>
  );
}

export function FilterResultsHeader({
  resultCount,
  filterName,
  onClear,
  className,
}: {
  resultCount: number;
  filterName?: string;
  onClear?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between py-3", className)}>
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          {resultCount} {resultCount === 1 ? "result" : "results"}
          {filterName && (
            <span className="font-medium text-foreground">
              {" "}
              for "{filterName}"
            </span>
          )}
        </span>
      </div>
      {onClear && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Clear filters
        </Button>
      )}
    </div>
  );
}

export default {
  NoBeatsFoundEmptyState,
  EmptyCartState,
  NoPurchasesState,
  NoMyBeatsState,
  NoProducersFoundState,
  NoFavoritesState,
  NoAnalyticsDataState,
  NoStorefrontState,
  NoStemsState,
  NoReviewsState,
  NoAIRecommendationsState,
  NoEscrowTransactionsState,
  NoContractsState,
  NoCollaborationsState,
  FilterResultsHeader,
};
