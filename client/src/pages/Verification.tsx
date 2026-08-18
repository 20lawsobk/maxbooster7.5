// @ts-nocheck
import { useState, useRef, useCallback, useEffect } from "react";
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
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  Upload,
  CheckCircle,
  AlertCircle,
  Clock,
  FileText,
  User,
  Building2,
  CreditCard,
  Loader2,
  X,
  Eye,
  Phone,
  Mail,
  RefreshCw,
  HelpCircle,
  ArrowRight,
} from "lucide-react";


interface DocumentChecklist {
  type: string;
  name: string;
  description: string;
  required: boolean;
  status: "not_uploaded" | "pending" | "approved" | "rejected";
  fileName?: string;
  rejectionReason?: string;
  uploadedAt?: string;
}

interface SupportContact {
  email: string;
  phone?: string;
  hours: string;
  responseTime: string;
}

interface VerificationStatus {
  status:
    | "not_started"
    | "pending"
    | "under_review"
    | "verified"
    | "rejected"
    | "expired";
  verificationId?: string;
  level?: string;
  verificationType?: "individual" | "business";
  infoSubmitted?: boolean;
  documentsRequired?: string[];
  documentsSubmitted?: string[];
  documentsPending?: string[];
  documentsRejected?: string[];
  documentsApproved?: string[];
  allDocumentsUploaded?: boolean;
  taxFormRequired?: boolean;
  taxFormSubmitted?: boolean;
  payoutEligible?: boolean;
  message?: string;
  estimatedReviewTime?: string;
  submittedAt?: string;
  reviewStartedAt?: string;
  rejectionReason?: string;
  resubmissionRequired?: boolean;
  documentChecklist?: DocumentChecklist[];
  supportContact?: SupportContact;
  nextSteps?: string[];
}

interface UploadedDocument {
  id: string;
  documentType: string;
  fileName: string;
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string;
}

interface IndividualInfo {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationality: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  taxIdNumber?: string;
}

interface BusinessInfo {
  businessName: string;
  businessType: string;
  businessRegistrationNumber: string;
  taxIdNumber: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export default function Verification() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [verificationType, setVerificationType] = useState<
    "individual" | "business"
  >("individual");
  const [step, setStep] = useState(1);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<
    Record<string, UploadedDocument>
  >({});

  const [individualInfo, setIndividualInfo] = useState<IndividualInfo>({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    nationality: "",
    address: "",
    city: "",
    state: "",
    postalCode: "",
    country: "US",
  });

  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>({
    businessName: "",
    businessType: "",
    businessRegistrationNumber: "",
    taxIdNumber: "",
    address: "",
    city: "",
    state: "",
    postalCode: "",
    country: "US",
  });

  const { data: status, isLoading } = useQuery<VerificationStatus>({
    queryKey: ["/api/kyc/status"],
    enabled: !!user,
  });

  const { data: existingDocs } = useQuery<{ documents: UploadedDocument[] }>({
    queryKey: ["/api/kyc/documents"],
    enabled: !!user && !!status?.verificationId,
  });

  useEffect(() => {
    if (!status || isLoading) return;

    if (status.verificationType) {
      setVerificationType(status.verificationType);
    }

    if (status.status === "not_started" || !status.verificationId) {
      setStep(1);
    } else if (status.status === "pending") {
      if (!status.infoSubmitted) {
        setStep(2);
      } else if (!status.allDocumentsUploaded) {
        setStep(3);
      } else {
        setStep(4);
      }
    } else if (
      status.status === "under_review" ||
      status.status === "verified"
    ) {
      setStep(4);
    } else if (status.status === "rejected") {
      setStep(1);
    }
  }, [status, isLoading]);

