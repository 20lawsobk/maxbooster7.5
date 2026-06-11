import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  GitBranch,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// ── Types (mirror server/services/catalogMigrationService.ts) ─────────────────

interface IsrcConflict {
  trackTitle: string;
  trackNumber: number;
  labelgridIsrc: string;
  platformIsrc: string;
}

interface PlatformValidation {
  platform: "deezer" | "apple_music";
  found: boolean;
  platformReleaseId: string | null;
  titleMatch: boolean;
  releaseDateMatch: boolean | null;
  trackCountMatch: boolean | null;
  isrcConflicts: IsrcConflict[];
  alternateVersions: string[];
  discrepancies: string[];
  enrichedFields: string[];
}

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
  releaseType: "album" | "EP" | "single";
  releaseDate: string | null;
  upc: string | null;
  artwork: string | null;
  genre: string | null;
  label: null;
  copyrightYear: number | null;
  copyrightOwner: null;
  territoryMode: "worldwide";
  territories: [];
  platforms: string[];
  tracks: MigrationTrack[];
  platformUrl?: string;
  _meta: {
    sources: string[];
    isrcsCovered: number;
    totalTracks: number;
    missingFields: string[];
    platformPresence: string[];
    validation: PlatformValidation[];
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const PLATFORM_LABEL: Record<string, string> = {
  spotify: "Spotify",
  apple_music: "Apple Music",
  "apple-music": "Apple Music",
  itunes: "iTunes",
  "amazon-music": "Amazon Music",
  amazon_music: "Amazon Music",
  tidal: "Tidal",
  deezer: "Deezer",
  "youtube-music": "YouTube Music",
  youtube_music: "YouTube Music",
  pandora: "Pandora",
  iheartradio: "iHeartRadio",
  napster: "Napster",
  soundcloud: "SoundCloud",
  tiktok: "TikTok",
  boomplay: "Boomplay",
  anghami: "Anghami",
  kkbox: "KKBOX",
  beatport: "Beatport",
  bandcamp: "Bandcamp",
};

/** Summarise a platform presence list for display. */
function formatPlatformPresence(platforms: string[]): string {
  if (platforms.length === 0) return "";
  if (platforms.length <= 4) {
    return platforms.map((p) => PLATFORM_LABEL[p] ?? p).join(", ");
  }
  const first = platforms
    .slice(0, 3)
    .map((p) => PLATFORM_LABEL[p] ?? p)
    .join(", ");
  return `${first} + ${platforms.length - 3} more`;
}

// ── ValidationBadge ───────────────────────────────────────────────────────────

function ValidationBadge({ v }: { v: PlatformValidation }) {
  const label = PLATFORM_LABEL[v.platform] ?? v.platform;
  const hasIssues = v.discrepancies.length > 0 || v.isrcConflicts.length > 0;

  if (!v.found) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <ShieldX className="w-3 h-3 text-muted-foreground/60" />
        {label}: not found
      </span>
    );
  }

  if (hasIssues) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-500">
        <AlertTriangle className="w-3 h-3" />
        {label}: {v.discrepancies.length + v.isrcConflicts.length} issue
        {v.discrepancies.length + v.isrcConflicts.length !== 1 ? "s" : ""}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-green-500">
      <ShieldCheck className="w-3 h-3" />
      {label}: verified
    </span>
  );
}

// ── ReleaseRow ────────────────────────────────────────────────────────────────

