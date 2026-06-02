import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Download,
  ExternalLink,
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Loader2,
  Calendar,
} from "lucide-react";

interface Invoice {
  id: string;
  number: string;
  amount: number;
  amountPaid: number;
  amountRemaining: number;
  currency: string;
  status: string;
  statusDisplay: string;
  statusColor: string;
  isOverdue: boolean;
  created: string;
  dueDate: string | null;
  paidAt: string | null;
  description: string;
  pdfUrl: string | null;
  hostedUrl: string | null;
  attemptCount: number;
  nextPaymentAttempt: string | null;
}

interface InvoiceStatusProps {
  className?: string;
  showFilters?: boolean;
  limit?: number;
}

const getStatusIcon = (status: string, isOverdue: boolean) => {
  if (isOverdue) return <AlertTriangle className="h-4 w-4 text-red-500" />;

  switch (status) {
    case "paid":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "open":
      return <Clock className="h-4 w-4 text-yellow-500" />;
    case "draft":
      return <FileText className="h-4 w-4 text-gray-500" />;
    case "void":
    case "uncollectible":
      return <XCircle className="h-4 w-4 text-gray-500" />;
    default:
      return <FileText className="h-4 w-4 text-gray-500" />;
  }
};

const getStatusBadgeVariant = (
  color: string,
): "default" | "secondary" | "destructive" | "outline" => {
  switch (color) {
    case "green":
      return "default";
    case "yellow":
      return "secondary";
    case "red":
      return "destructive";
    default:
      return "outline";
  }
};

export default function InvoiceStatus({
  className,
  showFilters = true,
  limit = 10,
}: InvoiceStatusProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading, error, refetch, isRefetching } = useQuery<{
    invoices: Invoice[];
  }>({
    queryKey: [
      "/api/billing/invoices",
      statusFilter !== "all" ? statusFilter : undefined,
    ],
  });

  const invoices = data?.invoices || [];
  const displayedInvoices = limit ? invoices.slice(0, limit) : invoices;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  };

  const handleDownloadPdf = (pdfUrl: string) => {
    window.open(pdfUrl, "_blank");
  };

  const handleViewInvoice = (hostedUrl: string) => {
    window.open(hostedUrl, "_blank");
  };

  const overdueCount = invoices.filter((inv) => inv.isOverdue).length;
  const pendingCount = invoices.filter(
    (inv) => inv.status === "open" && !inv.isOverdue,
  ).length;

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Invoices
            </CardTitle>
            <CardDescription>
              View and manage your billing invoices
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {showFilters && (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="open">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="void">Void</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isRefetching}
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {(overdueCount > 0 || pendingCount > 0) && (
          <div className="flex gap-3">
            {overdueCount > 0 && (
              <Alert variant="destructive" className="flex-1">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {overdueCount} overdue invoice{overdueCount > 1 ? "s" : ""}{" "}
                  requiring attention
                </AlertDescription>
              </Alert>
            )}
            {pendingCount > 0 && (
              <Alert className="flex-1 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30">
                <Clock className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-700 dark:text-yellow-400">
                  {pendingCount} pending payment{pendingCount > 1 ? "s" : ""}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {displayedInvoices.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No invoices found</p>
            <p className="text-sm mt-1">
              {statusFilter !== "all"
                ? `No ${statusFilter} invoices to display.`
                : "Your invoice history will appear here."}
            </p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedInvoices.map((invoice) => (
                  <TableRow
                    key={invoice.id}
                    className={
                      invoice.isOverdue ? "bg-red-50/50 dark:bg-red-950/20" : ""
                    }
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(invoice.status, invoice.isOverdue)}
                        <div>
                          <p className="font-medium">{invoice.number}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {invoice.description}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm">{formatDate(invoice.created)}</p>
                        {invoice.dueDate && invoice.status === "open" && (
                          <p
                            className={`text-xs ${invoice.isOverdue ? "text-red-600" : "text-muted-foreground"}`}
                          >
                            Due {formatDate(invoice.dueDate)}
                          </p>
                        )}
                        {invoice.paidAt && (
                          <p className="text-xs text-green-600">
                            Paid {formatDate(invoice.paidAt)}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {formatCurrency(invoice.amount, invoice.currency)}
                        </p>
                        {invoice.amountRemaining > 0 &&
                          invoice.amountRemaining < invoice.amount && (
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(
                                invoice.amountRemaining,
                                invoice.currency,
                              )}{" "}
                              remaining
                            </p>
                          )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge
                          variant={getStatusBadgeVariant(invoice.statusColor)}
                        >
                          {invoice.statusDisplay}
                        </Badge>
                        {invoice.attemptCount > 0 &&
                          invoice.status === "open" && (
                            <span className="text-xs text-muted-foreground">
                              {invoice.attemptCount} attempt
                              {invoice.attemptCount > 1 ? "s" : ""}
                            </span>
                          )}
                        {invoice.nextPaymentAttempt && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <RefreshCw className="h-3 w-3" />
                            Retry {formatDate(invoice.nextPaymentAttempt)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {invoice.hostedUrl && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              handleViewInvoice(invoice.hostedUrl!)
                            }
                            title="View invoice"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                        {invoice.pdfUrl && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDownloadPdf(invoice.pdfUrl!)}
                            title="Download PDF"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {invoices.length > limit && (
          <div className="text-center pt-2">
            <Button variant="link" className="text-sm">
              View all {invoices.length} invoices
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
