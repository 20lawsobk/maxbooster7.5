import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  MessageSquare,
  Upload,
  XCircle,
  ChevronRight,
  Loader2,
  Scale,
  Shield,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

export type DisputeType =
  | "earnings_mismatch"
  | "split_dispute"
  | "payout_issue"
  | "statement_error"
  | "other";
export type DisputeStatus =
  | "open"
  | "under_review"
  | "pending_evidence"
  | "resolved"
  | "closed";

export interface Dispute {
  id: string;
  type: DisputeType;
  status: DisputeStatus;
  subject: string;
  description: string;
  amount?: number;
  period?: string;
  createdAt: Date;
  updatedAt: Date;
  resolution?: string;
  outcome?: "approved" | "denied" | "partial";
  evidenceCount: number;
  messages: DisputeMessage[];
}

export interface DisputeMessage {
  id: string;
  sender: "user" | "support";
  content: string;
  timestamp: Date;
  attachments?: string[];
}

interface DisputeTrackerProps {
  disputes: Dispute[];
  isLoading?: boolean;
  onFileDispute: (data: {
    type: DisputeType;
    subject: string;
    description: string;
    amount?: number;
    period?: string;
  }) => Promise<void>;
  onSubmitEvidence: (
    disputeId: string,
    evidence: { description: string; files?: File[] },
  ) => Promise<void>;
  onSendMessage: (disputeId: string, message: string) => Promise<void>;
}

const DISPUTE_TYPES: Record<
  DisputeType,
  { label: string; description: string }
> = {
  earnings_mismatch: {
    label: "Earnings Mismatch",
    description: "Reported earnings dont match expected values",
  },
  split_dispute: {
    label: "Split Dispute",
    description: "Disagreement about royalty split percentages",
  },
  payout_issue: {
    label: "Payout Issue",
    description: "Problems with payout processing or amounts",
  },
  statement_error: {
    label: "Statement Error",
    description: "Incorrect information on royalty statements",
  },
  other: {
    label: "Other",
    description: "Other royalty-related issues",
  },
};

