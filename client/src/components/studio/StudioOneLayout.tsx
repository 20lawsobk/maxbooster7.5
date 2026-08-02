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


export function StudioOneLayout({
  toolbar,
  transport,
  inspector,
  arranger,
  arrange,
  console: consolePanel,
  browser,
  _launcher,
}: StudioOneLayoutProps) {
  const {
    
    browserPanel,
    inspectorPanel,
    consolePanel: consolePanelState,
    
    setPanelWidth,
    setFocusedPanel,
  } = useStudioLayoutStore();

  const { containerRef, width, isSmallScreen, isMediumScreen } = useDynamicLayout();
  const panelConfig = getResponsivePanelConfig(isSmallScreen, isMediumScreen, width);
  
  // Mobile mode includes small screens AND medium screens (landscape phones, small tablets)
  const isMobileMode = isSmallScreen || isMediumScreen || width < 1024;
  
  // Auto-collapse side panels on mobile - show as overlay instead
  const showInspectorInline = !isMobileMode && inspectorPanel.visible && inspector;
  const showBrowserInline = !isMobileMode && browserPanel.visible && browser;
  
  // On mobile, only one side panel can be visible at a time (as overlay)
  const [_mobileActivePanel, setMobileActivePanel] = useState<'inspector' | 'browser' | null>(null);
  
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
      <style dangerouslySetInnerHTML={{ __html: String(cssVariables) }} />
      <div
        ref={containerRef}
        className="relative flex flex-col w-full h-full overflow-hidden"
        style={{ background: studioOneTheme.colors.bg.primary }}
      >
        {toolbar && (
          <div
            className="shrink-0 w-full"
            style={{
              height: panelConfig.toolbarHeight,
              background: studioOneTheme.colors.bg.toolbar,
              borderBottom: `1px solid ${studioOneTheme.colors.border.primary}`,
            }}
          >
            {toolbar}
          </div>
        )}
        {transport && (
          <div
            className="shrink-0 w-full"
            style={{
              height: panelConfig.transportHeight,
              background: studioOneTheme.colors.bg.transport,
              borderBottom: `1px solid ${studioOneTheme.colors.border.primary}`,
            }}
          >
            {transport}
          </div>
        )}
        {arranger && (
          <div
            className="shrink-0 w-full"
            style={{ borderBottom: `1px solid ${studioOneTheme.colors.border.primary}` }}
          >
            {arranger}
          </div>
        )}
        <div className="flex flex-1 min-h-0 overflow-hidden">
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
                className="shrink-0 w-1 cursor-col-resize bg-transparent hover:bg-purple-500 transition-colors"
                onMouseDown={handleInspectorResizeStart}
              />
            </>
          )}
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <div className="flex-1 overflow-hidden">
              {arrange}
            </div>
            {consolePanelState.visible && consolePanel && (
              <div
                className="shrink-0"
                style={{ borderTop: `1px solid ${studioOneTheme.colors.border.primary}` }}
              >
                {consolePanel}
              </div>
            )}
          </div>
          {showBrowserInline && (
            <>
              <div
                className="shrink-0 w-1 cursor-col-resize bg-transparent hover:bg-purple-500 transition-colors"
                onMouseDown={handleBrowserResizeStart}
                style={{ borderLeft: `1px solid ${studioOneTheme.colors.border.primary}` }}
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
