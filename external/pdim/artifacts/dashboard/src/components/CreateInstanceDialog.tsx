import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Server,
  KeyRound,
  X,
  Copy,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { useCreateInstance } from "../hooks/use-instances";
import { tokenStore } from "../lib/utils";

interface CreateInstanceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessNavigate: (id: string) => void;
}

export function CreateInstanceDialog({
  isOpen,
  onClose,
  onSuccessNavigate,
}: CreateInstanceDialogProps) {
  const [name, setName] = useState("");
  const [maxKeys, setMaxKeys] = useState("0");
  const createMutation = useCreateInstance();
  const [result, setResult] = useState<{ id: string; token: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setMaxKeys("0");
      setResult(null);
      setCopied(false);
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const res = await createMutation.mutateAsync({
        name: name.trim(),
        maxKeys: parseInt(maxKeys) || 0,
      });
      setResult({ id: res.id, token: res.token });
      tokenStore.set(res.id, res.token);
    } catch {}
  };

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDone = () => {
    if (result) {
      const id = result.id;
      onClose();
      setTimeout(() => onSuccessNavigate(id), 150);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.15 }}
          className="w-full max-w-md bg-card border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-6 border-b border-white/5">
            <h2 className="text-xl font-bold font-mono text-foreground flex items-center gap-2">
              <Server className="w-5 h-5 text-primary" />
              Provision Instance
            </h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-white/5"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6">
            {!result ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Instance Name
                  </label>
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. user-cache-prod"
                    className="w-full px-4 py-3 bg-input border border-white/10 rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-mono"
                    required
                    maxLength={64}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Max Keys{" "}
                    <span className="text-muted-foreground/50 font-normal">
                      (0 = unlimited)
                    </span>
                  </label>
                  <input
                    type="number"
                    value={maxKeys}
                    onChange={(e) => setMaxKeys(e.target.value)}
                    className="w-full px-4 py-3 bg-input border border-white/10 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-mono"
                    min="0"
                  />
                </div>

                {createMutation.isError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">
                    {createMutation.error?.message ||
                      "Failed to create instance"}
                  </div>
                )}

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-3 bg-secondary border border-white/10 text-foreground font-medium rounded-xl hover:bg-muted transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending || !name.trim()}
                    className="flex-1 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-95"
                  >
                    {createMutation.isPending
                      ? "Provisioning..."
                      : "Create Instance"}
                  </button>
                </div>
              </form>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-5 text-center"
              >
                <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto border border-primary/30">
                  <KeyRound className="w-8 h-8 text-primary" />
                </div>

                <div>
                  <h3 className="text-xl font-bold text-foreground mb-1.5">
                    Instance Created!
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Save your access token — it won't be shown again.
                  </p>
                </div>

                <div className="relative group text-left">
                  <div className="p-4 bg-input rounded-xl border border-white/10 font-mono text-sm break-all text-primary pr-12">
                    {result.token}
                  </div>
                  <button
                    onClick={handleCopy}
                    className="absolute right-2 top-2 p-2 bg-secondary text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors border border-white/5"
                    title="Copy token"
                  >
                    {copied ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {!copied && (
                  <p className="text-xs text-muted-foreground/60">
                    Click the copy button above to save your token
                  </p>
                )}

                <button
                  onClick={handleDone}
                  className="w-full px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open Instance
                </button>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
