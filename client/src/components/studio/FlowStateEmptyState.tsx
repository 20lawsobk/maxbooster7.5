import { motion } from "framer-motion";
import {
  Music,
  Mic,
  Upload,
  Sparkles,
  Play,
  FolderOpen,
  Wand2,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: typeof Music;
  color: string;
  action: () => void;
}

interface FlowStateEmptyStateProps {
  onAddTrack: () => void;
  onImportAudio: () => void;
  onOpenTemplate: () => void;
  onGenerateAI: () => void;
}

export function FlowStateEmptyState({
  onAddTrack,
  onImportAudio,
  onOpenTemplate,
  onGenerateAI,
}: FlowStateEmptyStateProps) {
  const quickActions: QuickAction[] = [
    {
      id: "add-track",
      title: "Add Track",
      description: "Create audio, instrument, or vocal tracks",
      icon: Music,
      color: "from-blue-500 to-cyan-500",
      action: onAddTrack,
    },
    {
      id: "import",
      title: "Import Audio",
      description: "Drag and drop or browse files",
      icon: Upload,
      color: "from-emerald-500 to-teal-500",
      action: onImportAudio,
    },
    {
      id: "template",
      title: "Use Template",
      description: "Start from a pre-made project",
      icon: Layers,
      color: "from-purple-500 to-pink-500",
      action: onOpenTemplate,
    },
    {
      id: "ai-generate",
      title: "AI Generate",
      description: "Create music with AI assistance",
      icon: Wand2,
      color: "from-amber-500 to-orange-500",
      action: onGenerateAI,
    },
  ];

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl w-full text-center"
      >
        <motion.div
          className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-white/10 flex items-center justify-center"
          animate={{
            boxShadow: [
              "0 0 20px rgba(99,102,241,0.2)",
              "0 0 40px rgba(99,102,241,0.4)",
              "0 0 20px rgba(99,102,241,0.2)",
            ],
          }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 4, repeat: Infinity }}
          >
            <Sparkles className="w-12 h-12 text-indigo-400" />
          </motion.div>
        </motion.div>

        <h2 className="text-2xl font-bold text-white mb-2">
          Welcome to FlowState Studio
        </h2>
        <p className="text-white/50 mb-8 max-w-md mx-auto">
          Your creative journey starts here. Add tracks, import audio, or let AI
          help you create something amazing.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-8">
          {quickActions.map((action, index) => (
            <motion.button
              key={action.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={action.action}
              className="group p-5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all text-left"
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
            >
              <div
                className={cn(
                  "w-12 h-12 rounded-lg bg-gradient-to-br flex items-center justify-center mb-3 group-hover:scale-110 transition-transform",
                  action.color,
                )}
              >
                <action.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">
                {action.title}
              </h3>
              <p className="text-xs text-white/50">{action.description}</p>
            </motion.button>
          ))}
        </div>

        <div className="flex items-center justify-center gap-6 text-xs text-white/30">
          <div className="flex items-center gap-2">
            <kbd className="px-2 py-1 rounded bg-white/10 text-white/50 font-mono">
              ⌘ N
            </kbd>
            <span>New Track</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-2 py-1 rounded bg-white/10 text-white/50 font-mono">
              Space
            </kbd>
            <span>Play/Pause</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-2 py-1 rounded bg-white/10 text-white/50 font-mono">
              ?
            </kbd>
            <span>Shortcuts</span>
          </div>
        </div>

        <motion.div
          className="mt-12 py-4 border-t border-white/5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <p className="text-xs text-white/30 flex items-center justify-center gap-2">
            <Play className="w-3 h-3" />
            Pro Tip: Press{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/50 font-mono text-[10px]">
              Tab
            </kbd>{" "}
            to toggle Zero-Chrome mode for distraction-free editing
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
