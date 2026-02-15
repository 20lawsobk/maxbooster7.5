import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  Database, 
  FolderOpen, 
  FileText, 
  Layers, 
  Sparkles, 
  ArrowDown, 
  ArrowUp,
  RefreshCw,
  Plus,
  Trash2,
  Lock,
  Unlock,
  HardDrive
} from 'lucide-react';

interface PocketStats {
  totalEntries: number;
  totalSize: string;
  compressedSize: string;
  compressionRatio: string;
  deduplicationSavings: string;
  nestedDimensions: number;
  maxDepth: number;
}

interface PocketEntry {
  path: string;
  type: 'file' | 'directory' | 'dimension';
  size: number;
  compressedSize: number;
  compressionRatio: string;
  version: number;
  modifiedAt: string;
}

interface GlobalStats {
  pockets: number;
  totalSize: number;
  compressedSize: number;
}

export function PocketDimensionDashboard() {
  const [pockets, setPockets] = useState<string[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [selectedPocket, setSelectedPocket] = useState<string | null>(null);
  const [pocketStats, setPocketStats] = useState<PocketStats | null>(null);
  const [entries, setEntries] = useState<PocketEntry[]>([]);
  const [newPocketId, setNewPocketId] = useState('');
  const [newFilePath, setNewFilePath] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchPockets = async () => {
    try {
      const response = await fetch('/api/pocket/list');
      const data = await response.json();
      if (data.success) {
        setPockets(data.pockets);
        setGlobalStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch pockets:', error);
    }
  };

  const fetchPocketDetails = async (pocketId: string) => {
    try {
      const [statsRes, entriesRes] = await Promise.all([
        fetch(`/api/pocket/${pocketId}/stats`),
        fetch(`/api/pocket/${pocketId}/list`),
      ]);
      
      const statsData = await statsRes.json();
      const entriesData = await entriesRes.json();
      
      if (statsData.success) {
        setPocketStats(statsData.stats);
      }
      if (entriesData.success) {
        setEntries(entriesData.entries);
      }
    } catch (error) {
      console.error('Failed to fetch pocket details:', error);
    }
  };

  const createPocket = async () => {
    if (!newPocketId.trim()) {
      toast({ title: 'Error', description: 'Please enter a pocket ID', variant: 'destructive' });
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch('/api/pocket/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newPocketId, encrypted: false }),
      });
      
      const data = await response.json();
      if (data.success) {
        toast({ title: 'Pocket Dimension Created', description: `Created pocket: ${newPocketId}` });
        setNewPocketId('');
        fetchPockets();
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to create pocket dimension', variant: 'destructive' });
    }
    setLoading(false);
  };

  const writeFile = async () => {
    if (!selectedPocket || !newFilePath.trim() || !newFileContent.trim()) {
      toast({ title: 'Error', description: 'Please fill in all fields', variant: 'destructive' });
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch(`/api/pocket/${selectedPocket}/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newFilePath, data: newFileContent }),
      });
      
      const data = await response.json();
      if (data.success) {
        toast({ 
          title: 'File Written to Pocket Dimension', 
          description: `${data.entry.size} bytes compressed to ${data.entry.compressedSize} bytes (${data.entry.compressionRatio}x)` 
        });
        setNewFilePath('');
        setNewFileContent('');
        fetchPocketDetails(selectedPocket);
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to write file', variant: 'destructive' });
    }
    setLoading(false);
  };

  const runDemo = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/pocket/demo');
      const data = await response.json();
      if (data.success) {
        toast({ 
          title: 'Demo Created!', 
          description: `Compression ratio: ${data.stats.compressionRatio}` 
        });
        fetchPockets();
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to run demo', variant: 'destructive' });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPockets();
  }, []);

  useEffect(() => {
    if (selectedPocket) {
      fetchPocketDetails(selectedPocket);
    }
  }, [selectedPocket]);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Sparkles className="h-8 w-8 text-purple-500" />
            Pocket Dimension Storage
          </h1>
          <p className="text-muted-foreground mt-1">
            Infinite-like storage through streaming compression, chunking, and deduplication
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchPockets}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="secondary" onClick={runDemo}>
            <Sparkles className="h-4 w-4 mr-2" />
            Run Demo
          </Button>
        </div>
      </div>

      {globalStats && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Pockets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center gap-2">
                <Layers className="h-5 w-5 text-purple-500" />
                {globalStats.pockets}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Original Size</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-blue-500" />
                {formatBytes(globalStats.totalSize)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Compressed Size</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center gap-2">
                <ArrowDown className="h-5 w-5 text-green-500" />
                {formatBytes(globalStats.compressedSize)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Compression Ratio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-yellow-500" />
                {globalStats.totalSize > 0 
                  ? `${(globalStats.totalSize / globalStats.compressedSize).toFixed(2)}x`
                  : '0x'}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Pocket Dimensions
            </CardTitle>
            <CardDescription>Manage your storage pocket dimensions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="New pocket dimension ID..."
                value={newPocketId}
                onChange={(e) => setNewPocketId(e.target.value)}
              />
              <Button onClick={createPocket} disabled={loading}>
                <Plus className="h-4 w-4 mr-2" />
                Create
              </Button>
            </div>
            
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {pockets.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No pocket dimensions yet. Create one or run the demo!
                  </div>
                ) : (
                  pockets.map((pocket) => (
                    <div
                      key={pocket}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedPocket === pocket 
                          ? 'bg-purple-500/20 border-purple-500' 
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => setSelectedPocket(pocket)}
                    >
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 text-purple-500" />
                        <span className="font-medium">{pocket}</span>
                        <Badge variant="outline" className="ml-auto">
                          pocket['{pocket}']
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {selectedPocket ? `Contents: ${selectedPocket}` : 'Select a Pocket'}
            </CardTitle>
            <CardDescription>
              {selectedPocket 
                ? `Access via: pocket['${selectedPocket}']['path/to/file']`
                : 'Select a pocket dimension to view its contents'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedPocket && (
              <>
                {pocketStats && (
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="p-2 bg-muted rounded">
                      <div className="text-muted-foreground">Entries</div>
                      <div className="font-bold">{pocketStats.totalEntries}</div>
                    </div>
                    <div className="p-2 bg-muted rounded">
                      <div className="text-muted-foreground">Compression</div>
                      <div className="font-bold">{pocketStats.compressionRatio}</div>
                    </div>
                    <div className="p-2 bg-muted rounded">
                      <div className="text-muted-foreground">Nested Dims</div>
                      <div className="font-bold">{pocketStats.nestedDimensions}</div>
                    </div>
                  </div>
                )}
                
                <div className="space-y-2">
                  <Input
                    placeholder="File path (e.g., audio/track.mp3)..."
                    value={newFilePath}
                    onChange={(e) => setNewFilePath(e.target.value)}
                  />
                  <Input
                    placeholder="File content..."
                    value={newFileContent}
                    onChange={(e) => setNewFileContent(e.target.value)}
                  />
                  <Button className="w-full" onClick={writeFile} disabled={loading}>
                    <ArrowUp className="h-4 w-4 mr-2" />
                    Write to Pocket Dimension
                  </Button>
                </div>
                
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {entries.length === 0 ? (
                      <div className="text-center text-muted-foreground py-4">
                        No entries in this pocket dimension
                      </div>
                    ) : (
                      entries.map((entry) => (
                        <div key={entry.path} className="p-2 rounded border text-sm">
                          <div className="flex items-center gap-2">
                            {entry.type === 'dimension' ? (
                              <Layers className="h-4 w-4 text-purple-500" />
                            ) : (
                              <FileText className="h-4 w-4 text-blue-500" />
                            )}
                            <span className="font-mono">{entry.path}</span>
                            <Badge variant="secondary" className="ml-auto">
                              {entry.compressionRatio}x
                            </Badge>
                          </div>
                          <div className="text-muted-foreground text-xs mt-1">
                            {formatBytes(entry.size)} → {formatBytes(entry.compressedSize)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            How Pocket Dimension Storage Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div className="p-4 bg-background/50 rounded-lg">
              <h4 className="font-bold mb-2">1. Chunking</h4>
              <p className="text-muted-foreground">
                Data is split into 1MB chunks for efficient processing and deduplication.
              </p>
            </div>
            <div className="p-4 bg-background/50 rounded-lg">
              <h4 className="font-bold mb-2">2. Compression</h4>
              <p className="text-muted-foreground">
                Each chunk is compressed using maximum gzip compression (level 9).
              </p>
            </div>
            <div className="p-4 bg-background/50 rounded-lg">
              <h4 className="font-bold mb-2">3. Deduplication</h4>
              <p className="text-muted-foreground">
                Content-addressed storage ensures identical chunks are stored only once.
              </p>
            </div>
            <div className="p-4 bg-background/50 rounded-lg">
              <h4 className="font-bold mb-2">4. Nesting</h4>
              <p className="text-muted-foreground">
                Create dimensions within dimensions - inception-style storage up to 10 levels deep.
              </p>
            </div>
          </div>
          <div className="mt-4 p-4 bg-background/50 rounded-lg font-mono text-sm">
            <div className="text-muted-foreground mb-2">Bracket Notation Access:</div>
            <code className="text-purple-400">
              pocket['audio-files']['tracks/song.mp3'].write(audioBuffer)<br/>
              pocket['projects']['my-album']['nested-dimension']['deep/path'].createDimension()
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default PocketDimensionDashboard;
