interface LayoutGridProps {
  topBar: React.ReactNode;
  inspector: React.ReactNode;
  timeline: React.ReactNode;
  browser: React.ReactNode;
  dock: React.ReactNode;
  inspectorCollapsed: boolean;
  browserCollapsed: boolean;
}

/**
 * TODO: Add function documentation
 */
export function LayoutGrid({
  topBar,
  inspector,
  timeline,
  browser,
  dock,
  inspectorCollapsed,
  browserCollapsed,
}: LayoutGridProps) {
  return (
    <div
      className="h-screen w-full grid"
      style={{
        gridTemplateAreas: `
          "topbar topbar topbar"
          "inspector timeline browser"
          "dock dock dock"
        `,
        gridTemplateColumns: `${inspectorCollapsed ? '48px' : '280px'} 1fr ${browserCollapsed ? '48px' : '320px'}`,
        gridTemplateRows: 'auto 1fr auto',
        backgroundColor: 'var(--studio-bg-deep)',
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
