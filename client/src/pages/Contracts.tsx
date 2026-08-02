import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { FileText, Plus, Download, Send, CheckCircle, Clock, PenTool, Eye, Users, Filter, AlertTriangle, XCircle, Ban, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import {
  ContractOutcomeHandler,
  SignatureTimeline,
  ContractBuilder,
  TemplateBrowser,
  type ContractOutcome,
} from "@/components/contracts";

interface ContractTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  variables: string[];
  isPremium?: boolean;
}

interface ContractSignature {
  partyName: string;
  signedAt?: string;
  signatureHash?: string;
}

interface Contract {
  id: string;
  templateId: string;
  title: string;
  type: string;
  content: string;
  status:
    | "draft"
    | "pending_signature"
    | "partially_signed"
    | "fully_executed"
    | "voided"
    | "expired";
  createdAt: string;
  parties: Array<{ name: string; role: string; email?: string }>;
  signatures: ContractSignature[];
}

interface ContractStats {
  total: number;
  draft: number;
  pendingSignature: number;
  partiallySigned: number;
  fullyExecuted: number;
  voided: number;
  expired: number;
}

interface TimelineEvent {
  event: string;
  timestamp: string;
  actor?: string;
  details?: string;
}

export default function Contracts() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedTemplate, setSelectedTemplate] =
    useState<ContractTemplate | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [showDeclineDialog, setShowDeclineDialog] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(
    null,
  );
  const [previewContent, setPreviewContent] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [declineReason, setDeclineReason] = useState("");
  const [currentOutcome, setCurrentOutcome] = useState<ContractOutcome | null>(
    null,
  );
  const [outcomeDetails, _setOutcomeDetails] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [signStep, setSignStep] = useState<"pick" | "draw">("pick");
  const [signingAs, setSigningAs] = useState<string>("");
  const [pendingContracts, _setPendingContracts] = useState<Contract[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  const getCanvasPos = (
    canvas: HTMLCanvasElement,
    e: MouseEvent | TouchEvent,
  ) => {
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(Math.max(rect.height, 180) * dpr);
      ctx.scale(dpr, dpr);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  useEffect(() => {
    if (signStep === "draw") {
      setTimeout(setupCanvas, 50);
    }
  }, [signStep, setupCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || signStep !== "draw") return;
    const prevent = (e: Event) => e.preventDefault();
    canvas.addEventListener("touchstart", prevent, { passive: false });
    canvas.addEventListener("touchmove", prevent, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", prevent);
      canvas.removeEventListener("touchmove", prevent);
    };
  }, [signStep]);

  const startDraw = useCallback((e: MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    isDrawingRef.current = true;
    lastPosRef.current = getCanvasPos(canvas, e);
  }, []);

  const draw = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const ctx = canvas.getContext("2d");
    if (!ctx || !lastPosRef.current) return;
    const pos = getCanvasPos(canvas, e);
    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPosRef.current = pos;
  }, []);

  const stopDraw = useCallback(() => {
    isDrawingRef.current = false;
    lastPosRef.current = null;
  }, []);

  const clearCanvas = () => setupCanvas();

  const isCanvasEmpty = () => {
    const canvas = canvasRef.current;
    if (!canvas) return true;
    const ctx = canvas.getContext("2d");
    if (!ctx) return true;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return !data.some((v) => v !== 0);
  };

  const submitSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedContract || !signingAs) return;
    if (isCanvasEmpty()) {
      toast({
        title: "Signature required",
        description: "Please draw your signature before submitting.",
        variant: "destructive",
      });
      return;
    }
    const signatureDataUrl = canvas.toDataURL("image/png");
    signContractMutation.mutate({
      contractId: selectedContract.id,
      partyName: signingAs,
      signatureData: signatureDataUrl,
    });
  };

  const { data: templatesData } = useQuery<{
    templates: ContractTemplate[];
    categories: string[];
  }>({
    queryKey: ["/api/contracts/templates"],
    enabled: !!user,
  });

  const { data: contractsData, refetch: refetchContracts } = useQuery<{
    contracts: Contract[];
  }>({
    queryKey: ["/api/contracts/my-contracts"],
    enabled: !!user,
    staleTime: 0,
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
    retry: 2,
    retryDelay: 2000,
  });

  const { data: statsData } = useQuery<{ stats: ContractStats }>({
    queryKey: ["/api/contracts/stats/summary"],
    enabled: !!user,
  });

  const { data: timelineData } = useQuery<{ timeline: TimelineEvent[] }>({
    queryKey: ["/api/contracts", selectedContract?.id, "timeline"],
    enabled: !!selectedContract?.id && showDetailsDialog,
  });

  const { data: signatureStatusData } = useQuery<{
    total: number;
    signed: number;
    pending: number;
    signers: Array<{
      name: string;
      role: string;
      status: "signed" | "pending";
      signedAt?: string;
    }>;
    allSigned: boolean;
  }>({
    queryKey: ["/api/contracts", selectedContract?.id, "signature-status"],
    enabled: !!selectedContract?.id && showDetailsDialog,
  });

  const generateContractMutation = useMutation({
    mutationFn: async (variables: Record<string, any>) => {
      if (!selectedTemplate) throw new Error("No template selected");
      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch("/api/contracts/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ templateId: selectedTemplate.id, variables }),
      });
      if (!res.ok) throw new Error("Failed to generate contract");
      return res.json();
    },
    onSuccess: (newContract: Contract) => {
      queryClient.setQueryData<{ contracts: Contract[] }>(
        ["/api/contracts/my-contracts"],
        (old) => ({ contracts: [newContract, ...(old?.contracts ?? [])] }),
      );
      queryClient.invalidateQueries({
        queryKey: ["/api/contracts/stats/summary"],
      });
      setShowCreateDialog(false);
      setSelectedTemplate(null);
      setCurrentOutcome("contract_drafted");
      toast({
        title: "Contract created",
        description: "Your contract has been generated and saved as a draft.",
      });
      refetchContracts();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sendForSignatureMutation = useMutation({
    mutationFn: async (contractId: string) => {
      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch(
        `/api/contracts/${contractId}/send-for-signature`,
        {
          method: "POST",
          credentials: "include",
          headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
        },
      );
      if (!res.ok) throw new Error("Failed to send for signature");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/contracts/my-contracts"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/contracts/stats/summary"],
      });
      setCurrentOutcome("signature_requested");
      toast({
        title: "Signature requested",
        description: "The contract has been sent for signature.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const signContractMutation = useMutation({
    mutationFn: async ({
      contractId,
      partyName,
      signatureData,
    }: {
      contractId: string;
      partyName: string;
      signatureData: string;
    }) => {
      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch(`/api/contracts/${contractId}/sign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ partyName, signature: signatureData }),
      });
      if (!res.ok) throw new Error("Failed to sign contract");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/contracts/my-contracts"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/contracts/stats/summary"],
      });
      setShowSignDialog(false);
      setSignStep("pick");
      setSigningAs("");
      if (data.status === "fully_executed") {
        setCurrentOutcome("contract_executed");
      } else {
        setCurrentOutcome("contract_signed");
      }
      toast({
        title: "Contract signed",
        description: "Your signature has been recorded.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const declineSignatureMutation = useMutation({
    mutationFn: async ({
      contractId,
      partyName,
      reason,
    }: {
      contractId: string;
      partyName: string;
      reason: string;
    }) => {
      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch(`/api/contracts/${contractId}/decline`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ partyName, reason }),
      });
      if (!res.ok) throw new Error("Failed to decline signature");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/contracts/my-contracts"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/contracts/stats/summary"],
      });
      setShowDeclineDialog(false);
      setDeclineReason("");
      setCurrentOutcome("signature_declined");
      toast({
        title: "Signature declined",
        description: "The contract has been voided.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const voidContractMutation = useMutation({
    mutationFn: async (contractId: string) => {
      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch(`/api/contracts/${contractId}/void`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ reason: "Cancelled by user" }),
      });
      if (!res.ok) throw new Error("Failed to void contract");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/contracts/my-contracts"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/contracts/stats/summary"],
      });
      setShowDetailsDialog(false);
      setCurrentOutcome("contract_terminated");
      toast({
        title: "Contract voided",
        description: "The contract has been terminated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const downloadPDF = async (contractId: string) => {
    try {
      const res = await fetch(`/api/contracts/${contractId}/pdf`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to download PDF");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contract-${contractId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      setCurrentOutcome("pdf_downloaded");
      toast({
        title: "PDF downloaded",
        description: "Contract PDF has been downloaded.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const templates = templatesData?.templates || [];
  const categories = templatesData?.categories || [];
  const queryContracts = contractsData?.contracts || [];
  const pendingIds = new Set(queryContracts.map((c) => c.id));
  const contracts = [
    ...queryContracts,
    ...pendingContracts.filter((c) => !pendingIds.has(c.id)),
  ];
  const stats = statsData?.stats;

  const filteredContracts =
    filterStatus === "all"
      ? contracts
      : contracts.filter((c) => c.status === filterStatus);

  const getStatusBadge = (status: string) => {
    const variants: Record<
      string,
      {
        variant: "default" | "secondary" | "destructive" | "outline";
        label: string;
        icon: React.ElementType;
      }
    > = {
      draft: { variant: "outline", label: "Draft", icon: FileText },
      pending_signature: {
        variant: "secondary",
        label: "Awaiting Signature",
        icon: Clock,
      },
      partially_signed: {
        variant: "secondary",
        label: "Partially Signed",
        icon: PenTool,
      },
      fully_executed: {
        variant: "default",
        label: "Executed",
        icon: CheckCircle,
      },
      voided: { variant: "destructive", label: "Voided", icon: XCircle },
      expired: { variant: "outline", label: "Expired", icon: AlertTriangle },
    };
    const config = variants[status] || variants.draft;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const handleTemplateSelect = (template: ContractTemplate) => {
    setSelectedTemplate(template);
    setCurrentOutcome("template_selected");
  };

  if (!user) {
    setLocation("/login");
    return null;
  }

  return (
    <AppLayout>
      <ContractOutcomeHandler
        outcome={currentOutcome}
        details={outcomeDetails}
        onAcknowledge={() => setCurrentOutcome(null)}
      />

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              Contracts
            </h1>
            <p className="text-muted-foreground mt-1">
              Create, manage, and sign legal contracts for your music business
            </p>
          </div>
          <Dialog
            open={showCreateDialog}
            onOpenChange={(open) => {
              setShowCreateDialog(open);
              if (!open) setSelectedTemplate(null);
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Contract
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
              <DialogHeader>
                <DialogTitle>
                  {selectedTemplate
                    ? `Create ${selectedTemplate.name}`
                    : "Create New Contract"}
                </DialogTitle>
                <DialogDescription>
                  {selectedTemplate
                    ? "Fill in the contract details below"
                    : "Choose a template to get started"}
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="max-h-[70vh]">
                {!selectedTemplate ? (
                  <TemplateBrowser
                    templates={templates}
                    categories={categories}
                    onSelect={handleTemplateSelect}
                  />
                ) : (
                  <ContractBuilder
                    template={selectedTemplate}
                    onPreview={(content) => {
                      setPreviewContent(content);
                      setShowPreviewDialog(true);
                    }}
                    onSubmit={(variables) =>
                      generateContractMutation.mutate(variables)
                    }
                    isSubmitting={generateContractMutation.isPending}
                  />
                )}
              </ScrollArea>

              {selectedTemplate && (
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setSelectedTemplate(null)}
                  >
                    Back to Templates
                  </Button>
                </DialogFooter>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <Card className="p-3">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </Card>
            <Card className="p-3">
              <div className="text-2xl font-bold text-muted-foreground">
                {stats.draft}
              </div>
              <div className="text-xs text-muted-foreground">Drafts</div>
            </Card>
            <Card className="p-3">
              <div className="text-2xl font-bold text-amber-500">
                {stats.pendingSignature}
              </div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </Card>
            <Card className="p-3">
              <div className="text-2xl font-bold text-blue-500">
                {stats.partiallySigned}
              </div>
              <div className="text-xs text-muted-foreground">Partial</div>
            </Card>
            <Card className="p-3">
              <div className="text-2xl font-bold text-green-500">
                {stats.fullyExecuted}
              </div>
              <div className="text-xs text-muted-foreground">Active</div>
            </Card>
            <Card className="p-3">
              <div className="text-2xl font-bold text-red-500">
                {stats.voided}
              </div>
              <div className="text-xs text-muted-foreground">Voided</div>
            </Card>
            <Card className="p-3">
              <div className="text-2xl font-bold text-gray-500">
                {stats.expired}
              </div>
              <div className="text-xs text-muted-foreground">Expired</div>
            </Card>
          </div>
        )}

        <Tabs defaultValue="my-contracts" className="space-y-4">
          <TabsList>
            <TabsTrigger value="my-contracts">My Contracts</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="pending">
              Pending Signatures
              {stats && stats.pendingSignature > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {stats.pendingSignature}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="my-contracts" className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Contracts</SelectItem>
                    <SelectItem value="draft">Drafts</SelectItem>
                    <SelectItem value="pending_signature">Pending</SelectItem>
                    <SelectItem value="partially_signed">
                      Partially Signed
                    </SelectItem>
                    <SelectItem value="fully_executed">Executed</SelectItem>
                    <SelectItem value="voided">Voided</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <span className="text-sm text-muted-foreground">
                {filteredContracts.length} contract
                {filteredContracts.length !== 1 ? "s" : ""}
              </span>
            </div>

            {filteredContracts.length === 0 ? (
              <Card className="p-8 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium">No contracts yet</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Create your first contract using one of our templates
                </p>
                <Button
                  className="mt-4"
                  onClick={() => setShowCreateDialog(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Contract
                </Button>
              </Card>
            ) : (
              <div className="grid gap-4">
                {filteredContracts.map((contract) => (
                  <Card key={contract.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">
                          {contract.title}
                        </CardTitle>
                        {getStatusBadge(contract.status)}
                      </div>
                      <CardDescription>
                        Created{" "}
                        {contract.createdAt
                          ? format(new Date(contract.createdAt), "MMM d, yyyy")
                          : "—"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pb-3">
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>{contract.parties.length} parties</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {
                              contract.signatures.filter((s) => s.signedAt)
                                .length
                            }
                            /{contract.signatures.length} signed
                          </span>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedContract(contract);
                          setShowDetailsDialog(true);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadPDF(contract.id)}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        PDF
                      </Button>
                      {contract.status === "draft" && (
                        <Button
                          size="sm"
                          onClick={() =>
                            sendForSignatureMutation.mutate(contract.id)
                          }
                          disabled={sendForSignatureMutation.isPending}
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Send for Signature
                        </Button>
                      )}
                      {(contract.status === "pending_signature" ||
                        contract.status === "partially_signed") && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedContract(contract);
                            setShowSignDialog(true);
                          }}
                        >
                          <PenTool className="h-4 w-4 mr-1" />
                          Sign
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="templates" className="space-y-4">
            <TemplateBrowser
              templates={templates}
              categories={categories}
              onSelect={(template) => {
                setSelectedTemplate(template);
                setShowCreateDialog(true);
              }}
            />
          </TabsContent>

          <TabsContent value="pending" className="space-y-4">
            {contracts.filter(
              (c) =>
                c.status === "pending_signature" ||
                c.status === "partially_signed",
            ).length === 0 ? (
              <Card className="p-8 text-center">
                <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium">No pending signatures</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  All your contracts are up to date
                </p>
              </Card>
            ) : (
              <div className="grid gap-4">
                {contracts
                  .filter(
                    (c) =>
                      c.status === "pending_signature" ||
                      c.status === "partially_signed",
                  )
                  .map((contract) => (
                    <Card key={contract.id}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">
                            {contract.title}
                          </CardTitle>
                          {getStatusBadge(contract.status)}
                        </div>
                        <CardDescription>
                          Waiting for signatures
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {contract.signatures
                            .filter((s) => !s.signedAt)
                            .map((sig, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-2 text-sm"
                              >
                                <Clock className="h-4 w-4 text-amber-500" />
                                <span>{sig.partyName}</span>
                                <span className="text-muted-foreground">
                                  (pending)
                                </span>
                              </div>
                            ))}
                          {contract.signatures
                            .filter((s) => s.signedAt)
                            .map((sig, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-2 text-sm"
                              >
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <span>{sig.partyName}</span>
                                <span className="text-muted-foreground">
                                  (signed{" "}
                                  {sig.signedAt
                                    ? format(new Date(sig.signedAt), "MMM d")
                                    : "—"}
                                  )
                                </span>
                              </div>
                            ))}
                        </div>
                      </CardContent>
                      <CardFooter className="gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedContract(contract);
                            setShowSignDialog(true);
                          }}
                        >
                          <PenTool className="h-4 w-4 mr-1" />
                          Sign Now
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedContract(contract);
                            setShowDeclineDialog(true);
                          }}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Decline
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>{selectedContract?.title}</DialogTitle>
              <DialogDescription>
                Contract details and signature status
              </DialogDescription>
            </DialogHeader>

            {selectedContract && (
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        Contract Preview
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[300px] w-full rounded border p-4">
                        <pre className="text-xs whitespace-pre-wrap font-mono">
                          {selectedContract.content}
                        </pre>
                      </ScrollArea>
                    </CardContent>
                  </Card>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => downloadPDF(selectedContract.id)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download PDF
                    </Button>
                    {selectedContract.status !== "fully_executed" &&
                      selectedContract.status !== "voided" && (
                        <Button
                          variant="destructive"
                          className="flex-1"
                          onClick={() =>
                            voidContractMutation.mutate(selectedContract.id)
                          }
                        >
                          <Ban className="h-4 w-4 mr-2" />
                          Void Contract
                        </Button>
                      )}
                  </div>
                </div>

                <div>
                  <SignatureTimeline
                    signers={
                      signatureStatusData?.signers.map((s) => ({
                        ...s,
                        status: s.status as "signed" | "pending" | "declined",
                      })) ||
                      selectedContract.parties.map((p) => {
                        const sig = selectedContract.signatures.find(
                          (s) => s.partyName === p.name,
                        );
                        return {
                          name: p.name,
                          role: p.role,
                          status: sig.signedAt
                            ? ("signed" as const)
                            : ("pending" as const),
                          signedAt: sig.signedAt,
                        };
                      })
                    }
                    timeline={timelineData?.timeline || []}
                    showTimeline={true}
                  />
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
          <DialogContent className="max-w-3xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Contract Preview</DialogTitle>
              <DialogDescription>
                Review the contract content before creating
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[500px] w-full rounded border p-4">
              <pre className="text-sm whitespace-pre-wrap font-mono">
                {previewContent}
              </pre>
            </ScrollArea>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowPreviewDialog(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={showSignDialog}
          onOpenChange={(open) => {
            setShowSignDialog(open);
            if (!open) {
              setSignStep("pick");
              setSigningAs("");
            }
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PenTool className="h-5 w-5 text-primary" />
                {signStep === "pick" ? "Sign Contract" : "Draw Your Signature"}
              </DialogTitle>
              <DialogDescription>
                {signStep === "pick"
                  ? "Select which party you are signing as."
                  : "Draw your signature in the box below using your mouse or finger."}
              </DialogDescription>
            </DialogHeader>

            {selectedContract && signStep === "pick" && (
              <div className="space-y-4">
                <Card className="p-4 bg-muted/50">
                  <p className="font-medium">{selectedContract.title}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedContract.parties.length}{" "}
                    {selectedContract.parties.length === 1
                      ? "party"
                      : "parties"}{" "}
                    involved
                  </p>
                </Card>
                <p className="text-sm text-muted-foreground">
                  Who are you signing as?
                </p>
                {selectedContract.signatures.filter((s) => !s.signedAt).length >
                0 ? (
                  <div className="space-y-2">
                    {selectedContract.signatures
                      .filter((s) => !s.signedAt)
                      .map((sig, i) => (
                        <Button
                          key={i}
                          variant="outline"
                          className="w-full justify-start h-12"
                          onClick={() => {
                            setSigningAs(sig.partyName);
                            setSignStep("draw");
                          }}
                        >
                          <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                          <span className="font-medium">{sig.partyName}</span>
                        </Button>
                      ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Enter your name or role (e.g. Artist, Producer)"
                      value={signingAs}
                      onChange={(e) => setSigningAs(e.target.value)}
                    />
                    <Button
                      className="w-full"
                      disabled={!signingAs.trim()}
                      onClick={() => setSignStep("draw")}
                    >
                      Continue to Signature
                    </Button>
                  </div>
                )}
              </div>
            )}

            {selectedContract && signStep === "draw" && (
              <div className="space-y-4">
                <div className="text-sm text-center text-muted-foreground">
                  Signing as:{" "}
                  <span className="font-semibold text-foreground">
                    {signingAs}
                  </span>
                </div>
                <div className="relative rounded-lg border-2 border-dashed border-border bg-white overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    width={460}
                    height={180}
                    className="w-full touch-none cursor-crosshair"
                    onMouseDown={(e) => startDraw(e.nativeEvent)}
                    onMouseMove={(e) => draw(e.nativeEvent)}
                    onMouseUp={() => stopDraw()}
                    onMouseLeave={() => stopDraw()}
                    onTouchStart={(e) => startDraw(e.nativeEvent)}
                    onTouchMove={(e) => draw(e.nativeEvent)}
                    onTouchEnd={() => stopDraw()}
                  />
                  <p className="absolute bottom-2 right-3 text-xs text-muted-foreground pointer-events-none select-none">
                    Sign here
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearCanvas}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    Clear
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSignStep("pick")}
                    >
                      Back
                    </Button>
                    <Button
                      size="sm"
                      onClick={submitSignature}
                      disabled={signContractMutation.isPending}
                    >
                      {signContractMutation.isPending
                        ? "Signing..."
                        : "Submit Signature"}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  By submitting, you agree to all terms of this contract and
                  confirm this is your legal signature.
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={showDeclineDialog} onOpenChange={setShowDeclineDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Decline Signature</DialogTitle>
              <DialogDescription>
                Please provide a reason for declining to sign this contract.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="decline-reason">Reason</Label>
                <Textarea
                  id="decline-reason"
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Enter your reason for declining..."
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowDeclineDialog(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (selectedContract) {
                    const unsignedParty = selectedContract.signatures.find(
                      (s) => !s.signedAt,
                    );
                    if (unsignedParty) {
                      declineSignatureMutation.mutate({
                        contractId: selectedContract.id,
                        partyName: unsignedParty.partyName,
                        reason: declineReason,
                      });
                    }
                  }
                }}
                disabled={!declineReason || declineSignatureMutation.isPending}
              >
                Decline & Void Contract
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
