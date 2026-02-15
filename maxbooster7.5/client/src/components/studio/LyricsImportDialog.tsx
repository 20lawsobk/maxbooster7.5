import { useState } from 'react';
import { useStudioStore } from '@/lib/studioStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Upload, FileText, Clipboard } from 'lucide-react';

interface LyricsImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LyricsImportDialog({ open, onOpenChange }: LyricsImportDialogProps) {
  const { importLyrics } = useStudioStore();
  const [lyricsText, setLyricsText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleImport = () => {
    if (!lyricsText.trim()) {
      setError('Please enter some lyrics');
      return;
    }
    importLyrics(lyricsText);
    setLyricsText('');
    setError(null);
    onOpenChange(false);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setLyricsText(text);
      setError(null);
    } catch (err) {
      setError('Failed to paste from clipboard');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.txt') && !file.name.endsWith('.lrc')) {
      setError('Please upload a .txt or .lrc file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (file.name.endsWith('.lrc')) {
        const lines = content
          .split('\n')
          .map((line) => line.replace(/\[\d+:\d+\.\d+\]/g, '').trim())
          .filter((line) => line);
        setLyricsText(lines.join('\n'));
      } else {
        setLyricsText(content);
      }
      setError(null);
    };
    reader.readAsText(file);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Import Lyrics
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePaste}>
              <Clipboard className="w-4 h-4 mr-2" />
              Paste from Clipboard
            </Button>
            <Label
              htmlFor="lyrics-file"
              className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-accent cursor-pointer"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload File
            </Label>
            <input
              id="lyrics-file"
              type="file"
              accept=".txt,.lrc"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lyrics-text">Lyrics (one line per verse)</Label>
            <Textarea
              id="lyrics-text"
              value={lyricsText}
              onChange={(e) => {
                setLyricsText(e.target.value);
                setError(null);
              }}
              placeholder="Enter your lyrics here...&#10;Each line will become a separate lyric event.&#10;&#10;Example:&#10;Verse 1: Hello world&#10;This is the second line&#10;And so on..."
              className="h-48 font-mono text-sm"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <p className="text-xs text-muted-foreground">
            Each line will be placed on the timeline at 4-second intervals.
            You can drag them to adjust timing after import.
            Use Alt+Enter to snap the selected lyric to the playhead position.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport}>Import Lyrics</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
