import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Layers, 
  X, 
  Music,
  Loader2,
  Sparkles,
  Drum,
  Guitar,
  Mic2,
  Piano,
  Waves,
  Search,
  Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface StudioTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  genre?: string;
  bpm?: number;
  timeSignature?: string;
  coverImageUrl?: string;
  usageCount?: number;
  isBuiltIn?: boolean;
}

const CATEGORY_ICONS: Record<string, typeof Music> = {
  'pop': Music,
  'hip-hop': Mic2,
  'electronic': Waves,
  'rock': Guitar,
  'drums': Drum,
  'piano': Piano,
  'ambient': Sparkles,
  'default': Layers,
};

const CATEGORY_COLORS: Record<string, string> = {
  'pop': 'from-pink-500 to-rose-500',
  'hip-hop': 'from-amber-500 to-orange-500',
  'electronic': 'from-cyan-500 to-blue-500',
  'rock': 'from-red-500 to-rose-500',
  'drums': 'from-yellow-500 to-amber-500',
  'piano': 'from-purple-500 to-violet-500',
  'ambient': 'from-indigo-500 to-purple-500',
  'default': 'from-slate-500 to-gray-500',
};

async function fetchTemplates(category?: string): Promise<{ templates: StudioTemplate[] }> {
  const url = category 
    ? `/api/studio/templates?category=${encodeURIComponent(category)}`
    : '/api/studio/templates';
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    throw new Error('Failed to fetch templates');
  }
  return response.json();
}

async function createProjectFromTemplate(templateId: string, title?: string): Promise<any> {
  const response = await fetch(`/api/studio/templates/${templateId}/create-project`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create project');
  }
  return response.json();
}

interface FlowStateTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectCreated: (project: Record<string, unknown>) => void;
}

export function FlowStateTemplateDialog({
  open,
  onOpenChange,
  onProjectCreated,
}: FlowStateTemplateDialogProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<StudioTemplate | null>(null);
  const [projectTitle, setProjectTitle] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['studio-templates', selectedCategory],
    queryFn: () => fetchTemplates(selectedCategory || undefined),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const createProjectMutation = useMutation({
    mutationFn: ({ templateId, title }: { templateId: string; title?: string }) =>
      createProjectFromTemplate(templateId, title),
    onSuccess: (project) => {
      toast({
        title: 'Project Created',
        description: `"${project.title}" has been created from template`,
      });
      queryClient.invalidateQueries({ queryKey: ['studio-projects'] });
      onProjectCreated(project);
      setSelectedTemplate(null);
      setProjectTitle('');
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Create Project',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const templates = data?.templates || [];
  
  const filteredTemplates = templates.filter(template => {
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    return (
      template.name.toLowerCase().includes(query) ||
      template.description?.toLowerCase().includes(query) ||
      template.genre?.toLowerCase().includes(query) ||
      template.category.toLowerCase().includes(query)
    );
  });

  const categories = [...new Set(templates.map(t => t.category))];

  const handleUseTemplate = () => {
    if (!selectedTemplate) return;
    createProjectMutation.mutate({
      templateId: selectedTemplate.id,
      title: projectTitle.trim() || undefined,
    });
  };

  const getIconForTemplate = (template: StudioTemplate) => {
    const Icon = CATEGORY_ICONS[template.category.toLowerCase()] || 
                 CATEGORY_ICONS[template.genre?.toLowerCase() || ''] || 
                 CATEGORY_ICONS.default;
    return Icon;
  };

  const getColorForTemplate = (template: StudioTemplate) => {
    return CATEGORY_COLORS[template.category.toLowerCase()] || 
           CATEGORY_COLORS[template.genre?.toLowerCase() || ''] || 
           CATEGORY_COLORS.default;
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => onOpenChange(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                  <Layers className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Project Templates</h2>
                  <p className="text-xs text-white/50">Start from a pre-made project</p>
                </div>
              </div>
              <motion.button
                onClick={() => onOpenChange(false)}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>

            <div className="p-4 border-b border-white/5">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search templates..."
                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40"
                  />
                </div>
              </div>
              
              {categories.length > 1 && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs transition-colors",
                      selectedCategory === null
                        ? "bg-white/20 text-white"
                        : "bg-white/5 text-white/60 hover:bg-white/10"
                    )}
                  >
                    All
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={cn(
                        "px-3 py-1 rounded-full text-xs transition-colors capitalize",
                        selectedCategory === cat
                          ? "bg-white/20 text-white"
                          : "bg-white/5 text-white/60 hover:bg-white/10"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <ScrollArea className="h-[350px]">
              <div className="p-4">
                {isLoading ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3 animate-pulse">
                        <div className="h-24 bg-white/10 rounded-md" />
                        <div className="space-y-1.5">
                          <div className="h-3 bg-white/10 rounded w-3/4" />
                          <div className="h-2 bg-white/10 rounded w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center justify-center h-[250px] text-white/40">
                    <p className="text-red-400">Failed to load templates</p>
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[250px] text-white/40">
                    <Layers className="h-12 w-12 mb-4 opacity-50" />
                    <p>No templates found</p>
                    {search && (
                      <button
                        onClick={() => setSearch('')}
                        className="mt-2 text-xs text-purple-400 hover:underline"
                      >
                        Clear search
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {filteredTemplates.map((template) => {
                      const Icon = getIconForTemplate(template);
                      const color = getColorForTemplate(template);
                      return (
                        <motion.button
                          key={template.id}
                          onClick={() => setSelectedTemplate(template)}
                          className={cn(
                            "p-4 rounded-xl border text-left transition-all",
                            selectedTemplate?.id === template.id
                              ? "border-purple-500/50 bg-purple-500/10"
                              : "border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/10"
                          )}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <div className={cn(
                            "w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center mb-3",
                            color
                          )}>
                            <Icon className="w-5 h-5 text-white" />
                          </div>
                          <h3 className="text-sm font-medium text-white">{template.name}</h3>
                          {template.description && (
                            <p className="text-xs text-white/50 mt-1 line-clamp-2">{template.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            {template.bpm && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                                {template.bpm} BPM
                              </span>
                            )}
                            {template.genre && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60 capitalize">
                                {template.genre}
                              </span>
                            )}
                            {template.isBuiltIn && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                                Built-in
                              </span>
                            )}
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </div>
            </ScrollArea>

            <AnimatePresence>
              {selectedTemplate && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-white/5 overflow-hidden"
                >
                  <div className="p-4 space-y-4">
                    <div>
                      <label className="block text-xs text-white/60 mb-2">Project Name (optional)</label>
                      <Input
                        value={projectTitle}
                        onChange={(e) => setProjectTitle(e.target.value)}
                        placeholder={`New ${selectedTemplate.name} Project`}
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
                        onKeyDown={(e) => e.key === 'Enter' && !createProjectMutation.isPending && handleUseTemplate()}
                        disabled={createProjectMutation.isPending}
                      />
                    </div>
                    
                    <Button
                      onClick={handleUseTemplate}
                      disabled={createProjectMutation.isPending}
                      className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                    >
                      {createProjectMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Creating Project...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-2" />
                          Use Template
                        </>
                      )}
                    </Button>
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
