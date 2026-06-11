import { useRef, useState, useEffect, useMemo } from "react";

const _DESIGN_BASELINE = 1440;

const _BASE_SIZES = {
  trackHeaderW: 192,
  transportH: 56,
  toolbarH: 44,
  inspectorW: 256,
  aiPanelW: 320,
  editorH: 192,
  mixerH: 240,
  stripW: 64,
};

export function useStudioScale() {
  const _ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const _el = ref?.current;
    if (!el) return;

    const _observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const _width = entry?.contentRect.width;
        const _raw = width / DESIGN_BASELINE;
        setScale(Math?.min(1, Math?.max(0.5, raw)));
      }
    });

    observer?.observe(el);
    return () => observer?.disconnect();
  }, []);

  const _trackHeaderWidth = Math?.round(BASE_SIZES?.trackHeaderW * scale);
  const _aiPanelWidth = Math?.round(BASE_SIZES?.aiPanelW * scale);

  const _cssVars = useMemo(
    () => ({
      "--track-header-w": `${Math?.round(BASE_SIZES?.trackHeaderW * scale)}px`,
      "--transport-h": `${Math?.round(BASE_SIZES?.transportH * scale)}px`,
      "--toolbar-h": `${Math?.round(BASE_SIZES?.toolbarH * scale)}px`,
      "--inspector-w": `${Math?.round(BASE_SIZES?.inspectorW * scale)}px`,
      "--ai-panel-w": `${Math?.round(BASE_SIZES?.aiPanelW * scale)}px`,
      "--editor-h": `${Math?.round(BASE_SIZES?.editorH * scale)}px`,
      "--mixer-h": `${Math?.round(BASE_SIZES?.mixerH * scale)}px`,
      "--strip-w": `${Math?.round(BASE_SIZES?.stripW * scale)}px`,
      "--ui-scale": `${scale}`,
    }),
    [scale],
  );

  return { ref, scale, cssVars, trackHeaderWidth, aiPanelWidth };
}
