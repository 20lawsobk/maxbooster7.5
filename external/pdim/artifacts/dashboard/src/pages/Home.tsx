import React, { useState } from "react";
import { useLocation } from "wouter";
import {
  Server,
  Zap,
  Search,
  KeySquare,
  Clock,
  Plus,
  Copy,
  CheckCircle2,
  ShieldAlert,
  Activity,
  RefreshCw,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useInstances } from "../hooks/use-instances";
import { useAutoPushStatus, useAutoPushRestart } from "../hooks/use-autopush";
import { CreateInstanceDialog } from "../components/CreateInstanceDialog";
import { cn } from "../lib/utils";

export function Home() {
  const [_, setLocation] = useLocation();
  const { data, isLoading, error } = useInstances();
  const { data: push } = useAutoPushStatus();
  const restartMutation = useAutoPushRestart();
  const [search, setSearch] = useState("");
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const filteredInstances =
    data?.instances.filter(
      (i) =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.id.includes(search),
    ) || [];

  const handleCopyUrl = (e: React.MouseEvent, url: string, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-white/5 px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 bg-primary/20 rounded-xl flex items-center justify-center border border-primary/30 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold font-mono tracking-tight text-foreground truncate">
                Max Booster <span className="text-primary">Storage</span>
              </h1>
              <p className="text-xs font-mono text-muted-foreground hidden sm:block">
                High-performance KV Database
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Desktop search */}
            <div className="relative hidden md:block w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Find instance..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-input/50 border border-white/10 rounded-full pl-9 pr-4 py-2 text-sm font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
              />
            </div>

            {/* Mobile search toggle */}
            <button
              onClick={() => setSearchOpen((o) => !o)}
              className="md:hidden p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg transition-colors"
              aria-label="Search"
            >
              {searchOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Search className="w-5 h-5" />
              )}
            </button>

            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-full hover:bg-primary/90 hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all active:scale-95 text-sm shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Provision</span>
            </button>
          </div>
        </div>

        {/* Mobile search bar */}
        {searchOpen && (
          <div className="md:hidden mt-3 max-w-7xl mx-auto">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Find instance..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-input/50 border border-white/10 rounded-full pl-9 pr-4 py-2 text-sm font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
                autoFocus
              />
            </div>
          </div>
        )}
      </header>

      {/* Auto-Push Progress Banner */}
      {push && (
        <div
          className={cn(
            "border-b px-4 sm:px-6 py-3",
            push.running
              ? "bg-cyan-950/40 border-cyan-500/20"
              : "bg-green-950/40 border-green-500/20",
          )}
        >
          <div className="max-w-7xl mx-auto flex items-center gap-3 flex-wrap">
            <div
              className={cn(
                "flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider shrink-0",
                push.running ? "text-cyan-400" : "text-green-400",
              )}
            >
              <Activity
                className={cn("w-3.5 h-3.5", push.running && "animate-pulse")}
              />
              {push.running ? "Pushing" : "Transfer Complete"}
            </div>

            <div className="flex-1 min-w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  push.running
                    ? "bg-gradient-to-r from-cyan-500 to-blue-500"
                    : "bg-gradient-to-r from-green-500 to-emerald-400",
                )}
                style={{ width: `${Math.min(Number(push.pct), 100)}%` }}
              />
            </div>

            <div className="shrink-0 flex items-center gap-3 text-xs font-mono text-muted-foreground tabular-nums flex-wrap">
              <span
                className={push.running ? "text-cyan-300" : "text-green-300"}
              >
                {Number(push.pct).toFixed(1)}%
              </span>

              {push.gbPushed && push.totalGB && (
                <span>
                  {Number(push.gbPushed).toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}{" "}
                  /{" "}
                  {Number(push.totalGB).toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}{" "}
                  GB
                </span>
              )}

              <span>
                {push.chunkIndex.toLocaleString()} /{" "}
                {push.totalChunks.toLocaleString()} chunks
              </span>

              {push.running &&
                push.chunksPerSec != null &&
                push.chunksPerSec > 0 && (
                  <span className="text-cyan-400/70">
                    {push.chunksPerSec.toLocaleString()} chunks/s
                  </span>
                )}

              {push.running &&
                push.etaSeconds != null &&
                push.etaSeconds > 0 && (
                  <span className="text-cyan-400/60">
                    ETA{" "}
                    {push.etaSeconds < 60
                      ? `${push.etaSeconds}s`
                      : `${Math.round(push.etaSeconds / 60)}m`}
                  </span>
                )}
            </div>

            {!push.running && (
              <button
                onClick={() => restartMutation.mutate()}
                disabled={restartMutation.isPending}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1 text-xs font-mono bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-muted-foreground hover:text-foreground transition-all disabled:opacity-40"
                title="Replay full transfer from chunk 0"
              >
                <RefreshCw
                  className={cn(
                    "w-3 h-3",
                    restartMutation.isPending && "animate-spin",
                  )}
                />
                Replay
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Summary row */}
        {!isLoading && !error && data && (
          <div className="flex items-center justify-between mb-6">
            <div className="text-sm text-muted-foreground font-mono">
              {filteredInstances.length === data.instances.length ? (
                <span>
                  {data.count} {data.count === 1 ? "instance" : "instances"}
                </span>
              ) : (
                <span>
                  {filteredInstances.length} of {data.count} instances
                </span>
              )}
            </div>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-xs text-primary/70 hover:text-primary transition-colors flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                Clear search
              </button>
            )}
          </div>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-52 bg-card animate-pulse rounded-2xl border border-white/5"
              />
            ))}
          </div>
        )}

        {error && (
          <div className="p-6 bg-destructive/10 border border-destructive/20 rounded-2xl flex items-center gap-4 text-destructive">
            <ShieldAlert className="w-8 h-8 shrink-0" />
            <div>
              <h3 className="font-bold">Failed to load instances</h3>
              <p className="text-sm opacity-80 mt-1">
                Check server connection and try again.
              </p>
            </div>
          </div>
        )}

        {!isLoading && !error && filteredInstances.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Server className="w-16 h-16 text-muted-foreground/20 mb-4" />
            {search ? (
              <>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  No instances matched
                </h3>
                <p className="text-sm text-muted-foreground mb-6">
                  No results for "{search}"
                </p>
                <button
                  onClick={() => setSearch("")}
                  className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
                >
                  Clear search
                </button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  No instances yet
                </h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Provision your first Redis-compatible instance to get started.
                </p>
                <button
                  onClick={() => setCreateOpen(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-full hover:bg-primary/90 transition-all text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Provision Instance
                </button>
              </>
            )}
          </div>
        )}

        {!isLoading && !error && filteredInstances.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredInstances.map((instance) => {
              const isAgent = instance.name === "max-booster-agent";
              const isTraining = instance.name === "max-booster-training";
              const isSystem = isAgent || isTraining;

              return (
                <div
                  key={instance.id}
                  onClick={() => setLocation(`/instances/${instance.id}`)}
                  className={cn(
                    "group relative p-6 rounded-2xl bg-card border cursor-pointer transition-all duration-300 hover:-translate-y-1",
                    isSystem
                      ? "border-white/20 bg-gradient-to-b from-card to-card/50"
                      : "border-white/5 hover:border-white/20",
                    isAgent
                      ? "hover:shadow-[0_8px_30px_rgba(6,182,212,0.15)]"
                      : "",
                    isTraining
                      ? "hover:shadow-[0_8px_30px_rgba(168,85,247,0.15)]"
                      : "",
                  )}
                >
                  {isSystem && (
                    <div
                      className={cn(
                        "absolute -top-3 -right-3 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border",
                        isAgent
                          ? "bg-cyan-950/80 text-cyan-400 border-cyan-500/30"
                          : "bg-purple-950/80 text-purple-400 border-purple-500/30",
                      )}
                    >
                      System Core
                    </div>
                  )}

                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "w-12 h-12 shrink-0 rounded-xl flex items-center justify-center border",
                          isAgent
                            ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
                            : isTraining
                              ? "bg-purple-500/10 border-purple-500/30 text-purple-400"
                              : "bg-secondary border-white/10 text-muted-foreground group-hover:text-primary group-hover:border-primary/30 transition-colors",
                        )}
                      >
                        <Server className="w-6 h-6" />
                      </div>
                      <div className="min-w-0">
                        <h3
                          className={cn(
                            "font-bold font-mono text-lg truncate",
                            isAgent
                              ? "text-cyan-400"
                              : isTraining
                                ? "text-purple-400"
                                : "text-foreground",
                          )}
                          title={instance.name}
                        >
                          {instance.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={cn(
                              "w-2 h-2 rounded-full shrink-0",
                              instance.isActive
                                ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                                : "bg-red-500",
                            )}
                          />
                          <span className="text-xs font-mono text-muted-foreground uppercase">
                            {instance.isActive ? "Online" : "Offline"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className="p-3 bg-background/50 rounded-xl border border-white/5">
                      <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        <KeySquare className="w-3 h-3" /> Keys
                      </div>
                      <div className="font-mono font-bold text-lg text-foreground tabular-nums">
                        {instance.keyCount.toLocaleString()}
                      </div>
                    </div>
                    <div className="p-3 bg-background/50 rounded-xl border border-white/5">
                      <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Used
                      </div>
                      <div
                        className="font-mono font-medium text-sm text-foreground truncate"
                        title={new Date(instance.lastUsedAt).toLocaleString()}
                      >
                        {formatDistanceToNow(new Date(instance.lastUsedAt), {
                          addSuffix: true,
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono text-muted-foreground/70 border-t border-white/5 pt-4">
                    <div className="truncate pr-4" title={instance.id}>
                      ID: {instance.id.slice(0, 8)}...
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      Token:{" "}
                      <span className="text-primary/70">
                        {instance.tokenHint}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={(e) =>
                      handleCopyUrl(e, instance.httpUrl, instance.id)
                    }
                    className="absolute bottom-4 right-4 p-2 bg-secondary/80 text-muted-foreground rounded-lg hover:bg-primary hover:text-primary-foreground opacity-0 group-hover:opacity-100 transition-all duration-200"
                    title="Copy HTTP URL"
                  >
                    {copiedId === instance.id ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <CreateInstanceDialog
        isOpen={isCreateOpen}
        onClose={() => setCreateOpen(false)}
        onSuccessNavigate={(id) => setLocation(`/instances/${id}`)}
      />
    </div>
  );
}
