import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  ExternalLink,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';

export default function MerchStore() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('products');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Queries
  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ['/api/merch'],
  });

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['/api/merch/orders'],
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/merch/stats'],
  });

  // Mutations
  const addItemMutation = useMutation({
    mutationFn: async (newItem: any) => {
      const res = await apiRequest('POST', '/api/merch', newItem);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/merch'] });
      queryClient.invalidateQueries({ queryKey: ['/api/merch/stats'] });
      toast({ title: 'Success', description: 'Item added successfully' });
      setIsAddDialogOpen(false);
    },
  });

  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, status, trackingNumber }: any) => {
      const res = await apiRequest('PUT', `/api/merch/orders/${id}`, { status, trackingNumber });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/merch/orders'] });
      toast({ title: 'Success', description: 'Order updated successfully' });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/merch/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/merch'] });
      toast({ title: 'Success', description: 'Item deleted' });
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
    });
  };

  const filteredItems = items?.filter((item: any) => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="space-y-8 p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Merch Store</h1>
            <p className="text-muted-foreground">Manage your physical and digital merchandise.</p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Add New Product</DialogTitle>
                <DialogDescription>
                  Enter the details for your new merchandise item.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddItem} className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Product Name</Label>
                    <Input id="name" name="name" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select name="category" defaultValue="clothing">
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
                  <Textarea id="description" name="description" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="price">Price ($)</Label>
                    <Input id="price" name="price" type="number" step="0.01" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="salePrice">Sale Price ($)</Label>
                    <Input id="salePrice" name="salePrice" type="number" step="0.01" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inventory">Inventory</Label>
                    <Input id="inventory" name="inventory" type="number" defaultValue="0" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sku">SKU</Label>
                    <Input id="sku" name="sku" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="imageUrl">Image URL</Label>
                    <Input id="imageUrl" name="imageUrl" placeholder="https://..." />
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch id="isDigital" name="isDigital" />
                  <Label htmlFor="isDigital">Digital Product</Label>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="downloadUrl">Download URL (for digital products)</Label>
                  <Input id="downloadUrl" name="downloadUrl" placeholder="https://..." />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={addItemMutation.isPending}>
                    {addItemMutation.isPending ? 'Adding...' : 'Add Product'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Section */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats?.totalRevenue?.toFixed(2) || '0.00'}</div>
              <p className="text-xs text-muted-foreground">Lifetime earnings</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Orders (Month)</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.ordersThisMonth || 0}</div>
              <p className="text-xs text-muted-foreground">Orders this month</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalOrders || 0}</div>
              <p className="text-xs text-muted-foreground">All time orders</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
              <AlertCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.inventoryAlerts || 0}</div>
              <p className="text-xs text-muted-foreground">Items needing restock</p>
            </CardContent>
          </Card>
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
                <div className="col-span-full flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-muted/10">
                  <Package className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold">No products found</h3>
                  <p className="text-muted-foreground">Add your first product to get started.</p>
                </div>
              ) : (
                filteredItems?.map((item: any) => (
                  <Card key={item.id} className="overflow-hidden">
                    <div className="aspect-square bg-muted relative">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="object-cover w-full h-full" />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <Package className="h-12 w-12 text-muted-foreground/20" />
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <Badge variant={item.isActive ? "default" : "secondary"}>
                          {item.isActive ? "Active" : "Draft"}
                        </Badge>
                      </div>
                    </div>
                    <CardHeader className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg">{item.name}</CardTitle>
                          <p className="text-sm text-muted-foreground capitalize">{item.category}</p>
                        </div>
                        <div className="text-right">
                          <div className="font-bold">${parseFloat(item.price).toFixed(2)}</div>
                          {item.salePrice && (
                            <div className="text-xs text-muted-foreground line-through">
                              ${parseFloat(item.salePrice).toFixed(2)}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 space-y-4">
                      <div className="flex justify-between items-center text-sm">
                        <span>Stock: {item.isDigital ? '∞ (Digital)' : item.inventory}</span>
                        <span>Sold: {item.soldCount}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1">
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm('Are you sure?')) deleteItemMutation.mutate(item.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
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
                    ) : orders?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          No orders yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      orders?.map((order: any) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-mono text-xs">
                            {order.id.split('-')[0]}
                          </TableCell>
                          <TableCell className="text-sm">
                            {format(new Date(order.createdAt), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">{order.buyerName}</div>
                            <div className="text-xs text-muted-foreground">{order.buyerEmail}</div>
                          </TableCell>
                          <TableCell className="font-medium">
                            ${parseFloat(order.total).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              order.status === 'delivered' ? 'default' :
                              order.status === 'shipped' ? 'secondary' :
                              order.status === 'pending' ? 'outline' : 'secondary'
                            }>
                              {order.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {order.trackingNumber || '-'}
                          </TableCell>
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
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
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
                                      <Input 
                                        defaultValue={order.trackingNumber} 
                                        id={`tracking-${order.id}`}
                                      />
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
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Best Sellers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {stats?.bestSellers?.map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-muted rounded flex items-center justify-center">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt="" className="h-full w-full object-cover rounded" />
                            ) : (
                              <Package className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <div className="text-sm font-medium">{item.name}</div>
                            <div className="text-xs text-muted-foreground">{item.soldCount} sales</div>
                          </div>
                        </div>
                        <div className="text-sm font-bold">
                          ${(parseFloat(item.price) * item.soldCount).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Inventory Alerts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {stats?.lowInventoryItems?.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 text-center">
                        <CheckCircle className="h-8 w-8 text-green-500 mb-2" />
                        <p className="text-sm text-muted-foreground">All items are well-stocked.</p>
                      </div>
                    ) : (
                      stats?.lowInventoryItems?.map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <AlertCircle className="h-5 w-5 text-destructive" />
                            <div>
                              <div className="text-sm font-medium">{item.name}</div>
                              <div className="text-xs text-muted-foreground">{item.inventory} remaining</div>
                            </div>
                          </div>
                          <Button variant="outline" size="sm">Restock</Button>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
