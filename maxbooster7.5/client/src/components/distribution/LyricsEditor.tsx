import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Plus, Trash2 } from 'lucide-react';

interface LyricsData {
  trackNumber: number;
  trackTitle: string;
  lyrics: string;
  language: string;
  hasExplicitContent: boolean;
}

interface LyricsEditorProps {
  tracks: { trackNumber: number; title: string }[];
  lyricsData: LyricsData[];
  onChange: (lyrics: LyricsData[]) => void;
}

/**
 * TODO: Add function documentation
 */
export function LyricsEditor({ tracks, lyricsData, onChange }: LyricsEditorProps) {
  const updateLyrics = (trackNumber: number, updates: Partial<LyricsData>) => {
    const existing = lyricsData.find((l) => l.trackNumber === trackNumber);

    if (existing) {
      onChange(lyricsData.map((l) => (l.trackNumber === trackNumber ? { ...l, ...updates } : l)));
    } else {
      const track = tracks.find((t) => t.trackNumber === trackNumber);
      if (track) {
        onChange([
          ...lyricsData,
          {
            trackNumber,
            trackTitle: track.title,
            lyrics: '',
            language: 'English',
            hasExplicitContent: false,
            ...updates,
          },
        ]);
      }
    }
  };

  const removeLyrics = (trackNumber: number) => {
    onChange(lyricsData.filter((l) => l.trackNumber !== trackNumber));
  };

  const getLyricsForTrack = (trackNumber: number): LyricsData | undefined => {
    return lyricsData.find((l) => l.trackNumber === trackNumber);
  };

  const hasLyrics = (trackNumber: number): boolean => {
    const lyrics = getLyricsForTrack(trackNumber);
    return !!lyrics && lyrics.lyrics.trim().length > 0;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Track Lyrics
        </CardTitle>
        <CardDescription>
          Add lyrics for your tracks. This helps DSPs display synchronized lyrics and improves
          discoverability.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tracks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Upload tracks first to add lyrics</p>
          </div>
        ) : (
          <div className="space-y-6">
            {tracks.map((track) => {
              const trackLyrics = getLyricsForTrack(track.trackNumber);
              const isExpanded = hasLyrics(track.trackNumber);

              return (
                <div key={track.trackNumber} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary/10 rounded flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-medium">{track.trackNumber}</span>
                      </div>
                      <div>
                        <p className="font-medium">{track.title}</p>
                        {trackLyrics && trackLyrics.hasExplicitContent && (
                          <Badge variant="destructive" className="mt-1">
                            Explicit
                          </Badge>
                        )}
                      </div>
                    </div>

                    {isExpanded ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLyrics(track.trackNumber)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => updateLyrics(track.trackNumber, { lyrics: '' })}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Lyrics
                      </Button>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label htmlFor={`lyrics-${track.trackNumber}`}>Lyrics</Label>
                        <Textarea
                          id={`lyrics-${track.trackNumber}`}
                          placeholder="Enter lyrics line by line..."
                          value={trackLyrics?.lyrics || ''}
                          onChange={(e) =>
                            updateLyrics(track.trackNumber, { lyrics: e.target.value })
                          }
                          className="min-h-[200px] font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                          {(trackLyrics?.lyrics || '').split('\n').filter((l) => l.trim()).length}{' '}
                          lines
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor={`lyrics-lang-${track.trackNumber}`}>
                            Lyrics Language
                          </Label>
                          <Select
                            value={trackLyrics?.language || 'English'}
                            onValueChange={(value) =>
                              updateLyrics(track.trackNumber, { language: value })
                            }
                          >
                            <SelectTrigger id={`lyrics-lang-${track.trackNumber}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="English">English</SelectItem>
                              <SelectItem value="Spanish">Spanish</SelectItem>
                              <SelectItem value="French">French</SelectItem>
                              <SelectItem value="German">German</SelectItem>
                              <SelectItem value="Italian">Italian</SelectItem>
                              <SelectItem value="Portuguese">Portuguese</SelectItem>
                              <SelectItem value="Japanese">Japanese</SelectItem>
                              <SelectItem value="Korean">Korean</SelectItem>
                              <SelectItem value="Mandarin">Mandarin</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Content Rating</Label>
                          <div className="flex items-center gap-2 pt-2">
                            <input
                              type="checkbox"
                              id={`explicit-${track.trackNumber}`}
                              checked={trackLyrics?.hasExplicitContent || false}
                              onChange={(e) =>
                                updateLyrics(track.trackNumber, {
                                  hasExplicitContent: e.target.checked,
                                })
                              }
                              className="rounded border-gray-300"
                            />
                            <Label
                              htmlFor={`explicit-${track.trackNumber}`}
                              className="cursor-pointer font-normal"
                            >
                              Contains explicit content
                            </Label>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
