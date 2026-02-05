import { useEffect, useState } from 'react';
import { FileText, Clock, Trash2, RotateCcw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { draftStorage, Draft } from '@/lib/offline';
import { formatDistanceToNow } from 'date-fns';

interface DraftRecoveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId?: string;
  onRecover?: (draft: Draft) => void;
  onDiscard?: (draftId: string) => void;
}

export function DraftRecoveryDialog({
  open,
  onOpenChange,
  formId,
  onRecover,
  onDiscard,
}: DraftRecoveryDialogProps) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDraft, setSelectedDraft] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      loadDrafts();
    }
  }, [open, formId]);

  const loadDrafts = async () => {
    setLoading(true);
    try {
      const allDrafts = formId
        ? await draftStorage.getDraftsForForm(formId)
        : await draftStorage.getAllDrafts();
      setDrafts(allDrafts);
    } catch (error) {
      console.error('Failed to load drafts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRecover = async (draft: Draft) => {
    onRecover?.(draft);
    onOpenChange(false);
  };

  const handleDiscard = async (draftFormId: string) => {
    await draftStorage.deleteDraft(draftFormId);
    onDiscard?.(draftFormId);
    await loadDrafts();
  };

  const handleDiscardAll = async () => {
    await draftStorage.clearAll();
    setDrafts([]);
    onOpenChange(false);
  };

  const formatDraftInfo = (draft: Draft) => {
    const data = draft.data as Record<string, unknown>;
    if (typeof data === 'object' && data !== null) {
      const keys = Object.keys(data);
      if (keys.length > 0) {
        const preview = String(data[keys[0]] || '').substring(0, 50);
        return preview + (preview.length >= 50 ? '...' : '');
      }
    }
    return 'Form data';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Recover Saved Drafts
          </DialogTitle>
          <DialogDescription>
            Found {drafts.length} unsaved draft{drafts.length !== 1 ? 's' : ''}.
            Would you like to restore any of them?
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : drafts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No drafts found
            </div>
          ) : (
            <div className="space-y-2">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className={`
                    p-3 rounded-lg border cursor-pointer transition-colors
                    ${selectedDraft === draft.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                    }
                  `}
                  onClick={() => setSelectedDraft(draft.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {draft.formId}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {formatDraftInfo(draft)}
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>
                          {formatDistanceToNow(draft.updatedAt, { addSuffix: true })}
                        </span>
                        <Badge variant="outline" className="text-xs px-1 py-0">
                          v{draft.version}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRecover(draft);
                        }}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDiscard(draft.formId);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {drafts.length > 0 && (
            <>
              <Button
                variant="destructive"
                onClick={handleDiscardAll}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Discard All
              </Button>
              {selectedDraft && (
                <Button
                  onClick={() => {
                    const draft = drafts.find(d => d.id === selectedDraft);
                    if (draft) handleRecover(draft);
                  }}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Recover Selected
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DraftRecoveryDialog;
