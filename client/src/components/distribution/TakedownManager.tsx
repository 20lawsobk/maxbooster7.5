// @ts-nocheck
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  displayDate,
  displayValue,
  extractDistributionRows,
  type DmcaStrikeRow,
  type RoyaltyDisputeRow,
} from "./takedownData";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Trash2,
  Search,
  AlertCircle,
  RefreshCw,
  Shield,
  AlertTriangle,
  Send,
  Flag,
  Scale,
  Upload,
  RotateCcw,
  Gavel,
} from "lucide-react";

const DISPUTE_REASONS = [
  { value: "fair_use", label: "Fair Use" },
  { value: "license", label: "Valid License" },
  { value: "original", label: "Original Work" },
  { value: "public_domain", label: "Public Domain" },
  { value: "permission", label: "Permission Granted" },
  { value: "other", label: "Other" },
];

export function TakedownManager() {
  const [activeTab, setActiveTab] = useState("takedowns");
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewDisputeOpen, setIsNewDisputeOpen] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<DmcaStrikeRow | null>(
    null,
  );
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newDispute, setNewDispute] = useState({
    claimId: "",
    reason: "original",
    explanation: "",
    supportingDocs: [] as string[],
  });

  const takedownsQuery = useQuery({
    queryKey: ["/api/distribution/takedowns"],
    select: (response: unknown) =>
      extractDistributionRows<DmcaStrikeRow>(response, "takedowns"),
  });

  const claimsQuery = useQuery({
    queryKey: ["/api/distribution/claims"],
    select: (response: unknown) =>
      extractDistributionRows<DmcaStrikeRow>(response, "claims"),
  });

  const disputesQuery = useQuery({
    queryKey: ["/api/distribution/disputes"],
    select: (response: unknown) =>
      extractDistributionRows<RoyaltyDisputeRow>(response, "disputes"),
  });

  const reinstatementsQuery = useQuery({
    queryKey: ["/api/distribution/reinstatements"],
    select: (response: unknown) =>
      extractDistributionRows<DmcaStrikeRow>(response, "reinstatements"),
  });

  const takedowns = takedownsQuery.data ?? [];
  const claims = claimsQuery.data ?? [];
  const disputes = disputesQuery.data ?? [];
  const reinstatements = reinstatementsQuery.data ?? [];

  const submitDisputeMutation = useMutation({
    mutationFn: async (data: typeof newDispute) => {
      const response = await apiRequest(
        "POST",
        "/api/distribution/disputes",
        data,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/distribution/disputes"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/distribution/claims"] });
      setIsNewDisputeOpen(false);
      toast({
        title: "Dispute Submitted",
        description: "Your dispute has been submitted for review",
      });
    },
    onError: () => {
      toast({
        title: "Submission Failed",
        description: "Unable to submit dispute",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    return (
      <Badge variant="outline">
        {displayValue(status).replace(/_/g, " ")}
      </Badge>
    );
  };

  const matchesSearch = (...values: unknown[]) => {
    const query = searchQuery.trim().toLowerCase();
    return (
      !query ||
      values.some(
        (value) =>
          value !== null &&
          value !== undefined &&
          String(value).toLowerCase().includes(query),
      )
    );
  };

  const renderQueryState = (query: any, label: string) => {
    if (query.isPending) {
      return (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <RefreshCw className="h-5 w-5 mx-auto mb-2 animate-spin" />
          Loading {label}…
        </div>
      );
    }

    if (query.isError) {
      const message =
        query.error instanceof Error
          ? query.error.message
          : `Unable to load ${label.toLowerCase()}.`;
      return (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{message}</span>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      );
    }

    return null;
  };

  const activeTakedowns = takedowns.length;
  const activeClaims = claims.length;
  const openDisputes = disputes.filter((d) => d.status === "open").length;
  const expiredStrikes = reinstatements.length;

  const countFor = (query: any, count: number) =>
    query.isPending ? "—" : query.isError ? "!" : count;

  const filteredTakedowns = takedowns.filter((takedown) =>
    matchesSearch(
      takedown.contentType,
      takedown.contentId,
      takedown.reason,
      takedown.createdAt,
      takedown.expiresAt,
    ),
  );
  const filteredClaims = claims.filter((claim) =>
    matchesSearch(
      claim.contentType,
      claim.contentId,
      claim.reason,
      claim.createdAt,
      claim.expiresAt,
    ),
  );
  const filteredDisputes = disputes.filter((dispute) =>
    matchesSearch(
      dispute.type,
      dispute.status,
      dispute.subject,
      dispute.description,
      dispute.amount,
      dispute.period,
      dispute.resolution,
      dispute.outcome,
      dispute.createdAt,
      dispute.updatedAt,
    ),
  );
  const filteredReinstatements = reinstatements.filter((reinstatement) =>
    matchesSearch(
      reinstatement.contentType,
      reinstatement.contentId,
      reinstatement.reason,
      reinstatement.createdAt,
      reinstatement.expiresAt,
    ),
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Takedown &amp; Rights Manager
            </CardTitle>
            <CardDescription>
              Review DMCA strikes, disputes, and content reinstatement history
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-500">
                {countFor(takedownsQuery, activeTakedowns)}
              </div>
              <p className="text-xs text-muted-foreground">Active Takedowns</p>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-500">
                {countFor(claimsQuery, activeClaims)}
              </div>
              <p className="text-xs text-muted-foreground">DMCA Claims / Strikes</p>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-500">
                {countFor(disputesQuery, openDisputes)}
              </div>
              <p className="text-xs text-muted-foreground">Open Disputes</p>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-500">
                {countFor(reinstatementsQuery, expiredStrikes)}
              </div>
              <p className="text-xs text-muted-foreground">
                Expired DMCA Strikes
              </p>
            </div>
          </Card>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search releases, claims, or disputes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="takedowns" className="gap-2">
              <Trash2 className="h-4 w-4" />
              Takedowns
            </TabsTrigger>
            <TabsTrigger value="claims" className="gap-2">
              <Flag className="h-4 w-4" />
              Claims
            </TabsTrigger>
            <TabsTrigger value="disputes" className="gap-2">
              <Scale className="h-4 w-4" />
              Disputes
            </TabsTrigger>
            <TabsTrigger value="reinstatements" className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Reinstatements
            </TabsTrigger>
          </TabsList>

          <TabsContent value="takedowns" className="space-y-4">
            {renderQueryState(takedownsQuery, "active takedowns") ||
              (filteredTakedowns.length > 0 ? (
                filteredTakedowns.map((takedown) => (
                  <Card key={takedown.id} className="p-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="font-medium">
                            {displayValue(takedown.contentId)}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {displayValue(takedown.contentType)}
                          </p>
                        </div>
                        <Badge variant="outline" className="gap-1 shrink-0">
                          <AlertTriangle className="h-3 w-3" />
                          Active DMCA strike
                        </Badge>
                      </div>

                      <div className="grid gap-2 text-sm sm:grid-cols-2">
                        <p>
                          <span className="text-muted-foreground">Reason: </span>
                          {displayValue(takedown.reason)}
                        </p>
                        <p>
                          <span className="text-muted-foreground">
                            Recorded:{" "}
                          </span>
                          {displayDate(takedown.createdAt)}
                        </p>
                        <p>
                          <span className="text-muted-foreground">
                            Expires:{" "}
                          </span>
                          {displayDate(takedown.expiresAt, "No expiry recorded")}
                        </p>
                        <p>
                          <span className="text-muted-foreground">Strike ID: </span>
                          {displayValue(takedown.id)}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Trash2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>
                    {searchQuery
                      ? "No active takedowns match your search"
                      : "No active takedowns"}
                  </p>
                </div>
              ))}
          </TabsContent>

          <TabsContent value="claims" className="space-y-4">
            {renderQueryState(claimsQuery, "DMCA claims") ||
              (filteredClaims.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Content</TableHead>
                      <TableHead>Content type</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Recorded</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClaims.map((claim) => (
                      <TableRow key={claim.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {displayValue(claim.contentId)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Strike ID: {displayValue(claim.id)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{displayValue(claim.contentType)}</TableCell>
                        <TableCell>{displayValue(claim.reason)}</TableCell>
                        <TableCell>{displayDate(claim.createdAt)}</TableCell>
                        <TableCell>
                          {displayDate(claim.expiresAt, "No expiry recorded")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedClaim(claim);
                              setNewDispute({ ...newDispute, claimId: claim.id });
                              setIsNewDisputeOpen(true);
                            }}
                          >
                            <Scale className="h-4 w-4 mr-2" />
                            Dispute
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Flag className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>
                    {searchQuery
                      ? "No DMCA claims match your search"
                      : "No DMCA claims"}
                  </p>
                </div>
              ))}
          </TabsContent>

          <TabsContent value="disputes" className="space-y-4">
            {renderQueryState(disputesQuery, "disputes") ||
              (filteredDisputes.length > 0 ? (
                filteredDisputes.map((dispute) => (
                  <Card key={dispute.id} className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="font-medium">
                            {displayValue(dispute.subject)}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Type: {displayValue(dispute.type)}
                          </p>
                        </div>
                        {getStatusBadge(dispute.status)}
                      </div>

                      <div className="bg-muted/50 p-3 rounded-lg space-y-2">
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {displayValue(dispute.description)}
                        </p>
                        <div className="grid gap-1 text-sm sm:grid-cols-2">
                          <p>
                            <span className="text-muted-foreground">
                              Evidence:{" "}
                            </span>
                            {displayValue(dispute.evidenceCount, "None recorded")}
                          </p>
                          <p>
                            <span className="text-muted-foreground">
                              Amount:{" "}
                            </span>
                            {displayValue(dispute.amount)}
                          </p>
                          <p>
                            <span className="text-muted-foreground">
                              Period:{" "}
                            </span>
                            {displayValue(dispute.period)}
                          </p>
                          <p>
                            <span className="text-muted-foreground">
                              Dispute ID:{" "}
                            </span>
                            {displayValue(dispute.id)}
                          </p>
                        </div>
                      </div>

                      {(dispute.resolution || dispute.outcome) && (
                        <Alert>
                          <Gavel className="h-4 w-4" />
                          <AlertDescription>
                            {dispute.resolution || dispute.outcome}
                          </AlertDescription>
                        </Alert>
                      )}

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          Created: {displayDate(dispute.createdAt)}
                        </span>
                        <span>
                          Updated: {displayDate(dispute.updatedAt)}
                        </span>
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Scale className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>
                    {searchQuery
                      ? "No disputes match your search"
                      : "No disputes"}
                  </p>
                </div>
              ))}
          </TabsContent>

          <TabsContent value="reinstatements" className="space-y-4">
            {renderQueryState(reinstatementsQuery, "reinstatement history") ||
              (filteredReinstatements.length > 0 ? (
                filteredReinstatements.map((reinstatement) => (
                  <Card key={reinstatement.id} className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="font-medium">
                            {displayValue(reinstatement.contentId)}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {displayValue(reinstatement.contentType)}
                          </p>
                        </div>
                        <Badge variant="outline" className="gap-1 shrink-0">
                          <RotateCcw className="h-3 w-3" />
                          Expired DMCA strike
                        </Badge>
                      </div>
                      <div className="grid gap-2 text-sm sm:grid-cols-2">
                        <p>
                          <span className="text-muted-foreground">Reason: </span>
                          {displayValue(reinstatement.reason)}
                        </p>
                        <p>
                          <span className="text-muted-foreground">
                            Recorded:{" "}
                          </span>
                          {displayDate(reinstatement.createdAt)}
                        </p>
                        <p>
                          <span className="text-muted-foreground">
                            Expired:{" "}
                          </span>
                          {displayDate(
                            reinstatement.expiresAt,
                            "No expiry recorded",
                          )}
                        </p>
                        <p>
                          <span className="text-muted-foreground">
                            Strike ID:{" "}
                          </span>
                          {displayValue(reinstatement.id)}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <RotateCcw className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>
                    {searchQuery
                      ? "No expired strikes match your search"
                      : "No expired strikes"}
                  </p>
                </div>
              ))}
          </TabsContent>
        </Tabs>

        <Dialog open={isNewDisputeOpen} onOpenChange={setIsNewDisputeOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Dispute Copyright Claim</DialogTitle>
              <DialogDescription>
                {selectedClaim
                  ? `Dispute DMCA strike for "${selectedClaim.contentId}"`
                  : "Submit a dispute for a DMCA claim"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Dispute Reason</Label>
                <Select
                  value={newDispute.reason}
                  onValueChange={(v) =>
                    setNewDispute({ ...newDispute, reason: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DISPUTE_REASONS.map((reason) => (
                      <SelectItem key={reason.value} value={reason.value}>
                        {reason.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Explanation</Label>
                <Textarea
                  placeholder="Explain why you believe this claim is incorrect..."
                  value={newDispute.explanation}
                  onChange={(e) =>
                    setNewDispute({
                      ...newDispute,
                      explanation: e.target.value,
                    })
                  }
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label>Supporting Documents</Label>
                <div className="border-2 border-dashed rounded-lg p-4 text-center">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Upload licenses, contracts, or other proof
                  </p>
                  <Button variant="outline" size="sm" className="mt-2">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Files
                  </Button>
                </div>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  False disputes may result in account penalties. Only submit if
                  you have legitimate rights to the content.
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsNewDisputeOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => submitDisputeMutation.mutate(newDispute)}
                disabled={
                  !newDispute.explanation || submitDisputeMutation.isPending
                }
              >
                {submitDisputeMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Submit Dispute
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </CardContent>
    </Card>
  );
}
