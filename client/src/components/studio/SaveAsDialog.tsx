import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Save, Loader2, Copy } from 'lucide-react';

interface SaveAsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentProjectId: string | null;
  currentTitle: string;
  currentDescription?: string;
  onSaved?: (newProjectId: string) => void;
}

export function SaveAsDialog({
  open,
  onOpenChange,
  currentProjectId,
  currentTitle,
  currentDescription = '',
  onSaved,
}: SaveAsDialogProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState(() => `${currentTitle} (Copy)`);
  const [description, setDescription] = useState(currentDescription);

  const saveAsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/studio/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || 'Untitled Project',
          description,
          duplicateFrom: currentProjectId,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to save project' }));
        throw new Error(error.error || 'Failed to save project');
      }

      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/studio/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/studio/start-hub/summary'] });

      toast({
        title: 'Project Saved',
        description: `"${title}" has been created successfully.`,
      });

      const newProjectId = data?.id || data?.project?.id;
      if (newProjectId) {
        onSaved?.(newProjectId);
        setLocation(`/studio/${newProjectId}`);
      }

      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Save Failed',
        description: error.message || 'Failed to save project. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast({
        title: 'Title Required',
        description: 'Please enter a project title.',
        variant: 'destructive',
      });
      return;
    }
    saveAsMutation.mutate();
  };

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (newOpen) {
      setTitle(`${currentTitle} (Copy)`);
      setDescription(currentDescription);
    }
    onOpenChange(newOpen);
  }, [currentTitle, currentDescription, onOpenChange]);

  const isSubmitting = saveAsMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md bg-[#1e1e22] border-[#333] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Copy className="h-5 w-5 text-blue-500" />
            Save As
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Save a copy of this project with a new name.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-gray-300">Project Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter project title"
              className="bg-[#2a2a2e] border-[#444] text-white placeholder:text-gray-500"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-gray-300">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of your project"
              className="bg-[#2a2a2e] border-[#444] text-white placeholder:text-gray-500 resize-none h-20"
            />
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="text-gray-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save As
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
