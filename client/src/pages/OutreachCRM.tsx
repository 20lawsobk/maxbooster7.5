// @ts-nocheck
/**
 * Outreach CRM Page
 *
 * Track pitch campaigns from draft → sent → opened → replied → added/declined.
 * Includes AI pitch writer powered by the awareness layer + MaxCore.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowRight,
  Bell,
  CheckCircle,
  ChevronDown,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useRequireSubscription } from "@/hooks/useRequireAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  campaignType: string;
  status: string;
  totalPitches: number;
  openCount: number;
  replyCount: number;
  placementCount: number;
  notes?: string;
  createdAt: string;
}

interface Pitch {
  id: string;
  campaignId: string;
  recipientName: string;
  recipientEmail?: string;
  recipientUrl?: string;
  status: string;
  pitchBody?: string;
  followUpAt?: string;
  sentAt?: string;
  notes?: string;
  createdAt: string;
}

// ─── Status colors + labels ───────────────────────────────────────────────────

const STATUS_META: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  draft: {
    label: "Draft",
    color: "bg-muted text-muted-foreground",
    icon: <Pencil className="w-3 h-3" />,
  },
  sent: {
    label: "Sent",
    color: "bg-blue-500/20 text-blue-400",
    icon: <Send className="w-3 h-3" />,
  },
  opened: {
    label: "Opened",
    color: "bg-yellow-500/20 text-yellow-400",
    icon: <MailOpen className="w-3 h-3" />,
  },
  replied: {
    label: "Replied",
    color: "bg-purple-500/20 text-purple-400",
    icon: <MessageSquare className="w-3 h-3" />,
  },
  added: {
    label: "Added ✓",
    color: "bg-green-500/20 text-green-400",
    icon: <CheckCircle className="w-3 h-3" />,
  },
  declined: {
    label: "Declined",
    color: "bg-red-500/20 text-red-400",
    icon: <X className="w-3 h-3" />,
  },
  no_response: {
    label: "No Response",
    color: "bg-muted text-muted-foreground",
    icon: <Bell className="w-3 h-3" />,
  },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.draft;
  return (
    <Badge className={`text-xs flex items-center gap-1 ${meta.color}`}>
      {meta.icon}
      {meta.label}
    </Badge>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OutreachCRM() {
  useRequireSubscription();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const [createPitchOpen, setCreatePitchOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generatedPitch, setGeneratedPitch] = useState("");

  // Campaign form state
  const [campaignName, setCampaignName] = useState("");
  const [campaignType, setCampaignType] = useState("playlist");

  // Pitch form state
  const [pitchRecipient, setPitchRecipient] = useState("");
  const [pitchEmail, setPitchEmail] = useState("");
  const [pitchBody, setPitchBody] = useState("");

  // AI generate form
  const [genTrack, setGenTrack] = useState("");
  const [genGenre, setGenGenre] = useState("");
  const [genArtist, setGenArtist] = useState("");

  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<
    Campaign[]
  >({
    queryKey: ["outreach-campaigns"],
    queryFn: () =>
      apiRequest("GET", "/api/outreach/campaigns").then((r) => r.json()),
  });

  const { data: pitches = [], isLoading: pitchesLoading } = useQuery<Pitch[]>({
    queryKey: ["outreach-pitches", selectedCampaign?.id],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/outreach/campaigns/${selectedCampaign!.id}/pitches`,
      ).then((r) => r.json()),
    enabled: !!selectedCampaign,
  });

  const { data: followUps = [] } = useQuery<Pitch[]>({
    queryKey: ["outreach-followups"],
    queryFn: () =>
      apiRequest("GET", "/api/outreach/follow-ups").then((r) => r.json()),
  });

  const createCampaign = useMutation({
    mutationFn: (data: object) =>
      apiRequest("POST", "/api/outreach/campaigns", data).then((r) => r.json()),
    onSuccess: (campaign) => {
      qc.invalidateQueries({ queryKey: ["outreach-campaigns"] });
      setCreateCampaignOpen(false);
      setCampaignName("");
      setSelectedCampaign(campaign);
      toast({ title: "Campaign created" });
    },
    onError: () =>
      toast({ title: "Failed to create campaign", variant: "destructive" }),
  });

  const createPitch = useMutation({
    mutationFn: (data: object) =>
      apiRequest(
        "POST",
        `/api/outreach/campaigns/${selectedCampaign!.id}/pitches`,
        data,
      ).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach-pitches", selectedCampaign?.id] });
      qc.invalidateQueries({ queryKey: ["outreach-campaigns"] });
      setCreatePitchOpen(false);
      setPitchRecipient("");
      setPitchEmail("");
      setPitchBody("");
      toast({ title: "Pitch added" });
    },
    onError: () =>
      toast({ title: "Failed to add pitch", variant: "destructive" }),
  });

  const updatePitch = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & object) =>
      apiRequest("PATCH", `/api/outreach/pitches/${id}`, data).then((r) =>
        r.json(),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach-pitches", selectedCampaign?.id] });
      qc.invalidateQueries({ queryKey: ["outreach-campaigns"] });
    },
    onError: () =>
      toast({ title: "Failed to update pitch", variant: "destructive" }),
  });

  const generatePitch = useMutation({
    mutationFn: (data: object) =>
      apiRequest("POST", "/api/outreach/generate-pitch", data).then((r) =>
        r.json(),
      ),
    onSuccess: (result) => {
      setGeneratedPitch(result.pitchBody ?? "");
      toast({
        title: result.trendContextUsed
          ? "✨ Pitch generated using live industry data"
          : "Pitch generated",
      });
    },
    onError: () =>
      toast({ title: "Failed to generate pitch", variant: "destructive" }),
  });

  const NEXT_STATUS: Record<string, string> = {
    draft: "sent",
    sent: "opened",
    opened: "replied",
    replied: "added",
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Inbox className="w-6 h-6 text-primary" />
              Outreach CRM
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Track every pitch from draft to placement — blog, playlist, sync,
              press, radio
            </p>
          </div>
          <Button onClick={() => setCreateCampaignOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Campaign
          </Button>
        </div>

        {/* Follow-up alerts */}
        {followUps.length > 0 && (
          <Card className="border-yellow-500/30">
            <CardContent className="pt-4">
              <p className="text-sm font-medium flex items-center gap-2 text-yellow-400">
                <Bell className="w-4 h-4" />
                {followUps.length} pitch{followUps.length > 1 ? "es" : ""}{" "}
                need follow-up
              </p>
              <ul className="mt-2 space-y-1">
                {followUps.slice(0, 3).map((f) => (
                  <li key={f.id} className="text-xs text-muted-foreground">
                    → {f.recipientName} (due{" "}
                    {format(new Date(f.followUpAt!), "MMM d")})
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-3 gap-6">
          {/* Campaign list */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
              Campaigns
            </p>
            {campaignsLoading ? (
              <p className="text-sm text-muted-foreground px-1">Loading…</p>
            ) : campaigns.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No campaigns yet
                </CardContent>
              </Card>
            ) : (
              campaigns.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCampaign(c)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedCampaign?.id === c.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-xs capitalize">
                      {c.campaignType.replace("_", " ")}
                    </Badge>
                    <span>{c.totalPitches} pitches</span>
                    {c.placementCount > 0 && (
                      <span className="text-green-400">
                        {c.placementCount} ✓
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Pitches panel */}
          <div className="col-span-2 space-y-4">
            {!selectedCampaign ? (
              <Card>
                <CardContent className="py-16 text-center text-muted-foreground">
                  Select a campaign to view pitches
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{selectedCampaign.name}</h2>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setGenerateOpen(true)}
                    >
                      <Sparkles className="w-3.5 h-3.5 mr-1.5 text-primary" />
                      AI Write Pitch
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setCreatePitchOpen(true)}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                      Add Pitch
                    </Button>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Total", value: selectedCampaign.totalPitches },
                    { label: "Opened", value: selectedCampaign.openCount },
                    { label: "Replied", value: selectedCampaign.replyCount },
                    {
                      label: "Placements",
                      value: selectedCampaign.placementCount,
                    },
                  ].map(({ label, value }) => (
                    <Card key={label}>
                      <CardContent className="pt-3 pb-3">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-lg font-bold">{value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Pitches table */}
                {pitchesLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : pitches.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground text-sm">
                      No pitches yet — add your first contact above.
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Recipient</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Follow-up</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pitches.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell>
                                <p className="text-sm font-medium">
                                  {p.recipientName}
                                </p>
                                {p.recipientEmail && (
                                  <p className="text-xs text-muted-foreground">
                                    {p.recipientEmail}
                                  </p>
                                )}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={p.status} />
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {p.followUpAt
                                  ? format(
                                      new Date(p.followUpAt),
                                      "MMM d",
                                    )
                                  : "—"}
                              </TableCell>
                              <TableCell>
                                {NEXT_STATUS[p.status] && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() =>
                                      updatePitch.mutate({
                                        id: p.id,
                                        status: NEXT_STATUS[p.status],
                                      })
                                    }
                                  >
                                    Mark{" "}
                                    {STATUS_META[NEXT_STATUS[p.status]]?.label}
                                    <ArrowRight className="w-3 h-3 ml-1" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Create Campaign Dialog */}
      <Dialog
        open={createCampaignOpen}
        onOpenChange={(v) => !v && setCreateCampaignOpen(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Outreach Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Campaign Name</Label>
              <Input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g. Dark Trap Playlist Outreach"
              />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={campaignType} onValueChange={setCampaignType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="playlist">Playlist Curator</SelectItem>
                  <SelectItem value="blog">Music Blog</SelectItem>
                  <SelectItem value="sync_supervisor">Sync Supervisor</SelectItem>
                  <SelectItem value="pr_outlet">PR Outlet</SelectItem>
                  <SelectItem value="radio">Radio</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateCampaignOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={!campaignName.trim() || createCampaign.isPending}
              onClick={() =>
                createCampaign.mutate({
                  name: campaignName,
                  campaignType,
                })
              }
            >
              {createCampaign.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Pitch Dialog */}
      <Dialog
        open={createPitchOpen}
        onOpenChange={(v) => !v && setCreatePitchOpen(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Pitch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Recipient Name</Label>
              <Input
                value={pitchRecipient}
                onChange={(e) => setPitchRecipient(e.target.value)}
                placeholder="Blog / playlist / supervisor name"
              />
            </div>
            <div className="space-y-1">
              <Label>Email (optional)</Label>
              <Input
                type="email"
                value={pitchEmail}
                onChange={(e) => setPitchEmail(e.target.value)}
                placeholder="curator@example.com"
              />
            </div>
            <div className="space-y-1">
              <Label>Pitch (optional — or AI-generate above)</Label>
              <Textarea
                value={pitchBody}
                onChange={(e) => setPitchBody(e.target.value)}
                rows={5}
                placeholder="Dear [Name], …"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatePitchOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!pitchRecipient.trim() || createPitch.isPending}
              onClick={() =>
                createPitch.mutate({
                  recipientName: pitchRecipient,
                  recipientEmail: pitchEmail || undefined,
                  pitchBody: pitchBody || undefined,
                })
              }
            >
              {createPitch.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Add Pitch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Pitch Generator Dialog */}
      <Dialog
        open={generateOpen}
        onOpenChange={(v) => !v && setGenerateOpen(false)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              AI Pitch Writer
            </DialogTitle>
            <DialogDescription>
              Max Booster uses live industry signals to write a personalized
              pitch for you.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Track Title</Label>
              <Input
                value={genTrack}
                onChange={(e) => setGenTrack(e.target.value)}
                placeholder="Your track name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Genre</Label>
                <Input
                  value={genGenre}
                  onChange={(e) => setGenGenre(e.target.value)}
                  placeholder="Trap, R&B, …"
                />
              </div>
              <div className="space-y-1">
                <Label>Artist Name</Label>
                <Input
                  value={genArtist}
                  onChange={(e) => setGenArtist(e.target.value)}
                  placeholder="Your artist name"
                />
              </div>
            </div>
            <Button
              className="w-full"
              disabled={!genTrack.trim() || generatePitch.isPending}
              onClick={() =>
                generatePitch.mutate({
                  recipientName:
                    selectedCampaign?.name ?? "the curator",
                  recipientType:
                    (selectedCampaign?.campaignType as any) ?? "playlist",
                  trackTitle: genTrack,
                  trackGenre: genGenre || undefined,
                  artistName: genArtist || undefined,
                })
              }
            >
              {generatePitch.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Writing…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Pitch
                </>
              )}
            </Button>
            {generatedPitch && (
              <div className="space-y-2">
                <Textarea
                  value={generatedPitch}
                  onChange={(e) => setGeneratedPitch(e.target.value)}
                  rows={10}
                  className="text-sm"
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setPitchBody(generatedPitch);
                    setGenerateOpen(false);
                    setCreatePitchOpen(true);
                  }}
                >
                  Use This Pitch
                  <ArrowRight className="w-3.5 h-3.5 ml-2" />
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
