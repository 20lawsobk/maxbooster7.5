import { useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { studioOneTheme, cssVariables } from '@/lib/studioOneTheme';
import { useStudioLayoutStore } from '@/lib/studioLayoutStore';
import { useStudioResponsive } from '@/hooks/useStudioResponsive';
import { StudioDrawer } from './StudioDrawer';
import { MobileToolbar, MobileBottomBar } from './MobileToolbar';
import { MobileTransport } from './MobileTransport';

interface StudioOneLayoutProps {
  toolbar?: ReactNode;
  transport?: ReactNode;
  inspector?: ReactNode;
  arranger?: ReactNode;
  arrange?: ReactNode;
  console?: ReactNode;
  browser?: ReactNode;
  launcher?: ReactNode;
  mobileToolbarProps?: {
    projectName?: string;
    onUndo?: () => void;
    onRedo?: () => void;
    onSave?: () => void;
    onOpenSettings?: () => void;
    onOpenAI?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    isSaving?: boolean;
  };
  mobileTransportProps?: {
    isPlaying: boolean;
    isRecording: boolean;
    isPaused: boolean;
    isLooping: boolean;
    currentTime: string;
    bpm: number;
    metronomeEnabled?: boolean;
    onPlay: () => void;
    onPause: () => void;
    onStop: () => void;
    onRecord: () => void;
    onRewind: () => void;
    onForward: () => void;
    onToggleLoop: () => void;
    onToggleMetronome?: () => void;
    onBpmChange?: (bpm: number) => void;
  };
}

export function StudioOneLayout({
  toolbar,
  transport,
  inspector,
  arranger,
  arrange,
  console: consolePanel,
  browser,
  launcher,
  mobileToolbarProps,
  mobileTransportProps,
}: StudioOneLayoutProps) {
  const {
    mode,
    browserPanel,
    inspectorPanel,
    consolePanel: consolePanelState,
    launcherPanel,
    setPanelWidth,
    setFocusedPanel,
  } = useStudioLayoutStore();

  const {
    layoutMode,
    isMobile,
    isTablet,
    isTouch,
    panelConfig,
    activeDrawer,
    setActiveDrawer,
    toggleDrawer,
    closeAllDrawers,
  } = useStudioResponsive();

  const [browserResizing, setBrowserResizing] = useState(false);
  const [inspectorResizing, setInspectorResizing] = useState(false);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  const handleBrowserResizeStart = useCallback((e: React.MouseEvent) => {
    if (isTouch) return;
    setBrowserResizing(true);
    setResizeStartX(e.clientX);
    setResizeStartWidth(browserPanel.width || panelConfig.browserWidth);
    e.preventDefault();
  }, [browserPanel.width, panelConfig.browserWidth, isTouch]);

  const handleInspectorResizeStart = useCallback((e: React.MouseEvent) => {
    if (isTouch) return;
    setInspectorResizing(true);
    setResizeStartX(e.clientX);
    setResizeStartWidth(inspectorPanel.width || panelConfig.inspectorWidth);
    e.preventDefault();
  }, [inspectorPanel.width, panelConfig.inspectorWidth, isTouch]);

  useEffect(() => {
    if (!browserResizing && !inspectorResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (browserResizing) {
        const delta = resizeStartX - e.clientX;
        const newWidth = Math.max(200, Math.min(500, resizeStartWidth + delta));
        setPanelWidth('browser', newWidth);
      }
      if (inspectorResizing) {
        const delta = e.clientX - resizeStartX;
        const newWidth = Math.max(200, Math.min(400, resizeStartWidth + delta));
        setPanelWidth('inspector', newWidth);
      }
    };

    const handleMouseUp = () => {
      setBrowserResizing(false);
      setInspectorResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [browserResizing, inspectorResizing, resizeStartX, resizeStartWidth, setPanelWidth]);

  const useMobileLayout = layoutMode === 'mobile' || layoutMode === 'tablet-portrait';
  const useCompactSidebars = layoutMode === 'tablet-landscape';

  if (useMobileLayout) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: cssVariables }} />
        
        <div 
          className="flex flex-col h-screen w-full overflow-hidden"
          style={{ background: studioOneTheme.colors.bg.deep }}
        >
          <MobileToolbar
            projectName={mobileToolbarProps?.projectName}
            onOpenBrowser={() => toggleDrawer('browser')}
            onOpenInspector={() => toggleDrawer('inspector')}
            onOpenMixer={() => toggleDrawer('mixer')}
            onUndo={mobileToolbarProps?.onUndo}
            onRedo={mobileToolbarProps?.onRedo}
            onSave={mobileToolbarProps?.onSave}
            onOpenSettings={mobileToolbarProps?.onOpenSettings}
            onOpenAI={mobileToolbarProps?.onOpenAI}
            canUndo={mobileToolbarProps?.canUndo}
            canRedo={mobileToolbarProps?.canRedo}
            isSaving={mobileToolbarProps?.isSaving}
            browserActive={activeDrawer === 'browser'}
            inspectorActive={activeDrawer === 'inspector'}
            mixerActive={activeDrawer === 'mixer'}
          />
          
          <div className="flex-1 flex flex-col overflow-hidden">
            {arranger && mode === 'arrange' && (
              <div className="shrink-0">
                {arranger}
              </div>
            )}
            
            <div 
              className="flex-1 overflow-auto"
              onClick={closeAllDrawers}
            >
              {mode === 'launcher' && launcherPanel.visible && launcher ? (
                launcher
              ) : (
                arrange
              )}
            </div>
          </div>
          
          {mobileTransportProps && (
            <MobileTransport {...mobileTransportProps} />
          )}
          
          <MobileBottomBar
            onOpenBrowser={() => toggleDrawer('browser')}
            onOpenInspector={() => toggleDrawer('inspector')}
            onOpenMixer={() => toggleDrawer('mixer')}
            browserActive={activeDrawer === 'browser'}
            inspectorActive={activeDrawer === 'inspector'}
            mixerActive={activeDrawer === 'mixer'}
          />
          
          {browser && (
            <StudioDrawer
              isOpen={activeDrawer === 'browser'}
              onClose={() => setActiveDrawer(null)}
              position="right"
              size={panelConfig.browserWidth}
              title="Browser"
            >
              {browser}
            </StudioDrawer>
          )}
          
          {inspector && (
            <StudioDrawer
              isOpen={activeDrawer === 'inspector'}
              onClose={() => setActiveDrawer(null)}
              position="left"
              size={panelConfig.inspectorWidth}
              title="Inspector"
            >
              {inspector}
            </StudioDrawer>
          )}
          
          {consolePanel && (
            <StudioDrawer
              isOpen={activeDrawer === 'mixer' || activeDrawer === 'console'}
              onClose={() => setActiveDrawer(null)}
              position="bottom"
              size={panelConfig.consoleHeight}
              title="Mixer"
            >
              {consolePanel}
            </StudioDrawer>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: cssVariables }} />
      
      <div 
        className="flex flex-col h-screen w-full overflow-hidden"
        style={{ background: studioOneTheme.colors.bg.deep }}
      >
        {toolbar && (
          <div 
            className="shrink-0 border-b"
            style={{ 
              height: panelConfig.toolbarHeight,
              background: studioOneTheme.colors.bg.secondary,
              borderColor: studioOneTheme.colors.border.primary,
            }}
          >
            {toolbar}
          </div>
        )}

        {transport && (
          <div 
            className="shrink-0 border-b"
            style={{ 
              height: panelConfig.transportHeight,
              background: studioOneTheme.colors.bg.tertiary,
              borderColor: studioOneTheme.colors.border.primary,
            }}
          >
            {transport}
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          {inspectorPanel.visible && inspector && (
            <>
              <div 
                className="shrink-0 border-r overflow-hidden"
                style={{ 
                  width: useCompactSidebars 
                    ? Math.min(inspectorPanel.width || panelConfig.inspectorWidth, 200)
                    : (inspectorPanel.width || panelConfig.inspectorWidth),
                  background: studioOneTheme.colors.bg.panel,
                  borderColor: studioOneTheme.colors.border.primary,
                }}
                onClick={() => setFocusedPanel('inspector')}
              >
                {inspector}
              </div>
              {!isTouch && (
                <div
                  className="w-1 shrink-0 cursor-ew-resize hover:bg-blue-500/30 transition-colors"
                  style={{ background: studioOneTheme.colors.border.primary }}
                  onMouseDown={handleInspectorResizeStart}
                />
              )}
            </>
          )}

          <div className="flex-1 flex flex-col overflow-hidden">
            {arranger && mode === 'arrange' && (
              <div className="shrink-0">
                {arranger}
              </div>
            )}

            <div 
              className="flex-1 overflow-hidden"
              onClick={() => setFocusedPanel(mode === 'launcher' ? 'launcher' : 'arrange')}
            >
              {mode === 'launcher' && launcherPanel.visible && launcher ? (
                launcher
              ) : (
                arrange
              )}
            </div>

            {consolePanelState.visible && consolePanel && (
              <div 
                onClick={() => setFocusedPanel('console')}
                style={{
                  maxHeight: useCompactSidebars ? 200 : undefined,
                }}
              >
                {consolePanel}
              </div>
            )}
          </div>

          {browserPanel.visible && browser && (
            <>
              {!isTouch && (
                <div
                  className="w-1 shrink-0 cursor-ew-resize hover:bg-blue-500/30 transition-colors"
                  style={{ background: studioOneTheme.colors.border.primary }}
                  onMouseDown={handleBrowserResizeStart}
                />
              )}
              <div 
                className="shrink-0 border-l overflow-hidden"
                style={{ 
                  width: useCompactSidebars 
                    ? Math.min(browserPanel.width || panelConfig.browserWidth, 220)
                    : (browserPanel.width || panelConfig.browserWidth),
                  background: studioOneTheme.colors.bg.panel,
                  borderColor: studioOneTheme.colors.border.primary,
                }}
                onClick={() => setFocusedPanel('browser')}
              >
                {browser}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
