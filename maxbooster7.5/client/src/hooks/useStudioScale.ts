import { useRef, useState, useEffect, useCallback, useMemo } from 'react';

const DESIGN_BASELINE = 1440;

const BASE_SIZES = {
  trackHeaderW: 192,
  transportH: 56,
  toolbarH: 40,
  inspectorW: 256,
  aiPanelW: 320,
  editorH: 192,
  mixerH: 240,
  stripW: 64,
};

export function useStudioScale() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        const raw = width / DESIGN_BASELINE;
        setScale(Math.min(1, Math.max(0.5, raw)));
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const trackHeaderWidth = Math.round(BASE_SIZES.trackHeaderW * scale);
  const aiPanelWidth = Math.round(BASE_SIZES.aiPanelW * scale);

  const cssVars = useMemo(() => ({
    '--track-header-w': `${Math.round(BASE_SIZES.trackHeaderW * scale)}px`,
    '--transport-h': `${Math.round(BASE_SIZES.transportH * scale)}px`,
    '--toolbar-h': `${Math.round(BASE_SIZES.toolbarH * scale)}px`,
    '--inspector-w': `${Math.round(BASE_SIZES.inspectorW * scale)}px`,
    '--ai-panel-w': `${Math.round(BASE_SIZES.aiPanelW * scale)}px`,
    '--editor-h': `${Math.round(BASE_SIZES.editorH * scale)}px`,
    '--mixer-h': `${Math.round(BASE_SIZES.mixerH * scale)}px`,
    '--strip-w': `${Math.round(BASE_SIZES.stripW * scale)}px`,
    '--ui-scale': `${scale}`,
  }), [scale]);

  return { ref, scale, cssVars, trackHeaderWidth, aiPanelWidth };
}
