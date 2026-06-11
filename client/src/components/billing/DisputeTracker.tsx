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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Shield,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  Calendar,
  ChevronRight,
  Loader2,
  MessageSquare,
} from "lucide-react";

interface Dispute {
  id: string;
  chargeId: string;
  amount: number;
  currency: string;
  reason: string;
  status: string;
  statusDisplay: string;
  statusColor: string;
  created: string;
  evidenceDueBy: string | null;
  hasEvidence: boolean;
  submissionCount: number;
  description: string;
}

interface DisputeTrackerProps {
  className?: string;
}

const disputeReasonLabels: Record<string, string> = {
  bank_cannot_process: "Bank Cannot Process",
  credit_not_processed: "Credit Not Processed",
  customer_initiated: "Customer Initiated",
  debit_not_authorized: "Debit Not Authorized",
  duplicate: "Duplicate Transaction",
  fraudulent: "Fraudulent",
  general: "General",
  incorrect_account_details: "Incorrect Account Details",
  insufficient_funds: "Insufficient Funds",
  product_not_received: "Product Not Received",
  product_unacceptable: "Product Unacceptable",
  subscription_canceled: "Subscription Canceled",
  unrecognized: "Unrecognized",
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case "won":
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case "lost":
      return <XCircle className="h-5 w-5 text-red-500" />;
    case "needs_response":
    case "warning_needs_response":
      return <AlertTriangle className="h-5 w-5 text-orange-500" />;
    case "under_review":
      return <Clock className="h-5 w-5 text-blue-500" />;
    default:
      return <Shield className="h-5 w-5 text-gray-500" />;
  }
};

const getStatusBadgeVariant = (color: string) => {
  switch (color) {
    case "green":
      return "default";
    case "red":
      return "destructive";
    case "orange":
      return "secondary";
    case "blue":
      return "outline";
    default:
      return "outline";
  }
};

