import React, { useState, useCallback } from "react";
import {
  Search,
  Database,
  RefreshCw,
  Key,
  Braces,
  AlignLeft,
  Hash,
  Layers,
  Radio,
  Copy,
  CheckCircle2,
  Trash2,
  Clock,
} from "lucide-react";
import { useKeys, useExecCommand } from "../hooks/use-redis";
import { cn } from "../lib/utils";

interface KeyExplorerProps {
  instanceId: string;
}

type KeyType = "string" | "hash" | "list" | "set" | "zset" | "stream" | "none";

interface KeyInfo {
  type: KeyType;
  value: unknown;
  ttl: number | null;
}

export function KeyExplorer({ instanceId }: KeyExplorerProps) {
  const [pattern, setPattern] = useState("*");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const {
    data: keysData,
    isLoading: keysLoading,
    refetch: refetchKeys,
  } = useKeys(instanceId, pattern);
  const execCmd = useExecCommand(instanceId);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPattern(search || "*");
    setSelectedKey(null);
    setKeyInfo(null);
  };

  const inspectKey = useCallback(
    async (k: string) => {
      setSelectedKey(k);
      setKeyInfo(null);
      setIsInspecting(true);

      try {
        const [typeRes, ttlRes] = await Promise.all([
          execCmd.mutateAsync({ cmd: "TYPE", args: [k] }),
          execCmd.mutateAsync({ cmd: "TTL", args: [k] }),
        ]);

        const type = typeRes as KeyType;
        const ttl = typeof ttlRes === "number" && ttlRes >= 0 ? ttlRes : null;
        let value: unknown;

        switch (type) {
          case "string":
            value = await execCmd.mutateAsync({ cmd: "GET", args: [k] });
            break;
          case "hash":
            value = await execCmd.mutateAsync({ cmd: "HGETALL", args: [k] });
            break;
          case "list":
            value = await execCmd.mutateAsync({
              cmd: "LRANGE",
              args: [k, "0", "-1"],
            });
            break;
          case "set":
            value = await execCmd.mutateAsync({ cmd: "SMEMBERS", args: [k] });
            break;
          case "zset":
            value = await execCmd.mutateAsync({
              cmd: "ZRANGE",
              args: [k, "0", "-1", "WITHSCORES"],
            });
            break;
          case "stream":
            value = await execCmd.mutateAsync({
              cmd: "XRANGE",
              args: [k, "-", "+", "COUNT", "50"],
            });
            break;
          default:
            value = "(unsupported type)";
        }

        setKeyInfo({ type, value, ttl });
      } catch (err) {
        setKeyInfo({ type: "none", value: "Error reading key", ttl: null });
      } finally {
        setIsInspecting(false);
      }
    },
    [execCmd],
  );

  const handleDelete = async (k: string) => {
    try {
      await execCmd.mutateAsync({ cmd: "DEL", args: [k] });
      setDeleteConfirm(null);
      if (selectedKey === k) {
        setSelectedKey(null);
        setKeyInfo(null);
      }
      refetchKeys();
    } catch {}
  };

  const handleCopyValue = () => {
    if (!keyInfo) return;
    const text =
      typeof keyInfo.value === "object"
        ? JSON.stringify(keyInfo.value, null, 2)
        : String(keyInfo.value);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getTypeIcon = (type: KeyType | null) => {
    switch (type) {
      case "hash":
        return <Braces className="w-4 h-4 text-purple-400" />;
      case "list":
        return <AlignLeft className="w-4 h-4 text-green-400" />;
      case "set":
        return <Database className="w-4 h-4 text-orange-400" />;
      case "string":
        return <Hash className="w-4 h-4 text-cyan-400" />;
      case "zset":
        return <Layers className="w-4 h-4 text-blue-400" />;
      case "stream":
        return <Radio className="w-4 h-4 text-pink-400" />;
      default:
        return <Key className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getTypeBadgeColor = (type: KeyType) => {
    const map: Record<KeyType, string> = {
      string: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
      hash: "bg-purple-500/10 text-purple-400 border-purple-500/20",
      list: "bg-green-500/10 text-green-400 border-green-500/20",
      set: "bg-orange-500/10 text-orange-400 border-orange-500/20",
      zset: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      stream: "bg-pink-500/10 text-pink-400 border-pink-500/20",
      none: "bg-secondary text-muted-foreground border-white/10",
    };
    return map[type] ?? map.none;
  };

  const renderValue = () => {
    if (isInspecting)
      return (
        <div className="text-muted-foreground animate-pulse flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Inspecting key...
        </div>
      );
    if (!keyInfo) return null;

    const { type, value } = keyInfo;

    if (type === "zset" && Array.isArray(value)) {
      const pairs: Array<{ member: string; score: string }> = [];
      for (let i = 0; i < value.length; i += 2) {
        pairs.push({
          member: String(value[i]),
          score: String(value[i + 1]),
        });
      }
      return (
        <div className="space-y-1">
          {pairs.map((p, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-2 bg-input rounded-lg border border-white/5 text-sm font-mono"
            >
              <span className="text-foreground truncate flex-1 mr-4">
                {p.member}
              </span>
              <span className="text-blue-400 shrink-0 text-xs">
                score: {p.score}
              </span>
            </div>
          ))}
          {pairs.length === 0 && (
            <div className="text-muted-foreground text-sm">
              (empty sorted set)
            </div>
          )}
        </div>
      );
    }

    if (type === "stream" && Array.isArray(value)) {
      return (
        <div className="space-y-2">
          {(value as Array<[string, string[]]>).map(([id, fields]) => {
            const fieldPairs: Record<string, string> = {};
            for (let i = 0; i < fields.length; i += 2) {
              fieldPairs[fields[i]!] = fields[i + 1]!;
            }
            return (
              <div
                key={id}
                className="p-3 bg-input rounded-lg border border-white/5 text-xs font-mono"
              >
                <div className="text-pink-400 mb-2 text-xs">{id}</div>
                {Object.entries(fieldPairs).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-muted-foreground shrink-0">{k}:</span>
                    <span className="text-foreground break-all">{v}</span>
                  </div>
                ))}
              </div>
            );
          })}
          {value.length === 0 && (
            <div className="text-muted-foreground text-sm">(empty stream)</div>
          )}
        </div>
      );
    }

    if (Array.isArray(value)) {
      return (
        <div className="space-y-1">
          {value.map((item, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-2 bg-input rounded-lg border border-white/5 text-sm font-mono"
            >
              <span className="text-muted-foreground shrink-0 text-xs mt-0.5">
                {idx + 1}
              </span>
              <span className="text-foreground break-all">
                {item === null ? "(nil)" : String(item)}
              </span>
            </div>
          ))}
          {value.length === 0 && (
            <div className="text-muted-foreground text-sm">(empty)</div>
          )}
        </div>
      );
    }

    if (typeof value === "object" && value !== null) {
      return (
        <pre className="font-mono text-sm p-4 bg-input rounded-xl border border-white/5 overflow-x-auto">
          <code
            dangerouslySetInnerHTML={{
              __html: syntaxHighlight(JSON.stringify(value, null, 2)),
            }}
          />
        </pre>
      );
    }

    return (
      <div className="font-mono text-sm p-4 bg-input rounded-xl border border-white/5 whitespace-pre-wrap break-all text-primary">
        {String(value)}
      </div>
    );
  };

  return (
    <div className="h-full flex gap-4 overflow-hidden">
      {/* Sidebar - Keys List */}
      <div className="w-1/3 min-w-[240px] flex flex-col bg-card rounded-xl border border-white/10 shadow-inner">
        <div className="p-3 border-b border-white/5">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pattern (e.g. user:*)"
                className="w-full pl-9 pr-3 py-2 bg-input border border-white/10 rounded-lg text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-foreground font-mono transition-all"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                refetchKeys();
                setSelectedKey(null);
                setKeyInfo(null);
              }}
              className="p-2 bg-secondary rounded-lg border border-white/10 hover:bg-muted text-muted-foreground transition-colors shrink-0"
              title="Refresh"
            >
              <RefreshCw
                className={cn("w-3.5 h-3.5", keysLoading && "animate-spin")}
              />
            </button>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {keysLoading ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              Loading keys...
            </div>
          ) : keysData?.keys.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No keys matched "{pattern}"
            </div>
          ) : (
            keysData?.keys.map((k) => (
              <div
                key={k}
                className={cn(
                  "group flex items-center rounded-lg transition-all",
                  selectedKey === k
                    ? "bg-primary/10 border border-primary/20"
                    : "border border-transparent hover:bg-white/5",
                )}
              >
                <button
                  onClick={() => inspectKey(k)}
                  className="flex-1 text-left px-2.5 py-2 text-xs font-mono truncate flex items-center gap-2 min-w-0"
                >
                  <Key
                    className={cn(
                      "w-3 h-3 shrink-0",
                      selectedKey === k
                        ? "text-primary"
                        : "text-muted-foreground opacity-50",
                    )}
                  />
                  <span
                    className={cn(
                      "truncate",
                      selectedKey === k ? "text-primary" : "text-foreground",
                    )}
                    title={k}
                  >
                    {k}
                  </span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirm(k);
                  }}
                  className="shrink-0 p-1.5 mr-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                  title="Delete key"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
        <div className="px-3 py-2 text-xs text-muted-foreground border-t border-white/5 bg-background/50 flex items-center justify-between">
          <span>{keysData?.count ?? 0} keys</span>
          {pattern !== "*" && (
            <button
              onClick={() => {
                setSearch("*");
                setPattern("*");
              }}
              className="text-primary/70 hover:text-primary text-xs"
            >
              Clear filter
            </button>
          )}
        </div>
      </div>

      {/* Main Area - Key Details */}
      <div className="flex-1 flex flex-col bg-card rounded-xl border border-white/10 shadow-inner overflow-hidden">
        {selectedKey ? (
          <>
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-background/50 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {getTypeIcon(keyInfo?.type ?? null)}
                <h3
                  className="font-mono font-bold text-base break-all text-foreground truncate"
                  title={selectedKey}
                >
                  {selectedKey}
                </h3>
                {keyInfo?.type && keyInfo.type !== "none" && (
                  <span
                    className={cn(
                      "shrink-0 px-2 py-0.5 rounded text-xs font-mono uppercase border",
                      getTypeBadgeColor(keyInfo.type),
                    )}
                  >
                    {keyInfo.type}
                  </span>
                )}
                {keyInfo?.ttl !== null && keyInfo?.ttl !== undefined && (
                  <span className="shrink-0 flex items-center gap-1 text-xs font-mono text-orange-400 border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 rounded">
                    <Clock className="w-3 h-3" />
                    TTL {keyInfo.ttl}s
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleCopyValue}
                  disabled={!keyInfo}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-secondary hover:bg-muted border border-white/10 rounded-lg text-muted-foreground hover:text-foreground transition-all disabled:opacity-40"
                  title="Copy value"
                >
                  {copied ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  onClick={() => setDeleteConfirm(selectedKey)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 rounded-lg text-destructive transition-all"
                  title="Delete key"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </div>
            <div className="flex-1 p-5 overflow-y-auto">{renderValue()}</div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-4">
            <Database className="w-12 h-12 opacity-20" />
            <div className="text-center">
              <p className="text-sm font-medium">Select a key to inspect</p>
              <p className="text-xs mt-1 opacity-60">
                Click any key in the list to view its value
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-destructive/30 rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-destructive/10 rounded-xl flex items-center justify-center border border-destructive/20">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">Delete Key</h3>
                <p className="text-xs text-muted-foreground">
                  This action cannot be undone
                </p>
              </div>
            </div>
            <div className="mb-5 p-3 bg-input rounded-lg border border-white/5 font-mono text-sm text-foreground break-all">
              {deleteConfirm}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 bg-secondary border border-white/10 text-foreground font-medium rounded-xl hover:bg-muted transition-all text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-2 bg-destructive text-white font-semibold rounded-xl hover:bg-destructive/90 transition-all text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function syntaxHighlight(json: string) {
  json = json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    function (match) {
      let cls = "text-sky-300";
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "text-purple-300" : "text-green-300";
      } else if (/true|false/.test(match)) {
        cls = "text-yellow-300";
      } else if (/null/.test(match)) {
        cls = "text-red-400";
      }
      return '<span class="' + cls + '">' + match + "</span>";
    },
  );
}
