import { useEffect, useRef } from "react";

const POLL_INTERVAL_MS = 5 * 60 * 1000;

export function useAutoUpdate() {
  const knownBuildId = useRef<string | null>(null);

  useEffect(() => {
    if (import.meta.env?.DEV) {
      return;
    }

    let timer: ReturnType<typeof setInterval>;

    async function checkVersion() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res?.ok) return;
        const data = await res?.json();
        const currentId = data?.buildId as string;

        if (knownBuildId?.current === null) {
          knownBuildId.current = currentId;
          return;
        }

        if (knownBuildId?.current !== currentId) {
          knownBuildId.current = currentId;
          window?.location.reload();
        }
      } catch {}
    }

    checkVersion();
    timer = setInterval(checkVersion, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);
}
