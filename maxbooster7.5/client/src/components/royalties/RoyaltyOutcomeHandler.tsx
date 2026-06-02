import { useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle,
  XCircle,
  Clock,
  Mail,
  AlertTriangle,
  DollarSign,
  FileText,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  Banknote,
  Receipt,
} from "lucide-react";

export type RoyaltyOutcomeType =
  | "split_created"
  | "split_invitation_sent"
  | "split_accepted"
  | "split_declined"
  | "split_validation_error"
  | "payout_requested"
  | "payout_processing"
  | "payout_completed"
  | "payout_failed_kyc"
  | "payout_failed_minimum"
  | "payout_failed_bank_error"
  | "instant_payout_fee"
  | "tax_form_required"
  | "tax_form_submitted"
  | "tax_form_approved"
  | "tax_form_rejected"
  | "tax_withholding_calculated"
  | "statement_generated"
  | "statement_downloaded"
  | "statement_period_selected"
  | "no_earnings_period"
  | "dispute_filed"
  | "dispute_evidence_submitted"
  | "dispute_resolved";

export interface RoyaltyOutcome {
  type: RoyaltyOutcomeType;
  data?: Record<string, unknown>;
}

const outcomeConfig: Record<
  RoyaltyOutcomeType,
  {
    title: string;
    description: (data?: Record<string, unknown>) => string;
    variant: "default" | "destructive";
    icon: React.ReactNode;
  }
