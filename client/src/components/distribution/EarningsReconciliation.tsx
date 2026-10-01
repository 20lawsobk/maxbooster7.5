import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  DollarSign,
  BarChart3,
  Download,
  Upload,
  CheckCircle,
  Clock,
  RefreshCw,
  FileSpreadsheet,
  AlertCircle,
  Banknote,
  Globe,
  FileCheck,
  AlertTriangle,
  Info,
} from "lucide-react";

interface RoyaltyStatement {
  id: string;
  platform: string;
  period: string;
  statementDate: string;
  fileName: string;
  fileSize: number | null;
  status: "pending" | "processing" | "imported" | "error" | "reviewed" | "reconciled";
  totalAmount: number;
  totalStreams: number | null;
  rowCount: number | null;
  currency: string | null;
  importedAt?: string;
  errors?: string[];
  downloadUrl?: string | null;
}

interface TooLostEarningsSummary {
  totalEarnings: number;
  currency: string;
  source: "toolost";
  detailAvailable: false;
}

export function EarningsReconciliation() {
  const [activeTab, setActiveTab] = useState("statements");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedStatement, setSelectedStatement] =
    useState<RoyaltyStatement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: statements = [] } = useQuery<
    { statements?: RoyaltyStatement[] },
    Error,
    RoyaltyStatement[]
  >({
    queryKey: ["/api/distribution/earnings/statements"],
    select: (response: { statements?: RoyaltyStatement[] }) =>
      response.statements ?? [],
  });

  const {
    data: summary,
    isError: summaryError,
    isLoading: summaryLoading,
  } = useQuery<TooLostEarningsSummary>({
    queryKey: ["/api/distribution/earnings/summary"],
  });

  const importStatementMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("statement", file);
      const response = await apiRequest(
        "POST",
        "/api/distribution/earnings/import",
        formData,
      );
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/distribution/earnings/statements"],
      });
      setIsImportOpen(false);
      toast({
        title: "Statement Imported",
        description:
          result.message ||
          "The uploaded CSV summary was saved; it was not reconciled or used for a payout.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Import Failed",
        description: error.message || "Unable to import royalty statement",
        variant: "destructive",
      });
    },
  });

  const markReviewedMutation = useMutation({
    mutationFn: async (statementId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/distribution/earnings/statements/${statementId}/reconcile`,
      );
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/distribution/earnings/statements"],
      });
      toast({
        title: "Review recorded",
        description:
          result.message ||
          "This records a manual review only; it does not reconcile Too Lost ledger data.",
      });
    },
    onError: (error: Error) =>
      toast({
        title: "Review failed",
        description: error.message,
        variant: "destructive",
      }),
  });

  const formatCurrency = (amount: number, currency: string = "USD"): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + "M";
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + "K";
    }
    return num.toString();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<
      string,
      { className: string; icon: React.ElementType }
    > = {
      pending: {
        className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
        icon: Clock,
      },
      processing: {
        className: "bg-blue-500/10 text-blue-500 border-blue-500/20",
        icon: RefreshCw,
      },
      imported: {
        className: "bg-green-500/10 text-green-500 border-green-500/20",
        icon: FileCheck,
      },
      reconciled: {
        className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
        icon: CheckCircle,
      },
      reviewed: {
        className: "bg-sky-500/10 text-sky-500 border-sky-500/20",
        icon: CheckCircle,
      },
      completed: {
        className: "bg-green-500/10 text-green-500 border-green-500/20",
        icon: CheckCircle,
      },
      error: {
        className: "bg-red-500/10 text-red-500 border-red-500/20",
        icon: AlertCircle,
      },
      failed: {
        className: "bg-red-500/10 text-red-500 border-red-500/20",
        icon: AlertCircle,
      },
      returned: {
        className: "bg-orange-500/10 text-orange-500 border-orange-500/20",
        icon: AlertTriangle,
      },
    };
    const config = styles[status] || styles.pending;
    const Icon = config.icon;
    return (
      <Badge className={`gap-1 ${config.className}`}>
        <Icon
          className={`h-3 w-3 ${status === "processing" ? "animate-spin" : ""}`}
        />
        {status}
      </Badge>
    );
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      importStatementMutation.mutate(file);
    }
    event.target.value = "";
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Earnings Reconciliation
            </CardTitle>
            <CardDescription>
              View Too Lost lifetime totals and store user-exported CSV summaries.
              Too Lost controls payout requests and payout history.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsImportOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Import CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Too Lost exposes lifetime sales totals, but no statement, line-item
            reconciliation, payout request, or payout-history endpoint. CSV
            imports are user-provided summaries and never trigger a payout.
          </AlertDescription>
        </Alert>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div>
              <p className="text-sm text-muted-foreground">Too Lost Lifetime Sales</p>
              <p className="text-2xl font-bold">
                {summaryLoading
                  ? "Loading…"
                  : summary
                    ? formatCurrency(summary.totalEarnings, summary.currency)
                    : "Unavailable"}
              </p>
            </div>
          </Card>
          <Card className="p-4">
            <div>
              <p className="text-sm text-muted-foreground">Available with Too Lost</p>
              <p className="text-2xl font-bold">Not exposed by API</p>
            </div>
          </Card>
          <Card className="p-4">
            <div>
              <p className="text-sm text-muted-foreground">Pending at Too Lost</p>
              <p className="text-2xl font-bold">Not exposed by API</p>
            </div>
          </Card>
        </div>

        {summaryError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Too Lost did not return a confirmed earnings summary. Values are
              hidden rather than filled with local or estimated totals.
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="statements" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Statements
            </TabsTrigger>
            <TabsTrigger value="earnings" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Earnings
            </TabsTrigger>
            <TabsTrigger value="payouts" className="gap-2">
              <Banknote className="h-4 w-4" />
              Payouts
            </TabsTrigger>
            <TabsTrigger value="territories" className="gap-2">
              <Globe className="h-4 w-4" />
              Territories
            </TabsTrigger>
          </TabsList>

          <TabsContent value="statements" className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platform</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Streams</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Imported</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statements.map((statement) => (
                  <TableRow key={statement.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="capitalize">
                          {statement.platform.replace("-", " ")}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{statement.period}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">
                          {statement.fileName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {statement.fileSize !== null
                            ? formatFileSize(statement.fileSize)
                            : "Size unavailable"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {statement.currency
                        ? formatCurrency(statement.totalAmount, statement.currency)
                        : "Currency unavailable"}
                    </TableCell>
                    <TableCell className="text-right">
                      {statement.totalStreams !== null
                        ? formatNumber(statement.totalStreams)
                        : "-"}
                    </TableCell>
                    <TableCell>{getStatusBadge(statement.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {statement.importedAt
                        ? new Date(statement.importedAt).toLocaleDateString()
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {statement.status === "imported" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              markReviewedMutation.mutate(statement.id)
                            }
                            disabled={markReviewedMutation.isPending}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Mark reviewed
                          </Button>
                        )}
                        {statement.status === "error" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedStatement(statement);
                              setIsDetailsOpen(true);
                            }}
                          >
                            <AlertCircle className="h-4 w-4 mr-1" />
                            View Errors
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Download ${statement.fileName}`}
                          disabled={!statement.downloadUrl}
                          onClick={() => {
                            if (statement.downloadUrl) {
                              window.location.assign(statement.downloadUrl);
                            }
                          }}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {statements.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No statements imported yet</p>
                <p className="text-sm mt-1">
                  Too Lost does not provide statement downloads through its API.
                  Import a user-exported CSV for a saved summary.
                </p>
                <Button className="mt-4" onClick={() => setIsImportOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import CSV
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="earnings" className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Too Lost does not expose per-track earnings through the
                connected API. Detailed earnings are not populated from
                unrelated local marketplace transactions.
              </AlertDescription>
            </Alert>
          </TabsContent>

          <TabsContent value="payouts" className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Too Lost does not provide an API to request or inspect payouts.
                No payout request has been sent from this app. Use the payout
                provider linked in your Too Lost account.
              </AlertDescription>
            </Alert>
          </TabsContent>

          <TabsContent value="territories" className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Too Lost does not expose territory-level earnings through the
                connected API. Territory totals are not estimated from other
                data sources.
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>

        <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Import User-Exported CSV</DialogTitle>
              <DialogDescription>
                Too Lost does not expose a statement-download API. This app-defined
                CSV format stores a user-provided summary only.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="font-medium mb-2">
                  Click to upload or drag and drop
                </p>
                <p className="text-sm text-muted-foreground">
                  CSV only · max 10 MB
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                />
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Required columns: period_start, period_end, currency, platform,
                  streams, amount. Dates must use YYYY-MM-DD. This is not claimed
                  to match Too Lost's native export format.
                </AlertDescription>
              </Alert>

              {importStatementMutation.isPending && (
                <div className="text-sm text-muted-foreground">
                  Saving the CSV and its validated summary…
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsImportOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Statement Import Errors</DialogTitle>
              <DialogDescription>
                {selectedStatement?.fileName}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {selectedStatement?.errors?.map((error, index) => (
                <Alert key={index} variant="destructive" className="mb-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ))}
              <p className="text-sm text-muted-foreground mt-4">
                Please fix these issues and re-import the statement, or contact
                support if you need help.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
                Close
              </Button>
              <Button onClick={() => setIsImportOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Re-import
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
