import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  ShoppingCart,
  Package,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Plus,
  Edit,
  Trash2,
  Search,
  Truck,
  CheckCircle,
  Store,
  BarChart3,
  X,
  Layers,
} from 'lucide-react';
import { format } from 'date-fns';

interface Variant {
  name: string;
  value: string;
  priceOffset: number;
}

export default function MerchStore() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('products');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [addVariants, setAddVariants] = useState<Variant[]>([]);
  const [editVariants, setEditVariants] = useState<Variant[]>([]);

  const { data: items, isLoading: itemsLoading } = useQuery({ queryKey: ['/api/merch'] });
  const { data: orders, isLoading: ordersLoading } = useQuery({ queryKey: ['/api/merch/orders'] });
  const { data: stats, isLoading: statsLoading } = useQuery({ queryKey: ['/api/merch/stats'] });

  const addItemMutation = useMutation({
    mutationFn: async (newItem: any) => {
      const res = await apiRequest('POST', '/api/merch', newItem);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/merch'] });
      queryClient.invalidateQueries({ queryKey: ['/api/merch/stats'] });
      toast({ title: 'Product added', description: 'Your product is now live in your store.' });
      setIsAddDialogOpen(false);
      setAddVariants([]);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to add product.', variant: 'destructive' });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest('PUT', `/api/merch/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/merch'] });
      queryClient.invalidateQueries({ queryKey: ['/api/merch/stats'] });
      toast({ title: 'Product updated', description: 'Changes saved successfully.' });
      setEditingItem(null);
      setEditVariants([]);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update product.', variant: 'destructive' });
    },
  });

  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, status, trackingNumber }: any) => {
      const res = await apiRequest('PUT', `/api/merch/orders/${id}`, { status, trackingNumber });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/merch/orders'] });
      toast({ title: 'Order updated' });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/merch/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/merch'] });
      queryClient.invalidateQueries({ queryKey: ['/api/merch/stats'] });
      toast({ title: 'Product deleted' });
    },
  });

  const handleAddItem = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    addItemMutation.mutate({
      ...data,
      price: parseFloat(data.price as string),
      salePrice: data.salePrice ? parseFloat(data.salePrice as string) : null,
      inventory: parseInt(data.inventory as string) || 0,
      isDigital: data.isDigital === 'on',
      isActive: true,
      variants: addVariants,
    });
  };

  const handleEditItem = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    updateItemMutation.mutate({
      id: editingItem.id,
      ...data,
      price: parseFloat(data.price as string),
      salePrice: data.salePrice ? parseFloat(data.salePrice as string) : null,
      inventory: parseInt(data.inventory as string) || 0,
      isDigital: data.isDigital === 'on',
      variants: editVariants,
    });
  };

  const filteredItems = (items as any[])?.filter((item: any) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const VariantEditor = ({ variants, setVariants }: { variants: Variant[]; setVariants: (v: Variant[]) => void }) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" />
          Variants (sizes, colors, etc.)
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setVariants([...variants, { name: 'Size', value: '', priceOffset: 0 }])}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Variant
        </Button>
      </div>
      {variants.length > 0 && (
        <div className="space-y-2 rounded-md border p-3 bg-muted/30">
          {variants.map((v, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-4">
                <Select
                  value={v.name}
                  onValueChange={(val) => {
                    const updated = [...variants];
                    updated[i] = { ...updated[i], name: val };
                    setVariants(updated);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Size">Size</SelectItem>
                    <SelectItem value="Color">Color</SelectItem>
                    <SelectItem value="Style">Style</SelectItem>
                    <SelectItem value="Material">Material</SelectItem>
                    <SelectItem value="Edition">Edition</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-5">
                <Input
                  className="h-8 text-xs"
                  placeholder="e.g. Large, Black, Gold..."
                  value={v.value}
                  onChange={(e) => {
                    const updated = [...variants];
                    updated[i] = { ...updated[i], value: e.target.value };
                    setVariants(updated);
                  }}
                />
              </div>
              <div className="col-span-2">
                <Input
                  className="h-8 text-xs"
                  type="number"
                  step="0.01"
                  placeholder="+$0"
                  value={v.priceOffset || ''}
                  onChange={(e) => {
                    const updated = [...variants];
                    updated[i] = { ...updated[i], priceOffset: parseFloat(e.target.value) || 0 };
                    setVariants(updated);
                  }}
                />
              </div>
              <div className="col-span-1 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setVariants(variants.filter((_, idx) => idx !== i))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground pt-1">Type · Value · Price offset (+/-$)</p>
        </div>
      )}
    </div>
  );

  const ProductForm = ({
    defaultValues,
    onSubmit,
    isLoading,
    submitLabel,
    variants,
    setVariants,
  }: {
    defaultValues?: any;
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    isLoading: boolean;
    submitLabel: string;
    variants: Variant[];
    setVariants: (v: Variant[]) => void;
  }) => (
    <form onSubmit={onSubmit} className="space-y-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Product Name</Label>
          <Input id="name" name="name" required defaultValue={defaultValues?.name} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Select name="category" defaultValue={defaultValues?.category || 'clothing'}>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="clothing">Clothing</SelectItem>
              <SelectItem value="accessories">Accessories</SelectItem>
              <SelectItem value="music">Music (Physical)</SelectItem>
              <SelectItem value="digital">Digital Download</SelectItem>
              <SelectItem value="bundle">Bundle</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" defaultValue={defaultValues?.description} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="price">Price ($)</Label>
          <Input id="price" name="price" type="number" step="0.01" required defaultValue={defaultValues?.price} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="salePrice">Sale Price ($)</Label>
          <Input id="salePrice" name="salePrice" type="number" step="0.01" defaultValue={defaultValues?.salePrice} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="inventory">Inventory</Label>
          <Input id="inventory" name="inventory" type="number" defaultValue={defaultValues?.inventory ?? 0} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sku">SKU</Label>
          <Input id="sku" name="sku" defaultValue={defaultValues?.sku} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="imageUrl">Image URL</Label>
          <Input id="imageUrl" name="imageUrl" placeholder="https://..." defaultValue={defaultValues?.imageUrl} />
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <Switch id="isDigital" name="isDigital" defaultChecked={defaultValues?.isDigital} />
        <Label htmlFor="isDigital">Digital Product</Label>
      </div>
      <div className="space-y-2">
        <Label htmlFor="downloadUrl">Download URL (digital products)</Label>
        <Input id="downloadUrl" name="downloadUrl" placeholder="https://..." defaultValue={defaultValues?.downloadUrl} />
      </div>
      <VariantEditor variants={variants} setVariants={setVariants} />
      <DialogFooter>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );

  const itemsArr = (items as any[]) || [];
  const ordersArr = (orders as any[]) || [];

  const categoryRevenue = (() => {
    const map: Record<string, number> = {};
    for (const item of itemsArr) {
      const rev = parseFloat(item.price) * (item.soldCount || 0);
      map[item.category] = (map[item.category] || 0) + rev;
    }
    return Object.entries(map)
      .map(([cat, rev]) => ({ cat, rev }))
      .sort((a, b) => b.rev - a.rev);
  })();

  const orderStatusBreakdown = (() => {
    const map: Record<string, number> = {};
    for (const o of ordersArr) {
      map[o.status] = (map[o.status] || 0) + 1;
    }
    return Object.entries(map).map(([status, count]) => ({ status, count }));
  })();

  const avgOrderValue =
    ordersArr.length > 0
      ? ordersArr.reduce((s: number, o: any) => s + parseFloat(o.total || 0), 0) / ordersArr.length
      : 0;

  const totalCatRev = categoryRevenue.reduce((s, x) => s + x.rev, 0) || 1;

  const STATUS_COLORS: Record<string, string> = {
    pending: '#f59e0b',
    processing: '#6366f1',
    shipped: '#3b82f6',
    delivered: '#22c55e',
    refunded: '#ef4444',
  };

  return (
    <AppLayout>
      <div className="space-y-8 p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Store className="h-8 w-8 text-primary" />
              Merch Store
            </h1>
            <p className="text-muted-foreground mt-1">Manage your physical and digital merchandise.</p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={(open) => { setIsAddDialogOpen(open); if (!open) setAddVariants([]); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Product</DialogTitle>
                <DialogDescription>Enter the details for your new merchandise item.</DialogDescription>
              </DialogHeader>
              <ProductForm
                onSubmit={handleAddItem}
                isLoading={addItemMutation.isPending}
                submitLabel="Add Product"
                variants={addVariants}
                setVariants={setAddVariants}
              />
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Total Revenue', value: `$${(stats as any)?.totalRevenue?.toFixed(2) || '0.00'}`, sub: 'Lifetime earnings', icon: DollarSign, color: 'text-green-500' },
            { label: 'Orders (Month)', value: (stats as any)?.ordersThisMonth || 0, sub: 'Orders this month', icon: ShoppingCart, color: 'text-blue-500' },
            { label: 'Total Orders', value: (stats as any)?.totalOrders || 0, sub: 'All time orders', icon: TrendingUp, color: 'text-purple-500' },
            { label: 'Low Stock', value: (stats as any)?.inventoryAlerts || 0, sub: 'Items needing restock', icon: AlertCircle, color: 'text-destructive' },
          ].map(({ label, value, sub, icon: Icon, color }) => (
            <Card key={label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{label}</CardTitle>
                <Icon className={`h-4 w-4 ${color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{statsLoading ? '—' : value}</div>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="space-y-4">
            <div className="flex items-center px-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {itemsLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="h-48" />
                  </Card>
                ))
              ) : filteredItems?.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center py-16 text-center border rounded-lg bg-muted/10">
                  <Package className="h-14 w-14 text-muted-foreground mb-4 opacity-30" />
                  <h3 className="text-lg font-semibold">No products yet</h3>
                  <p className="text-muted-foreground text-sm mt-1 mb-4">Add your first product to start selling merch.</p>
                  <Button onClick={() => setIsAddDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Add Product
                  </Button>
                </div>
              ) : (
                filteredItems?.map((item: any) => (
                  <Card key={item.id} className="overflow-hidden group">
                    <div className="aspect-square bg-muted relative">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="object-cover w-full h-full" />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <Package className="h-12 w-12 text-muted-foreground/20" />
                        </div>
                      )}
                      <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                        <Badge variant={item.isActive ? 'default' : 'secondary'}>
                          {item.isActive ? 'Active' : 'Draft'}
                        </Badge>
                        {item.variants?.length > 0 && (
                          <Badge variant="outline" className="text-xs bg-background/80">
                            <Layers className="h-2.5 w-2.5 mr-1" />{item.variants.length} variants
                          </Badge>
                        )}
                        {!item.isDigital && item.inventory <= 5 && item.inventory > 0 && (
                          <Badge variant="outline" className="border-orange-500/30 text-orange-400 bg-orange-500/10 text-xs">Low Stock</Badge>
                        )}
                        {!item.isDigital && item.inventory === 0 && (
                          <Badge variant="outline" className="border-red-500/30 text-red-400 bg-red-500/10 text-xs">Out of Stock</Badge>
                        )}
                      </div>
                    </div>
                    <CardHeader className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-base leading-tight">{item.name}</CardTitle>
                          <p className="text-xs text-muted-foreground capitalize mt-0.5">{item.category}</p>
                        </div>
                        <div className="text-right">
                          {item.salePrice ? (
                            <>
                              <div className="font-bold text-green-500">${parseFloat(item.salePrice).toFixed(2)}</div>
                              <div className="text-xs text-muted-foreground line-through">${parseFloat(item.price).toFixed(2)}</div>
                            </>
                          ) : (
                            <div className="font-bold">${parseFloat(item.price).toFixed(2)}</div>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 space-y-3">
                      <div className="flex justify-between items-center text-sm text-muted-foreground">
                        <span>Stock: {item.isDigital ? '∞' : item.inventory}</span>
                        <span>Sold: {item.soldCount || 0}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            setEditingItem(item);
                            setEditVariants(item.variants || []);
                          }}
                        >
                          <Edit className="h-3.5 w-3.5 mr-1.5" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setPendingDeleteId(item.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <CardTitle>Recent Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Buyer</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tracking</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordersLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i} className="animate-pulse">
                          <TableCell colSpan={7} className="h-12" />
                        </TableRow>
                      ))
                    ) : !ordersArr.length ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12">
                          <ShoppingCart className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-20" />
                          <p className="text-muted-foreground">No orders yet.</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      ordersArr.map((order: any) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-mono text-xs">{order.id.split('-')[0]}</TableCell>
                          <TableCell className="text-sm">{format(new Date(order.createdAt), 'MMM d, yyyy')}</TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">{order.buyerName}</div>
                            <div className="text-xs text-muted-foreground">{order.buyerEmail}</div>
                          </TableCell>
                          <TableCell className="font-medium">${parseFloat(order.total).toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant={
                              order.status === 'delivered' ? 'default' :
                              order.status === 'shipped' ? 'secondary' :
                              order.status === 'pending' ? 'outline' : 'secondary'
                            }>
                              {order.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm font-mono">{order.trackingNumber || '—'}</TableCell>
                          <TableCell className="text-right">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <Truck className="h-4 w-4 mr-2" />
                                  Update
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Update Order Status</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                  <div className="space-y-2">
                                    <Label>Status</Label>
                                    <Select
                                      defaultValue={order.status}
                                      onValueChange={(val) => updateOrderMutation.mutate({ id: order.id, status: val })}
                                    >
                                      <SelectTrigger><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="processing">Processing</SelectItem>
                                        <SelectItem value="shipped">Shipped</SelectItem>
                                        <SelectItem value="delivered">Delivered</SelectItem>
                                        <SelectItem value="refunded">Refunded</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Tracking Number</Label>
                                    <div className="flex gap-2">
                                      <Input defaultValue={order.trackingNumber} id={`tracking-${order.id}`} />
                                      <Button onClick={() => {
                                        const val = (document.getElementById(`tracking-${order.id}`) as HTMLInputElement).value;
                                        updateOrderMutation.mutate({ id: order.id, trackingNumber: val });
                                      }}>
                                        Save
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Avg Order Value</CardTitle>
                  <div className="text-2xl font-bold">${avgOrderValue.toFixed(2)}</div>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Products</CardTitle>
                  <div className="text-2xl font-bold">{itemsArr.length}</div>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Units Sold</CardTitle>
                  <div className="text-2xl font-bold">{itemsArr.reduce((s: number, i: any) => s + (i.soldCount || 0), 0)}</div>
                </CardHeader>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="flex flex-row items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <CardTitle>Revenue by Category</CardTitle>
                </CardHeader>
                <CardContent>
                  {categoryRevenue.length === 0 ? (
                    <div className="flex flex-col items-center py-8 text-muted-foreground">
                      <TrendingUp className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-sm">No sales data yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {categoryRevenue.map(({ cat, rev }) => (
                        <div key={cat} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="capitalize font-medium">{cat}</span>
                            <span className="text-muted-foreground">${rev.toFixed(2)}</span>
                          </div>
                          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full transition-all duration-500"
                              style={{ width: `${(rev / totalCatRev) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                  <CardTitle>Order Status Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  {orderStatusBreakdown.length === 0 ? (
                    <div className="flex flex-col items-center py-8 text-muted-foreground">
                      <ShoppingCart className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-sm">No orders yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {orderStatusBreakdown.map(({ status, count }) => (
                        <div key={status} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: STATUS_COLORS[status] || '#94a3b8' }}
                            />
                            <span className="text-sm capitalize font-medium">{status}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${(count / ordersArr.length) * 100}%`,
                                  backgroundColor: STATUS_COLORS[status] || '#94a3b8',
                                }}
                              />
                            </div>
                            <span className="text-sm text-muted-foreground w-4 text-right">{count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <CardTitle>Best Sellers</CardTitle>
                </CardHeader>
                <CardContent>
                  {!(stats as any)?.bestSellers?.length ? (
                    <div className="flex flex-col items-center py-8 text-muted-foreground">
                      <TrendingUp className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-sm">No sales data yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(stats as any).bestSellers.map((item: any, i: number) => (
                        <div key={item.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-muted-foreground text-sm w-4">{i + 1}.</span>
                            <div className="h-10 w-10 bg-muted rounded flex items-center justify-center overflow-hidden">
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <Package className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                            <div>
                              <div className="text-sm font-medium">{item.name}</div>
                              <div className="text-xs text-muted-foreground">{item.soldCount} units sold</div>
                            </div>
                          </div>
                          <div className="text-sm font-bold text-green-500">
                            ${(parseFloat(item.price) * item.soldCount).toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <CardTitle>Inventory Alerts</CardTitle>
                </CardHeader>
                <CardContent>
                  {!(stats as any)?.lowInventoryItems?.length ? (
                    <div className="flex flex-col items-center py-8 text-center">
                      <CheckCircle className="h-8 w-8 text-green-500 mb-2" />
                      <p className="text-sm text-muted-foreground">All items are well-stocked.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(stats as any).lowInventoryItems.map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                          <div className="flex items-center gap-3">
                            <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                            <div>
                              <div className="text-sm font-medium">{item.name}</div>
                              <div className="text-xs text-muted-foreground">{item.inventory} remaining</div>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-destructive border-destructive/30">Restock</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <Dialog open={!!editingItem} onOpenChange={(open) => { if (!open) { setEditingItem(null); setEditVariants([]); } }}>
          <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Product</DialogTitle>
              <DialogDescription>Update your product details.</DialogDescription>
            </DialogHeader>
            {editingItem && (
              <ProductForm
                defaultValues={editingItem}
                onSubmit={handleEditItem}
                isLoading={updateItemMutation.isPending}
                submitLabel="Save Changes"
                variants={editVariants}
                setVariants={setEditVariants}
              />
            )}
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!pendingDeleteId} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Product</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove this product from your store. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={() => {
                  if (pendingDeleteId) deleteItemMutation.mutate(pendingDeleteId);
                  setPendingDeleteId(null);
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
