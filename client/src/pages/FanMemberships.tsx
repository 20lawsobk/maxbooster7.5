// @ts-nocheck
/**
 * Fan Memberships Page
 *
 * Artist-facing hub for managing fan club membership tiers, viewing subscribers,
 * tracking monthly recurring revenue, and configuring the loyalty wallet.
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Crown,
  DollarSign,
  Edit,
  Gift,
  Loader2,
  Plus,
  Trash2,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { useRequireSubscription } from "@/hooks/useRequireAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MembershipTier {
  id: string;
  name: string;
  description?: string;
  priceCents: number;
  currency: string;
  interval: "month" | "year";
  benefits: string[];
  maxSubscribers?: number;
  currentSubscribers: number;
  isActive: boolean;
  sortOrder: number;
}

interface MemberRow {
  id: string;
  tierId: string;
  tierName: string;
  tierPriceCents: number;
  customerId: string;
  status: string;
  startDate: string;
}

interface MembersResponse {
  members: MemberRow[];
  total: number;
  page: number;
}

interface Revenue {
  mrrCents: number;
  arrCents: number;
  activeMembers: number;
  byTier: Array<{
    tierId: string;
    tierName: string;
    interval: string;
    priceCents: number;
    members: number;
    mrrCents: number;
  }>;
}

interface LoyaltyConfig {
  creditsPerDollar: number;
  creditsPerShare: number;
  creditsPerComment: number;
  creditsPerRedemptionDollar: number;
  maxRedemptionPct: number;
  enabled: boolean;
}

interface LeaderEntry {
  fanId: string;
  balanceCredits: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TierCard({
  tier,
  onEdit,
  onDelete,
}: {
  tier: MembershipTier;
  onEdit: (t: MembershipTier) => void;
  onDelete: (id: string) => void;
}) {
  const price = (tier.priceCents / 100).toFixed(2);
  return (
    <Card className={tier.isActive ? "" : "opacity-60"}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Crown className="w-4 h-4 text-yellow-400" />
              {tier.name}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              ${price}/{tier.interval}
            </p>
          </div>
          <div className="flex gap-1">
            <Badge variant={tier.isActive ? "default" : "secondary"} className="text-xs">
              {tier.isActive ? "Active" : "Paused"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {tier.description && (
          <p className="text-sm text-muted-foreground mb-3">{tier.description}</p>
        )}
        {tier.benefits.length > 0 && (
          <ul className="space-y-1 mb-3">
            {tier.benefits.map((b, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs">
                <Zap className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                {b}
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {tier.currentSubscribers}
            {tier.maxSubscribers ? `/${tier.maxSubscribers}` : ""} members
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => onEdit(tier)}
            >
              <Edit className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-destructive"
              onClick={() => onDelete(tier.id)}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TierDialog({
  open,
  onClose,
  initial,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial?: MembershipTier | null;
  onSave: (data: Partial<MembershipTier>) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priceCents, setPriceCents] = useState(
    initial ? String(initial.priceCents / 100) : "5.00",
  );
  const [interval, setInterval] = useState<"month" | "year">(
    initial?.interval ?? "month",
  );
  const [benefitInput, setBenefitInput] = useState("");
  const [benefits, setBenefits] = useState<string[]>(initial?.benefits ?? []);

  function addBenefit() {
    const b = benefitInput.trim();
    if (!b) return;
    setBenefits((prev) => [...prev, b]);
    setBenefitInput("");
  }

  function handleSave() {
    const cents = Math.round(parseFloat(priceCents) * 100);
    if (isNaN(cents) || cents < 100) return;
    onSave({ name, description, priceCents: cents, interval, benefits });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Tier" : "New Fan Club Tier"}</DialogTitle>
          <DialogDescription>
            Set the name, price, and perks for this membership level.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Tier Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Inner Circle"
            />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What fans get at this level..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Price (USD)</Label>
              <Input
                value={priceCents}
                onChange={(e) => setPriceCents(e.target.value)}
                type="number"
                min="1"
                step="0.01"
                placeholder="9.99"
              />
            </div>
            <div className="space-y-1">
              <Label>Billing Interval</Label>
              <Select
                value={interval}
                onValueChange={(v) => setInterval(v as "month" | "year")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Monthly</SelectItem>
                  <SelectItem value="year">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Benefits</Label>
            <div className="flex gap-2">
              <Input
                value={benefitInput}
                onChange={(e) => setBenefitInput(e.target.value)}
                placeholder="e.g. Exclusive stems each month"
                onKeyDown={(e) => e.key === "Enter" && addBenefit()}
              />
              <Button variant="outline" size="sm" onClick={addBenefit}>
                Add
              </Button>
            </div>
            <ul className="space-y-1">
              {benefits.map((b, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <Zap className="w-3 h-3 text-primary shrink-0" />
                  <span className="flex-1">{b}</span>
                  <button
                    onClick={() =>
                      setBenefits((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            {initial ? "Save Changes" : "Create Tier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FanMemberships() {
  useRequireSubscription();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tierDialogOpen, setTierDialogOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<MembershipTier | null>(null);

  const { data: tiers = [], isLoading: tiersLoading } = useQuery<MembershipTier[]>({
    queryKey: ["fan-membership-tiers"],
    queryFn: () =>
      apiRequest("GET", "/api/fan-memberships/tiers").then((r) => r.json()),
  });

  const { data: revenue } = useQuery<Revenue>({
    queryKey: ["fan-membership-revenue"],
    queryFn: () =>
      apiRequest("GET", "/api/fan-memberships/revenue").then((r) => r.json()),
  });

  const { data: membersResp } = useQuery<MembersResponse>({
    queryKey: ["fan-membership-members"],
    queryFn: () =>
      apiRequest("GET", "/api/fan-memberships/members").then((r) => r.json()),
  });

  const { data: loyaltyConfig } = useQuery<LoyaltyConfig>({
    queryKey: ["fan-loyalty-config"],
    queryFn: () =>
      apiRequest("GET", "/api/fan-memberships/wallet-config").then((r) =>
        r.json(),
      ),
  });

  const { data: leaderboard = [] } = useQuery<LeaderEntry[]>({
    queryKey: ["fan-wallet-leaderboard"],
    queryFn: () =>
      apiRequest("GET", "/api/fan-memberships/wallet-leaderboard").then((r) =>
        r.json(),
      ),
  });

  const createTier = useMutation({
    mutationFn: (data: object) =>
      apiRequest("POST", "/api/fan-memberships/tiers", data).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fan-membership-tiers"] });
      qc.invalidateQueries({ queryKey: ["fan-membership-revenue"] });
      setTierDialogOpen(false);
      toast({ title: "Tier created" });
    },
    onError: () => toast({ title: "Failed to create tier", variant: "destructive" }),
  });

  const updateTier = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & object) =>
      apiRequest("PUT", `/api/fan-memberships/tiers/${id}`, data).then((r) =>
        r.json(),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fan-membership-tiers"] });
      setEditingTier(null);
      toast({ title: "Tier updated" });
    },
    onError: () => toast({ title: "Failed to update tier", variant: "destructive" }),
  });

  const deleteTier = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/fan-memberships/tiers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fan-membership-tiers"] });
      qc.invalidateQueries({ queryKey: ["fan-membership-revenue"] });
      toast({ title: "Tier deactivated" });
    },
    onError: () => toast({ title: "Failed to deactivate tier", variant: "destructive" }),
  });

  const saveLoyalty = useMutation({
    mutationFn: (data: LoyaltyConfig) =>
      apiRequest("PUT", "/api/fan-memberships/wallet-config", data).then((r) =>
        r.json(),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fan-loyalty-config"] });
      toast({ title: "Loyalty config saved" });
    },
    onError: () => toast({ title: "Failed to save loyalty config", variant: "destructive" }),
  });

  function handleSaveTier(data: Partial<MembershipTier>) {
    if (editingTier) {
      updateTier.mutate({ id: editingTier.id, ...data });
    } else {
      createTier.mutate(data);
    }
  }

  const [loyaltyForm, setLoyaltyForm] = useState<LoyaltyConfig | null>(null);
  const lf = loyaltyForm ?? loyaltyConfig;

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Crown className="w-6 h-6 text-yellow-400" />
              Fan Memberships
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Recurring fan subscriptions with tiered perks + loyalty credits
            </p>
          </div>
          <Button
            onClick={() => {
              setEditingTier(null);
              setTierDialogOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Tier
          </Button>
        </div>

        {/* MRR Summary */}
        {revenue && (
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <TrendingUp className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">MRR</p>
                    <p className="text-xl font-bold">
                      ${(revenue.mrrCents / 100).toFixed(2)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-400/10 rounded-lg">
                    <DollarSign className="w-4 h-4 text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ARR</p>
                    <p className="text-xl font-bold">
                      ${(revenue.arrCents / 100).toFixed(2)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <Users className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Active Members</p>
                    <p className="text-xl font-bold">{revenue.activeMembers}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="tiers">
          <TabsList>
            <TabsTrigger value="tiers">Tiers</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="wallet">Loyalty Wallet</TabsTrigger>
          </TabsList>

          {/* ── Tiers tab ── */}
          <TabsContent value="tiers" className="space-y-4 mt-4">
            {tiersLoading ? (
              <p className="text-muted-foreground text-sm">Loading tiers…</p>
            ) : tiers.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Crown className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="font-medium">No membership tiers yet</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Create your first fan club tier to start earning recurring revenue.
                  </p>
                  <Button
                    onClick={() => {
                      setEditingTier(null);
                      setTierDialogOpen(true);
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Tier
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tiers.map((tier) => (
                  <TierCard
                    key={tier.id}
                    tier={tier}
                    onEdit={(t) => {
                      setEditingTier(t);
                      setTierDialogOpen(true);
                    }}
                    onDelete={(id) => deleteTier.mutate(id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Members tab ── */}
          <TabsContent value="members" className="mt-4">
            {membersResp?.members.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="font-medium">No active members yet</p>
                  <p className="text-sm text-muted-foreground">
                    Share your fan club page to start growing memberships.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fan ID</TableHead>
                        <TableHead>Tier</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Since</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(membersResp?.members ?? []).map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-mono text-xs">
                            {m.customerId.slice(0, 12)}…
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{m.tierName}</Badge>
                          </TableCell>
                          <TableCell>
                            ${(m.tierPriceCents / 100).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={m.status === "active" ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {m.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(m.startDate), "MMM d, yyyy")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Loyalty Wallet tab ── */}
          <TabsContent value="wallet" className="mt-4 space-y-4">
            {lf && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Wallet className="w-4 h-4 text-primary" />
                      Loyalty Programme Settings
                    </CardTitle>
                    <CardDescription>
                      Fans earn credits for purchases, shares, and comments —
                      redeemable as checkout discounts.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Enable Loyalty Wallet</p>
                        <p className="text-xs text-muted-foreground">
                          Fans see their credit balance on your storefront
                        </p>
                      </div>
                      <Switch
                        checked={lf.enabled}
                        onCheckedChange={(v) =>
                          setLoyaltyForm((prev) => ({
                            ...(prev ?? lf),
                            enabled: v,
                          }))
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        {
                          key: "creditsPerDollar",
                          label: "Credits per $1 spent",
                          min: 1,
                          max: 1000,
                        },
                        {
                          key: "creditsPerShare",
                          label: "Credits per share",
                          min: 0,
                          max: 500,
                        },
                        {
                          key: "creditsPerComment",
                          label: "Credits per comment",
                          min: 0,
                          max: 100,
                        },
                        {
                          key: "creditsPerRedemptionDollar",
                          label: "Credits to earn $1 discount",
                          min: 1,
                          max: 10000,
                        },
                        {
                          key: "maxRedemptionPct",
                          label: "Max % redeemable per order",
                          min: 0,
                          max: 100,
                        },
                      ].map(({ key, label, min, max }) => (
                        <div key={key} className="space-y-1">
                          <Label className="text-xs">{label}</Label>
                          <Input
                            type="number"
                            min={min}
                            max={max}
                            value={(lf as any)[key]}
                            onChange={(e) =>
                              setLoyaltyForm((prev) => ({
                                ...(prev ?? lf),
                                [key]: parseInt(e.target.value) || 0,
                              }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                    <Button
                      onClick={() => lf && saveLoyalty.mutate(lf)}
                      disabled={saveLoyalty.isPending}
                    >
                      {saveLoyalty.isPending && (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      )}
                      Save Loyalty Settings
                    </Button>
                  </CardContent>
                </Card>

                {/* Leaderboard */}
                {leaderboard.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Trophy className="w-4 h-4 text-yellow-400" />
                        Top Fans by Credits
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>#</TableHead>
                            <TableHead>Fan</TableHead>
                            <TableHead>Balance</TableHead>
                            <TableHead>Lifetime Earned</TableHead>
                            <TableHead>Redeemed</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {leaderboard.slice(0, 10).map((l, i) => (
                            <TableRow key={l.fanId}>
                              <TableCell className="text-muted-foreground font-mono text-xs">
                                {i + 1}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {l.fanId.slice(0, 12)}…
                              </TableCell>
                              <TableCell className="font-medium">
                                {l.balanceCredits.toLocaleString()} cr
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {l.lifetimeEarned.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {l.lifetimeRedeemed.toLocaleString()}
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
          </TabsContent>
        </Tabs>
      </div>

      {/* Tier create/edit dialog */}
      <TierDialog
        open={tierDialogOpen}
        onClose={() => {
          setTierDialogOpen(false);
          setEditingTier(null);
        }}
        initial={editingTier}
        onSave={handleSaveTier}
      />
    </AppLayout>
  );
}
