import {
  getMaxcoreAdminHeaders,
  getMaxcoreGenerationHeaders,
  getMaxcoreOrigin,
} from "./maxcoreConnector.js";

export class MaxCoreControlError extends Error {
  constructor(
    message: string,
    readonly status: number = 503,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "MaxCoreControlError";
  }
}

type FetchTransport = typeof fetch;

export interface MaxCoreControlTransport {
  request<T>(
    endpoint: string,
    options?: {
      method?: "GET" | "POST";
      body?: unknown;
      timeoutMs?: number;
      authScope?: "admin" | "generation";
      userId?: string;
    },
  ): Promise<T>;
}

export function createMaxCoreControlTransport(
  fetchTransport: FetchTransport = fetch,
): MaxCoreControlTransport {
  return {
    async request<T>(
      endpoint: string,
      options: {
        method?: "GET" | "POST";
        body?: unknown;
        timeoutMs?: number;
        authScope?: "admin" | "generation";
        userId?: string;
      } = {},
    ): Promise<T> {
      const origin = getMaxcoreOrigin();
      const authHeaders =
        options.authScope === "generation"
          ? getMaxcoreGenerationHeaders()
          : getMaxcoreAdminHeaders();
      if (!origin || Object.keys(authHeaders).length === 0) {
        throw new MaxCoreControlError(
          "MaxCore control plane is not configured",
        );
      }

      const method = options.method ?? "GET";
      let response: Response;
      try {
        response = await fetchTransport(`${origin}${endpoint}`, {
          method,
          headers: {
            ...authHeaders,
            "Content-Type": "application/json",
            ...(options.userId
              ? { "X-MaxCore-User-Id": options.userId }
              : {}),
          },
          body:
            method === "POST" && options.body !== undefined
              ? JSON.stringify(options.body)
              : undefined,
          signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
          redirect: "manual",
        });
      } catch (error) {
        throw new MaxCoreControlError(
          `MaxCore control request failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      const contentType = response.headers.get("content-type") ?? "";
      let data: unknown;
      try {
        data = contentType.includes("json")
          ? await response.json()
          : await response.text();
      } catch {
        throw new MaxCoreControlError(
          `MaxCore returned an unreadable response for ${endpoint}`,
          502,
        );
      }

      if (!response.ok) {
        const upstreamMessage =
          data && typeof data === "object" && "detail" in data
            ? String((data as { detail: unknown }).detail)
            : `HTTP ${response.status}`;
        throw new MaxCoreControlError(
          `MaxCore rejected ${endpoint}: ${upstreamMessage}`,
          response.status >= 400 && response.status < 600
            ? response.status
            : 502,
          data,
        );
      }
      if (!contentType.includes("json") || !data || typeof data !== "object") {
        throw new MaxCoreControlError(
          `MaxCore returned a non-JSON contract for ${endpoint}`,
          502,
        );
      }
      return data as T;
    },
  };
}

export const maxCoreControlTransport = createMaxCoreControlTransport();