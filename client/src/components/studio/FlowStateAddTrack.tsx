import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, 
  Music, 
  Mic, 
  Piano, 
  Drum, 
  Guitar,
  Waves,
  Volume2,
  X,
  Folder,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface TrackType {
  id: string;
  name: string;
  icon: typeof Music;
  color: string;
  description: string;
  backendType: 'audio' | 'midi' | 'aux' | 'master';
}

const TRACK_TYPES: TrackType[] = [
  { id: 'audio', name: 'Audio', icon: Waves, color: 'from-blue-500 to-cyan-500', description: 'Record or import audio files', backendType: 'audio' },
  { id: 'instrument', name: 'Instrument', icon: Piano, color: 'from-purple-500 to-pink-500', description: 'Virtual instruments & MIDI', backendType: 'midi' },
  { id: 'vocal', name: 'Vocal', icon: Mic, color: 'from-rose-500 to-orange-500', description: 'Optimized for vocals', backendType: 'audio' },
  { id: 'drum', name: 'Drums', icon: Drum, color: 'from-amber-500 to-yellow-500', description: 'Drum patterns & beats', backendType: 'midi' },
  { id: 'guitar', name: 'Guitar', icon: Guitar, color: 'from-emerald-500 to-teal-500', description: 'Guitar with amp simulation', backendType: 'audio' },
  { id: 'bus', name: 'Bus', icon: Volume2, color: 'from-slate-500 to-gray-500', description: 'Route multiple tracks', backendType: 'aux' },
  { id: 'folder', name: 'Folder', icon: Folder, color: 'from-indigo-500 to-violet-500', description: 'Organize track groups', backendType: 'aux' },
];

const TYPE_COLORS: Record<string, string> = {
  audio: '#3b82f6',
  instrument: '#a855f7',
  vocal: '#f43f5e',
  drum: '#f59e0b',
  guitar: '#10b981',
  bus: '#64748b',
  folder: '#6366f1',
};

interface CreateTrackParams {
  projectId: string;
  name: string;
  trackType: 'audio' | 'midi' | 'aux' | 'master';
  color?: string;
}

async function createTrack(params: CreateTrackParams) {
  const response = await fetch('/api/studio/tracks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create track');
  }
  return response.json();
}

interface FlowStateAddTrackProps {
  onAddTrack: (type: string, name: string, track?: Record<string, unknown>) => void;
  onClose: () => void;
  isOpen: boolean;
  projectId?: string;
  onCreateProject?: (title: string) => Promise<{ id: string }>;
}

export function FlowStateAddTrack({ onAddTrack, onClose, isOpen, projectId, onCreateProject }: FlowStateAddTrackProps) {
  const [selectedType, setSelectedType] = useState<TrackType | null>(null);
  const [trackName, setTrackName] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createTrackMutation = useMutation({
    mutationFn: createTrack,
    onSuccess: (track, variables) => {
      toast({
        title: 'Track Created',
        description: `${selectedType?.name || 'Track'} "${track.name}" has been added to your project`,
      });
      queryClient.invalidateQueries({ queryKey: ['studio-tracks', projectId] });
      onAddTrack(selectedType?.id || 'audio', track.name, track);
      setSelectedType(null);
      setTrackName('');
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Create Track',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCreate = async () => {
    if (!selectedType) return;

    const name = trackName.trim() || `${selectedType.name} ${Date.now().toString(36).slice(-4).toUpperCase()}`;
    
    if (projectId) {
      createTrackMutation.mutate({
        projectId,
        name,
        trackType: selectedType.backendType,
        color: TYPE_COLORS[selectedType.id],
      });
    } else if (onCreateProject) {
      setIsCreatingProject(true);
      try {
        const project = await onCreateProject('New Project');
        if (project?.id) {
          createTrackMutation.mutate({
            projectId: project.id,
            name,
            trackType: selectedType.backendType,
            color: TYPE_COLORS[selectedType.id],
          });
        }
      } catch (error) {
        toast({
          title: 'Failed to Create Project',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setIsCreatingProject(false);
      }
    } else {
      toast({
        title: 'No Project Selected',
        description: 'Please create or select a project first',
        variant: 'destructive',
      });
      onAddTrack(selectedType.id, name);
      setSelectedType(null);
      setTrackName('');
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <Plus className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Add New Track</h2>
                  <p className="text-xs text-white/50">Choose a track type to get started</p>
                </div>
              </div>
              <motion.button
                onClick={onClose}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>

            <div className="p-4 grid grid-cols-2 gap-3">
              {TRACK_TYPES.map((type) => (
                <motion.button
                  key={type.id}
                  onClick={() => setSelectedType(type)}
                  className={cn(
                    "p-4 rounded-xl border text-left transition-all",
                    selectedType?.id === type.id
                      ? "border-white/30 bg-white/10"
                      : "border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/10"
                  )}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={createTrackMutation.isPending}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center mb-3",
                    type.color
                  )}>
                    <type.icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-sm font-medium text-white">{type.name}</h3>
                  <p className="text-xs text-white/50 mt-1">{type.description}</p>
                </motion.button>
              ))}
            </div>

            <AnimatePresence>
              {selectedType && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-white/5 overflow-hidden"
                >
                  <div className="p-4 space-y-4">
                    <div>
                      <label className="block text-xs text-white/60 mb-2">Track Name (optional)</label>
                      <input
                        type="text"
                        value={trackName}
                        onChange={(e) => setTrackName(e.target.value)}
                        placeholder={`${selectedType.name} Track`}
                        className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-colors"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && !createTrackMutation.isPending && handleCreate()}
                        disabled={createTrackMutation.isPending}
                      />
                    </div>
                    
                    <motion.button
                      onClick={handleCreate}
                      disabled={createTrackMutation.isPending || isCreatingProject}
                      className={cn(
                        "w-full py-3 rounded-lg font-medium text-white bg-gradient-to-r flex items-center justify-center gap-2",
                        selectedType.color,
                        (createTrackMutation.isPending || isCreatingProject) && "opacity-70 cursor-not-allowed"
                      )}
                      whileHover={!(createTrackMutation.isPending || isCreatingProject) ? { scale: 1.01 } : undefined}
                      whileTap={!(createTrackMutation.isPending || isCreatingProject) ? { scale: 0.99 } : undefined}
                    >
                      {isCreatingProject ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Creating Project...
                        </>
                      ) : createTrackMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Creating Track...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          Create {selectedType.name} Track
                        </>
                      )}
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function AddTrackButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      className="w-full py-3 border border-dashed border-white/10 rounded-lg text-white/40 hover:text-white/70 hover:border-white/20 hover:bg-white/5 transition-all flex items-center justify-center gap-2"
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <Plus className="w-4 h-4" />
      Add Track
    </motion.button>
  );
}