function ReleaseRow({ release }: { release: MigrationRelease }) {
  const [open, setOpen] = useState(false);
  const { isrcsCovered, totalTracks, validation, platformPresence } =
    release._meta;

  const allDiscrepancies = validation.flatMap((v) => v.discrepancies);
  const allConflicts = validation.flatMap((v) => v.isrcConflicts);
  const allAlternates = [
    ...new Set(validation.flatMap((v) => v.alternateVersions)),
  ];
  const hasWarnings = allDiscrepancies.length > 0 || allConflicts.length > 0;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* ── Header row ── */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="w-12 h-12 rounded bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden relative">
          {release.artwork && (
            <img
              src={release.artwork}
              alt={release.title}
              className="absolute inset-0 w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <Music className="w-5 h-5 text-muted-foreground" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{release.title}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
            <span className="text-xs text-muted-foreground">
              {release.releaseDate?.slice(0, 4) ?? "—"} · {totalTracks} track
              {totalTracks !== 1 ? "s" : ""} ·{" "}
              {release.genre ?? "Unknown genre"}
            </span>
            {validation.map((v) => (
              <ValidationBadge key={v.platform} v={v} />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {hasWarnings && (
            <Badge
              variant="outline"
              className="text-xs text-amber-500 border-amber-400"
            >
              {allDiscrepancies.length + allConflicts.length} flag
              {allDiscrepancies.length + allConflicts.length !== 1 ? "s" : ""}
            </Badge>
          )}
          {release.upc && (
            <Badge variant="secondary" className="text-xs font-mono">
              UPC
            </Badge>
          )}
          <Badge
            variant={
              isrcsCovered === totalTracks
                ? "default"
                : isrcsCovered > 0
                  ? "secondary"
                  : "outline"
            }
            className="text-xs"
          >
            {isrcsCovered}/{totalTracks} ISRC
          </Badge>
          {release.platformUrl && (
            <a
              href={release.platformUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="View on platform"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          {open ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* ── Expanded detail ── */}
      {open && (
        <div className="border-t border-border bg-muted/20 divide-y divide-border/50">
          {/* Metadata summary */}
          <div className="px-4 py-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            {release.upc && (
              <span>
                UPC:{" "}
                <span className="font-mono text-foreground">{release.upc}</span>
              </span>
            )}
            {release.releaseDate && (
              <span>Released: {release.releaseDate}</span>
            )}
            {platformPresence.length > 0 && (
              <span>
                LabelGrid confirmed:{" "}
                <span className="text-foreground">
                  {formatPlatformPresence(platformPresence)}
                </span>
              </span>
            )}
            {release.platforms.length > 0 && (
              <span>
                Distribution targets:{" "}
                <span className="text-foreground">
                  {release.platforms.length > 6
                    ? `All ${release.platforms.length} registered platforms`
                    : formatPlatformPresence(release.platforms)}
                </span>
              </span>
            )}
            {release._meta.sources.length > 0 && (
              <span>Sources: {release._meta.sources.join(", ")}</span>
            )}
          </div>

          {/* Alternate versions */}
          {allAlternates.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-xs font-medium flex items-center gap-1 mb-1 text-blue-500">
                <GitBranch className="w-3 h-3" />
                Alternate versions detected on streaming platforms
              </p>
              <ul className="space-y-0.5">
                {allAlternates.map((v, i) => (
                  <li key={i} className="text-xs text-muted-foreground pl-4">
                    {v}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Validation discrepancies */}
          {(allDiscrepancies.length > 0 || allConflicts.length > 0) && (
            <div className="px-4 py-3">
              <p className="text-xs font-medium flex items-center gap-1 mb-1 text-amber-500">
                <AlertTriangle className="w-3 h-3" />
                Metadata discrepancies
              </p>
              <ul className="space-y-0.5">
                {allDiscrepancies.map((d, i) => (
                  <li key={i} className="text-xs text-muted-foreground pl-4">
                    {d}
                  </li>
                ))}
                {allConflicts.map((c, i) => (
                  <li
                    key={`conflict-${i}`}
                    className="text-xs text-amber-600 pl-4"
                  >
                    ISRC conflict on "{c.trackTitle}": LabelGrid=
                    {c.labelgridIsrc} vs Platform={c.platformIsrc}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Track listing */}
          <div className="px-4 py-3">
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
                  <tr
                    key={track.trackNumber}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="py-1 text-muted-foreground">
                      {track.trackNumber}
                    </td>
                    <td className="py-1 pr-2 truncate max-w-0 w-full">
                      <span className="flex items-center gap-1">
                        {track.title}
                        {track.explicit && (
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1 py-0 h-4"
                          >
                            E
                          </Badge>
                        )}
                      </span>
                    </td>
                    <td className="py-1 font-mono">
                      {track.isrc ? (
                        <span className="text-green-500">{track.isrc}</span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
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
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface CatalogMigrationProps {
  defaultArtistName?: string;
}

export default function CatalogMigration({
  defaultArtistName = "",
}: CatalogMigrationProps) {
  const [artistName, setArtistName] = useState(defaultArtistName);
  const [result, setResult] = useState<MigrationPayload | null>(null);
  const { toast } = useToast();

  const exportMutation = useMutation({
    mutationFn: async (name: string) => {
      const resp = await apiRequest(
        "POST",
        "/api/distribution/catalog-export",
        { artistName: name },
      );
      return resp.json() as Promise<MigrationPayload>;
    },
    onSuccess: (data) => {
      setResult(data);
      if (data.totalReleases === 0) {
        toast({
          title: "No releases found",
          description: `Could not find any releases for "${data.artistName}".`,
          variant: "destructive",
        });
      } else {
        const warnings = data.releases.reduce(
          (acc, r) =>
            acc +
            r._meta.validation.reduce(
              (a, v) => a + v.discrepancies.length + v.isrcConflicts.length,
              0,
            ),
          0,
        );
        toast({
          title: "Catalog parsed",
          description: `${data.totalReleases} release(s), ${data.isrcCoverage} ISRC coverage${warnings > 0 ? `, ${warnings} discrepancy flag(s) detected` : ""}.`,
        });
      }
    },
    onError: () => {
      toast({
        title: "Export failed",
        description: "Could not parse catalog. Please try again.",
        variant: "destructive",
      });
    },
  });

  function handleExport() {
    if (!artistName.trim()) return;
    setResult(null);
    exportMutation.mutate(artistName.trim());
  }

  function downloadJson() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.artistName.replace(/\s+/g, "_")}_labelgrid_import.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const isLoading = exportMutation.isPending;

  const totalWarnings =
    result?.releases.reduce(
      (acc, r) =>
        acc +
        r._meta.validation.reduce(
          (a, v) => a + v.discrepancies.length + v.isrcConflicts.length,
          0,
        ),
      0,
    ) ?? 0;

  return (
    <div className="space-y-6">
      {/* ── Input card ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            Migrate Catalog to LabelGrid
          </CardTitle>
          <CardDescription>
            Pulls your complete catalog from LabelGrid as the authoritative
            source, then cross-checks every release against Deezer and Apple
            Music — verifying ISRCs, UPCs, release dates, track counts, and
            artwork. Any discrepancies or alternate versions found on public
            platforms are flagged in the output. Outputs a clean JSON file ready
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
                onChange={(e) => setArtistName(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !isLoading && handleExport()
                }
                disabled={isLoading}
              />
              <Button
                onClick={handleExport}
                disabled={isLoading || !artistName.trim()}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing…
                  </>
                ) : (
                  <>
                    <Music className="w-4 h-4 mr-2" />
                    Parse &amp; Validate
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Uses LabelGrid as the primary source. Streaming platforms (Deezer,
              Apple Music) are queried in parallel for validation and enrichment
              only. Typically takes 1–3 minutes for a full catalog.
            </p>
          </div>

          {isLoading && (
            <Alert>
              <Loader2 className="w-4 h-4 animate-spin" />
              <AlertDescription className="ml-2">
                Step 1: Fetching catalog from LabelGrid…
                <br />
                Step 2: Cross-checking every release against Deezer and Apple
                Music — verifying ISRCs, UPCs, dates, track counts, and
                detecting alternate versions…
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

      {/* ── Results card ── */}
      {result && result.totalReleases > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  {result.totalReleases} Release
                  {result.totalReleases !== 1 ? "s" : ""} Extracted &amp;
                  Validated
                </CardTitle>
                <CardDescription className="mt-1">
                  {result.totalTracks} tracks · {result.isrcCoverage} ISRC
                  coverage
                  {totalWarnings > 0 && (
                    <span className="text-amber-500">
                      {" "}
                      · {totalWarnings} discrepancy flag
                      {totalWarnings !== 1 ? "s" : ""}
                    </span>
                  )}
                  {" · "}Exported {new Date(result.exportedAt).toLocaleString()}
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
              <Badge variant="default">LabelGrid (primary)</Badge>
              <Badge variant="secondary">Deezer (validation)</Badge>
              <Badge variant="secondary">Apple Music (validation)</Badge>
              {totalWarnings > 0 && (
                <Badge
                  variant="outline"
                  className="text-amber-500 border-amber-400 gap-1"
                >
                  <AlertTriangle className="w-3 h-3" />
                  {totalWarnings} flag{totalWarnings !== 1 ? "s" : ""} — review
                  before importing
                </Badge>
              )}
            </div>
          </CardHeader>

          <CardContent>
            <ScrollArea className="max-h-[600px] pr-1">
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
            No releases found for <strong>{result.artistName}</strong>. Ensure
            the artist name matches exactly how it appears on Apple Music and
            that your LabelGrid account is connected.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
