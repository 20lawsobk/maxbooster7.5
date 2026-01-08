export const studioOneTheme = {
  colors: {
    bg: {
      primary: '#1a1d24',
      secondary: '#22262e',
      tertiary: '#2a2f38',
      panel: '#1e2128',
      deep: '#14171c',
      surface: '#252a32',
      elevated: '#2e343d',
    },
    border: {
      primary: '#3a3f48',
      secondary: '#4a505a',
      subtle: '#2e333c',
      accent: '#5a606a',
    },
    text: {
      primary: '#e8eaed',
      secondary: '#a8adb8',
      muted: '#6a7080',
      accent: '#7aa2f7',
    },
    accent: {
      blue: '#7aa2f7',
      cyan: '#7dcfff',
      green: '#9ece6a',
      yellow: '#e0af68',
      orange: '#ff9e64',
      red: '#f7768e',
      purple: '#bb9af7',
      teal: '#73daca',
    },
    meter: {
      low: '#4ade80',
      mid: '#fbbf24',
      high: '#f87171',
      peak: '#dc2626',
      clip: '#ff0000',
    },
    fader: {
      track: '#3a3f48',
      thumb: '#5a606a',
      active: '#7aa2f7',
    },
    button: {
      mute: '#eab308',
      muteActive: '#ca8a04',
      solo: '#22c55e',
      soloActive: '#16a34a',
      record: '#ef4444',
      recordActive: '#dc2626',
    },
    track: {
      colors: [
        '#4ade80', '#60a5fa', '#f87171', '#fbbf24', '#a78bfa',
        '#fb923c', '#ec4899', '#14b8a6', '#8b5cf6', '#06b6d4',
        '#f472b6', '#84cc16', '#0ea5e9', '#f59e0b', '#8b5cf6',
      ],
    },
  },
  spacing: {
    channelWidth: 80,
    channelWidthNarrow: 60,
    channelWidthWide: 120,
    headerHeight: 48,
    transportHeight: 56,
    browserWidth: 280,
    inspectorWidth: 260,
    consoleHeight: 300,
    navColumnWidth: 40,
  },
  effects: {
    shadow: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
      md: '0 4px 6px rgba(0, 0, 0, 0.4)',
      lg: '0 10px 15px rgba(0, 0, 0, 0.5)',
      inner: 'inset 0 2px 4px rgba(0, 0, 0, 0.3)',
    },
    glow: {
      blue: '0 0 10px rgba(122, 162, 247, 0.3)',
      green: '0 0 10px rgba(74, 222, 128, 0.3)',
      red: '0 0 10px rgba(239, 68, 68, 0.3)',
    },
  },
  transitions: {
    fast: '100ms ease-out',
    normal: '200ms ease-out',
    slow: '300ms ease-out',
  },
};

export const cssVariables = `
  :root {
    --s1-bg-primary: ${studioOneTheme.colors.bg.primary};
    --s1-bg-secondary: ${studioOneTheme.colors.bg.secondary};
    --s1-bg-tertiary: ${studioOneTheme.colors.bg.tertiary};
    --s1-bg-panel: ${studioOneTheme.colors.bg.panel};
    --s1-bg-deep: ${studioOneTheme.colors.bg.deep};
    --s1-bg-surface: ${studioOneTheme.colors.bg.surface};
    --s1-bg-elevated: ${studioOneTheme.colors.bg.elevated};
    
    --s1-border-primary: ${studioOneTheme.colors.border.primary};
    --s1-border-secondary: ${studioOneTheme.colors.border.secondary};
    --s1-border-subtle: ${studioOneTheme.colors.border.subtle};
    --s1-border-accent: ${studioOneTheme.colors.border.accent};
    
    --s1-text-primary: ${studioOneTheme.colors.text.primary};
    --s1-text-secondary: ${studioOneTheme.colors.text.secondary};
    --s1-text-muted: ${studioOneTheme.colors.text.muted};
    --s1-text-accent: ${studioOneTheme.colors.text.accent};
    
    --s1-accent-blue: ${studioOneTheme.colors.accent.blue};
    --s1-accent-cyan: ${studioOneTheme.colors.accent.cyan};
    --s1-accent-green: ${studioOneTheme.colors.accent.green};
    --s1-accent-yellow: ${studioOneTheme.colors.accent.yellow};
    --s1-accent-orange: ${studioOneTheme.colors.accent.orange};
    --s1-accent-red: ${studioOneTheme.colors.accent.red};
    --s1-accent-purple: ${studioOneTheme.colors.accent.purple};
    --s1-accent-teal: ${studioOneTheme.colors.accent.teal};
    
    --s1-meter-low: ${studioOneTheme.colors.meter.low};
    --s1-meter-mid: ${studioOneTheme.colors.meter.mid};
    --s1-meter-high: ${studioOneTheme.colors.meter.high};
    --s1-meter-peak: ${studioOneTheme.colors.meter.peak};
    --s1-meter-clip: ${studioOneTheme.colors.meter.clip};
    
    --s1-channel-width: ${studioOneTheme.spacing.channelWidth}px;
    --s1-channel-width-narrow: ${studioOneTheme.spacing.channelWidthNarrow}px;
    --s1-channel-width-wide: ${studioOneTheme.spacing.channelWidthWide}px;
    --s1-header-height: ${studioOneTheme.spacing.headerHeight}px;
    --s1-transport-height: ${studioOneTheme.spacing.transportHeight}px;
    --s1-browser-width: ${studioOneTheme.spacing.browserWidth}px;
    --s1-inspector-width: ${studioOneTheme.spacing.inspectorWidth}px;
    --s1-console-height: ${studioOneTheme.spacing.consoleHeight}px;
    --s1-nav-column-width: ${studioOneTheme.spacing.navColumnWidth}px;
  }
`;

export type StudioOneTheme = typeof studioOneTheme;
