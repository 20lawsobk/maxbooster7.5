import { useQuery, useMutation } from "@tanstack/react-query";

export interface AutoPushStatus {
  running: boolean;
  chunkIndex: number;
  totalChunks: number;
  pct: string;
  status: string | null;
  gbPushed: string | null;
  totalGB: string | null;
  chunksRemaining: number | null;
  chunksPerSec: number | null;
  etaSeconds: number | null;
}

export function useAutoPushStatus() {
  return useQuery<AutoPushStatus>({
    queryKey: ["autopush-status"],
    queryFn: async () => {
      const res = await fetch("/api/autopush/status");
      if (!res.ok) throw new Error("Failed to fetch autopush status");
      return res.json();
    },
    refetchInterval: 2000,
    retry: false,
  });
}

export function useAutoPushRestart() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/autopush/restart", { method: "POST" });
      if (!res.ok) throw new Error("Failed to restart autopush");
      return res.json();
    },
  });
}