export function DisputeTracker({
  disputes,
  isLoading = false,
  onFileDispute,
  onSubmitEvidence,
  onSendMessage,
}: DisputeTrackerProps) {
  const [isFileDisputeOpen, setIsFileDisputeOpen] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [isEvidenceDialogOpen, setIsEvidenceDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [newDispute, setNewDispute] = useState({
    type: "" as DisputeType,
    subject: "",
    description: "",
    amount: "",
    period: "",
  });

  const [newEvidence, setNewEvidence] = useState({
    description: "",
    files: [] as File[],
  });

  const [newMessage, setNewMessage] = useState("");

  const getStatusBadge = (status: DisputeStatus) => {
    const badges: Record<
      DisputeStatus,
      { className: string; icon: React.ReactNode; label: string }
    > = {
      open: {
        className: "bg-blue-500/20 text-blue-500",
        icon: <AlertTriangle className="w-3 h-3" />,
        label: "Open",
      },
      under_review: {
        className: "bg-amber-500/20 text-amber-500",
        icon: <Clock className="w-3 h-3" />,
        label: "Under Review",
      },
      pending_evidence: {
        className: "bg-purple-500/20 text-purple-500",
        icon: <FileText className="w-3 h-3" />,
        label: "Pending Evidence",
      },
      resolved: {
        className: "bg-green-500/20 text-green-500",
        icon: <CheckCircle className="w-3 h-3" />,
        label: "Resolved",
      },
      closed: {
        className: "bg-muted text-muted-foreground",
        icon: <XCircle className="w-3 h-3" />,
        label: "Closed",
      },
    };

    const config = badges[status];
    return (
      <Badge className={`${config.className} flex items-center gap-1`}>
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  const getOutcomeBadge = (outcome?: string) => {
    if (!outcome) return null;
    const badges: Record<string, { className: string; label: string }> = {
      approved: {
        className: "bg-green-500/20 text-green-500",
        label: "Approved",
      },
      denied: { className: "bg-red-500/20 text-red-500", label: "Denied" },
      partial: {
        className: "bg-amber-500/20 text-amber-500",
        label: "Partially Approved",
      },
    };
    const config = badges[outcome] || badges.denied;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const getStatusProgress = (status: DisputeStatus) => {
    const steps = ["open", "under_review", "resolved"];
    const currentIndex = steps.indexOf(
      status === "pending_evidence" ? "under_review" : status,
    );
    return ((currentIndex + 1) / (steps.length || 1)) * 100;
  };

  const handleFileDispute = async () => {
    if (!newDispute.type || !newDispute.subject || !newDispute.description)
      return;

    setIsSubmitting(true);
    try {
      await onFileDispute({
        type: newDispute.type,
        subject: newDispute.subject,
        description: newDispute.description,
        amount: newDispute.amount ? parseFloat(newDispute.amount) : undefined,
        period: newDispute.period || undefined,
      });
      setIsFileDisputeOpen(false);
      setNewDispute({
        type: "" as DisputeType,
        subject: "",
        description: "",
        amount: "",
        period: "",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitEvidence = async () => {
    if (!selectedDispute || !newEvidence.description) return;

    setIsSubmitting(true);
    try {
      await onSubmitEvidence(selectedDispute.id, newEvidence);
      setIsEvidenceDialogOpen(false);
      setNewEvidence({ description: "", files: [] });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedDispute || !newMessage.trim()) return;

    setIsSubmitting(true);
    try {
      await onSendMessage(selectedDispute.id, newMessage);
      setNewMessage("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (isLoading) {
    return (
      <Card className="glassmorphism" data-testid="dispute-tracker-loading">
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="glassmorphism" data-testid="dispute-tracker">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Scale className="w-5 h-5" />
              Dispute Center
            </CardTitle>
            <Button
              onClick={() => setIsFileDisputeOpen(true)}
              data-testid="button-file-dispute"
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              File Dispute
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {disputes.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-12 text-muted-foreground"
              data-testid="no-disputes"
            >
              <Shield className="w-12 h-12 mb-4 opacity-50" />
              <p>No disputes filed</p>
              <p className="text-sm">All your royalties are in order</p>
            </div>
          ) : (
            <div className="space-y-3">
              {disputes.map((dispute) => (
                <div
                  key={dispute.id}
                  onClick={() => setSelectedDispute(dispute)}
                  className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                  data-testid={`dispute-item-${dispute.id}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {getStatusBadge(dispute.status)}
                        {getOutcomeBadge(dispute.outcome)}
                        <Badge variant="outline" className="text-xs">
                          {DISPUTE_TYPES[dispute.type].label}
                        </Badge>
                      </div>
                      <p className="font-medium">{dispute.subject}</p>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {dispute.description}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Filed: {formatDate(dispute.createdAt)}</span>
                        {dispute.amount && (
                          <span>Amount: ${dispute.amount.toFixed(2)}</span>
                        )}
                        {dispute.evidenceCount > 0 && (
                          <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            {dispute.evidenceCount} evidence
                          </span>
                        )}
                        {dispute.messages.length > 0 && (
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            {dispute.messages.length} messages
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>

                  {dispute.status !== "closed" &&
                    dispute.status !== "resolved" && (
                      <div className="mt-3 pt-3 border-t">
                        <Progress
                          value={getStatusProgress(dispute.status)}
                          className="h-1"
                        />
                      </div>
                    )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFileDisputeOpen} onOpenChange={setIsFileDisputeOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-file-dispute">
          <DialogHeader>
            <DialogTitle>File a Dispute</DialogTitle>
            <DialogDescription>
              Submit a dispute regarding your royalties. Well review and respond
              within 5 business days.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Dispute Type *</Label>
              <Select
                value={newDispute.type}
                onValueChange={(value: DisputeType) =>
                  setNewDispute({ ...newDispute, type: value })
                }
              >
                <SelectTrigger data-testid="select-dispute-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DISPUTE_TYPES).map(
                    ([key, { label, description }]) => (
                      <SelectItem key={key} value={key}>
                        <div>
                          <p>{label}</p>
                          <p className="text-xs text-muted-foreground">
                            {description}
                          </p>
                        </div>
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">Subject *</Label>
              <Input
                id="subject"
                placeholder="Brief description of the issue"
                value={newDispute.subject}
                onChange={(e) =>
                  setNewDispute({ ...newDispute, subject: e.target.value })
                }
                data-testid="input-dispute-subject"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                placeholder="Provide details about your dispute..."
                rows={4}
                value={newDispute.description}
                onChange={(e) =>
                  setNewDispute({ ...newDispute, description: e.target.value })
                }
                data-testid="input-dispute-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Disputed Amount ($)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newDispute.amount}
                  onChange={(e) =>
                    setNewDispute({ ...newDispute, amount: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="period">Period</Label>
                <Input
                  id="period"
                  placeholder="e.g., January 2026"
                  value={newDispute.period}
                  onChange={(e) =>
                    setNewDispute({ ...newDispute, period: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsFileDisputeOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleFileDispute}
              disabled={
                !newDispute.type ||
                !newDispute.subject ||
                !newDispute.description ||
                isSubmitting
              }
              data-testid="button-submit-dispute"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Dispute"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!selectedDispute}
        onOpenChange={() => setSelectedDispute(null)}
      >
        <DialogContent
          className="max-w-2xl max-h-[80vh] overflow-y-auto"
          data-testid="dialog-dispute-details"
        >
          {selectedDispute && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-2">
                  {getStatusBadge(selectedDispute.status)}
                  {getOutcomeBadge(selectedDispute.outcome)}
                </div>
                <DialogTitle>{selectedDispute.subject}</DialogTitle>
                <DialogDescription>
                  Filed on {formatDate(selectedDispute.createdAt)} |{" "}
                  {DISPUTE_TYPES[selectedDispute.type].label}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-muted/30">
                  <p className="text-sm">{selectedDispute.description}</p>
                  {selectedDispute.amount && (
                    <p className="mt-2 text-sm">
                      <strong>Disputed Amount:</strong> $
                      {selectedDispute.amount.toFixed(2)}
                    </p>
                  )}
                  {selectedDispute.period && (
                    <p className="text-sm">
                      <strong>Period:</strong> {selectedDispute.period}
                    </p>
                  )}
                </div>

                {selectedDispute.resolution && (
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="font-medium text-green-500 mb-1">
                      Resolution
                    </p>
                    <p className="text-sm">{selectedDispute.resolution}</p>
                  </div>
                )}

                {selectedDispute.messages.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium">Messages</h4>
                    {selectedDispute.messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`p-3 rounded-lg ${
                          msg.sender === "user"
                            ? "bg-primary/10 ml-8"
                            : "bg-muted/30 mr-8"
                        }`}
                      >
                        <p className="text-sm">{msg.content}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(msg.timestamp)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {selectedDispute.status !== "resolved" &&
                  selectedDispute.status !== "closed" && (
                    <div className="space-y-3 pt-4 border-t">
                      <div className="flex gap-2">
                        <Textarea
                          placeholder="Type a message..."
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          rows={2}
                          className="flex-1"
                        />
                        <div className="flex flex-col gap-2">
                          <Button
                            size="sm"
                            onClick={handleSendMessage}
                            disabled={!newMessage.trim() || isSubmitting}
                          >
                            <MessageSquare className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setIsEvidenceDialogOpen(true)}
                          >
                            <Upload className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={isEvidenceDialogOpen}
        onOpenChange={setIsEvidenceDialogOpen}
      >
        <DialogContent data-testid="dialog-submit-evidence">
          <DialogHeader>
            <DialogTitle>Submit Evidence</DialogTitle>
            <DialogDescription>
              Provide supporting documents or information for your dispute.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="evidenceDescription">Description *</Label>
              <Textarea
                id="evidenceDescription"
                placeholder="Describe the evidence you're submitting..."
                rows={3}
                value={newEvidence.description}
                onChange={(e) =>
                  setNewEvidence({
                    ...newEvidence,
                    description: e.target.value,
                  })
                }
                data-testid="input-evidence-description"
              />
            </div>

            <div className="space-y-2">
              <Label>Attachments</Label>
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drag and drop files here, or click to browse
                </p>
                <Input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      setNewEvidence({
                        ...newEvidence,
                        files: Array.from(e.target.files),
                      });
                    }
                  }}
                />
              </div>
              {newEvidence.files.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {newEvidence.files.length} file(s) selected
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEvidenceDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitEvidence}
              disabled={!newEvidence.description || isSubmitting}
              data-testid="button-submit-evidence"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Evidence"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
