import { useState, useCallback, useEffect, ReactNode } from 'react';
import { studioOneTheme, cssVariables } from '@/lib/studioOneTheme';
import { useStudioLayoutStore } from '@/lib/studioLayoutStore';

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
  } = useStudioLayoutStore();

  const panelConfig = defaultPanelConfig;

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

          {browserPanel.visible && browser && (
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
