import { useIsMobile } from '@/hooks/use-mobile';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Layers, FolderOpen, Music, ChevronUp, ChevronDown } from 'lucide-react';

interface LayoutGridProps {
  topBar: React.ReactNode;
  inspector: React.ReactNode;
  timeline: React.ReactNode;
  browser: React.ReactNode;
  dock: React.ReactNode;
  inspectorCollapsed: boolean;
  browserCollapsed: boolean;
}

export function LayoutGrid({
  topBar,
  inspector,
  timeline,
  browser,
  dock,
  inspectorCollapsed,
  browserCollapsed,
}: LayoutGridProps) {
  const isMobile = useIsMobile();
  const [mobilePanel, setMobilePanel] = useState<'timeline' | 'inspector' | 'browser'>('timeline');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [topBarCollapsed, setTopBarCollapsed] = useState(false);
  const [isVerySmallScreen, setIsVerySmallScreen] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsVerySmallScreen(window.innerHeight < 500);
    };
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  if (isMobile) {
    return (
      <div
        className="w-full flex flex-col"
        style={{ 
          backgroundColor: 'var(--studio-bg-deep)', 
          minHeight: '100dvh',
          height: isVerySmallScreen ? 'auto' : '100dvh',
          overflowY: isVerySmallScreen ? 'auto' : 'hidden',
        }}
        data-testid="layout-grid-container-mobile"
      >
        <div
          className="border-b transition-all shrink-0"
          style={{
            background: 'var(--studio-toolbar)',
            borderColor: 'var(--studio-border)',
            boxShadow: 'var(--studio-shadow-md)',
          }}
        >
          <div className="flex items-center justify-between">
            <div className={`flex-1 ${topBarCollapsed ? 'hidden' : ''}`}>
              {topBar}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 shrink-0"
              onClick={() => setTopBarCollapsed(!topBarCollapsed)}
              title={topBarCollapsed ? 'Show toolbar' : 'Hide toolbar'}
            >
              {topBarCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="flex shrink-0 border-b" style={{ borderColor: 'var(--studio-border)', background: 'var(--studio-bg-medium)' }}>
          <Button
            variant={mobilePanel === 'timeline' ? 'secondary' : 'ghost'}
            size="sm"
            className="flex-1 rounded-none h-10"
            onClick={() => setMobilePanel('timeline')}
          >
            <Music className="h-4 w-4 mr-1" />
            Timeline
          </Button>
          <Button
            variant={mobilePanel === 'inspector' ? 'secondary' : 'ghost'}
            size="sm"
            className="flex-1 rounded-none h-10"
            onClick={() => setMobilePanel('inspector')}
          >
            <Layers className="h-4 w-4 mr-1" />
            Inspector
          </Button>
          <Button
            variant={mobilePanel === 'browser' ? 'secondary' : 'ghost'}
            size="sm"
            className="flex-1 rounded-none h-10"
            onClick={() => setMobilePanel('browser')}
          >
            <FolderOpen className="h-4 w-4 mr-1" />
            Browser
          </Button>
        </div>

        <div className="flex-1 overflow-hidden" style={{ minHeight: isVerySmallScreen ? '300px' : undefined }}>
          {mobilePanel === 'timeline' && (
            <div
              className="h-full flex flex-col overflow-hidden"
              style={{
                background: 'var(--studio-timeline)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
              }}
            >
              {timeline}
            </div>
          )}
          {mobilePanel === 'inspector' && (
            <div
              className="h-full overflow-auto"
              style={{
                background: 'var(--studio-inspector)',
              }}
            >
              {inspector}
            </div>
          )}
          {mobilePanel === 'browser' && (
            <div
              className="h-full overflow-auto"
              style={{
                background: 'var(--studio-browser)',
              }}
            >
              {browser}
            </div>
          )}
        </div>

        <div
          className="border-t shrink-0"
          style={{
            background: 'var(--studio-transport)',
            borderColor: 'var(--studio-border)',
            boxShadow: 'var(--studio-shadow-lg), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          <div className="flex items-center justify-between px-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setDockCollapsed(!dockCollapsed)}
              title={dockCollapsed ? 'Show transport' : 'Hide transport'}
            >
              {dockCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            <span className="text-xs text-gray-400">Transport</span>
          </div>
          {!dockCollapsed && dock}
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full grid"
      style={{
        gridTemplateAreas: `
          "topbar topbar topbar"
          "inspector timeline browser"
          "dock dock dock"
        `,
        gridTemplateColumns: `${inspectorCollapsed ? '48px' : '280px'} 1fr ${browserCollapsed ? '48px' : '320px'}`,
        gridTemplateRows: 'auto 1fr auto',
        backgroundColor: 'var(--studio-bg-deep)',
        height: '100dvh',
      }}
      data-testid="layout-grid-container"
    >
      <div
        className="border-b transition-all"
        style={{
          gridArea: 'topbar',
          background: 'var(--studio-toolbar)',
          borderColor: 'var(--studio-border)',
          boxShadow: 'var(--studio-shadow-md)',
        }}
      >
        {topBar}
      </div>

      <div
        className="border-r overflow-hidden transition-all"
        style={{
          gridArea: 'inspector',
          background: 'var(--studio-inspector)',
          borderColor: 'var(--studio-border-subtle)',
          boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.03)',
        }}
      >
        {inspector}
      </div>

      <div
        className="flex flex-col overflow-hidden"
        style={{
          gridArea: 'timeline',
          background: 'var(--studio-timeline)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
        }}
      >
        {timeline}
      </div>

      <div
        className="border-l overflow-hidden transition-all"
        style={{
          gridArea: 'browser',
          background: 'var(--studio-browser)',
          borderColor: 'var(--studio-border-subtle)',
          boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.03)',
        }}
      >
        {browser}
      </div>

      <div
        className="border-t"
        style={{
          gridArea: 'dock',
          background: 'var(--studio-transport)',
          borderColor: 'var(--studio-border)',
          boxShadow: 'var(--studio-shadow-lg), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {dock}
      </div>
    </div>
  );
}
