import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  FileText,
  Send,
  Users,
  PenTool,
  Ban,
  History,
} from "lucide-react";

export type ContractOutcome =
  | "template_selected"
  | "contract_drafted"
  | "contract_customization_saved"
  | "validation_passed"
  | "validation_errors"
  | "signature_requested"
  | "signature_pending"
  | "contract_signed"
  | "signature_declined"
  | "contract_executed"
  | "contract_list_loaded"
  | "contract_details_viewed"
  | "contract_amended"
  | "contract_terminated"
  | "split_percentages_defined"
  | "all_parties_agreed"
  | "payments_distributed"
  | "roles_credits_defined"
  | "ownership_shares_specified"
  | "rights_restrictions_set"
  | "preview_generated"
  | "pdf_downloaded"
  | "timeline_loaded"
  | "stats_loaded"
  | "partially_signed";

interface ContractOutcomeHandlerProps {
  outcome: ContractOutcome | null;
  details?: {
    contractId?: string;
    templateName?: string;
    partyName?: string;
    reason?: string;
    signedCount?: number;
    totalCount?: number;
    errors?: string[];
    warnings?: string[];
    splitTotal?: number;
    percentages?: Array<{ name: string; percentage: number }>;
  };
  onAcknowledge?: () => void;
}

const outcomeConfig: Record<
  ContractOutcome,
  {
    title: string;
    description: string;
    icon: React.ElementType;
    variant: "default" | "success" | "warning" | "destructive";
  }
> = {
  template_selected: {
    title: "Template Selected",
    description:
      "Contract template has been selected. Fill in the details to continue.",
    icon: FileText,
    variant: "default",
  },
  contract_drafted: {
    title: "Contract Drafted",
    description:
      "Your contract has been drafted with all parties. Review before sending.",
    icon: FileText,
    variant: "success",
  },
  contract_customization_saved: {
    title: "Changes Saved",
    description: "Your contract customizations have been saved.",
    icon: CheckCircle,
    variant: "success",
  },
  validation_passed: {
    title: "Validation Passed",
    description: "All contract terms are valid. Ready to send for signature.",
    icon: CheckCircle,
    variant: "success",
  },
  validation_errors: {
    title: "Validation Errors",
    description: "Please fix the following errors before proceeding.",
    icon: AlertTriangle,
    variant: "destructive",
  },
  signature_requested: {
    title: "Signature Requested",
    description: "Signature request emails have been sent to all parties.",
    icon: Send,
    variant: "success",
  },
  signature_pending: {
    title: "Awaiting Signatures",
    description: "Waiting for all parties to sign the contract.",
    icon: Clock,
    variant: "warning",
  },
  contract_signed: {
    title: "Contract Signed",
    description: "You have successfully signed the contract.",
    icon: PenTool,
    variant: "success",
  },
  signature_declined: {
    title: "Signature Declined",
    description: "A party has declined to sign the contract.",
    icon: XCircle,
    variant: "destructive",
  },
  contract_executed: {
    title: "Contract Executed",
    description: "All parties have signed. The contract is now active.",
    icon: CheckCircle,
    variant: "success",
  },
  contract_list_loaded: {
    title: "Contracts Loaded",
    description: "Your contracts have been loaded successfully.",
    icon: FileText,
    variant: "default",
  },
  contract_details_viewed: {
    title: "Contract Details",
    description: "Viewing contract details and signature status.",
    icon: FileText,
    variant: "default",
  },
  contract_amended: {
    title: "Contract Amended",
    description: "Contract amendment has been created and sent for approval.",
    icon: History,
    variant: "success",
  },
  contract_terminated: {
    title: "Contract Terminated",
    description: "The contract has been terminated.",
    icon: Ban,
    variant: "destructive",
  },
  split_percentages_defined: {
    title: "Splits Defined",
    description: "Royalty split percentages have been defined.",
    icon: Users,
    variant: "success",
  },
  all_parties_agreed: {
    title: "All Parties Agreed",
    description: "All parties have agreed to the split terms.",
    icon: CheckCircle,
    variant: "success",
  },
  payments_distributed: {
    title: "Payments Distributed",
    description:
      "Payments have been automatically distributed according to splits.",
    icon: CheckCircle,
    variant: "success",
  },
  roles_credits_defined: {
    title: "Roles & Credits Set",
    description: "Collaborator roles and credits have been defined.",
    icon: Users,
    variant: "success",
  },
  ownership_shares_specified: {
    title: "Ownership Specified",
    description: "Ownership shares have been specified for all parties.",
    icon: FileText,
    variant: "success",
  },
  rights_restrictions_set: {
    title: "Rights Configured",
    description: "Rights and restrictions have been set for the contract.",
    icon: FileText,
    variant: "success",
  },
  preview_generated: {
    title: "Preview Ready",
    description: "Contract preview has been generated.",
    icon: FileText,
    variant: "default",
  },
  pdf_downloaded: {
    title: "PDF Downloaded",
    description: "Contract PDF has been downloaded successfully.",
    icon: CheckCircle,
    variant: "success",
  },
  timeline_loaded: {
    title: "Timeline Loaded",
    description: "Contract activity timeline has been loaded.",
    icon: History,
    variant: "default",
  },
  stats_loaded: {
    title: "Stats Loaded",
    description: "Contract statistics have been loaded.",
    icon: FileText,
    variant: "default",
  },
  partially_signed: {
    title: "Partially Signed",
    description: "Some parties have signed. Waiting for remaining signatures.",
    icon: Clock,
    variant: "warning",
  },
};

export function ContractOutcomeHandler({
  outcome,
  details,
  onAcknowledge,
}: ContractOutcomeHandlerProps) {
  const { toast } = useToast();
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    if (outcome && outcome !== shown) {
      const config = outcomeConfig[outcome];

      let description = config.description;

      if (details?.errors && details.errors.length > 0) {
        description = details.errors.join(". ");
      }

      if (
        details?.signedCount !== undefined &&
        details?.totalCount !== undefined
      ) {
        description = `${details.signedCount} of ${details.totalCount} parties have signed.`;
      }

      if (details?.partyName && outcome === "signature_declined") {
        description = `${details.partyName} declined to sign. Reason: ${details.reason || "Not specified"}`;
      }

      if (
        details?.splitTotal !== undefined &&
        outcome === "split_percentages_defined"
      ) {
        description = `Splits total ${details.splitTotal}%. ${details.splitTotal === 100 ? "Valid!" : "Must equal 100%"}`;
      }

      toast({
        title: config.title,
        description,
        variant: config.variant === "destructive" ? "destructive" : "default",
      });

      setShown(outcome);
      onAcknowledge?.();
    }
  }, [outcome, details, shown, toast, onAcknowledge]);

  return null;
}

export function getOutcomeIcon(outcome: ContractOutcome): React.ElementType {
  return outcomeConfig[outcome]?.icon || FileText;
}

export function getOutcomeVariant(
  outcome: ContractOutcome,
): "default" | "success" | "warning" | "destructive" {
  return outcomeConfig[outcome]?.variant || "default";
}
