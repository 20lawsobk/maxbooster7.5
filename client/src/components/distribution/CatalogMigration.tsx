import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Download,
  Loader2,
  Music,
  FileJson,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ArrowRightLeft,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface MigrationTrack {
  title: string;
  artist: string;
  isrc: string | null;
  audioFile: null;
  duration: number | null;
  trackNumber: number;
  discNumber: number;
  explicit: boolean;
}

interface MigrationRelease {
  title: string;
  artist: string;
  releaseDate: string | null;
  upc: string | null;
  artwork: string | null;
  genre: string | null;
  label: null;
  copyrightYear: number | null;
  copyrightOwner: null;
  territoryMode: 'worldwide';
  territories: [];
  platforms: string[];
  tracks: MigrationTrack[];
  _meta: {
    sources: string[];
    isrcsCovered: number;
    totalTracks: number;
    missingFields: string[];
  };
}

interface MigrationPayload {
  exportedAt: string;
  artistName: string;
  totalReleases: number;
  totalTracks: number;
  isrcCoverage: string;
  releases: MigrationRelease[];
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function ReleaseRow({ release }: { release: MigrationRelease }) {
  const [open, setOpen] = useState(false);
  const isrcCount = release._meta.isrcsCovered;
  const totalTracks = release._meta.totalTracks;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        {release.artwork ? (
          <img
            src={release.artwork}
            alt={release.title}
            className="w-12 h-12 rounded object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded bg-muted flex items-center justify-center flex-shrink-0">
            <Music className="w-5 h-5 text-muted-foreground" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{release.title}</p>
          <p className="text-xs text-muted-foreground">
            {release.releaseDate?.slice(0, 4) ?? '—'} · {totalTracks} track{totalTracks !== 1 ? 's' : ''} · {release.genre ?? 'Unknown genre'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {release.upc && (
            <Badge variant="secondary" className="text-xs font-mono">UPC</Badge>
          )}
          <Badge
            variant={isrcCount === totalTracks ? 'default' : isrcCount > 0 ? 'secondary' : 'outline'}
            className="text-xs"
          >
            {isrcCount}/{totalTracks} ISRC
          </Badge>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-2">
          {release.upc && (
            <p className="text-xs text-muted-foreground font-mono">UPC: {release.upc}</p>
          )}
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left pb-1 w-8">#</th>
                <th className="text-left pb-1">Title</th>
                <th className="text-left pb-1 w-36 font-mono">ISRC</th>
                <th className="text-right pb-1 w-16">Duration</th>
              </tr>
            </thead>
            <tbody>
              {release.tracks.map((track) => (
                <tr key={track.trackNumber} className="border-b border-border/50 last:border-0">
                  <td className="py-1 text-muted-foreground">{track.trackNumber}</td>
                  <td className="py-1 pr-2 truncate max-w-0 w-full">
                    <span className="flex items-center gap-1">
                      {track.title}
                      {track.explicit && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">E</Badge>
                      )}
                    </span>
                  </td>
                  <td className="py-1 font-mono text-muted-foreground">
                    {track.isrc ? (
                      <span className="text-green-500">{track.isrc}</span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="py-1 text-right text-muted-foreground">
                    {formatDuration(track.duration)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface CatalogMigrationProps {
  defaultArtistName?: string;
}

export default function CatalogMigration({ defaultArtistName = '' }: CatalogMigrationProps) {
  const [artistName, setArtistName] = useState(defaultArtistName);
  const [result, setResult] = useState<MigrationPayload | null>(null);
  const { toast } = useToast();
  const downloadRef = useRef<HTMLAnchorElement>(null);

  const exportMutation = useMutation({
    mutationFn: async (name: string) => {
      const resp = await apiRequest('POST', '/api/distribution/catalog-export', { artistName: name });
      return resp.json() as Promise<MigrationPayload>;
    },
    onSuccess: (data) => {
      setResult(data);
      if (data.totalReleases === 0) {
        toast({
          title: 'No releases found',
          description: `Could not find any releases for "${data.artistName}" on iTunes or Deezer.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Catalog parsed',
          description: `Found ${data.totalReleases} release(s), ${data.isrcCoverage} ISRC coverage.`,
        });
      }
    },
    onError: () => {
      toast({ title: 'Export failed', description: 'Could not parse catalog. Please try again.', variant: 'destructive' });
    },
  });

  function handleExport() {
    if (!artistName.trim()) return;
    setResult(null);
    exportMutation.mutate(artistName.trim());
  }

  function downloadJson() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.artistName.replace(/\s+/g, '_')}_labelgrid_import.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const isLoading = exportMutation.isPending;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            Migrate Catalog to LabelGrid
          </CardTitle>
          <CardDescription>
            Pulls your complete catalog directly from LabelGrid — including UPCs, ISRCs, artwork,
            and all distribution-grade metadata. Missing fields are automatically filled in from
            Deezer (ISRCs) and Apple Music (artwork/genre). Outputs a clean JSON file ready
            for LabelGrid import.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="artist-name">Artist Name</Label>
            <div className="flex gap-2">
              <Input
                id="artist-name"
                placeholder="e.g. B-Lawz"
                value={artistName}
                onChange={e => setArtistName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !isLoading && handleExport()}
                disabled={isLoading}
              />
              <Button onClick={handleExport} disabled={isLoading || !artistName.trim()}>
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Parsing…
                  </>
                ) : (
                  <>
                    <Music className="w-4 h-4 mr-2" />
                    Parse Catalog
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Must match the exact artist name used on Apple Music. This scan typically takes
              30–90 seconds depending on catalog size.
            </p>
          </div>

          {isLoading && (
            <Alert>
              <Loader2 className="w-4 h-4 animate-spin" />
              <AlertDescription className="ml-2">
                Fetching your catalog from LabelGrid, then filling any gaps using Deezer (ISRCs)
                and Apple Music (artwork/genre). Large catalogs may take up to 2 minutes…
              </AlertDescription>
            </Alert>
          )}

          {exportMutation.isError && (
            <Alert variant="destructive">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription className="ml-2">
                The export failed. Check the artist name and try again.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {result && result.totalReleases > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  {result.totalReleases} Release{result.totalReleases !== 1 ? 's' : ''} Extracted
                </CardTitle>
                <CardDescription className="mt-1">
                  {result.totalTracks} tracks total · {result.isrcCoverage} ISRC coverage ·
                  Exported {new Date(result.exportedAt).toLocaleString()}
                </CardDescription>
              </div>
              <Button onClick={downloadJson} className="flex-shrink-0">
                <Download className="w-4 h-4 mr-2" />
                Download JSON
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              <Badge variant="outline" className="gap-1">
                <FileJson className="w-3 h-3" />
                LabelGrid Import Format
              </Badge>
              <Badge variant="default">LabelGrid</Badge>
              <Badge variant="secondary">Deezer (ISRC fill)</Badge>
              <Badge variant="secondary">Apple Music (artwork)</Badge>
            </div>
          </CardHeader>

          <CardContent>
            <ScrollArea className="max-h-[520px] pr-1">
              <div className="space-y-2">
                {result.releases.map((release, i) => (
                  <ReleaseRow key={i} release={release} />
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {result && result.totalReleases === 0 && (
        <Alert>
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="ml-2">
            No releases found for <strong>{result.artistName}</strong> on Apple Music. Make sure
            the artist name matches exactly how it appears on Apple Music.
          </AlertDescription>
        </Alert>
      )}

      <a ref={downloadRef} className="hidden" />
    </div>
  );
}
