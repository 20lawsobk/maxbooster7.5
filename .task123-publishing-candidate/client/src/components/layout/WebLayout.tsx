import {
  useState,
  useEffect,
  ReactNode,
  createContext,
  useContext,
  useCallback,
} from "react";
import { Sidebar } from "./Sidebar";
import { BreadcrumbTrail } from "./Breadcrumb";
import {
  useFluidLayout,
  LayoutMode,
  getFluidPadding,
  getFluidGap,
} from "@/hooks/useFluidLayout";
import { cn } from "@/lib/utils";
import { Menu, Bell, Search, User, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { NetworkStatusBanner } from "@/components/offline/NetworkStatusBanner";
import { SyncStatusBar } from "@/components/offline/SyncStatusBar";
import { DraftRecoveryDialog } from "@/components/offline/DraftRecoveryDialog";
import { ConflictResolver } from "@/components/offline/ConflictResolver";
import { OfflineModeWarning } from "@/components/offline/OfflineModeWarning";
import { PendingChangesIndicator } from "@/components/offline/PendingChangesIndicator";
import { useIsOffline, usePendingChanges } from "@/contexts/OfflineContext";
import { draftStorage, offlineQueue } from "@/lib/offline";
import { logger } from "@/lib/logger";

interface WebLayoutContextType {
  layoutMode: LayoutMode;
  containerWidth: number;
  containerHeight: number;
  isCompact: boolean;
  isWide: boolean;
}

const WebLayoutContext = createContext<WebLayoutContextType | null>(null);

export function useWebLayout() {
  const context = useContext(WebLayoutContext);
  if (!context) {
    return {
      layoutMode: "desktop" as LayoutMode,
      containerWidth: 1200,
      containerHeight: 800,
      isCompact: false,
      isWide: false,
    };
  }
  return context;
}

interface WebLayoutProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  noPadding?: boolean;
  showSidebar?: boolean;
  className?: string;
}