> = {
  split_created: {
    title: "Split Created Successfully",
    description: (data) =>
      `Royalty split for "${data?.releaseName || "release"}" has been created.`,
    variant: "default",
    icon: <CheckCircle className="w-5 h-5 text-green-500" />,
  },
  split_invitation_sent: {
    title: "Invitation Sent",
    description: (data) =>
      `Invitation sent to ${data?.email || "collaborator"} for split participation.`,
    variant: "default",
    icon: <Mail className="w-5 h-5 text-blue-500" />,
  },
  split_accepted: {
    title: "Split Accepted",
    description: (data) =>
      `${data?.collaboratorName || "Collaborator"} has accepted the royalty split.`,
    variant: "default",
    icon: <CheckCircle className="w-5 h-5 text-green-500" />,
  },
  split_declined: {
    title: "Split Declined",
    description: (data) =>
      `${data?.collaboratorName || "Collaborator"} has declined the royalty split invitation.`,
    variant: "destructive",
    icon: <XCircle className="w-5 h-5 text-red-500" />,
  },
  split_validation_error: {
    title: "Split Validation Error",
    description: (data) =>
      `Split percentages must total 100%. Current total: ${data?.total || 0}%`,
    variant: "destructive",
    icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
  },
  payout_requested: {
    title: "Payout Requested",
    description: (data) =>
      `Payout of $${((data?.amount as number) || 0).toFixed(2)} has been requested. Confirmation: ${data?.confirmationId || "pending"}`,
    variant: "default",
    icon: <DollarSign className="w-5 h-5 text-green-500" />,
  },
  payout_processing: {
    title: "Payout Processing",
    description: (data) =>
      `Your payout is being processed. Status: ${data?.status || "in progress"}`,
    variant: "default",
    icon: <Clock className="w-5 h-5 text-blue-500" />,
  },
  payout_completed: {
    title: "Payout Completed",
    description: (data) =>
      `Payout of $${((data?.amount as number) || 0).toFixed(2)} completed. Transaction ID: ${data?.transactionId || "N/A"}`,
    variant: "default",
    icon: <CheckCircle className="w-5 h-5 text-green-500" />,
  },
  payout_failed_kyc: {
    title: "Payout Failed - KYC Required",
    description: () =>
      "Please complete identity verification (KYC) before requesting payouts.",
    variant: "destructive",
    icon: <ShieldCheck className="w-5 h-5 text-red-500" />,
  },
  payout_failed_minimum: {
    title: "Payout Failed - Below Minimum",
    description: (data) =>
      `Minimum payout amount is $${data?.minimum || 50}. Current balance: $${((data?.balance as number) || 0).toFixed(2)}`,
    variant: "destructive",
    icon: <AlertCircle className="w-5 h-5 text-amber-500" />,
  },
  payout_failed_bank_error: {
    title: "Payout Failed - Bank Error",
    description: (data) =>
      `Bank rejected the transfer: ${data?.reason || "Unknown error"}. Please verify your bank details.`,
    variant: "destructive",
    icon: <Banknote className="w-5 h-5 text-red-500" />,
  },
  instant_payout_fee: {
    title: "Instant Payout Fee",
    description: (data) =>
      `Instant payout fee: $${((data?.fee as number) || 0).toFixed(2)} (${data?.percentage || 1.5}%). You will receive: $${((data?.netAmount as number) || 0).toFixed(2)}`,
    variant: "default",
    icon: <TrendingUp className="w-5 h-5 text-purple-500" />,
  },
  tax_form_required: {
    title: "Tax Form Required",
    description: (data) =>
      `Please complete your ${data?.formType || "W-9"} form to receive payouts.`,
    variant: "destructive",
    icon: <FileText className="w-5 h-5 text-amber-500" />,
  },
  tax_form_submitted: {
    title: "Tax Form Submitted",
    description: (data) =>
      `Your ${data?.formType || "tax form"} has been submitted for review.`,
    variant: "default",
    icon: <Clock className="w-5 h-5 text-blue-500" />,
  },
  tax_form_approved: {
    title: "Tax Form Approved",
    description: (data) =>
      `Your ${data?.formType || "tax form"} has been approved. You can now receive payouts.`,
    variant: "default",
    icon: <CheckCircle className="w-5 h-5 text-green-500" />,
  },
  tax_form_rejected: {
    title: "Tax Form Rejected",
    description: (data) =>
      `Your tax form was rejected. Reason: ${data?.reason || "Missing or incorrect information"}`,
    variant: "destructive",
    icon: <XCircle className="w-5 h-5 text-red-500" />,
  },
  tax_withholding_calculated: {
    title: "Tax Withholding Calculated",
    description: (data) =>
      `Withholding rate: ${data?.rate || 0}% ($${((data?.amount as number) || 0).toFixed(2)}). ${data?.treatyApplied ? "Treaty benefits applied." : ""}`,
    variant: "default",
    icon: <Receipt className="w-5 h-5 text-blue-500" />,
  },
  statement_generated: {
    title: "Statement Generated",
    description: (data) =>
      `Statement for ${data?.period || "the selected period"} has been generated.`,
    variant: "default",
    icon: <FileText className="w-5 h-5 text-green-500" />,
  },
  statement_downloaded: {
    title: "Statement Downloaded",
    description: (data) =>
      `Statement for ${data?.period || "the selected period"} is downloading.`,
    variant: "default",
    icon: <CheckCircle className="w-5 h-5 text-green-500" />,
  },
  statement_period_selected: {
    title: "Period Selected",
    description: (data) =>
      `Showing data for ${data?.startDate || "start"} to ${data?.endDate || "end"}.`,
    variant: "default",
    icon: <Clock className="w-5 h-5 text-blue-500" />,
  },
  no_earnings_period: {
    title: "No Earnings in Period",
    description: (data) =>
      `No earnings recorded for ${data?.period || "the selected period"}.`,
    variant: "default",
    icon: <AlertCircle className="w-5 h-5 text-amber-500" />,
  },
  dispute_filed: {
    title: "Dispute Filed",
    description: (data) =>
      `Dispute #${data?.disputeId || "N/A"} has been filed. We will review within ${data?.reviewDays || 5} business days.`,
    variant: "default",
    icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
  },
  dispute_evidence_submitted: {
    title: "Evidence Submitted",
    description: (data) =>
      `Evidence for dispute #${data?.disputeId || "N/A"} has been submitted successfully.`,
    variant: "default",
    icon: <CheckCircle className="w-5 h-5 text-green-500" />,
  },
  dispute_resolved: {
    title: "Dispute Resolved",
    description: (data) =>
      `Dispute #${data?.disputeId || "N/A"} has been resolved. Outcome: ${data?.outcome || "settled"}`,
    variant: "default",
    icon: <CheckCircle className="w-5 h-5 text-green-500" />,
  },
};

interface RoyaltyOutcomeHandlerProps {
  outcome?: RoyaltyOutcome | null;
  onOutcomeHandled?: () => void;
}

export function RoyaltyOutcomeHandler({
  outcome,
  onOutcomeHandled,
}: RoyaltyOutcomeHandlerProps) {
  const { toast } = useToast();

  const handleOutcome = useCallback(
    (outcome: RoyaltyOutcome) => {
      const config = outcomeConfig[outcome.type];
      if (!config) return;

      toast({
        title: config.title,
        description: config.description(outcome.data),
        variant: config.variant,
      });

      onOutcomeHandled?.();
    },
    [toast, onOutcomeHandled],
  );

  useEffect(() => {
    if (outcome) {
      handleOutcome(outcome);
    }
  }, [outcome, handleOutcome]);

  return null;
}

export function useRoyaltyOutcome() {
  const { toast } = useToast();

  const showOutcome = useCallback(
    (type: RoyaltyOutcomeType, data?: Record<string, unknown>) => {
      const config = outcomeConfig[type];
      if (!config) return;

      toast({
        title: config.title,
        description: config.description(data),
        variant: config.variant,
      });
    },
    [toast],
  );

  return { showOutcome };
}
