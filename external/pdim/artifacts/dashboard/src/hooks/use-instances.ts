import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tokenStore } from "../lib/utils";

// --- Types inferred from openapi ---
export interface InstanceSummary {
  id: string;
  name: string;
  httpUrl: string;
  tokenHint: string;
  isActive: boolean;
  keyCount: number;
  createdAt: string;
  lastUsedAt: string;
}

export interface InstanceListResponse {
  count: number;
  instances: InstanceSummary[];
}

export interface InstanceInfo {
  id: string;
  name: string;
  connectionUrl: string;
  httpUrl: string;
  keyCount: number;
  totalCommandsProcessed: number;
  uptimeSeconds: number;
  createdAt: string;
  lastSavedAt: string | null;
  persistenceEnabled: boolean;
}

export interface CreateInstancePayload {
  name: string;
  maxKeys?: number;
}

export interface CreatedInstance {
  id: string;
  name: string;
  token: string;
  connectionUrl: string;
  httpUrl: string;
  createdAt: string;
}

const API_BASE = "/api/redis/instances";

function getHeaders(id?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (id) {
    const token = tokenStore.get(id);
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export function useInstances() {
  return useQuery({
    queryKey: [API_BASE],
    queryFn: async (): Promise<InstanceListResponse> => {
      const res = await fetch(API_BASE);
      if (!res.ok) throw new Error("Failed to fetch instances");
      return res.json();
    },
    refetchInterval: 8000,
  });
}

export function useInstance(id: string) {
  return useQuery({
    queryKey: [API_BASE, id],
    queryFn: async (): Promise<InstanceInfo> => {
      const res = await fetch(`${API_BASE}/${id}`, { headers: getHeaders(id) });
      if (res.status === 401) throw new Error("UNAUTHORIZED");
      if (!res.ok) throw new Error("Failed to fetch instance details");
      return res.json();
    },
    retry: false,
    refetchInterval: 5000,
  });
}

export function useCreateInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      data: CreateInstancePayload,
    ): Promise<CreatedInstance> => {
      const res = await fetch(API_BASE, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create instance");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [API_BASE] });
    },
  });
}

export function useDeleteInstance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_BASE}/${id}`, {
        method: "DELETE",
        headers: getHeaders(id),
      });
      if (!res.ok) throw new Error("Failed to delete instance");
      return res.json();
    },
    onSuccess: (_, id) => {
      tokenStore.clear(id);
      queryClient.invalidateQueries({ queryKey: [API_BASE] });
    },
  });
}
