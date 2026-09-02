import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tokenStore } from "../lib/utils";

const API_BASE = "/api/redis/instances";

function getHeaders(id: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = tokenStore.get(id);
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export function useKeys(id: string, pattern: string = "*") {
  return useQuery({
    queryKey: [API_BASE, id, "keys", pattern],
    queryFn: async (): Promise<{ count: number; keys: string[] }> => {
      const url = new URL(`${API_BASE}/${id}/keys`, window.location.origin);
      url.searchParams.set("pattern", pattern);
      const res = await fetch(url.toString(), { headers: getHeaders(id) });
      if (!res.ok) throw new Error("Failed to fetch keys");
      return res.json();
    },
  });
}

export function useExecCommand(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ cmd, args }: { cmd: string; args: string[] }) => {
      const res = await fetch(`${API_BASE}/${id}/exec`, {
        method: "POST",
        headers: getHeaders(id),
        body: JSON.stringify({ cmd, args }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Command failed");
      return data.result;
    },
    onSuccess: (_, variables) => {
      // Invalidate keys list if a mutation command is run
      const mutatingCmds = [
        "SET",
        "DEL",
        "HSET",
        "RPUSH",
        "SADD",
        "FLUSHALL",
        "FLUSHDB",
      ];
      if (mutatingCmds.includes(variables.cmd.toUpperCase())) {
        queryClient.invalidateQueries({ queryKey: [API_BASE, id, "keys"] });
        queryClient.invalidateQueries({ queryKey: [API_BASE, id] }); // Invalidate stats
      }
    },
  });
}

export function useFlushInstance(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/${id}/flush`, {
        method: "POST",
        headers: getHeaders(id),
      });
      if (!res.ok) throw new Error("Failed to flush instance");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [API_BASE, id] });
    },
  });
}
