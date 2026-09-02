import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Terminal as TermIcon,
  Trash2,
  Loader2,
  AlertCircle,
  ChevronUp,
} from "lucide-react";
import { useExecCommand } from "../hooks/use-redis";
import { parseCommand, cn } from "../lib/utils";

interface TerminalProps {
  instanceId: string;
}

interface HistoryItem {
  id: string;
  type: "input" | "output" | "error";
  content: string;
}

const COMMAND_HINTS = [
  "PING",
  "DBSIZE",
  "INFO",
  "KEYS *",
  "SET key value",
  "GET key",
  "DEL key",
  "HGETALL key",
  "LRANGE key 0 -1",
  "SMEMBERS key",
  "ZRANGE key 0 -1 WITHSCORES",
  "TTL key",
  "TYPE key",
  "XRANGE stream - +",
];

export function Terminal({ instanceId }: TerminalProps) {
  const [history, setHistory] = useState<HistoryItem[]>([
    {
      id: "welcome",
      type: "output",
      content:
        "Max Booster Storage Console\nType a command to begin. Use ↑/↓ to navigate history, Tab for hints.",
    },
  ]);
  const [input, setInput] = useState("");
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [cmdHistoryIdx, setCmdHistoryIdx] = useState(-1);
  const [savedInput, setSavedInput] = useState("");
  const [showHints, setShowHints] = useState(false);
  const [hintFilter, setHintFilter] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const execCmd = useExecCommand(instanceId);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, execCmd.isPending]);

  const filteredHints = COMMAND_HINTS.filter((h) =>
    h.toLowerCase().startsWith(hintFilter.toLowerCase()),
  );

  const applyHint = (hint: string) => {
    setInput(hint);
    setShowHints(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Tab") {
        e.preventDefault();
        if (input.trim()) {
          setHintFilter(input.trim());
          setShowHints(true);
        }
        return;
      }

      if (e.key === "Escape") {
        setShowHints(false);
        return;
      }

      if (showHints) return;

      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (cmdHistory.length === 0) return;
        const newIdx =
          cmdHistoryIdx === -1
            ? cmdHistory.length - 1
            : Math.max(0, cmdHistoryIdx - 1);
        if (cmdHistoryIdx === -1) setSavedInput(input);
        setCmdHistoryIdx(newIdx);
        setInput(cmdHistory[newIdx]!);
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (cmdHistoryIdx === -1) return;
        const newIdx = cmdHistoryIdx + 1;
        if (newIdx >= cmdHistory.length) {
          setCmdHistoryIdx(-1);
          setInput(savedInput);
        } else {
          setCmdHistoryIdx(newIdx);
          setInput(cmdHistory[newIdx]!);
        }
        return;
      }
    },
    [input, cmdHistory, cmdHistoryIdx, savedInput, showHints],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || execCmd.isPending) return;

    const cmdStr = input.trim();
    setInput("");
    setCmdHistoryIdx(-1);
    setSavedInput("");
    setShowHints(false);

    setCmdHistory((prev) => {
      const deduped = prev.filter((c) => c !== cmdStr);
      return [...deduped, cmdStr].slice(-100);
    });

    const inputId = Date.now().toString() + "-in";
    setHistory((prev) => [
      ...prev,
      { id: inputId, type: "input", content: `> ${cmdStr}` },
    ]);

    const { cmd, args } = parseCommand(cmdStr);

    if (cmd === "CLEAR") {
      setHistory([]);
      return;
    }

    if (cmd === "HELP") {
      setHistory((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "-out",
          type: "output",
          content: `Available commands:\n${COMMAND_HINTS.join("\n")}`,
        },
      ]);
      return;
    }

    try {
      const result = await execCmd.mutateAsync({ cmd, args });

      let formattedResult = "";
      if (result === null) {
        formattedResult = "(nil)";
      } else if (Array.isArray(result)) {
        formattedResult =
          result.length === 0
            ? "(empty array)"
            : result
                .map((v, i) => `${i + 1}) ${v === null ? "(nil)" : String(v)}`)
                .join("\n");
      } else if (typeof result === "object") {
        formattedResult = JSON.stringify(result, null, 2);
      } else {
        formattedResult = String(result);
      }

      setHistory((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "-out",
          type: "output",
          content: formattedResult,
        },
      ]);
    } catch (err: any) {
      setHistory((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "-err",
          type: "error",
          content: err.message || "Unknown error",
        },
      ]);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background rounded-xl border border-white/10 overflow-hidden font-mono text-sm relative shadow-inner">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-white/5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <TermIcon className="w-4 h-4" />
          <span className="truncate">
            {instanceId.slice(0, 8)}...{instanceId.slice(-4)}
          </span>
          {cmdHistory.length > 0 && (
            <span className="text-xs text-muted-foreground/50 ml-2 flex items-center gap-1">
              <ChevronUp className="w-3 h-3" />
              {cmdHistory.length} cmds
            </span>
          )}
        </div>
        <button
          onClick={() => {
            setHistory([]);
            setCmdHistory([]);
            setCmdHistoryIdx(-1);
          }}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
          title="Clear Terminal"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Output Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-1 text-foreground/90"
      >
        {history.map((item) => (
          <div
            key={item.id}
            className={cn(
              "whitespace-pre-wrap break-all leading-relaxed",
              item.type === "input" &&
                "text-primary font-semibold mt-3 first:mt-0",
              item.type === "error" &&
                "text-destructive flex items-start gap-2",
              item.type === "output" &&
                "pl-3 border-l-2 border-white/10 text-muted-foreground",
            )}
          >
            {item.type === "error" && (
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            {item.content}
          </div>
        ))}
        {execCmd.isPending && (
          <div className="pl-3 flex items-center gap-2 text-muted-foreground border-l-2 border-white/10">
            <Loader2 className="w-4 h-4 animate-spin" />
            Executing...
          </div>
        )}
      </div>

      {/* Autocomplete Hints */}
      {showHints && filteredHints.length > 0 && (
        <div className="border-t border-white/5 bg-card/80 max-h-40 overflow-y-auto">
          {filteredHints.map((hint) => (
            <button
              key={hint}
              type="button"
              onClick={() => applyHint(hint)}
              className="w-full text-left px-4 py-1.5 text-xs hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
            >
              {hint}
            </button>
          ))}
        </div>
      )}

      {/* Input Area */}
      <form
        onSubmit={handleSubmit}
        className="p-4 bg-card border-t border-white/5 flex items-center gap-2"
      >
        <span className="text-primary font-bold shrink-0">{">"}</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowHints(false);
          }}
          onKeyDown={handleKeyDown}
          placeholder="SET key value  |  ↑↓ history  |  Tab hints"
          className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/40 focus:ring-0 font-mono"
          autoFocus
          disabled={execCmd.isPending}
          autoComplete="off"
          spellCheck={false}
        />
      </form>
    </div>
  );
}
