import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Plus,
  Trash2,
  Edit,
  Gift,
  Tag,
  Loader2,
  Calendar,
  ShoppingCart,
  Percent,
  Zap,
  Pause,
  Play,
} from 'lucide-react';

interface BogoPromotion {
  id: string;
  storefrontId: string;
  name: string;
  description: string | null;
  promoType: string;
  buyQuantity: number;
  getQuantity: number;
  getDiscountPercent: number;
  appliesTo: string;
  applicableListingIds: string[];
  applicableGenres: string[];
  maxRedemptions: number | null;
  redemptionCount: number;
  perCustomerLimit: number | null;
  stackable: boolean;
  priority: number;
  status: string;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
}

const PROMO_PRESETS = [
  { label: 'Buy 1 Get 1 Free', buy: 1, get: 1, discount: 100 },
  { label: 'Buy 2 Get 1 Free', buy: 2, get: 1, discount: 100 },
  { label: 'Buy 3 Get 2 Free', buy: 3, get: 2, discount: 100 },
  { label: 'Buy 3 Get 1 Free', buy: 3, get: 1, discount: 100 },
  { label: 'Buy 5 Get 3 Free', buy: 5, get: 3, discount: 100 },
  { label: 'Buy 2 Get 1 at 50% Off', buy: 2, get: 1, discount: 50 },
  { label: 'Buy 3 Get 1 at 25% Off', buy: 3, get: 1, discount: 25 },
  { label: 'Custom', buy: 0, get: 0, discount: 0 },
];

interface Props {
  storefrontId: string;
}

