import { useState, useCallback, useEffect, ReactNode } from 'react';
import { studioOneTheme, cssVariables } from '@/lib/studioOneTheme';
import { useStudioLayoutStore } from '@/lib/studioLayoutStore';
import { useDynamicLayout } from '@/hooks/useDynamicLayout';

interface StudioOneLayoutProps {
  toolbar?: ReactNode;
  transport?: ReactNode;
  inspector?: ReactNode;
  arranger?: ReactNode;
  arrange?: ReactNode;
  console?: ReactNode;
  browser?: ReactNode;
  launcher?: ReactNode;
}

const getResponsivePanelConfig = (isSmallScreen: boolean, isMediumScreen: boolean, width: number) => ({
  browserWidth: isSmallScreen ? Math.min(width * 0.85, 320) : isMediumScreen ? 240 : 280,
  inspectorWidth: isSmallScreen ? Math.min(width * 0.85, 320) : isMediumScreen ? 220 : 280,
  toolbarHeight: isSmallScreen ? 40 : 48,
  transportHeight: isSmallScreen ? 52 : 64,
});

const defaultPanelConfig = {
  browserWidth: 280,
  inspectorWidth: 280,
  toolbarHeight: 48,
  transportHeight: 64,
};

export function StudioOneLayout({
  toolbar,
  transport,
  inspector,
  arranger,
  arrange,
  console: consolePanel,
  browser,
  launcher,
}: StudioOneLayoutProps) {
  const {
    mode,
    browserPanel,
    inspectorPanel,
    consolePanel: consolePanelState,
    launcherPanel,
    setPanelWidth,
    setFocusedPanel,
    setPanelVisibility,
  } = useStudioLayoutStore();

  const { containerRef, width, isSmallScreen, isMediumScreen, breakpoint } = useDynamicLayout();
  const panelConfig = getResponsivePanelConfig(isSmallScreen, isMediumScreen, width);
  
  // Mobile mode includes small screens AND medium screens (landscape phones, small tablets)
  const isMobileMode = isSmallScreen || isMediumScreen || width < 1024;
  
  // Auto-collapse side panels on mobile - show as overlay instead
  const showInspectorInline = !isMobileMode && inspectorPanel.visible && inspector;
  const showBrowserInline = !isMobileMode && browserPanel.visible && browser;
  
  // On mobile, only one side panel can be visible at a time (as overlay)
  const [mobileActivePanel, setMobileActivePanel] = useState<'inspector' | 'browser' | null>(null);
  
  useEffect(() => {
    if (isMobileMode) {
      // When on mobile, show the most recently toggled panel as overlay
      if (inspectorPanel.visible) {
        setMobileActivePanel('inspector');
      } else if (browserPanel.visible) {
        setMobileActivePanel('browser');
      } else {
        setMobileActivePanel(null);
      }
    } else {
      setMobileActivePanel(null);
    }
  }, [isMobileMode, inspectorPanel.visible, browserPanel.visible]);

  const [browserResizing, setBrowserResizing] = useState(false);
  const [inspectorResizing, setInspectorResizing] = useState(false);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  const handleBrowserResizeStart = useCallback((e: React.MouseEvent) => {
    setBrowserResizing(true);
    setResizeStartX(e.clientX);
    setResizeStartWidth(browserPanel.width || panelConfig.browserWidth);
    e.preventDefault();
  }, [browserPanel.width, panelConfig.browserWidth]);

  const handleInspectorResizeStart = useCallback((e: React.MouseEvent) => {
    setInspectorResizing(true);
    setResizeStartX(e.clientX);
    setResizeStartWidth(inspectorPanel.width || panelConfig.inspectorWidth);
    e.preventDefault();
  }, [inspectorPanel.width, panelConfig.inspectorWidth]);

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

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables))))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)))))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables))))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables))))))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables))))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)))))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables))))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(cssVariables) : cssVariables))))))) }} />
      
      <div 
        ref={containerRef as React.RefObject<HTMLDivElement>}
        className="flex flex-col h-screen w-full overflow-hidden"
        style={{ background: studioOneTheme.colors.bg.deep }}
      >
        {toolbar && (
          <div 
            className="shrink-0 border-b"
            style={{ 
              minHeight: panelConfig.toolbarHeight,
              background: studioOneTheme.colors.bg.secondary,
              borderColor: studioOneTheme.colors.border.primary,
            }}
          >
            {toolbar}
          </div>
        )}

        {transport && (
          <div 
            className="shrink-0 border-b overflow-x-auto"
            style={{ 
              minHeight: panelConfig.transportHeight,
              background: studioOneTheme.colors.bg.tertiary,
              borderColor: studioOneTheme.colors.border.primary,
            }}
          >
            {transport}
          </div>
        )}

        <div className="flex-1 flex overflow-hidden relative">
          {/* Desktop: Inline inspector panel */}
          {showInspectorInline && (
            <>
              <div 
                className="shrink-0 border-r overflow-hidden"
                style={{ 
                  width: inspectorPanel.width || panelConfig.inspectorWidth,
                  background: studioOneTheme.colors.bg.panel,
                  borderColor: studioOneTheme.colors.border.primary,
                }}
                onClick={() => setFocusedPanel('inspector')}
              >
                {inspector}
              </div>
              <div
                className="w-1 shrink-0 cursor-ew-resize hover:bg-blue-500/30 transition-colors"
                style={{ background: studioOneTheme.colors.border.primary }}
                onMouseDown={handleInspectorResizeStart}
              />
            </>
          )}
          
          {/* Mobile: Overlay panels - same layer as other interface elements */}
          {isMobileMode && mobileActivePanel === 'inspector' && inspectorPanel.visible && inspector && (
            <>
              <div 
                className="absolute inset-0 bg-black/50 z-10"
                onClick={() => {
                  setMobileActivePanel(null);
                  setPanelVisibility('inspector', false);
                }}
              />
              <div 
                className="absolute left-0 top-0 bottom-0 z-20 border-r overflow-hidden animate-in slide-in-from-left duration-200"
                style={{ 
                  width: panelConfig.inspectorWidth,
                  background: studioOneTheme.colors.bg.panel,
                  borderColor: studioOneTheme.colors.border.primary,
                }}
              >
                {inspector}
              </div>
            </>
          )}
          
          {isMobileMode && mobileActivePanel === 'browser' && browserPanel.visible && browser && (
            <>
              <div 
                className="absolute inset-0 bg-black/50 z-10"
                onClick={() => {
                  setMobileActivePanel(null);
                  setPanelVisibility('browser', false);
                }}
              />
              <div 
                className="absolute right-0 top-0 bottom-0 z-20 border-l overflow-hidden animate-in slide-in-from-right duration-200"
                style={{ 
                  width: panelConfig.browserWidth,
                  background: studioOneTheme.colors.bg.panel,
                  borderColor: studioOneTheme.colors.border.primary,
                }}
              >
                {browser}
              </div>
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
              >
                {consolePanel}
              </div>
            )}
          </div>

          {/* Desktop: Inline browser panel */}
          {showBrowserInline && (
            <>
              <div
                className="w-1 shrink-0 cursor-ew-resize hover:bg-blue-500/30 transition-colors"
                style={{ background: studioOneTheme.colors.border.primary }}
                onMouseDown={handleBrowserResizeStart}
              />
              <div 
                className="shrink-0 border-l overflow-hidden"
                style={{ 
                  width: browserPanel.width || panelConfig.browserWidth,
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
