// @ts-nocheck
/**
 * Audit Log Admin Page
 *
 * Real-time log of sensitive platform actions (plan changes, payout requests,
 * DMCA filings, login from new device, etc.) with risk-level filtering.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  Search,
  Shield,
  XCircle,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useRequireSubscription } from "@/hooks/useRequireAuth";
import { format } from "date-fns";

interface AuditLogEntry {
  id: number;
  timestamp: string;
  userId: string | null;
  userEmail: string | null;
  ip: string;
  action: string;
  resource: string;
  result: string;
  risk: string;
  details: Record<string, unknown> | null;
}

interface AuditSummary {
  total: number;
  failures: number;
  byRisk: Record<string, number>;
  topActions: Array<{ action: string; count: number }>;
}

const RISK_META: Record<
  string,
  { color: string; label: string; icon: React.ReactNode }
> = {
  low: {
    color: "bg-green-500/20 text-green-400",
    label: "Low",
    icon: <CheckCircle className="w-3 h-3" />,
  },
  medium: {
    color: "bg-yellow-500/20 text-yellow-400",
    label: "Medium",
    icon: <AlertTriangle className="w-3 h-3" />,
  },
  high: {
    color: "bg-orange-500/20 text-orange-400",
    label: "High",
    icon: <AlertTriangle className="w-3 h-3" />,
  },
  critical: {
    color: "bg-red-500/20 text-red-400",
    label: "Critical",
    icon: <XCircle className="w-3 h-3" />,
  },
};

function RiskBadge({ risk }: { risk: string }) {
  const meta = RISK_META[risk] ?? RISK_META.low;
  return (
    <Badge className={`text-xs flex items-center gap-1 ${meta.color}`}>
      {meta.icon}
      {meta.label}
    </Badge>
  );
}

function ResultBadge({ result }: { result: string }) {
  if (result === "success") {
    return (
      <Badge className="text-xs bg-green-500/20 text-green-400">success</Badge>
    );
  }
  if (result === "failure") {
    return (
      <Badge className="text-xs bg-red-500/20 text-red-400">failure</Badge>
    );
  }
  return <Badge variant="secondary" className="text-xs">{result}</Badge>;
}

export default function AuditLogPage() {
  const { user } = useRequireSubscription();
  const [riskFilter, setRiskFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(1);

  const queryParams = new URLSearchParams({
    limit: "50",
    page: String(page),
    ...(riskFilter !== "all" && { risk: riskFilter }),
    ...(actionFilter && { action: actionFilter }),
  });

  const { data, isLoading, refetch, isRefetching } = useQuery<{
    logs: AuditLogEntry[];
    page: number;
  }>({
    queryKey: ["admin-audit-log", riskFilter, actionFilter, page],
    queryFn: () =>
      apiRequest("GET", `/api/admin/audit-log?${queryParams}`).then((r) =>
        r.json(),
      ),
    refetchInterval: 30_000,
  });

  const { data: summary } = useQuery<AuditSummary>({
    queryKey: ["admin-audit-log-summary"],
    queryFn: () =>
      apiRequest("GET", "/api/admin/audit-log/summary").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  if (user?.role !== "admin") {
    return (
      <AppLayout>
        <div className="p-6">
          <p className="text-muted-foreground">Admin access required.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="w-6 h-6 text-primary" />
              Audit Log
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Immutable record of all sensitive platform actions
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${isRefetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Events (24h)</p>
                <p className="text-xl font-bold">{summary.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Failures (24h)</p>
                <p className="text-xl font-bold text-red-400">
                  {summary.failures}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">High/Critical (24h)</p>
                <p className="text-xl font-bold text-orange-400">
                  {(summary.byRisk?.high ?? 0) +
                    (summary.byRisk?.critical ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Top Action</p>
                <p className="text-sm font-semibold truncate">
                  {summary.topActions[0]?.action ?? "—"}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              placeholder="Filter by action…"
              className="pl-9"
            />
          </div>
          <Select
            value={riskFilter}
            onValueChange={(v) => {
              setRiskFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Risk level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risks</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Log Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">
                    <Clock className="w-3.5 h-3.5 inline mr-1" />
                    Time
                  </TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : (data?.logs ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No audit events found
                    </TableCell>
                  </TableRow>
                ) : (
                  (data?.logs ?? []).map((entry) => (
                    <TableRow
                      key={entry.id}
                      className={
                        entry.risk === "critical"
                          ? "bg-red-500/5"
                          : entry.risk === "high"
                            ? "bg-orange-500/5"
                            : ""
                      }
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(entry.timestamp), "MMM d HH:mm:ss")}
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        {entry.action}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {entry.resource}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {entry.userEmail
                          ? entry.userEmail.slice(0, 24)
                          : entry.userId
                            ? entry.userId.slice(0, 12) + "…"
                            : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {entry.ip}
                      </TableCell>
                      <TableCell>
                        <ResultBadge result={entry.result} />
                      </TableCell>
                      <TableCell>
                        <RiskBadge risk={entry.risk} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} — showing up to 50 entries
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(data?.logs ?? []).length < 50}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
