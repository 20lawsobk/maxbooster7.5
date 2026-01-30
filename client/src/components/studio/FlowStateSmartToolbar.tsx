import { motion, AnimatePresence } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface ToolbarAction {
  id: string;
  icon: LucideIcon;
  label: string;
  suggested?: boolean;
  disabled?: boolean;
}

interface FlowStateSmartToolbarProps {
  actions: ToolbarAction[];
  onAction?: (actionId: string) => void;
}

export function FlowStateSmartToolbar({ actions, onAction }: FlowStateSmartToolbarProps) {
  if (actions.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="flow-smart-toolbar"
      >
        {actions.map((action, index) => (
          <motion.button
            key={action.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
            className={`flow-smart-toolbar-item ${action.suggested ? 'suggested' : ''}`}
            onClick={() => onAction?.(action.id)}
            disabled={action.disabled}
          >
            <action.icon className="w-5 h-5" />
            <span className="flow-smart-toolbar-label">{action.label}</span>
            {action.suggested && (
              <motion.div
                className="absolute -top-1 -right-1 w-2 h-2 bg-cyan-400 rounded-full"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
              />
            )}
          </motion.button>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}