export function WebLayout({
  title,
  subtitle,
  children,
  noPadding = false,
  showSidebar = true,
  className,
}: WebLayoutProps) {
  const [_isSidebarOpen, _setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const fluidLayout = useFluidLayout();
  const {
    containerRef,
    layoutMode,
    containerWidth,
    containerHeight,
    isSmallHeight,
  } = fluidLayout;
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [signingOut, setSigningOut] = useState(false);

  const isOffline = useIsOffline();
  const { conflictCount } = usePendingChanges();

  const [conflictResolverOpen, setConflictResolverOpen] = useState(false);
  const [draftRecoveryOpen, setDraftRecoveryOpen] = useState(false);

  const isCompact = containerWidth < 1024;
  const isWide = containerWidth > 1600;

  const contextValue: WebLayoutContextType = {
    layoutMode,
    containerWidth,
    containerHeight,
    isCompact,
    isWide,
  };

  // Auto-open draft recovery dialog on first mount if there are saved drafts.
  useEffect(() => {
    let cancelled = false;
    draftStorage
      .getAllDrafts()
      .then((drafts) => {
        if (!cancelled && drafts.length > 0) {
          setDraftRecoveryOpen(true);
        }
      })
      .catch((err) => {
        logger.warn("[WebLayout] Could not check drafts:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-open conflict resolver when unresolved conflicts exist.
  useEffect(() => {
    if (conflictCount > 0) {
      offlineQueue
        .getConflicts()
        .then((conflicts) => {
          if (conflicts.length > 0) setConflictResolverOpen(true);
        })
        .catch(() => {});
    }
  }, [conflictCount]);

  const handleConflictResolve = useCallback(
    async (
      actionId: string,
      resolution: "local" | "server" | "merged",
      mergedData?: unknown,
    ) => {
      await offlineQueue.resolveConflict(actionId, resolution, mergedData);
    },
    [],
  );

  const handleConflictResolveAll = useCallback(
    async (resolution: "local" | "server") => {
      const conflicts = await offlineQueue.getConflicts();
      for (const conflict of conflicts) {
        await offlineQueue.resolveConflict(conflict.actionId, resolution);
      }
      setConflictResolverOpen(false);
    },
    [],
  );

  const getPadding = () => {
    if (noPadding) return "";
    return getFluidPadding(layoutMode);
  };

  const getSpacing = () => {
    return getFluidGap(layoutMode);
  };

  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
      setLocation("/login");
    }
  };

  return (
    <WebLayoutContext.Provider value={contextValue}>
      <div
        ref={containerRef}
        className={cn("flex flex-col bg-background overflow-hidden", className)}
        style={{
          height: "100dvh",
          minHeight: isSmallHeight ? "auto" : "100dvh",
        }}
        data-layout="web"
        data-mode={layoutMode}
      >
        {/* Offline network status banner — only visible when offline or reconnecting */}
        <NetworkStatusBanner
          variant="compact"
          position="inline"
          autoDismiss={true}
          autoDismissDelay={4000}
        />

        <div className="flex flex-1 overflow-hidden min-h-0">
          {showSidebar && (
            <Sidebar
              isMobileOpen={isMobileMenuOpen}
              onMobileClose={() => setIsMobileMenuOpen(false)}
            />
          )}

          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            <header className="h-14 border-b border-border bg-background/95 backdrop-blur-sm flex items-center justify-between px-4 lg:px-6 shrink-0">
              <div className="flex items-center gap-3">
                {showSidebar && isCompact && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsMobileMenuOpen(true)}
                    className="lg:hidden"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                )}

                <div className="min-w-0">
                  {title && (
                    <h1 className="font-semibold text-base truncate">
                      {title}
                    </h1>
                  )}
                  {subtitle && (
                    <p className="text-xs text-muted-foreground truncate">
                      {subtitle}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="hidden sm:flex">
                  <Search className="h-4 w-4" />
                </Button>

                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-4 w-4" />
                  <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
                </Button>

                {/* Sync / pending-changes indicator */}
                <PendingChangesIndicator
                  variant="badge"
                  showDropdown={true}
                  onViewAll={() => setConflictResolverOpen(true)}
                />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <span className="hidden md:inline text-sm">
                        {user?.username || "User"}
                      </span>
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setLocation("/settings")}>
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setLocation("/settings?tab=profile")}
                    >
                      Profile
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleLogout}
                      className="text-destructive"
                    >
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>

            <main
              className={cn(
                "flex-1",
                noPadding
                  ? "overflow-hidden"
                  : `overflow-y-auto ${getPadding()} pb-6`,
              )}
            >
              {noPadding ? (
                children
              ) : (
                <div className="max-w-[1920px] mx-auto">
                  {/* Show offline capability warning for routes that require connectivity */}
                  {isOffline && (
                    <OfflineModeWarning variant="banner" className="mb-4" />
                  )}
                  <div className="mb-4">
                    <BreadcrumbTrail />
                  </div>
                  <div className={getSpacing().replace("gap", "space-y")}>
                    {children}
                  </div>
                </div>
              )}
            </main>
          </div>
        </div>

        {/* Sync progress toast — fixed bottom-center, self-manages visibility */}
        <SyncStatusBar
          onRetry={() => {
            import("@/lib/offline").then(({ syncManager }) =>
              syncManager.retryFailed(),
            );
          }}
        />

        {/* Draft recovery modal — auto-opens when unsaved drafts detected on mount */}
        <DraftRecoveryDialog
          open={draftRecoveryOpen}
          onOpenChange={setDraftRecoveryOpen}
        />

        {/* Conflict resolver modal — auto-opens when sync conflicts are detected */}
        <ConflictResolver
          open={conflictResolverOpen}
          onOpenChange={setConflictResolverOpen}
          onResolve={handleConflictResolve}
          onResolveAll={handleConflictResolveAll}
        />
      </div>
    </WebLayoutContext.Provider>
  );
}
