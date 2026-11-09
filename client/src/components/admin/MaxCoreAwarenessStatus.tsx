import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SourceHealth = {
  source: string;
  status: string;
  failure?: string | null;
  observation_count: number;
  third_party_result_count: number;
  freshness_state: string;
  last_observed_at: number | null;
};

type NativeCrawl = {
  implementation_state: string;
  state: string;
  reason: string;
  authorized: boolean;
  first_party_observation_count: number;
  training_eligible: boolean;
};

type PlatformStatus = {
  status: string;
  reason: string | null;
  ingestion_state: string;
  freshness_state: string;
  observation_count: number;
  last_observed_at: number | null;
  native_crawl: NativeCrawl;
  training_eligibility: { eligible: boolean; reason: string };
  source_health: SourceHealth[];
};

type AwarenessStatus = {
  ready: boolean;
  source_scan_state: string | null;
  snapshot_id: string | number | null;
  snapshot_expires_at: string | number | null;
  platforms: Record<string, PlatformStatus>;
};

const PLATFORM_NAMES: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X / Twitter",
  youtube: "YouTube",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  threads: "Threads",
  google_business: "Google Business Profile",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseAwarenessStatus(value: unknown): AwarenessStatus {
  if (!isRecord(value) || !isRecord(value.platforms)) {
    throw new Error("MaxCore returned an invalid source-status response.");
  }
  const platforms: Record<string, PlatformStatus> = {};
  for (const id of Object.keys(PLATFORM_NAMES)) {
    const row = value.platforms[id];
    if (
      !isRecord(row) ||
      typeof row.status !== "string" ||
      typeof row.ingestion_state !== "string" ||
      typeof row.freshness_state !== "string" ||
      typeof row.observation_count !== "number" ||
      !Array.isArray(row.source_health) ||
      !isRecord(row.native_crawl) ||
      typeof row.native_crawl.authorized !== "boolean" ||
      typeof row.native_crawl.reason !== "string" ||
      !isRecord(row.training_eligibility) ||
      typeof row.training_eligibility.eligible !== "boolean" ||
      !row.source_health.every(
        (item) =>
          isRecord(item) &&
          typeof item.source === "string" &&
          typeof item.status === "string" &&
          typeof item.observation_count === "number" &&
          typeof item.third_party_result_count === "number" &&
          typeof item.freshness_state === "string" &&
          (item.last_observed_at === null ||
            typeof item.last_observed_at === "number"),
      )
    ) {
      throw new Error(`MaxCore source status is incomplete for ${id}.`);
    }
    platforms[id] = row as unknown as PlatformStatus;
  }
  return {
    ready: value.ready === true,
    source_scan_state:
      typeof value.source_scan_state === "string"
        ? value.source_scan_state
        : null,
    snapshot_id:
      typeof value.snapshot_id === "string" ||
      typeof value.snapshot_id === "number"
        ? value.snapshot_id
        : null,
    snapshot_expires_at:
      typeof value.snapshot_expires_at === "string" ||
      typeof value.snapshot_expires_at === "number"
        ? value.snapshot_expires_at
        : null,
    platforms,
  };
}

function displayTime(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "No observation time";
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? "Invalid timestamp" : date.toLocaleString();
}

async function getAwarenessStatus(): Promise<AwarenessStatus> {
  const response = await fetch("/api/awareness/unified/admin/source-status", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403
        ? "Administrator authentication is required to view source diagnostics."
        : `Source status request failed with HTTP ${response.status}.`,
    );
  }
  return parseAwarenessStatus(await response.json());
}

export function MaxCoreAwarenessStatus() {
  const query = useQuery({
    queryKey: ["/api/awareness/unified/admin/source-status"],
    queryFn: getAwarenessStatus,
    refetchInterval: 60_000,
    staleTime: 15_000,
  });

  return (
    <Card data-testid="maxcore-awareness-status">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle id="maxcore-awareness-title">
            MaxCore Public-Source Status
          </CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Platform observations and access policy. Public visibility does not
            grant permission to crawl or train on content.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
          aria-label="Refresh MaxCore source status"
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading source status…
          </p>
        ) : query.isError ? (
          <Alert variant="destructive" role="alert">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>
              {query.error instanceof Error
                ? query.error.message
                : "Unable to load MaxCore source status."}
            </AlertDescription>
          </Alert>
        ) : query.data ? (
          <>
            <Alert>
              <AlertDescription>
                Native anonymous crawling is not currently authorized for these
                sources. Optional search-index results are labeled separately;
                they are not first-party platform observations. No credential
                or login restriction is bypassed.
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {Object.entries(PLATFORM_NAMES).map(([id, name]) => {
                const source = query.data.platforms[id];
                if (!source) {
                  return (
                    <section
                      key={id}
                      className="rounded-lg border p-4"
                      aria-labelledby={`source-${id}-title`}
                    >
                      <h3 id={`source-${id}-title`} className="font-medium">
                        {name}
                      </h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Status unavailable from MaxCore.
                      </p>
                    </section>
                  );
                }
                const hasFailure = source.source_health.some(
                  (item) => item.status === "failed",
                );
                return (
                  <section
                    key={id}
                    className="rounded-lg border p-4"
                    aria-labelledby={`source-${id}-title`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 id={`source-${id}-title`} className="font-medium">
                        {name}
                      </h3>
                      <Badge variant={hasFailure ? "destructive" : "secondary"}>
                        {source.ingestion_state.replaceAll("_", " ")}
                      </Badge>
                    </div>
                    <dl className="mt-3 space-y-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Source status</dt>
                        <dd className="text-right">{source.status.replaceAll("_", " ")}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Observations</dt>
                        <dd>{source.observation_count}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Freshness</dt>
                        <dd>{source.freshness_state}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Last observation</dt>
                        <dd className="text-right">{displayTime(source.last_observed_at)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Native crawl</dt>
                        <dd className="mt-1">
                          {source.native_crawl.authorized
                            ? "Authorized"
                            : `Blocked: ${source.native_crawl.reason.replaceAll("_", " ")}`}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Training rights</dt>
                        <dd className="mt-1">
                          {source.training_eligibility.eligible
                            ? "Eligible under recorded rights"
                            : "Not eligible: permission is unverified"}
                        </dd>
                      </div>
                    </dl>
                    {source.source_health.length > 0 && (
                      <ul className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
                        {source.source_health.map((item) => (
                          <li key={item.source}>
                            {item.source}: {item.status.replaceAll("_", " ")}
                            {item.failure ? ` (${item.failure})` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Awareness {query.data.ready ? "ready" : "degraded"} · scan{" "}
              {query.data.source_scan_state ?? "unknown"} · snapshot{" "}
              {query.data.snapshot_id ?? "not available"} · expires{" "}
              {query.data.snapshot_expires_at ?? "unknown"}
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
