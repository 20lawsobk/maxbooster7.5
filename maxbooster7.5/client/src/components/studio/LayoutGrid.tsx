import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Layers, FolderOpen, Music, ChevronUp, ChevronDown, PanelLeftClose, PanelRightClose } from 'lucide-react';

interface LayoutGridProps {
  topBar: React.ReactNode;
  inspector: React.ReactNode;
  timeline: React.ReactNode;
  browser: React.ReactNode;
  dock: React.ReactNode;
  inspectorCollapsed: boolean;
  browserCollapsed: boolean;
}

type LayoutMode = 'full' | 'compact' | 'minimal';

const PANEL_MIN_WIDTH = 200;
const TIMELINE_MIN_WIDTH = 300;

export function LayoutGrid({
  topBar,
  inspector,
  timeline,
  browser,
  dock,
  inspectorCollapsed,
  browserCollapsed,
}: LayoutGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('full');
  const [activePanel, setActivePanel] = useState<'timeline' | 'inspector' | 'browser'>('timeline');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [topBarCollapsed, setTopBarCollapsed] = useState(false);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [containerHeight, setContainerHeight] = useState(800);

  const calculateLayoutMode = useCallback((width: number): LayoutMode => {
    const inspectorWidth = inspectorCollapsed ? 48 : PANEL_MIN_WIDTH;
    const browserWidth = browserCollapsed ? 48 : PANEL_MIN_WIDTH;
    const fullLayoutMin = inspectorWidth + TIMELINE_MIN_WIDTH + browserWidth;
    const compactLayoutMin = TIMELINE_MIN_WIDTH + Math.max(inspectorWidth, browserWidth);

    if (width >= fullLayoutMin + 100) return 'full';
    if (width >= compactLayoutMin) return 'compact';
    return 'minimal';
  }, [inspectorCollapsed, browserCollapsed]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerWidth(width);
          setContainerHeight(height);
          setLayoutMode(calculateLayoutMode(width));
        }
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [calculateLayoutMode]);

  const getGridColumns = useCallback(() => {
    if (layoutMode === 'minimal') return '1fr';
    
    const availableWidth = containerWidth;
    const inspectorFraction = inspectorCollapsed ? '48px' : `clamp(180px, ${Math.round(availableWidth * 0.2)}px, 280px)`;
    const browserFraction = browserCollapsed ? '48px' : `clamp(180px, ${Math.round(availableWidth * 0.22)}px, 320px)`;
    
    if (layoutMode === 'compact') {
      return `${inspectorFraction} 1fr`;
    }
    
    return `${inspectorFraction} 1fr ${browserFraction}`;
  }, [layoutMode, containerWidth, inspectorCollapsed, browserCollapsed]);

  const isSmallHeight = containerHeight < 500;

  if (layoutMode === 'minimal') {
    return (
      <div
        ref={containerRef}
        className="w-full flex flex-col"
        style={{ 
          backgroundColor: 'var(--studio-bg-deep)',
          height: '100dvh',
          minHeight: isSmallHeight ? 'auto' : '100dvh',
          overflowY: isSmallHeight ? 'auto' : 'hidden',
        }}
        data-testid="layout-grid-container-minimal"
        data-layout="minimal"
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
            <div className={`flex-1 overflow-hidden ${topBarCollapsed ? 'h-0' : ''}`}>
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

        <div 
          className="flex shrink-0 border-b" 
          style={{ borderColor: 'var(--studio-border)', background: 'var(--studio-bg-medium)' }}
        >
          <Button
            variant={activePanel === 'timeline' ? 'secondary' : 'ghost'}
            size="sm"
            className="flex-1 rounded-none h-10"
            onClick={() => setActivePanel('timeline')}
          >
            <Music className="h-4 w-4 mr-1" />
            Timeline
          </Button>
          <Button
            variant={activePanel === 'inspector' ? 'secondary' : 'ghost'}
            size="sm"
            className="flex-1 rounded-none h-10"
            onClick={() => setActivePanel('inspector')}
          >
            <Layers className="h-4 w-4 mr-1" />
            Inspector
          </Button>
          <Button
            variant={activePanel === 'browser' ? 'secondary' : 'ghost'}
            size="sm"
            className="flex-1 rounded-none h-10"
            onClick={() => setActivePanel('browser')}
          >
            <FolderOpen className="h-4 w-4 mr-1" />
            Browser
          </Button>
        </div>

        <div 
          className="flex-1 overflow-hidden" 
          style={{ minHeight: isSmallHeight ? '300px' : '0' }}
        >
          {activePanel === 'timeline' && (
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
          {activePanel === 'inspector' && (
            <div
              className="h-full overflow-auto"
              style={{ background: 'var(--studio-inspector)' }}
            >
              {inspector}
            </div>
          )}
          {activePanel === 'browser' && (
            <div
              className="h-full overflow-auto"
              style={{ background: 'var(--studio-browser)' }}
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
          <div className="flex items-center justify-between px-2 py-1">
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
          <div className={`transition-all ${dockCollapsed ? 'h-0 overflow-hidden' : ''}`}>
            {dock}
          </div>
        </div>
      </div>
    );
  }

  if (layoutMode === 'compact') {
    return (
      <div
        ref={containerRef}
        className="w-full grid overflow-hidden"
        style={{
          gridTemplateAreas: `
            "topbar topbar"
            "inspector timeline"
            "dock dock"
          `,
          gridTemplateColumns: getGridColumns(),
          gridTemplateRows: 'auto 1fr auto',
          backgroundColor: 'var(--studio-bg-deep)',
          height: '100dvh',
          minHeight: isSmallHeight ? 'auto' : '100dvh',
          overflowY: isSmallHeight ? 'auto' : 'hidden',
        }}
        data-testid="layout-grid-container-compact"
        data-layout="compact"
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
          className="border-r overflow-hidden transition-all flex flex-col"
          style={{
            gridArea: 'inspector',
            background: 'var(--studio-inspector)',
            borderColor: 'var(--studio-border-subtle)',
            boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.03)',
            minHeight: 0,
          }}
        >
          <div className="flex border-b" style={{ borderColor: 'var(--studio-border)' }}>
            <Button
              variant={activePanel === 'inspector' ? 'secondary' : 'ghost'}
              size="sm"
              className="flex-1 rounded-none h-8 text-xs"
              onClick={() => setActivePanel('inspector')}
            >
              <PanelLeftClose className="h-3 w-3 mr-1" />
              Inspector
            </Button>
            <Button
              variant={activePanel === 'browser' ? 'secondary' : 'ghost'}
              size="sm"
              className="flex-1 rounded-none h-8 text-xs"
              onClick={() => setActivePanel('browser')}
            >
              <PanelRightClose className="h-3 w-3 mr-1" />
              Browser
            </Button>
          </div>
          <div className="flex-1 overflow-auto">
            {activePanel === 'inspector' || activePanel === 'timeline' ? inspector : browser}
          </div>
        </div>

        <div
          className="flex flex-col overflow-hidden"
          style={{
            gridArea: 'timeline',
            background: 'var(--studio-timeline)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
            minHeight: 0,
          }}
        >
          {timeline}
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

  return (
    <div
      ref={containerRef}
      className="w-full grid overflow-hidden"
      style={{
        gridTemplateAreas: `
          "topbar topbar topbar"
          "inspector timeline browser"
          "dock dock dock"
        `,
        gridTemplateColumns: getGridColumns(),
        gridTemplateRows: 'auto 1fr auto',
        backgroundColor: 'var(--studio-bg-deep)',
        height: '100dvh',
        minHeight: isSmallHeight ? 'auto' : '100dvh',
        overflowY: isSmallHeight ? 'auto' : 'hidden',
      }}
      data-testid="layout-grid-container-full"
      data-layout="full"
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
        className="border-r overflow-auto transition-all"
        style={{
          gridArea: 'inspector',
          background: 'var(--studio-inspector)',
          borderColor: 'var(--studio-border-subtle)',
          boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.03)',
          minHeight: 0,
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
          minHeight: 0,
        }}
      >
        {timeline}
      </div>

      <div
        className="border-l overflow-auto transition-all"
        style={{
          gridArea: 'browser',
          background: 'var(--studio-browser)',
          borderColor: 'var(--studio-border-subtle)',
          boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.03)',
          minHeight: 0,
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
