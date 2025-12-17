import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Package, Download, Loader2, Upload, Music, FileText, Info } from 'lucide-react';
import type { DistributionPackage, DistributionTrack, StudioTrack } from '@shared/schema';

const packageSchema = z.object({
  upc: z
    .string()
    .regex(/^\d{12,13}$/, 'UPC must be 12-13 digits')
    .optional()
    .or(z.literal('')),
  albumTitle: z.string().min(1, 'Album title is required'),
  releaseDate: z.string().optional(),
  label: z.string().optional(),
  artworkUrl: z.string().optional(),
  copyrightP: z.string().optional(),
  copyrightC: z.string().optional(),
});

const trackSchema = z.object({
  isrc: z
    .string()
    .regex(/^[A-Z]{2}-[A-Z0-9]{3}-\d{2}-\d{5}$/, 'ISRC format: CC-XXX-YY-NNNNN')
    .optional()
    .or(z.literal('')),
  title: z.string().min(1, 'Title is required'),
  artist: z.string().optional(),
  genre: z.string().optional(),
  explicitContent: z.boolean().default(false),
  lyrics: z.string().optional(),
  credits: z.string().optional(),
});

type PackageFormData = z.infer<typeof packageSchema>;
type TrackFormData = z.infer<typeof trackSchema>;

interface DistributionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  tracks: StudioTrack[];
}

/**
 * TODO: Add function documentation
 */