  const startVerificationMutation = useMutation({
    mutationFn: async (type: "individual" | "business") => {
      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch("/api/kyc/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ type, level: "enhanced" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start verification");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setVerificationId(data.verification.id);
      queryClient.invalidateQueries({ queryKey: ["/api/kyc/status"] });
      setStep(2);
      toast({
        title: "Verification started",
        description: "Please provide your information.",
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

  const submitInfoMutation = useMutation({
    mutationFn: async () => {
      const vId = verificationId || status?.verificationId;
      if (!vId) throw new Error("No verification in progress");

      const endpoint =
        verificationType === "individual"
          ? "/api/kyc/individual"
          : "/api/kyc/business";
      const data =
        verificationType === "individual"
          ? { verificationId: vId, ...individualInfo }
          : { verificationId: vId, ...businessInfo };

      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to submit information");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kyc/status"] });
      setStep(3);
      toast({
        title: "Information saved",
        description: "Please upload your documents.",
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

  const submitForReviewMutation = useMutation({
    mutationFn: async () => {
      const vId = verificationId || status?.verificationId;
      if (!vId) throw new Error("No verification in progress");

      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch("/api/kyc/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ verificationId: vId }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to submit for review");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kyc/status"] });
      setStep(4);
      toast({
        title: "Submitted for review",
        description:
          "Your verification is being reviewed. This typically takes 1-2 business days.",
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

  if (!user) {
    setLocation("/login");
    return null;
  }

  const currentVerificationId = verificationId || status?.verificationId;

  const getStatusBadge = () => {
    const s = status?.status || "not_started";
    const variants: Record<
      string,
      {
        variant: "default" | "secondary" | "destructive" | "outline";
        icon: React.ReactNode;
        label: string;
      }
    > = {
      not_started: {
        variant: "outline",
        icon: <Clock className="h-3 w-3" />,
        label: "Not Started",
      },
      pending: {
        variant: "secondary",
        icon: <Clock className="h-3 w-3" />,
        label: "Pending Documents",
      },
      under_review: {
        variant: "secondary",
        icon: <FileText className="h-3 w-3" />,
        label: "Under Review",
      },
      verified: {
        variant: "default",
        icon: <CheckCircle className="h-3 w-3" />,
        label: "Verified",
      },
      rejected: {
        variant: "destructive",
        icon: <AlertCircle className="h-3 w-3" />,
        label: "Rejected",
      },
      expired: {
        variant: "destructive",
        icon: <AlertCircle className="h-3 w-3" />,
        label: "Expired",
      },
    };
    const { variant, icon, label } = variants[s] || variants.not_started;
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        {icon}
        {label}
      </Badge>
    );
  };

  const calculateProgress = () => {
    if (!status || status.status === "not_started") return 0;
    if (status.status === "verified") return 100;

    const docsRequired = status.documentsRequired?.length || 3;
    const docsSubmitted = status.documentsSubmitted?.length || 0;
    const infoComplete = step >= 3 ? 1 : 0;

    const totalSteps = docsRequired + 2;
    const completedSteps =
      infoComplete + docsSubmitted + (status.status === "under_review" ? 1 : 0);

    return Math.min(Math.round((completedSteps / (totalSteps || 1)) * 100), 95);
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      );
    }

    if (status?.status === "verified") {
      return (
        <div className="max-w-2xl mx-auto">
          <Card className="border-green-500/50 bg-green-500/5">
            <CardHeader className="text-center">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <CardTitle className="text-2xl">Identity Verified</CardTitle>
              <CardDescription>
                Your identity has been verified. You can now receive payouts and
                access all platform features.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button onClick={() => setLocation("/dashboard")}>
                Return to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (status?.status === "under_review") {
      return (
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <Shield className="h-8 w-8 text-primary" />
                Identity Verification
              </h1>
            </div>
            {getStatusBadge()}
          </div>

          <Card className="border-blue-500/50 bg-blue-500/5">
            <CardHeader className="text-center">
              <FileText className="h-16 w-16 text-blue-500 mx-auto mb-4" />
              <CardTitle className="text-2xl">Under Review</CardTitle>
              <CardDescription className="text-base">
                {status.message || "Your verification is being reviewed."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Progress value={90} className="h-3" />

              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <Clock className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">Estimated Review Time</p>
                  <p className="text-lg font-bold text-primary">
                    {status.estimatedReviewTime || "1-2 business days"}
                  </p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <FileText className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">Documents Submitted</p>
                  <p className="text-lg font-bold text-primary">
                    {status.documentsSubmitted?.length || 0} of{" "}
                    {status.documentsRequired?.length || 0}
                  </p>
                </div>
              </div>

              {status.submittedAt && (
                <p className="text-sm text-center text-muted-foreground">
                  Submitted on{" "}
                  {new Date(status.submittedAt).toLocaleDateString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              )}

              <p className="text-sm text-center text-muted-foreground">
                We'll notify you by email once the review is complete.
              </p>

              <div className="flex justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => setLocation("/dashboard")}
                >
                  Return to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>

          {status.supportContact && (
            <SupportContactCard contact={status.supportContact} />
          )}
          <WhyVerifyCard />
        </div>
      );
    }

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Shield className="h-8 w-8 text-primary" />
              Identity Verification
            </h1>
            <p className="text-muted-foreground mt-1">
              Verify your identity to enable payouts and advanced features
            </p>
          </div>
          {getStatusBadge()}
        </div>

        {status.status === "rejected" && (
          <Card className="border-destructive bg-destructive/10">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Verification Rejected
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-destructive/10 rounded-lg">
                <p className="font-medium">Reason:</p>
                <p className="text-sm text-muted-foreground">
                  {status.rejectionReason ||
                    status.message ||
                    "No specific reason provided"}
                </p>
              </div>

              {status.documentsRejected &&
                status.documentsRejected.length > 0 && (
                  <div className="space-y-2">
                    <p className="font-medium text-sm">
                      Documents requiring resubmission:
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {status.documentChecklist
                        .filter((d) => d.status === "rejected")
                        .map((doc) => (
                          <li key={doc.type} className="flex items-start gap-2">
                            <RefreshCw className="h-4 w-4 mt-0.5 text-destructive flex-shrink-0" />
                            <span>
                              <strong>{doc.name}:</strong>{" "}
                              {doc.rejectionReason || "Needs resubmission"}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}

              {status.nextSteps && status.nextSteps.length > 0 && (
                <div className="space-y-2">
                  <p className="font-medium text-sm flex items-center gap-2">
                    <ArrowRight className="h-4 w-4" />
                    What to do next:
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1 ml-6">
                    {status.nextSteps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <Button
                  onClick={() => {
                    setStep(1);
                    startVerificationMutation.mutate(verificationType);
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Start New Verification
                </Button>
                {status.supportContact && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      window.open(`mailto:${status.supportContact.email}`)
                    }
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Contact Support
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {currentVerificationId && status.status !== "rejected" && (
          <Card>
            <CardHeader>
              <CardTitle>Verification Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <VerificationStepper currentStep={step} status={status} />
              <Progress value={calculateProgress()} className="h-3" />
              <div className="flex justify-between text-sm text-muted-foreground mt-2">
                <span>Step {step} of 4</span>
                <span>{calculateProgress()}% complete</span>
              </div>
              {status.nextSteps &&
                status.nextSteps.length > 0 &&
                status.status === "pending" && (
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm font-medium flex items-center gap-2 mb-2">
                      <ArrowRight className="h-4 w-4" />
                      Next Steps:
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
                      {status.nextSteps.map((nextStep, i) => (
                        <li key={i}>{nextStep}</li>
                      ))}
                    </ul>
                  </div>
                )}
            </CardContent>
          </Card>
        )}

        {(status.status === "not_started" || !currentVerificationId) &&
          step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Choose Verification Type</CardTitle>
                <CardDescription>
                  Select whether you're verifying as an individual artist or a
                  business entity
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Tabs
                  value={verificationType}
                  onValueChange={(v) =>
                    setVerificationType(v as "individual" | "business")
                  }
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger
                      value="individual"
                      className="flex items-center gap-2"
                    >
                      <User className="h-4 w-4" />
                      Individual
                    </TabsTrigger>
                    <TabsTrigger
                      value="business"
                      className="flex items-center gap-2"
                    >
                      <Building2 className="h-4 w-4" />
                      Business
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="individual" className="mt-4">
                    <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                      <h4 className="font-medium">Individual Verification</h4>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li className="flex items-center gap-2">
                          <FileText className="h-3 w-3" /> Government-issued
                          photo ID (passport, driver's license)
                        </li>
                        <li className="flex items-center gap-2">
                          <FileText className="h-3 w-3" /> Proof of address
                          (utility bill, bank statement)
                        </li>
                        <li className="flex items-center gap-2">
                          <FileText className="h-3 w-3" /> Selfie for facial
                          verification
                        </li>
                        <li className="flex items-center gap-2">
                          <FileText className="h-3 w-3" /> Tax information (W-9
                          for US residents)
                        </li>
                      </ul>
                    </div>
                  </TabsContent>
                  <TabsContent value="business" className="mt-4">
                    <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                      <h4 className="font-medium">Business Verification</h4>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li className="flex items-center gap-2">
                          <FileText className="h-3 w-3" /> Business registration
                          documents
                        </li>
                        <li className="flex items-center gap-2">
                          <FileText className="h-3 w-3" /> Articles of
                          incorporation
                        </li>
                        <li className="flex items-center gap-2">
                          <FileText className="h-3 w-3" /> Tax ID documentation
                          (EIN)
                        </li>
                        <li className="flex items-center gap-2">
                          <FileText className="h-3 w-3" /> Proof of business
                          address
                        </li>
                        <li className="flex items-center gap-2">
                          <FileText className="h-3 w-3" /> Authorized
                          representative ID
                        </li>
                      </ul>
                    </div>
                  </TabsContent>
                </Tabs>

                <Button
                  className="w-full"
                  onClick={() =>
                    startVerificationMutation.mutate(verificationType)
                  }
                  disabled={startVerificationMutation.isPending}
                >
                  {startVerificationMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    "Start Verification"
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

        {step === 2 && currentVerificationId && (
          <Card>
            <CardHeader>
              <CardTitle>
                {verificationType === "individual"
                  ? "Personal Information"
                  : "Business Information"}
              </CardTitle>
              <CardDescription>
                Please provide accurate information matching your official
                documents
              </CardDescription>
            </CardHeader>
            <CardContent>
              {verificationType === "individual" ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input
                      id="firstName"
                      value={individualInfo.firstName}
                      onChange={(e) =>
                        setIndividualInfo({
                          ...individualInfo,
                          firstName: e.target.value,
                        })
                      }
                      placeholder="John"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input
                      id="lastName"
                      value={individualInfo.lastName}
                      onChange={(e) =>
                        setIndividualInfo({
                          ...individualInfo,
                          lastName: e.target.value,
                        })
                      }
                      placeholder="Doe"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dob">Date of Birth *</Label>
                    <Input
                      id="dob"
                      type="date"
                      value={individualInfo.dateOfBirth}
                      onChange={(e) =>
                        setIndividualInfo({
                          ...individualInfo,
                          dateOfBirth: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nationality">Nationality *</Label>
                    <Input
                      id="nationality"
                      value={individualInfo.nationality}
                      onChange={(e) =>
                        setIndividualInfo({
                          ...individualInfo,
                          nationality: e.target.value,
                        })
                      }
                      placeholder="United States"
                      required
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="address">Street Address *</Label>
                    <Input
                      id="address"
                      value={individualInfo.address}
                      onChange={(e) =>
                        setIndividualInfo({
                          ...individualInfo,
                          address: e.target.value,
                        })
                      }
                      placeholder="123 Main St"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      value={individualInfo.city}
                      onChange={(e) =>
                        setIndividualInfo({
                          ...individualInfo,
                          city: e.target.value,
                        })
                      }
                      placeholder="Los Angeles"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State/Province *</Label>
                    <Input
                      id="state"
                      value={individualInfo.state}
                      onChange={(e) =>
                        setIndividualInfo({
                          ...individualInfo,
                          state: e.target.value,
                        })
                      }
                      placeholder="California"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postalCode">Postal Code *</Label>
                    <Input
                      id="postalCode"
                      value={individualInfo.postalCode}
                      onChange={(e) =>
                        setIndividualInfo({
                          ...individualInfo,
                          postalCode: e.target.value,
                        })
                      }
                      placeholder="90001"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Country *</Label>
                    <Select
                      value={individualInfo.country}
                      onValueChange={(v) =>
                        setIndividualInfo({ ...individualInfo, country: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="US">United States</SelectItem>
                        <SelectItem value="CA">Canada</SelectItem>
                        <SelectItem value="GB">United Kingdom</SelectItem>
                        <SelectItem value="DE">Germany</SelectItem>
                        <SelectItem value="FR">France</SelectItem>
                        <SelectItem value="AU">Australia</SelectItem>
                        <SelectItem value="JP">Japan</SelectItem>
                        <SelectItem value="BR">Brazil</SelectItem>
                        <SelectItem value="MX">Mexico</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="businessName">Business Name *</Label>
                    <Input
                      id="businessName"
                      value={businessInfo.businessName}
                      onChange={(e) =>
                        setBusinessInfo({
                          ...businessInfo,
                          businessName: e.target.value,
                        })
                      }
                      placeholder="Acme Records LLC"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="businessType">Business Type *</Label>
                    <Select
                      value={businessInfo.businessType}
                      onValueChange={(v) =>
                        setBusinessInfo({ ...businessInfo, businessType: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="llc">LLC</SelectItem>
                        <SelectItem value="corporation">Corporation</SelectItem>
                        <SelectItem value="partnership">Partnership</SelectItem>
                        <SelectItem value="sole_proprietorship">
                          Sole Proprietorship
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="regNumber">Registration Number *</Label>
                    <Input
                      id="regNumber"
                      value={businessInfo.businessRegistrationNumber}
                      onChange={(e) =>
                        setBusinessInfo({
                          ...businessInfo,
                          businessRegistrationNumber: e.target.value,
                        })
                      }
                      placeholder="12-3456789"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="taxId">Tax ID (EIN) *</Label>
                    <Input
                      id="taxId"
                      value={businessInfo.taxIdNumber}
                      onChange={(e) =>
                        setBusinessInfo({
                          ...businessInfo,
                          taxIdNumber: e.target.value,
                        })
                      }
                      placeholder="XX-XXXXXXX"
                      required
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="bizAddress">Business Address *</Label>
                    <Input
                      id="bizAddress"
                      value={businessInfo.address}
                      onChange={(e) =>
                        setBusinessInfo({
                          ...businessInfo,
                          address: e.target.value,
                        })
                      }
                      placeholder="456 Business Ave"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bizCity">City *</Label>
                    <Input
                      id="bizCity"
                      value={businessInfo.city}
                      onChange={(e) =>
                        setBusinessInfo({
                          ...businessInfo,
                          city: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bizState">State *</Label>
                    <Input
                      id="bizState"
                      value={businessInfo.state}
                      onChange={(e) =>
                        setBusinessInfo({
                          ...businessInfo,
                          state: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bizPostal">Postal Code *</Label>
                    <Input
                      id="bizPostal"
                      value={businessInfo.postalCode}
                      onChange={(e) =>
                        setBusinessInfo({
                          ...businessInfo,
                          postalCode: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bizCountry">Country *</Label>
                    <Select
                      value={businessInfo.country}
                      onValueChange={(v) =>
                        setBusinessInfo({ ...businessInfo, country: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="US">United States</SelectItem>
                        <SelectItem value="CA">Canada</SelectItem>
                        <SelectItem value="GB">United Kingdom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => submitInfoMutation.mutate()}
                  disabled={submitInfoMutation.isPending}
                >
                  {submitInfoMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save & Continue"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && currentVerificationId && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Document Upload
              </CardTitle>
              <CardDescription>
                Upload clear photos or scans of your documents. Accepted
                formats: JPG, PNG, PDF (max 10MB each)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                {verificationType === "individual" ? (
                  <>
                    <DocumentUploadCard
                      title="Government ID"
                      description="Passport, driver's license, or national ID"
                      type="government_id"
                      verificationId={currentVerificationId}
                      existingDoc={existingDocs?.documents?.find(
                        (d) => d.documentType === "government_id",
                      )}
                      onUploadComplete={(doc) =>
                        setUploadedDocs((prev) => ({
                          ...prev,
                          government_id: doc,
                        }))
                      }
                    />
                    <DocumentUploadCard
                      title="Proof of Address"
                      description="Utility bill or bank statement (last 3 months)"
                      type="proof_of_address"
                      verificationId={currentVerificationId}
                      existingDoc={existingDocs?.documents?.find(
                        (d) => d.documentType === "proof_of_address",
                      )}
                      onUploadComplete={(doc) =>
                        setUploadedDocs((prev) => ({
                          ...prev,
                          proof_of_address: doc,
                        }))
                      }
                    />
                    <DocumentUploadCard
                      title="Selfie Verification"
                      description="Take a clear selfie holding your ID next to your face"
                      type="selfie"
                      verificationId={currentVerificationId}
                      existingDoc={existingDocs?.documents?.find(
                        (d) => d.documentType === "selfie",
                      )}
                      onUploadComplete={(doc) =>
                        setUploadedDocs((prev) => ({ ...prev, selfie: doc }))
                      }
                    />
                  </>
                ) : (
                  <>
                    <DocumentUploadCard
                      title="Business Registration"
                      description="Certificate of incorporation or registration"
                      type="business_registration"
                      verificationId={currentVerificationId}
                      existingDoc={existingDocs?.documents?.find(
                        (d) => d.documentType === "business_registration",
                      )}
                      onUploadComplete={(doc) =>
                        setUploadedDocs((prev) => ({
                          ...prev,
                          business_registration: doc,
                        }))
                      }
                    />
                    <DocumentUploadCard
                      title="Tax ID Document"
                      description="EIN letter or equivalent"
                      type="tax_id_document"
                      verificationId={currentVerificationId}
                      existingDoc={existingDocs?.documents?.find(
                        (d) => d.documentType === "tax_id_document",
                      )}
                      onUploadComplete={(doc) =>
                        setUploadedDocs((prev) => ({
                          ...prev,
                          tax_id_document: doc,
                        }))
                      }
                    />
                    <DocumentUploadCard
                      title="Proof of Address"
                      description="Business utility bill or bank statement"
                      type="proof_of_address"
                      verificationId={currentVerificationId}
                      existingDoc={existingDocs?.documents?.find(
                        (d) => d.documentType === "proof_of_address",
                      )}
                      onUploadComplete={(doc) =>
                        setUploadedDocs((prev) => ({
                          ...prev,
                          proof_of_address: doc,
                        }))
                      }
                    />
                  </>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <Button variant="outline" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => submitForReviewMutation.mutate()}
                  disabled={
                    submitForReviewMutation.isPending ||
                    Object.keys(uploadedDocs).length === 0
                  }
                >
                  {submitForReviewMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit for Review"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 4 && (
          <Card className="border-blue-500/50 bg-blue-500/5">
            <CardHeader className="text-center">
              <FileText className="h-16 w-16 text-blue-500 mx-auto mb-4" />
              <CardTitle className="text-2xl">Verification Submitted</CardTitle>
              <CardDescription className="text-base">
                Your verification is being reviewed. This typically takes 1-2
                business days.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={90} className="h-3" />
              <p className="text-sm text-center text-muted-foreground">
                We'll notify you by email once the review is complete.
              </p>
              <div className="flex justify-center">
                <Button onClick={() => setLocation("/dashboard")}>
                  Return to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <WhyVerifyCard />
      </div>
    );
  };

  return <AppLayout>{renderContent()}</AppLayout>;
}

function WhyVerifyCard() {
  return (
    <Card className="bg-muted/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5" />
          Why Verify?
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            Enable instant payouts to your bank account
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            Access higher payout limits
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            Comply with financial regulations
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            Build trust with collaborators and buyers
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

function SupportContactCard({ contact }: { contact: SupportContact }) {
  return (
    <Card className="bg-muted/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <HelpCircle className="h-5 w-5" />
          Need Help?
        </CardTitle>
        <CardDescription>
          Our verification support team is here to assist you
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3">
          <div className="flex items-center gap-3 p-3 bg-background rounded-lg">
            <Mail className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Email Support</p>
              <a
                href={`mailto:${contact.email}`}
                className="text-sm text-primary hover:underline"
              >
                {contact.email}
              </a>
            </div>
          </div>
          {contact.phone && (
            <div className="flex items-center gap-3 p-3 bg-background rounded-lg">
              <Phone className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Phone Support</p>
                <a
                  href={`tel:${contact.phone}`}
                  className="text-sm text-primary hover:underline"
                >
                  {contact.phone}
                </a>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 p-3 bg-background rounded-lg">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Hours</p>
              <p className="text-sm text-muted-foreground">{contact.hours}</p>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Response time: {contact.responseTime}
        </p>
      </CardContent>
    </Card>
  );
}

function VerificationStepper({
  currentStep,
  status,
}: {
  currentStep: number;
  status?: VerificationStatus;
}) {
  const steps = [
    { id: 1, label: "Choose Type", icon: User },
    { id: 2, label: "Information", icon: FileText },
    { id: 3, label: "Documents", icon: Upload },
    { id: 4, label: "Review", icon: Shield },
  ];

  return (
    <div className="flex items-center justify-between mb-6">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isCompleted =
          currentStep > step.id || status?.status === "verified";
        const isCurrent = currentStep === step.id;

        return (
          <div key={step.id} className="flex items-center">
            <div
              className={`flex flex-col items-center ${index < steps.length - 1 ? "flex-1" : ""}`}
            >
              <div
                className={`
                w-10 h-10 rounded-full flex items-center justify-center transition-colors
                ${
                  isCompleted
                    ? "bg-green-500 text-white"
                    : isCurrent
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                }
              `}
              >
                {isCompleted ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </div>
              <span
                className={`text-xs mt-1 ${isCurrent ? "font-medium" : "text-muted-foreground"}`}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`h-0.5 flex-1 mx-2 ${currentStep > step.id ? "bg-green-500" : "bg-muted"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}


interface DocumentUploadCardProps {
  title: string;
  description: string;
  type: string;
  verificationId: string;
  existingDoc?: UploadedDocument;
  onUploadComplete: (doc: UploadedDocument) => void;
}

function DocumentUploadCard({
  title,
  description,
  type,
  verificationId,
  existingDoc,
  onUploadComplete,
}: DocumentUploadCardProps) {
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<UploadedDocument | null>(
    existingDoc || null,
  );
  const [error, setError] = useState<string | null>(null);
  const [errorSuggestion, setErrorSuggestion] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const createPreview = useCallback((file: File) => {
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else if (file.type === "application/pdf") {
      setPreview("pdf");
    }
  }, []);

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setError(null);
      setErrorSuggestion(null);

      if (file.size < 10 * 1024) {
        setError(
          "File is too small (minimum 10KB). The document may not be readable.",
        );
        setErrorSuggestion("Please upload a higher resolution document.");
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setError("File is too large (maximum 10MB).");
        setErrorSuggestion(
          "Try compressing the image or using a lower resolution scanner.",
        );
        return;
      }

      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/jpg",
        "application/pdf",
      ];
      if (!allowedTypes.includes(file.type)) {
        setError(`Invalid file format (${file.type}).`);
        setErrorSuggestion(
          "Convert your document to JPG, PNG, or PDF format before uploading.",
        );
        return;
      }

      createPreview(file);
      setUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("verificationId", verificationId);
        formData.append("documentType", type);

        const csrfToken = getCsrfTokenFromCookie();
        const res = await fetch("/api/kyc/documents/upload", {
          method: "POST",
          credentials: "include",
          headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to upload document");
        }

        const doc: UploadedDocument = {
          id: data.document.id,
          documentType: type,
          fileName: file.name,
          status: "pending",
        };

        setUploaded(doc);
        onUploadComplete(doc);
        toast({
          title: "Document uploaded",
          description: data.message || `${title} uploaded successfully.`,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to upload document";
        setError(message);
        setPreview(null);
        toast({
          title: "Upload failed",
          description: message,
          variant: "destructive",
        });
      } finally {
        setUploading(false);
      }
    },
    [verificationId, type, title, onUploadComplete, toast, createPreview],
  );

  const getStatusBadge = () => {
    if (!uploaded) return null;

    switch (uploaded.status) {
      case "approved":
        return <Badge className="bg-green-500">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="secondary">Pending Review</Badge>;
    }
  };

  return (
    <div
      className={`border rounded-lg p-4 transition-colors ${
        uploaded?.status === "approved"
          ? "border-green-500 bg-green-500/5"
          : uploaded?.status === "rejected"
            ? "border-destructive bg-destructive/5"
            : uploaded
              ? "border-primary/50 bg-primary/5"
              : "border-dashed hover:border-primary/50"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        {preview && uploaded && (
          <div className="flex-shrink-0">
            {preview === "pdf" ? (
              <div className="w-16 h-16 bg-muted rounded flex items-center justify-center">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
            ) : (
              <div
                className="relative w-16 h-16 rounded overflow-hidden cursor-pointer border hover:border-primary"
                onClick={() => setShowPreview(true)}
              >
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Eye className="h-4 w-4 text-white" />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium">{title}</h4>
            {getStatusBadge()}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
          {uploaded && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 truncate">
              <FileText className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{uploaded.fileName}</span>
            </p>
          )}
          {uploaded?.status === "rejected" && uploaded.rejectionReason && (
            <div className="mt-2 p-2 bg-destructive/10 rounded text-xs">
              <p className="text-destructive font-medium">
                Rejected: {uploaded.rejectionReason}
              </p>
              <p className="text-muted-foreground mt-1">
                Please upload a new document.
              </p>
            </div>
          )}
          {error && (
            <div className="mt-2 p-2 bg-destructive/10 rounded text-xs">
              <p className="text-destructive">{error}</p>
              {errorSuggestion && (
                <p className="text-muted-foreground mt-1">{errorSuggestion}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {uploaded?.status === "approved" ? (
            <div className="flex items-center gap-2">
              <CheckCircle className="h-6 w-6 text-green-500" />
            </div>
          ) : uploading ? (
            <div className="flex flex-col items-center gap-1">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">
                Uploading...
              </span>
            </div>
          ) : (
            <Button
              variant={uploaded ? "ghost" : "outline"}
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploaded?.status === "rejected" ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Re-upload
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  {uploaded ? "Replace" : "Upload"}
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {showPreview && preview && preview !== "pdf" && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setShowPreview(false)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img
              src={preview}
              alt="Document preview"
              className="max-w-full max-h-[90vh] rounded-lg"
            />
            <Button
              variant="secondary"
              size="sm"
              className="absolute top-2 right-2"
              onClick={() => setShowPreview(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}