export function BogoPromotionsManager({ storefrontId }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingPromo, setEditingPromo] = useState<BogoPromotion | null>(null);
  const [selectedPreset, setSelectedPreset] = useState('');

  const [form, setForm] = useState({
    name: '',
    description: '',
    buyQuantity: 2,
    getQuantity: 1,
    getDiscountPercent: 100,
    appliesTo: 'all',
    maxRedemptions: '',
    perCustomerLimit: '',
    startAt: '',
    endAt: '',
    status: 'active',
  });

  const { data: promotions = [], isLoading } = useQuery<BogoPromotion[]>({
    queryKey: [`/api/storefront/${storefrontId}/bogo-promotions/all`],
    enabled: !!storefrontId,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', `/api/storefront/${storefrontId}/bogo-promotions`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/storefront/${storefrontId}/bogo-promotions/all`] });
      setShowCreateDialog(false);
      resetForm();
      toast({ title: 'BOGO promotion created!' });
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest('PUT', `/api/storefront/${storefrontId}/bogo-promotions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/storefront/${storefrontId}/bogo-promotions/all`] });
      setEditingPromo(null);
      setShowCreateDialog(false);
      resetForm();
      toast({ title: 'Promotion updated!' });
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/storefront/${storefrontId}/bogo-promotions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/storefront/${storefrontId}/bogo-promotions/all`] });
      toast({ title: 'Promotion deleted' });
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest('PUT', `/api/storefront/${storefrontId}/bogo-promotions/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/storefront/${storefrontId}/bogo-promotions/all`] });
      toast({ title: 'Promotion status updated' });
    },
  });

  const resetForm = () => {
    setForm({
      name: '',
      description: '',
      buyQuantity: 2,
      getQuantity: 1,
      getDiscountPercent: 100,
      appliesTo: 'all',
      maxRedemptions: '',
      perCustomerLimit: '',
      startAt: '',
      endAt: '',
      status: 'active',
    });
    setSelectedPreset('');
    setEditingPromo(null);
  };

  const applyPreset = (preset: typeof PROMO_PRESETS[0]) => {
    if (preset.buy === 0) return;
    setForm((f) => ({
      ...f,
      buyQuantity: preset.buy,
      getQuantity: preset.get,
      getDiscountPercent: preset.discount,
      name: f.name || preset.label,
    }));
  };

  const openEdit = (promo: BogoPromotion) => {
    setEditingPromo(promo);
    setForm({
      name: promo.name,
      description: promo.description || '',
      buyQuantity: promo.buyQuantity,
      getQuantity: promo.getQuantity,
      getDiscountPercent: promo.getDiscountPercent,
      appliesTo: promo.appliesTo,
      maxRedemptions: promo.maxRedemptions?.toString() || '',
      perCustomerLimit: promo.perCustomerLimit?.toString() || '',
      startAt: promo.startAt ? new Date(promo.startAt).toISOString().slice(0, 16) : '',
      endAt: promo.endAt ? new Date(promo.endAt).toISOString().slice(0, 16) : '',
      status: promo.status,
    });
    setShowCreateDialog(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast({ title: 'Please enter a promotion name', variant: 'destructive' });
      return;
    }
    if (form.buyQuantity < 1 || form.getQuantity < 1) {
      toast({ title: 'Quantities must be at least 1', variant: 'destructive' });
      return;
    }

    const data = {
      name: form.name,
      description: form.description || null,
      promoType: form.getDiscountPercent === 100 ? 'buy_x_get_y_free' : 'buy_x_get_y_discount',
      buyQuantity: form.buyQuantity,
      getQuantity: form.getQuantity,
      getDiscountPercent: form.getDiscountPercent,
      appliesTo: form.appliesTo,
      maxRedemptions: form.maxRedemptions ? parseInt(form.maxRedemptions) : null,
      perCustomerLimit: form.perCustomerLimit ? parseInt(form.perCustomerLimit) : null,
      startAt: form.startAt || null,
      endAt: form.endAt || null,
      status: form.status,
    };

    if (editingPromo) {
      updateMutation.mutate({ id: editingPromo.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const getPromoSummary = (promo: BogoPromotion) => {
    if (promo.getDiscountPercent === 100) {
      return `Buy ${promo.buyQuantity}, Get ${promo.getQuantity} FREE`;
    }
    return `Buy ${promo.buyQuantity}, Get ${promo.getQuantity} at ${promo.getDiscountPercent}% Off`;
  };

  const isActive = (promo: BogoPromotion) => {
    if (promo.status !== 'active') return false;
    const now = new Date();
    if (promo.startAt && new Date(promo.startAt) > now) return false;
    if (promo.endAt && new Date(promo.endAt) < now) return false;
    if (promo.maxRedemptions && promo.redemptionCount >= promo.maxRedemptions) return false;
    return true;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Gift className="w-5 h-5 text-purple-500" />
            BOGO Promotions
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Create buy-one-get-one deals to boost sales. Discounts apply automatically at checkout.
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setShowCreateDialog(true);
          }}
          size="sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Deal
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : promotions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-purple-100 dark:bg-purple-900/30 p-4 mb-4">
              <Tag className="w-8 h-8 text-purple-500" />
            </div>
            <h4 className="font-medium mb-2">No Promotions Yet</h4>
            <p className="text-sm text-muted-foreground max-w-sm mb-4">
              Create BOGO deals like "Buy 3 Get 2 Free" to encourage buyers to purchase more beats from your store.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
                setShowCreateDialog(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Deal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {promotions.map((promo) => (
            <Card key={promo.id} className={!isActive(promo) ? 'opacity-60' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold">{promo.name}</h4>
                      {isActive(promo) ? (
                        <Badge variant="default" className="bg-green-500 text-white text-xs">Active</Badge>
                      ) : promo.status === 'paused' ? (
                        <Badge variant="secondary" className="text-xs">Paused</Badge>
                      ) : promo.status === 'expired' ? (
                        <Badge variant="outline" className="text-xs">Expired</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">{promo.status}</Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium text-purple-600 dark:text-purple-400 flex items-center gap-1">
                      <ShoppingCart className="w-3.5 h-3.5" />
                      {getPromoSummary(promo)}
                    </p>
                    {promo.description && (
                      <p className="text-xs text-muted-foreground mt-1">{promo.description}</p>
                    )}
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                      {promo.maxRedemptions && (
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          {promo.redemptionCount}/{promo.maxRedemptions} used
                        </span>
                      )}
                      {promo.startAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          From {new Date(promo.startAt).toLocaleDateString()}
                        </span>
                      )}
                      {promo.endAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Until {new Date(promo.endAt).toLocaleDateString()}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        Applies to: {promo.appliesTo === 'all' ? 'All beats' : promo.appliesTo}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        toggleStatusMutation.mutate({
                          id: promo.id,
                          status: promo.status === 'active' ? 'paused' : 'active',
                        })
                      }
                      title={promo.status === 'active' ? 'Pause' : 'Activate'}
                    >
                      {promo.status === 'active' ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(promo)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(promo.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={(open) => { if (!open) { setShowCreateDialog(false); resetForm(); } else setShowCreateDialog(true); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-purple-500" />
              {editingPromo ? 'Edit Deal' : 'Create BOGO Deal'}
            </DialogTitle>
            <DialogDescription>
              Set up a buy-one-get-one promotion for your storefront
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!editingPromo && (
              <div>
                <Label>Quick Presets</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {PROMO_PRESETS.filter((p) => p.buy > 0).map((preset) => (
                    <Button
                      key={preset.label}
                      variant={
                        form.buyQuantity === preset.buy &&
                        form.getQuantity === preset.get &&
                        form.getDiscountPercent === preset.discount
                          ? 'default'
                          : 'outline'
                      }
                      size="sm"
                      className="text-xs justify-start"
                      onClick={() => applyPreset(preset)}
                    >
                      <Tag className="w-3 h-3 mr-1.5 shrink-0" />
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label>Promotion Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Summer BOGO Sale"
              />
            </div>

            <div>
              <Label>Description (optional)</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe your deal..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Buy</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.buyQuantity}
                  onChange={(e) => setForm({ ...form, buyQuantity: parseInt(e.target.value) || 1 })}
                />
                <span className="text-xs text-muted-foreground">items</span>
              </div>
              <div>
                <Label>Get</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.getQuantity}
                  onChange={(e) => setForm({ ...form, getQuantity: parseInt(e.target.value) || 1 })}
                />
                <span className="text-xs text-muted-foreground">items</span>
              </div>
              <div>
                <Label>Discount</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={form.getDiscountPercent}
                    onChange={(e) => setForm({ ...form, getDiscountPercent: parseInt(e.target.value) || 100 })}
                  />
                  <Percent className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
                <span className="text-xs text-muted-foreground">
                  {form.getDiscountPercent === 100 ? 'FREE' : `${form.getDiscountPercent}% off`}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
              <p className="text-sm font-medium text-purple-700 dark:text-purple-300 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" />
                {form.getDiscountPercent === 100
                  ? `Buy ${form.buyQuantity}, Get ${form.getQuantity} FREE!`
                  : `Buy ${form.buyQuantity}, Get ${form.getQuantity} at ${form.getDiscountPercent}% off!`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Customers need {form.buyQuantity + form.getQuantity} items in their cart to qualify
              </p>
            </div>

            <div>
              <Label>Applies To</Label>
              <Select value={form.appliesTo} onValueChange={(v) => setForm({ ...form, appliesTo: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Beats</SelectItem>
                  <SelectItem value="specific">Specific Beats</SelectItem>
                  <SelectItem value="genre">Specific Genres</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Max Redemptions (optional)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.maxRedemptions}
                  onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })}
                  placeholder="Unlimited"
                />
              </div>
              <div>
                <Label>Per Customer Limit (optional)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.perCustomerLimit}
                  onChange={(e) => setForm({ ...form, perCustomerLimit: e.target.value })}
                  placeholder="Unlimited"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date (optional)</Label>
                <Input
                  type="datetime-local"
                  value={form.startAt}
                  onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                />
              </div>
              <div>
                <Label>End Date (optional)</Label>
                <Input
                  type="datetime-local"
                  value={form.endAt}
                  onChange={(e) => setForm({ ...form, endAt: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editingPromo ? 'Save Changes' : 'Create Deal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