export function DistributionDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  tracks,
}: DistributionDialogProps) {
  const [currentTab, setCurrentTab] = useState('album');
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [artworkPreview, setArtworkPreview] = useState<string>('');
  const [exportProgress, setExportProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<PackageFormData>({
    resolver: zodResolver(packageSchema),
    defaultValues: {
      albumTitle: projectName || '',
      upc: '',
      releaseDate: '',
      label: '',
      artworkUrl: '',
      copyrightP: '',
      copyrightC: '',
    },
  });

  const { data: existingPackage, isLoading: packageLoading } = useQuery<DistributionPackage>({
    queryKey: [`/api/distribution/packages/${projectId}`],
    enabled: open && !!projectId,
  });

  const { data: packageTracks = [], isLoading: tracksLoading } = useQuery<DistributionTrack[]>({
    queryKey: [`/api/distribution/packages/${existingPackage?.id}/tracks`],
    enabled: open && !!existingPackage?.id,
  });

  useEffect(() => {
    if (existingPackage) {
      form.reset({
        albumTitle: existingPackage.albumTitle || projectName,
        upc: existingPackage.upc || '',
        releaseDate: existingPackage.releaseDate
          ? new Date(existingPackage.releaseDate).toISOString().split('T')[0]
          : '',
        label: existingPackage.label || '',
        artworkUrl: existingPackage.artworkUrl || '',
        copyrightP: existingPackage.copyrightP || '',
        copyrightC: existingPackage.copyrightC || '',
      });
      if (existingPackage.artworkUrl) {
        setArtworkPreview(existingPackage.artworkUrl);
      }
      if (existingPackage.status === 'ready' && existingPackage.id) {
        setDownloadUrl(`/exports/distribution_${existingPackage.id}_*.zip`);
      }
    }
  }, [existingPackage, projectName, form]);

  const uploadArtworkMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('artwork', file);

      const response = await apiRequest('POST', '/api/distribution/artwork/upload', formData);
      return response.json();
    },
    onError: (error: unknown) => {
      toast({
        title: 'Artwork Upload Failed',
        description: error.message || 'Failed to upload artwork',
        variant: 'destructive',
      });
    },
  });

  const createPackageMutation = useMutation({
    mutationFn: async (data: PackageFormData & { uploadedArtworkUrl?: string }) => {
      const payload = {
        projectId,
        albumTitle: data.albumTitle,
        upc: data.upc || null,
        releaseDate: data.releaseDate ? new Date(data.releaseDate) : null,
        label: data.label || null,
        artworkUrl: data.uploadedArtworkUrl || null,
        copyrightP: data.copyrightP || null,
        copyrightC: data.copyrightC || null,
        status: 'draft',
      };

      if (existingPackage?.id) {
        return apiRequest('PUT', `/api/distribution/packages/${existingPackage.id}`, payload);
      } else {
        return apiRequest('POST', '/api/distribution/packages', payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/distribution/packages/${projectId}`] });
      toast({
        title: 'Success',
        description: 'Distribution package saved',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save distribution package',
        variant: 'destructive',
      });
    },
  });

  const addTrackMutation = useMutation({
    mutationFn: async ({
      trackData,
      trackNumber,
    }: {
      trackData: TrackFormData;
      trackNumber: number;
    }) => {
      if (!existingPackage?.id) throw new Error('Package not created yet');

      const payload = {
        ...trackData,
        trackNumber,
        duration: 0,
        credits: trackData.credits ? trackData.credits : null,
      };

      return apiRequest('POST', `/api/distribution/packages/${existingPackage.id}/tracks`, payload);
    },
    onSuccess: () => {
      if (existingPackage?.id) {
        queryClient.invalidateQueries({
          queryKey: [`/api/distribution/packages/${existingPackage.id}/tracks`],
        });
      }
      toast({
        title: 'Success',
        description: 'Track added to package',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add track',
        variant: 'destructive',
      });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      if (!existingPackage?.id) throw new Error('Package not created yet');
      setExportProgress(0);

      const interval = setInterval(() => {
        setExportProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const response = await apiRequest(
        'POST',
        `/api/distribution/packages/${existingPackage.id}/export`,
        {}
      );
      clearInterval(interval);
      setExportProgress(100);
      return response;
    },
    onSuccess: (data: unknown) => {
      setDownloadUrl(data.downloadUrl);
      queryClient.invalidateQueries({ queryKey: [`/api/distribution/packages/${projectId}`] });
      toast({
        title: 'Export Complete',
        description: 'Your distribution package is ready to download',
      });
    },
    onError: (error: unknown) => {
      setExportProgress(0);
      toast({
        title: 'Export Failed',
        description: error.message || 'Failed to export package',
        variant: 'destructive',
      });
    },
  });

  const handleArtworkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/image\/(jpeg|jpg|png)/)) {
      toast({
        title: 'Invalid Format',
        description: 'Artwork must be JPEG or PNG',
        variant: 'destructive',
      });
      return;
    }

    const img = new Image();
    const reader = new FileReader();

    reader.onload = (event) => {
      img.src = event.target?.result as string;
      img.onload = () => {
        if (img.width < 3000 || img.height < 3000) {
          toast({
            title: 'Image Too Small',
            description: 'Artwork must be at least 3000x3000px for DSP compliance',
            variant: 'destructive',
          });
          return;
        }
        setArtworkFile(file);
        setArtworkPreview(img.src);
      };
    };

    reader.readAsDataURL(file);
  };

  const handleSavePackage = async (data: PackageFormData) => {
    let uploadedArtworkUrl: string | undefined;

    // Upload artwork first if there's a new file
    if (artworkFile) {
      try {
        const uploadResult = await uploadArtworkMutation.mutateAsync(artworkFile);
        uploadedArtworkUrl = uploadResult.artworkUrl;
        setArtworkFile(null); // Clear the file after successful upload
      } catch (error: unknown) {
        // Error already shown by mutation, abort save
        return;
      }
    } else if (existingPackage?.artworkUrl) {
      // Keep existing artwork URL if no new file
      uploadedArtworkUrl = existingPackage.artworkUrl;
    }

    await createPackageMutation.mutateAsync({ ...data, uploadedArtworkUrl });
  };

  const handleAutoFillTracks = async () => {
    if (!existingPackage?.id) {
      toast({
        title: 'Info',
        description: 'Please save album info first',
        variant: 'default',
      });
      return;
    }

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      await addTrackMutation.mutateAsync({
        trackData: {
          title: track.name || `Track ${i + 1}`,
          artist: '',
          genre: '',
          explicitContent: false,
          isrc: '',
          lyrics: '',
          credits: '',
        },
        trackNumber: i + 1,
      });
    }
  };

  const handleExport = async () => {
    if (!existingPackage?.id) {
      toast({
        title: 'Info',
        description: 'Please save the distribution package first',
        variant: 'default',
      });
      return;
    }

    await exportMutation.mutateAsync();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        data-testid="dialog-distribution"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-distribution-title">
            <Package className="w-5 h-5" />
            Distribution Package
          </DialogTitle>
          <DialogDescription data-testid="text-distribution-description">
            Create a DSP-compliant metadata package for {projectName}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3" data-testid="tabs-distribution">
            <TabsTrigger value="album" data-testid="tab-album">
              <Music className="w-4 h-4 mr-2" />
              Album Info
            </TabsTrigger>
            <TabsTrigger value="tracks" data-testid="tab-tracks">
              <FileText className="w-4 h-4 mr-2" />
              Tracks
            </TabsTrigger>
            <TabsTrigger value="export" data-testid="tab-export">
              <Download className="w-4 h-4 mr-2" />
              Export
            </TabsTrigger>
          </TabsList>

          <TabsContent value="album" className="space-y-4" data-testid="content-album">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSavePackage)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="albumTitle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Album Title *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Enter album title"
                          data-testid="input-album-title"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="upc"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>UPC/EAN Code</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="123456789012"
                          maxLength={13}
                          data-testid="input-upc"
                        />
                      </FormControl>
                      <FormDescription>12-13 digits. Leave blank to auto-generate.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="releaseDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Release Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-release-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="label"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Record Label</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Independent" data-testid="input-label" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="copyrightP"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>℗ Phonographic Copyright</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="℗ 2025 Artist Name"
                            data-testid="input-copyright-p"
                          />
                        </FormControl>
                        <FormDescription>Sound recording copyright</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="copyrightC"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>© Compositional Copyright</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="© 2025 Artist Name"
                            data-testid="input-copyright-c"
                          />
                        </FormControl>
                        <FormDescription>Composition copyright</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <FormLabel>Album Artwork</FormLabel>
                  <div className="flex items-center gap-4">
                    <Input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png"
                      onChange={handleArtworkUpload}
                      data-testid="input-artwork"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      data-testid="button-upload-artwork"
                    >
                      <Upload className="w-4 h-4" />
                    </Button>
                  </div>
                  {artworkPreview && (
                    <div className="mt-2">
                      <img
                        src={artworkPreview}
                        alt="Artwork preview"
                        className="w-48 h-48 object-cover rounded border"
                        data-testid="img-artwork-preview"
                      />
                    </div>
                  )}
                  <FormDescription>
                    <Info className="w-3 h-3 inline mr-1" />
                    Minimum 3000x3000px, JPEG or PNG format
                  </FormDescription>
                </div>

                <Button
                  type="submit"
                  disabled={uploadArtworkMutation.isPending || createPackageMutation.isPending}
                  data-testid="button-save-package"
                >
                  {(uploadArtworkMutation.isPending || createPackageMutation.isPending) && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {uploadArtworkMutation.isPending ? 'Uploading Artwork...' : 'Save Album Info'}
                </Button>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="tracks" className="space-y-4" data-testid="content-tracks">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold" data-testid="text-tracks-title">
                Track Metadata
              </h3>
              <Button
                onClick={handleAutoFillTracks}
                variant="outline"
                disabled={!existingPackage?.id || addTrackMutation.isPending}
                data-testid="button-autofill-tracks"
              >
                {addTrackMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Auto-fill from Project
              </Button>
            </div>

            {tracksLoading ? (
              <div className="flex justify-center py-8" data-testid="loader-tracks">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : packageTracks.length > 0 ? (
              <Accordion type="single" collapsible className="w-full">
                {packageTracks.map((track, index) => (
                  <AccordionItem
                    key={track.id}
                    value={`track-${index}`}
                    data-testid={`accordion-track-${index}`}
                  >
                    <AccordionTrigger data-testid={`trigger-track-${index}`}>
                      Track {track.trackNumber}: {track.title || 'Untitled'}
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3 p-4" data-testid={`content-track-${index}`}>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-sm font-medium">Title</label>
                            <p className="text-sm" data-testid={`text-track-title-${index}`}>
                              {track.title}
                            </p>
                          </div>
                          <div>
                            <label className="text-sm font-medium">Artist</label>
                            <p className="text-sm" data-testid={`text-track-artist-${index}`}>
                              {track.artist || '—'}
                            </p>
                          </div>
                          <div>
                            <label className="text-sm font-medium">ISRC</label>
                            <p
                              className="text-sm font-mono"
                              data-testid={`text-track-isrc-${index}`}
                            >
                              {track.isrc || '—'}
                            </p>
                          </div>
                          <div>
                            <label className="text-sm font-medium">Genre</label>
                            <p className="text-sm" data-testid={`text-track-genre-${index}`}>
                              {track.genre || '—'}
                            </p>
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium">Explicit Content</label>
                          <p className="text-sm" data-testid={`text-track-explicit-${index}`}>
                            {track.explicitContent ? 'Yes' : 'No'}
                          </p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <div className="text-center py-8 text-muted-foreground" data-testid="text-no-tracks">
                No tracks added yet. Click "Auto-fill from Project" to add tracks.
              </div>
            )}
          </TabsContent>

          <TabsContent value="export" className="space-y-4" data-testid="content-export">
            <div className="space-y-4">
              <div className="p-4 border rounded-lg space-y-2">
                <h3 className="font-semibold" data-testid="text-export-title">
                  Export Package
                </h3>
                <p className="text-sm text-muted-foreground" data-testid="text-export-description">
                  Generate a ZIP file containing metadata.json, tracks.csv, artwork, and README.
                </p>

                {existingPackage?.status && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Status:</span>
                    <span
                      className={`text-sm px-2 py-1 rounded ${
                        existingPackage.status === 'ready'
                          ? 'bg-green-100 text-green-700'
                          : existingPackage.status === 'submitted'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-700'
                      }`}
                      data-testid="text-package-status"
                    >
                      {existingPackage.status}
                    </span>
                  </div>
                )}

                {exportProgress > 0 && exportProgress < 100 && (
                  <div className="space-y-2">
                    <Progress value={exportProgress} data-testid="progress-export" />
                    <p className="text-sm text-center" data-testid="text-export-progress">
                      Generating package... {exportProgress}%
                    </p>
                  </div>
                )}

                <div className="flex gap-2 mt-4">
                  <Button
                    onClick={handleExport}
                    disabled={!existingPackage?.id || exportMutation.isPending}
                    data-testid="button-export"
                  >
                    {exportMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Package className="w-4 h-4 mr-2" />
                        Generate ZIP
                      </>
                    )}
                  </Button>

                  {downloadUrl && (
                    <Button
                      onClick={() => window.open(downloadUrl, '_blank')}
                      variant="outline"
                      data-testid="button-download"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download Package
                    </Button>
                  )}
                </div>
              </div>

              <div className="p-4 border rounded-lg space-y-2 bg-muted/50">
                <h4 className="font-semibold text-sm" data-testid="text-package-contents">
                  Package Contents:
                </h4>
                <ul
                  className="text-sm space-y-1 list-disc list-inside"
                  data-testid="list-package-contents"
                >
                  <li>metadata.json - DSP-compliant release metadata</li>
                  <li>tracks.csv - Track listing in CSV format</li>
                  <li>artwork.jpg/png - Album artwork (if provided)</li>
                  <li>README.txt - Package information</li>
                </ul>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