export default function DisputeTracker({ className }: DisputeTrackerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [evidenceDialogOpen, setEvidenceDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [evidenceForm, setEvidenceForm] = useState({
    productDescription: "",
    customerName: "",
    customerEmail: "",
    additionalInfo: "",
    submit: false,
  });

  const { data, isLoading } = useQuery<{ disputes: Dispute[] }>({
    queryKey: ["/api/billing/disputes"],
  });

  const disputes = data?.disputes || [];

  const handleOpenEvidence = (dispute: Dispute) => {
    setSelectedDispute(dispute);
    setEvidenceForm({
      productDescription: "",
      customerName: "",
      customerEmail: "",
      additionalInfo: "",
      submit: false,
    });
    setEvidenceDialogOpen(true);
  };

  const handleSubmitEvidence = async (submitFinal: boolean) => {
    if (!selectedDispute) return;

    setSubmitting(true);
    try {
      const response = await apiRequest(
        "POST",
        "/api/billing/dispute/evidence",
        {
          disputeId: selectedDispute.id,
          evidence: {
            product_description: evidenceForm.productDescription || undefined,
            customer_name: evidenceForm.customerName || undefined,
            customer_email_address: evidenceForm.customerEmail || undefined,
            uncategorized_text: evidenceForm.additionalInfo || undefined,
            submit: submitFinal,
          },
        },
      );

      const data = await response.json();

      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/billing/disputes"] });

        toast({
          title: submitFinal ? "Evidence Submitted" : "Evidence Saved",
          description: submitFinal
            ? "Your evidence has been submitted for review."
            : "Your evidence has been saved as a draft.",
        });

        if (submitFinal) {
          setEvidenceDialogOpen(false);
        }
      } else {
        throw data;
      }
    } catch (err) {
      const errorData = err.body || err;
      toast({
        title: "Submission Failed",
        description: errorData.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getDaysUntilDue = (dueDate: string) => {
    const diff = new Date(dueDate).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (disputes.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Disputes
          </CardTitle>
          <CardDescription>
            Track and respond to payment disputes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No disputes found</p>
            <p className="text-sm mt-1">
              You don't have any active or past disputes on your account.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Disputes
          </CardTitle>
          <CardDescription>
            Track and respond to payment disputes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {disputes.map((dispute) => {
            const daysUntilDue = dispute.evidenceDueBy
              ? getDaysUntilDue(dispute.evidenceDueBy)
              : null;
            const isUrgent =
              daysUntilDue !== null && daysUntilDue <= 3 && daysUntilDue > 0;
            const isExpired = daysUntilDue !== null && daysUntilDue <= 0;

            return (
              <div
                key={dispute.id}
                className={`border rounded-lg p-4 space-y-3 ${
                  isUrgent
                    ? "border-orange-500 bg-orange-50/50 dark:bg-orange-950/20"
                    : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(dispute.status)}
                    <div>
                      <p className="font-medium">{dispute.description}</p>
                      <p className="text-sm text-muted-foreground">
                        ${dispute.amount.toFixed(2)} •{" "}
                        {disputeReasonLabels[dispute.reason] || dispute.reason}
                      </p>
                    </div>
                  </div>
                  <Badge variant={getStatusBadgeVariant(dispute.statusColor)}>
                    {dispute.statusDisplay}
                  </Badge>
                </div>

                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>Opened {formatDate(dispute.created)}</span>
                  </div>
                  {dispute.evidenceDueBy && !isExpired && (
                    <div
                      className={`flex items-center gap-1 ${isUrgent ? "text-orange-600 font-medium" : ""}`}
                    >
                      <Clock className="h-4 w-4" />
                      <span>
                        Evidence due {formatDate(dispute.evidenceDueBy)}
                        {isUrgent &&
                          ` (${daysUntilDue} day${daysUntilDue !== 1 ? "s" : ""} left)`}
                      </span>
                    </div>
                  )}
                  {dispute.hasEvidence && (
                    <div className="flex items-center gap-1 text-green-600">
                      <FileText className="h-4 w-4" />
                      <span>Evidence submitted</span>
                    </div>
                  )}
                </div>

                {(dispute.status === "needs_response" ||
                  dispute.status === "warning_needs_response") && (
                  <Alert className={isUrgent ? "border-orange-500" : ""}>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {isUrgent
                        ? `Urgent: You have ${daysUntilDue} day${daysUntilDue !== 1 ? "s" : ""} to respond to this dispute.`
                        : "Action required: Please submit evidence to respond to this dispute."}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex gap-2">
                  {(dispute.status === "needs_response" ||
                    dispute.status === "warning_needs_response") && (
                    <Button
                      size="sm"
                      onClick={() => handleOpenEvidence(dispute)}
                    >
                      <MessageSquare className="h-4 w-4 mr-1" />
                      Submit Evidence
                    </Button>
                  )}
                  <Button size="sm" variant="outline">
                    <ChevronRight className="h-4 w-4 mr-1" />
                    View Details
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={evidenceDialogOpen} onOpenChange={setEvidenceDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Submit Dispute Evidence</DialogTitle>
            <DialogDescription>
              Provide evidence to support your case. Be thorough and include all
              relevant details.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedDispute?.evidenceDueBy && (
              <Alert>
                <Clock className="h-4 w-4" />
                <AlertDescription>
                  Evidence must be submitted by{" "}
                  {formatDate(selectedDispute.evidenceDueBy)}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="productDescription">
                Product/Service Description
              </Label>
              <Textarea
                id="productDescription"
                placeholder="Describe the product or service that was purchased..."
                value={evidenceForm.productDescription}
                onChange={(e) =>
                  setEvidenceForm((prev) => ({
                    ...prev,
                    productDescription: e.target.value,
                  }))
                }
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customerName">Customer Name</Label>
                <Input
                  id="customerName"
                  placeholder="Full name"
                  value={evidenceForm.customerName}
                  onChange={(e) =>
                    setEvidenceForm((prev) => ({
                      ...prev,
                      customerName: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerEmail">Customer Email</Label>
                <Input
                  id="customerEmail"
                  type="email"
                  placeholder="email@example.com"
                  value={evidenceForm.customerEmail}
                  onChange={(e) =>
                    setEvidenceForm((prev) => ({
                      ...prev,
                      customerEmail: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="additionalInfo">Additional Information</Label>
              <Textarea
                id="additionalInfo"
                placeholder="Include any other relevant details, such as communication history, delivery confirmation, etc..."
                value={evidenceForm.additionalInfo}
                onChange={(e) =>
                  setEvidenceForm((prev) => ({
                    ...prev,
                    additionalInfo: e.target.value,
                  }))
                }
                rows={4}
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleSubmitEvidence(false)}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Save Draft
            </Button>
            <Button
              onClick={() => handleSubmitEvidence(true)}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Submit Evidence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
