import { useState } from 'react';
import { useMutation, useQueryClient } from '@tantml:parameter>@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  MoreVertical,
  Eye,
  Edit,
  Copy,
  Trash2,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react';

interface ReleaseActionsPanelProps {
  release: {
    id: string;
    title: string;
    artistName: string;
    status: string;
    platforms?: string[];
  };
  onView?: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}

const TAKEDOWN_REASONS = [
  { value: 'rights_issue', label: 'Rights Issue', description: 'Copyright or licensing problem' },
  {
    value: 'quality_issue',
    label: 'Quality Issue',
    description: 'Audio or metadata quality problem',
  },
  {
    value: 'artist_request',
    label: 'Requested by Artist',
    description: 'Artist wants to remove release',
  },
  {
    value: 'contract_dispute',
    label: 'Contract Dispute',
    description: 'Legal or contractual issue',
  },
  {
    value: 'duplicate',
    label: 'Duplicate Release',
    description: 'Release was uploaded multiple times',
  },
  { value: 'other', label: 'Other', description: 'Other reason not listed' },
];

const PLATFORM_NAMES: Record<string, string> = {
  spotify: 'Spotify',
  'apple-music': 'Apple Music',
  'youtube-music': 'YouTube Music',
  'amazon-music': 'Amazon Music',
  tidal: 'TIDAL',
  deezer: 'Deezer',
  soundcloud: 'SoundCloud',
};

/**
 * TODO: Add function documentation
 */
export function ReleaseActionsPanel({
  release,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
}: ReleaseActionsPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showTakedownDialog, setShowTakedownDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [takedownReason, setTakedownReason] = useState('');
  const [takedownExplanation, setTakedownExplanation] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(release.platforms || []);
  const [takedownAllPlatforms, setTakedownAllPlatforms] = useState(true);

  // Takedown mutation
  const takedownMutation = useMutation({
    mutationFn: async () => {
      if (!takedownReason) {
        throw new Error('Please select a reason for takedown');
      }

      const response = await apiRequest(
        'POST',
        `/api/distribution/releases/${release.id}/takedown`,
        {
          reason: takedownReason,
          explanation: takedownExplanation,
          platforms: takedownAllPlatforms ? undefined : selectedPlatforms,
          allPlatforms: takedownAllPlatforms,
        }
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Takedown requested',
        description: 'Your release will be removed from the selected platforms within 7-14 days.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/releases'] });
      setShowTakedownDialog(false);
      resetTakedownForm();
    },
    onError: (error: unknown) => {
      toast({
        title: 'Takedown failed',
        description: error.message || 'Failed to request takedown. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/distribution/releases/${release.id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Release deleted',
        description: 'Your release has been permanently deleted.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/releases'] });
      setShowDeleteDialog(false);
      onDelete?.();
    },
    onError: () => {
      toast({
        title: 'Delete failed',
        description: 'Failed to delete release. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const resetTakedownForm = () => {
    setTakedownReason('');
    setTakedownExplanation('');
    setSelectedPlatforms(release.platforms || []);
    setTakedownAllPlatforms(true);
  };

  const handleTakedown = () => {
    takedownMutation.mutate();
  };

  const handleDelete = () => {
    deleteMutation.mutate();
  };

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={onView}>
            <Eye className="h-4 w-4 mr-2" />
            View Details
          </DropdownMenuItem>

          {release.status === 'draft' && (
            <DropdownMenuItem onClick={onEdit}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Release
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onClick={onDuplicate}>
            <Copy className="h-4 w-4 mr-2" />
            Duplicate
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {release.status !== 'draft' && (
            <DropdownMenuItem
              onClick={() => setShowTakedownDialog(true)}
              className="text-yellow-600 focus:text-yellow-600"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Request Takedown
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onClick={() => setShowDeleteDialog(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Release
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Takedown Dialog */}
      <Dialog open={showTakedownDialog} onOpenChange={setShowTakedownDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Request Release Takedown</DialogTitle>
            <DialogDescription>
              Remove your release from distribution platforms. This action typically takes 7-14 days
              to complete.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Release Info */}
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-semibold">{release.title}</h4>
              <p className="text-sm text-muted-foreground">{release.artistName}</p>
            </div>

            {/* Platform Selection */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="takedown-all"
                  checked={takedownAllPlatforms}
                  onCheckedChange={(checked) => setTakedownAllPlatforms(checked === true)}
                />
                <label
                  htmlFor="takedown-all"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Takedown from all platforms
                </label>
              </div>

              {!takedownAllPlatforms && (
                <div className="ml-6 space-y-2 p-4 bg-muted rounded-lg">
                  <Label>Select platforms to remove from:</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(release.platforms || []).map((platform) => (
                      <div key={platform} className="flex items-center space-x-2">
                        <Checkbox
                          id={`platform-${platform}`}
                          checked={selectedPlatforms.includes(platform)}
                          onCheckedChange={() => togglePlatform(platform)}
                        />
                        <label htmlFor={`platform-${platform}`} className="text-sm leading-none">
                          {PLATFORM_NAMES[platform] || platform}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Reason Selection */}
            <div className="space-y-2">
              <Label htmlFor="takedown-reason">Reason for Takedown *</Label>
              <Select value={takedownReason} onValueChange={setTakedownReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {TAKEDOWN_REASONS.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>
                      <div>
                        <div className="font-medium">{reason.label}</div>
                        <div className="text-xs text-muted-foreground">{reason.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Explanation */}
            <div className="space-y-2">
              <Label htmlFor="takedown-explanation">Additional Explanation (Optional)</Label>
              <Textarea
                id="takedown-explanation"
                placeholder="Provide additional details about the takedown request..."
                value={takedownExplanation}
                onChange={(e) => setTakedownExplanation(e.target.value)}
                rows={4}
              />
            </div>

            {/* Warning */}
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-yellow-500">Important Information</p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1">
                    <li>Takedown process typically takes 7-14 business days</li>
                    <li>Some platforms may take longer to process removal requests</li>
                    <li>Existing streams and sales data will be preserved</li>
                    <li>This action cannot be undone once processing begins</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowTakedownDialog(false);
                resetTakedownForm();
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleTakedown}
              disabled={!takedownReason || takedownMutation.isPending}
            >
              {takedownMutation.isPending ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  Requesting...
                </>
              ) : (
                'Request Takedown'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Release?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{release.title}" by {release.artistName}.
              {release.status !== 'draft' && (
                <span className="block mt-2 text-yellow-600">
                  <AlertTriangle className="h-4 w-4 inline mr-1" />
                  Warning: This release is already distributed. Consider requesting a takedown
                  instead.
                </span>
              )}
              <span className="block mt-2 font-medium">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete Permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
