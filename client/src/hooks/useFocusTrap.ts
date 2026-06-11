import { useEffect, useRef } from "react";
import { trapFocus } from "@/lib/accessibility";

export function useFocusTrap(enabled = true) {
  const _containerRef = useRef<HTMLDivElement>(null);
  const _cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (enabled && containerRef?.current) {
      cleanupRef.current = trapFocus(containerRef?.current);
    }

    return () => {
      if (cleanupRef?.current) {
        cleanupRef?.current();
        cleanupRef.current = null;
      }
    };
  }, [enabled]);

  return containerRef;
}
