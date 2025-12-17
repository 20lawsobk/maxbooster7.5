import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tantml:react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Play, Pause, Trash2, Upload, Download, DollarSign, Music2, FileAudio } from 'lucide-react';
import { StemUploadDialog } from './StemUploadDialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface StemsManagerProps {
  listingId: string;
  isOwner: boolean;
}

interface Stem {
  id: string;
  listingId: string;
  stemName: string;
  stemType: string;
  fileUrl: string;
  fileSize: number;
  format: string;
  sampleRate: number | null;
  bitDepth: number | null;
  price: string | null;
  downloadCount: number;
  createdAt: string;
}

const STEM_TYPE_COLORS: Record<string, string> = {
  drums: 'bg-red-500/10 text-red-500 border-red-500/20',
  bass: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  melody: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  vocals: 'bg-green-500/10 text-green-500 border-green-500/20',
  fx: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  other: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
};

const STEM_TYPE_LABELS: Record<string, string> = {
  drums: 'Drums',
  bass: 'Bass',
  melody: 'Melody',
  vocals: 'Vocals',
  fx: 'FX',
  other: 'Other',
};

/**
 * TODO: Add function documentation
 */
export function StemsManager({ listingId, isOwner }: StemsManagerProps) {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [playingStem, setPlayingStem] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stems = [], isLoading } = useQuery<Stem[]>({
    queryKey: [`/api/marketplace/listings/${listingId}/stems`],
    queryFn: async () => {
      const res = await fetch(`/api/marketplace/listings/${listingId}/stems`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch stems');
      return res.json();
    },
  });

  const deleteStemMutation = useMutation({
    mutationFn: async (stemId: string) => {
      const response = await apiRequest('DELETE', `/api/marketplace/stems/${stemId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/marketplace/listings/${listingId}/stems`] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/my-stems'] });
      toast({
        title: 'Stem Deleted',
        description: 'The stem has been deleted successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const purchaseStemMutation = useMutation({
    mutationFn: async (stemId: string) => {
      const response = await apiRequest('POST', `/api/marketplace/stems/${stemId}/purchase`);
      return response.json();
    },
    onSuccess: (data: unknown) => {
      toast({
        title: 'Stem Purchased!',
        description: 'Your stem is ready for download.',
      });
      if (data.downloadToken) {
        const downloadUrl = `/api/marketplace/stems/${data.order.listingId}/download/${data.downloadToken}`;
        window.open(downloadUrl, '_blank');
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Purchase Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleDelete = (stemId: string) => {
    if (confirm('Are you sure you want to delete this stem?')) {
      deleteStemMutation.mutate(stemId);
    }
  };

  const handlePurchase = (stemId: string) => {
    purchaseStemMutation.mutate(stemId);
  };

  const handlePlayPause = (stemId: string, fileUrl: string) => {
    if (playingStem === stemId) {
      setPlayingStem(null);
    } else {
      setPlayingStem(stemId);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music2 className="h-5 w-5" />
            Stems
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">Loading stems...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Music2 className="h-5 w-5" />
              Stems {stems.length > 0 && `(${stems.length})`}
            </CardTitle>
            {isOwner && (
              <Button onClick={() => setUploadDialogOpen(true)} size="sm">
                <Upload className="h-4 w-4 mr-2" />
                Upload Stem
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {stems.length === 0 ? (
            <div className="text-center py-8">
              <FileAudio className="h-12 w-12 mx-auto text-gray-400 mb-3" />
              <p className="text-gray-500">
                {isOwner
                  ? 'No stems uploaded yet. Upload individual stems to offer buyers more options.'
                  : 'No stems available for this listing.'}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Downloads</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stems.map((stem) => (
                    <TableRow key={stem.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handlePlayPause(stem.id, stem.fileUrl)}
                          >
                            {playingStem === stem.id ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                          {stem.stemName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={STEM_TYPE_COLORS[stem.stemType] || STEM_TYPE_COLORS.other}
                        >
                          {STEM_TYPE_LABELS[stem.stemType] || stem.stemType}
                        </Badge>
                      </TableCell>
                      <TableCell className="uppercase text-xs font-mono">{stem.format}</TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {formatFileSize(stem.fileSize)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Download className="h-4 w-4 text-gray-400" />
                          <span className="text-sm">{stem.downloadCount}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {stem.price ? (
                          <div className="flex items-center gap-1 text-sm font-medium">
                            <DollarSign className="h-4 w-4" />
                            {parseFloat(stem.price).toFixed(2)}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">Included</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isOwner ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(stem.id)}
                              disabled={deleteStemMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          ) : (
                            stem.price && (
                              <Button
                                size="sm"
                                onClick={() => handlePurchase(stem.id)}
                                disabled={purchaseStemMutation.isPending}
                              >
                                <DollarSign className="h-4 w-4 mr-1" />
                                Buy
                              </Button>
                            )
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {isOwner && (
        <StemUploadDialog
          open={uploadDialogOpen}
          onOpenChange={setUploadDialogOpen}
          listingId={listingId}
        />
      )}
    </>
  );
}
