import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { ChevronLeft, ChevronRight, Search, File, Music, Zap, Disc, Loader2 } from 'lucide-react';

interface Plugin {
  id: string;
  name: string;
  type: string;
  description: string;
  manufacturer: string;
  version: string;
  tags: string[];
}

interface PluginCatalogResponse {
  [kind: string]: Plugin[];
}

interface StudioBrowserProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onFileSelect?: (file: unknown) => void;
  recentFiles?: unknown[];
  samples?: unknown[];
}

/**
 * TODO: Add function documentation
 */
export function StudioBrowser({
  collapsed,
  onToggleCollapse,
  onFileSelect,
  recentFiles = [],
  samples = [],
}: StudioBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('files');

  // Fetch plugins from API
  const { data: pluginCatalog, isLoading: isLoadingPlugins } = useQuery<PluginCatalogResponse>({
    queryKey: ['/api/studio/plugins'],
  });

  // Filter and combine effect plugins (eq, dynamics, reverb, delay, modulation, distortion, filter, utility)
  const effectPlugins = useMemo(() => {
    if (!pluginCatalog) return [];

    const effectKinds = [
      'eq',
      'dynamics',
      'reverb',
      'delay',
      'modulation',
      'distortion',
      'filter',
      'utility',
    ];
    const plugins: Plugin[] = [];

    effectKinds.forEach((kind) => {
      if (pluginCatalog[kind]) {
        plugins.push(...pluginCatalog[kind]);
      }
    });

    return plugins;
  }, [pluginCatalog]);

  // Filter instrument plugins (synth, sampler)
  const instrumentPlugins = useMemo(() => {
    if (!pluginCatalog) return [];

    const instrumentKinds = ['synth', 'sampler'];
    const plugins: Plugin[] = [];

    instrumentKinds.forEach((kind) => {
      if (pluginCatalog[kind]) {
        plugins.push(...pluginCatalog[kind]);
      }
    });

    return plugins;
  }, [pluginCatalog]);

  if (collapsed) {
    return (
      <div
        className="h-full flex flex-col items-center py-4"
        style={{ backgroundColor: 'var(--studio-inspector)' }}
      >
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 mb-4"
          onClick={onToggleCollapse}
          data-testid="button-toggle-browser"
          style={{ color: 'var(--studio-text)' }}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div
          className="text-xs font-medium rotate-180 mb-auto mt-4"
          style={{
            writingMode: 'vertical-rl',
            color: 'var(--studio-text-muted)',
          }}
        >
          BROWSER
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--studio-inspector)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 border-b"
        style={{ borderColor: 'var(--studio-border)' }}
      >
        <h3 className="text-sm font-semibold" style={{ color: 'var(--studio-text)' }}>
          Browser
        </h3>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={onToggleCollapse}
          data-testid="button-toggle-browser"
          style={{ color: 'var(--studio-text)' }}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search
            className="absolute left-2 top-2.5 h-4 w-4"
            style={{ color: 'var(--studio-text-muted)' }}
          />
          <Input
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9"
            style={{
              backgroundColor: 'var(--studio-bg-deep)',
              borderColor: 'var(--studio-border)',
              color: 'var(--studio-text)',
            }}
            data-testid="input-browser-search"
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList
          className="w-full grid grid-cols-4 rounded-none border-b h-10"
          style={{
            backgroundColor: 'var(--studio-bg-medium)',
            borderColor: 'var(--studio-border)',
          }}
        >
          <TabsTrigger
            value="files"
            className="text-xs data-[state=active]:bg-transparent"
            style={{
              color: 'var(--studio-text-muted)',
            }}
            data-testid="tab-files"
          >
            <File className="h-3.5 w-3.5 mr-1" />
            Files
          </TabsTrigger>
          <TabsTrigger
            value="plugins"
            className="text-xs data-[state=active]:bg-transparent"
            style={{
              color: 'var(--studio-text-muted)',
            }}
            data-testid="tab-plugins"
          >
            <Zap className="h-3.5 w-3.5 mr-1" />
            FX
          </TabsTrigger>
          <TabsTrigger
            value="instruments"
            className="text-xs data-[state=active]:bg-transparent"
            style={{
              color: 'var(--studio-text-muted)',
            }}
            data-testid="tab-instruments"
          >
            <Music className="h-3.5 w-3.5 mr-1" />
            Inst
          </TabsTrigger>
          <TabsTrigger
            value="loops"
            className="text-xs data-[state=active]:bg-transparent"
            style={{
              color: 'var(--studio-text-muted)',
            }}
            data-testid="tab-loops"
          >
            <Disc className="h-3.5 w-3.5 mr-1" />
            Loops
          </TabsTrigger>
        </TabsList>

        <TabsContent value="files" className="flex-1 mt-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-1">
              {recentFiles.length > 0 ? (
                recentFiles
                  .filter(
                    (file) =>
                      !searchQuery || file.name?.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((file, index) => (
                    <button
                      key={index}
                      onClick={() => onFileSelect?.(file)}
                      className="w-full text-left px-3 py-2 rounded text-sm hover:bg-opacity-10 transition-colors"
                      style={{
                        color: 'var(--studio-text)',
                        backgroundColor: 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--studio-bg-light)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                      data-testid={`file-item-${index}`}
                    >
                      <div className="flex items-center gap-2">
                        <File className="h-4 w-4" style={{ color: 'var(--studio-text-muted)' }} />
                        <span className="truncate">{file.name || `File ${index + 1}`}</span>
                      </div>
                    </button>
                  ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm" style={{ color: 'var(--studio-text-muted)' }}>
                    No files found
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="plugins" className="flex-1 mt-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-1">
              {isLoadingPlugins ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2
                    className="h-5 w-5 animate-spin"
                    style={{ color: 'var(--studio-text-muted)' }}
                  />
                  <span className="ml-2 text-sm" style={{ color: 'var(--studio-text-muted)' }}>
                    Loading effects...
                  </span>
                </div>
              ) : effectPlugins.length > 0 ? (
                effectPlugins
                  .filter(
                    (plugin) =>
                      !searchQuery ||
                      plugin.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      plugin.manufacturer?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      plugin.tags?.some((tag) =>
                        tag.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                  )
                  .map((plugin, index) => (
                    <button
                      key={plugin.id}
                      onClick={() => onFileSelect?.(plugin)}
                      className="w-full text-left px-3 py-2 rounded text-sm hover:bg-opacity-10 transition-colors"
                      style={{
                        color: 'var(--studio-text)',
                        backgroundColor: 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--studio-bg-light)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                      data-testid={`plugin-item-${index}`}
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Zap
                            className="h-4 w-4 flex-shrink-0"
                            style={{ color: 'var(--studio-text-muted)' }}
                          />
                          <span className="truncate font-medium">{plugin.name}</span>
                        </div>
                        <div
                          className="ml-6 flex items-center gap-2 text-xs"
                          style={{ color: 'var(--studio-text-muted)' }}
                        >
                          <span>{plugin.manufacturer}</span>
                          {plugin.tags && plugin.tags.length > 0 && (
                            <>
                              <span>•</span>
                              <span className="truncate">{plugin.tags.slice(0, 2).join(', ')}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm" style={{ color: 'var(--studio-text-muted)' }}>
                    No effects available
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="instruments" className="flex-1 mt-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-1">
              {isLoadingPlugins ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2
                    className="h-5 w-5 animate-spin"
                    style={{ color: 'var(--studio-text-muted)' }}
                  />
                  <span className="ml-2 text-sm" style={{ color: 'var(--studio-text-muted)' }}>
                    Loading instruments...
                  </span>
                </div>
              ) : instrumentPlugins.length > 0 ? (
                instrumentPlugins
                  .filter(
                    (plugin) =>
                      !searchQuery ||
                      plugin.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      plugin.manufacturer?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      plugin.tags?.some((tag) =>
                        tag.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                  )
                  .map((plugin, index) => (
                    <button
                      key={plugin.id}
                      onClick={() => onFileSelect?.(plugin)}
                      className="w-full text-left px-3 py-2 rounded text-sm hover:bg-opacity-10 transition-colors"
                      style={{
                        color: 'var(--studio-text)',
                        backgroundColor: 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--studio-bg-light)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                      data-testid={`instrument-item-${index}`}
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Music
                            className="h-4 w-4 flex-shrink-0"
                            style={{ color: 'var(--studio-text-muted)' }}
                          />
                          <span className="truncate font-medium">{plugin.name}</span>
                        </div>
                        <div
                          className="ml-6 flex items-center gap-2 text-xs"
                          style={{ color: 'var(--studio-text-muted)' }}
                        >
                          <span>{plugin.manufacturer}</span>
                          {plugin.tags && plugin.tags.length > 0 && (
                            <>
                              <span>•</span>
                              <span className="truncate">{plugin.tags.slice(0, 2).join(', ')}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm" style={{ color: 'var(--studio-text-muted)' }}>
                    No instruments available
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="loops" className="flex-1 mt-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-1">
              {samples.length > 0 ? (
                samples
                  .filter(
                    (sample) =>
                      !searchQuery || sample.name?.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((sample, index) => (
                    <button
                      key={index}
                      onClick={() => onFileSelect?.(sample)}
                      className="w-full text-left px-3 py-2 rounded text-sm hover:bg-opacity-10 transition-colors"
                      style={{
                        color: 'var(--studio-text)',
                        backgroundColor: 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--studio-bg-light)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                      data-testid={`loop-item-${index}`}
                    >
                      <div className="flex items-center gap-2">
                        <Disc className="h-4 w-4" style={{ color: 'var(--studio-text-muted)' }} />
                        <span className="truncate">{sample.name || `Sample ${index + 1}`}</span>
                      </div>
                    </button>
                  ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm" style={{ color: 'var(--studio-text-muted)' }}>
                    No loops found
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
