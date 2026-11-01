import React, { useState, useEffect } from "react";
import { useRoute, Link, useLocation } from "wouter";
import {
  ArrowLeft,
  Clock,
  Copy,
  CheckCircle2,
  Database,
  Terminal as TermIcon,
  ShieldAlert,
  KeyRound,
  Save,
  Activity,
  Trash2,
  AlertTriangle,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useInstance, useDeleteInstance } from "../hooks/use-instances";
import { Terminal } from "../components/Terminal";
import { KeyExplorer } from "../components/KeyExplorer";
import { tokenStore, cn, formatUptime } from "../lib/utils";

export function InstanceDetail() {
  const [match, params] = useRoute("/instances/:id");
  const id = params?.id || "";
  const [_, setLocation] = useLocation();

  const { data, isLoading, error, refetch } = useInstance(id);
  const deleteMutation = useDeleteInstance();

  const [activeTab, setActiveTab] = useState<
    "overview" | "explorer" | "console"
  >("overview");

  const [showAuthForm, setShowAuthForm] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    if (error && error.message === "UNAUTHORIZED") {
      setShowAuthForm(true);
    } else {
      setShowAuthForm(false);
    }
  }, [error]);

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    tokenStore.set(id, tokenInput.trim());
    refetch();
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(id);
      setShowDeleteModal(false);
      setLocation("/");
    } catch {
      setShowDeleteModal(false);
    }
  };

  const handleCopyUrl = () => {
    if (!data) return;
    navigator.clipboard.writeText(data.connectionUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  if (!match) return <div>Invalid Route</div>;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (showAuthForm) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md p-8 glass-panel rounded-3xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-primary" />

          <Link
            href="/"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Instances
          </Link>

          <div className="flex items-center justify-center w-16 h-16 bg-red-500/10 rounded-2xl mb-6 mx-auto border border-red-500/20">
            <ShieldAlert className="w-8 h-8 text-red-500" />
          </div>

          <h2 className="text-2xl font-bold font-mono text-center text-foreground mb-2">
            Authentication Required
          </h2>
          <p className="text-center text-muted-foreground mb-8 text-sm">
            Instance{" "}
            <span className="font-mono text-foreground">
              {id.slice(0, 8)}...
            </span>{" "}
            requires a Bearer token.
          </p>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div className="relative">
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="password"
                placeholder="Enter connection token"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-input border border-white/10 rounded-xl text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all font-mono"
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-foreground text-background font-bold rounded-xl hover:bg-white/90 transition-all active:scale-95"
            >
              Connect to Instance
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (error && !showAuthForm) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4 opacity-60" />
          <p className="text-destructive font-mono text-sm">{error.message}</p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Instances
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col h-screen overflow-hidden">
      {/* Top Navigation */}
      <header className="flex-none bg-card border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href="/"
            className="p-2 bg-secondary text-muted-foreground rounded-lg hover:text-foreground hover:bg-white/10 transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1
                className="text-xl font-bold font-mono text-foreground truncate"
                title={data.name}
              >
                {data.name}
              </h1>
              <span className="shrink-0 px-2 py-0.5 rounded text-xs font-mono font-bold bg-green-500/20 text-green-400 border border-green-500/30 uppercase tracking-wider">
                Connected
              </span>
            </div>
            <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">
              {data.id}
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowDeleteModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg hover:bg-destructive/20 transition-colors text-sm font-semibold shrink-0 ml-4"
        >
          <Trash2 className="w-4 h-4" />
          <span className="hidden sm:inline">Destroy</span>
        </button>
      </header>

      {/* Tabs */}
      <div className="flex-none px-6 border-b border-white/5 flex gap-6 overflow-x-auto">
        {[
          { id: "overview", label: "Overview", icon: Activity },
          { id: "explorer", label: "Key Explorer", icon: Database },
          { id: "console", label: "Console", icon: TermIcon },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={cn(
              "flex items-center gap-2 py-4 text-sm font-medium border-b-2 transition-all whitespace-nowrap",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-white/20",
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden p-6 bg-background">
        <div className="max-w-7xl mx-auto h-full">
          {activeTab === "overview" && (
            <div className="space-y-6 h-full overflow-y-auto pb-20">
              {/* Connection Box */}
              <div className="glass-panel p-6 rounded-2xl">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                  Connection Strings
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">
                      PocketDimension URL
                    </label>
                    <div className="flex items-center relative">
                      <input
                        readOnly
                        value={data.connectionUrl}
                        className="w-full bg-input border border-white/10 rounded-xl py-3 pl-4 pr-12 font-mono text-primary text-sm focus:outline-none"
                      />
                      <button
                        onClick={handleCopyUrl}
                        className="absolute right-2 p-2 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                        title="Copy connection URL"
                      >
                        {copiedUrl ? (
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">
                      HTTP API Base
                    </label>
                    <input
                      readOnly
                      value={data.httpUrl}
                      className="w-full bg-input border border-white/10 rounded-xl px-4 py-3 font-mono text-foreground text-sm focus:outline-none opacity-70"
                    />
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  title="Total Keys"
                  value={data.keyCount.toLocaleString()}
                  icon={<Database className="w-5 h-5 text-cyan-400" />}
                />
                <StatCard
                  title="Commands Processed"
                  value={data.totalCommandsProcessed.toLocaleString()}
                  icon={<Activity className="w-5 h-5 text-purple-400" />}
                />
                <StatCard
                  title="Uptime"
                  value={formatUptime(data.uptimeSeconds)}
                  icon={<Clock className="w-5 h-5 text-green-400" />}
                />
                <StatCard
                  title="Persistence"
                  value={data.persistenceEnabled ? "Enabled" : "Disabled"}
                  icon={<Save className="w-5 h-5 text-orange-400" />}
                  subtext={
                    data.lastSavedAt
                      ? `Saved ${formatDistanceToNow(new Date(data.lastSavedAt))} ago`
                      : "Never saved"
                  }
                />
              </div>
            </div>
          )}

          {activeTab === "explorer" && <KeyExplorer instanceId={id} />}
          {activeTab === "console" && <Terminal instanceId={id} />}
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-destructive/30 rounded-2xl shadow-2xl p-6 w-full max-w-sm relative">
            <button
              onClick={() => setShowDeleteModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 bg-destructive/10 rounded-xl flex items-center justify-center border border-destructive/20">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-lg">
                  Destroy Instance
                </h3>
                <p className="text-xs text-muted-foreground">
                  This cannot be undone
                </p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-2">
              All data in{" "}
              <span className="font-mono text-foreground font-semibold">
                {data.name}
              </span>{" "}
              will be permanently deleted, including:
            </p>
            <ul className="text-sm text-muted-foreground mb-5 space-y-1 pl-4">
              <li className="list-disc">
                {data.keyCount.toLocaleString()} stored keys
              </li>
              <li className="list-disc">All connection tokens</li>
              <li className="list-disc">Persisted snapshots</li>
            </ul>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2.5 bg-secondary border border-white/10 text-foreground font-medium rounded-xl hover:bg-muted transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="flex-1 py-2.5 bg-destructive text-white font-semibold rounded-xl hover:bg-destructive/90 transition-all disabled:opacity-60"
              >
                {deleteMutation.isPending ? "Destroying..." : "Destroy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  subtext,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtext?: string;
}) {
  return (
    <div className="glass-panel p-5 rounded-2xl">
      <div className="flex items-start justify-between mb-3">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </h4>
        <div className="p-2 bg-secondary/50 rounded-lg">{icon}</div>
      </div>
      <div className="text-2xl font-bold font-mono text-foreground tabular-nums">
        {value}
      </div>
      {subtext && (
        <div className="text-xs text-muted-foreground mt-1.5">{subtext}</div>
      )}
    </div>
  );
}
