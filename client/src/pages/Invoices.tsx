import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Receipt, Plus, Download, Send, Eye, DollarSign, Clock, CheckCircle, AlertCircle, Filter, Search, Trash2, MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { format } from 'date-fns';

interface Invoice {
  id: string;
  invoiceNumber: string;
  clientName: string;
  clientEmail: string;
  amount: number;
  currency: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  dueDate: string;
  createdAt: string;
  paidAt?: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
  }>;
}

export default function Invoices() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  
  const CURRENCIES: Record<string, { symbol: string; label: string }> = {
    USD: { symbol: '$', label: 'USD — US Dollar' },
    EUR: { symbol: '€', label: 'EUR — Euro' },
    GBP: { symbol: '£', label: 'GBP — British Pound' },
    CAD: { symbol: 'C$', label: 'CAD — Canadian Dollar' },
    AUD: { symbol: 'A$', label: 'AUD — Australian Dollar' },
    JPY: { symbol: '¥', label: 'JPY — Japanese Yen' },
  };

  const [newInvoice, setNewInvoice] = useState({
    clientName: '',
    clientEmail: '',
    currency: 'USD',
    dueDate: '',
    items: [{ description: '', quantity: 1, unitPrice: 0 }],
    notes: '',
  });

  const { data: invoicesData, isLoading} = useQuery<{ invoices: Invoice[] }>({
    queryKey: ['/api/invoices'],
    enabled: !!user,
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newInvoice),
      });
      if (!res.ok) throw new Error('Failed to create invoice');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      setShowCreateDialog(false);
      setNewInvoice({
        clientName: '',
        clientEmail: '',
        currency: 'USD',
        dueDate: '',
        items: [{ description: '', quantity: 1, unitPrice: 0 }],
        notes: '',
      });
      toast({ title: 'Invoice created', description: 'Your invoice has been saved as a draft.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const sendInvoiceMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const res = await fetch(`/api/invoices/${invoiceId}/send`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to send invoice');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      toast({ title: 'Invoice sent', description: 'The invoice has been emailed to the client.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to delete invoice');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      toast({ title: 'Invoice deleted' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const downloadPDF = async (invoiceId: string, invoiceNumber: string) => {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/pdf`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to generate PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: 'Download failed', description: 'Could not generate PDF. Please try again.', variant: 'destructive' });
    }
  };

  if (!user) {
    setLocation('/login');
    return null;
  }

const invoices = invoicesData?.invoices || [];
  
  const filteredInvoices = invoices.filter(inv => {
    const matchesStatus = filterStatus === 'all' || inv.status === filterStatus;
    const matchesSearch = !searchQuery || 
      inv.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const stats = {
    total: invoices.reduce((sum, inv) => sum + inv.amount, 0),
    paid: invoices.filter(i => i.status === 'paid').reduce((sum, inv) => sum + inv.amount, 0),
    pending: invoices.filter(i => i.status === 'sent').reduce((sum, inv) => sum + inv.amount, 0),
    overdue: invoices.filter(i => i.status === 'overdue').reduce((sum, inv) => sum + inv.amount, 0),
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
      draft: { variant: 'outline', icon: <Clock className="h-3 w-3" /> },
      sent: { variant: 'secondary', icon: <Send className="h-3 w-3" /> },
      paid: { variant: 'default', icon: <CheckCircle className="h-3 w-3" /> },
      overdue: { variant: 'destructive', icon: <AlertCircle className="h-3 w-3" /> },
      cancelled: { variant: 'outline', icon: <AlertCircle className="h-3 w-3" /> },
    };
    const { variant, icon } = config[status] || config.draft;
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        {icon}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const addInvoiceItem = () => {
    setNewInvoice({
      ...newInvoice,
      items: [...newInvoice.items, { description: '', quantity: 1, unitPrice: 0 }],
    });
  };

  const updateInvoiceItem = (index: number, field: string, value: any) => {
    const items = [...newInvoice.items];
    items[index] = { ...items[index], [field]: value };
    setNewInvoice({ ...newInvoice, items });
  };

  const removeInvoiceItem = (index: number) => {
    if (newInvoice.items.length > 1) {
      const items = newInvoice.items.filter((_, i) => i !== index);
      setNewInvoice({ ...newInvoice, items });
    }
  };

  const calculateTotal = () => {
    return newInvoice.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  };

  return (
    <AppLayout>
      {isLoading ? (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Receipt className="h-8 w-8 text-primary" />
              Invoices
            </h1>
            <p className="text-muted-foreground mt-1">
              Create and manage invoices for your music services
            </p>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Invoice
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Invoice</DialogTitle>
                <DialogDescription>
                  Create a new invoice for your client
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="clientName">Client Name</Label>
                    <Input
                      id="clientName"
                      value={newInvoice.clientName}
                      onChange={(e) => setNewInvoice({ ...newInvoice, clientName: e.target.value })}
                      placeholder="Client or company name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clientEmail">Client Email</Label>
                    <Input
                      id="clientEmail"
                      type="email"
                      value={newInvoice.clientEmail}
                      onChange={(e) => setNewInvoice({ ...newInvoice, clientEmail: e.target.value })}
                      placeholder="client@example.com"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dueDate">Due Date</Label>
                    <Input
                      id="dueDate"
                      type="date"
                      value={newInvoice.dueDate}
                      onChange={(e) => setNewInvoice({ ...newInvoice, dueDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currency">Currency</Label>
                    <Select value={newInvoice.currency} onValueChange={(val) => setNewInvoice({ ...newInvoice, currency: val })}>
                      <SelectTrigger id="currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CURRENCIES).map(([code, { label }]) => (
                          <SelectItem key={code} value={code}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Line Items</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addInvoiceItem}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Item
                    </Button>
                  </div>
                  
                  <div className="space-y-3">
                    {newInvoice.items.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-6">
                          <Input
                            placeholder="Description"
                            value={item.description}
                            onChange={(e) => updateInvoiceItem(index, 'description', e.target.value)}
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="number"
                            placeholder="Qty"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateInvoiceItem(index, 'quantity', parseInt(e.target.value) || 1)}
                          />
                        </div>
                        <div className="col-span-3">
                          <Input
                            type="number"
                            placeholder="Price"
                            min="0"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) => updateInvoiceItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="col-span-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeInvoiceItem(index)}
                            disabled={newInvoice.items.length === 1}
                          >
                            ×
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex justify-end pt-2 border-t">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Total ({newInvoice.currency})</p>
                      <p className="text-xl font-bold">{CURRENCIES[newInvoice.currency]?.symbol}{calculateTotal().toFixed(2)}</p>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    value={newInvoice.notes}
                    onChange={(e) => setNewInvoice({ ...newInvoice, notes: e.target.value })}
                    placeholder="Additional notes or payment terms..."
                    rows={3}
                  />
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
                <Button 
                  onClick={() => createInvoiceMutation.mutate()}
                  disabled={!newInvoice.clientName || !newInvoice.clientEmail || createInvoiceMutation.isPending}
                >
                  {createInvoiceMutation.isPending ? 'Creating...' : 'Create Invoice'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Invoiced</CardDescription>
              <CardTitle className="text-2xl">${stats.total.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Paid</CardDescription>
              <CardTitle className="text-2xl text-green-500">${stats.paid.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending</CardDescription>
              <CardTitle className="text-2xl text-amber-500">${stats.pending.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Overdue</CardDescription>
              <CardTitle className="text-2xl text-red-500">${stats.overdue.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search invoices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {filteredInvoices.length === 0 ? (
          <Card className="p-12 text-center">
            <Receipt className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-medium">No invoices yet</h3>
            <p className="text-muted-foreground mt-2 max-w-md mx-auto">
              Create your first invoice to start tracking payments for your music services
            </p>
            <Button className="mt-6" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Invoice
            </Button>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{invoice.clientName}</p>
                        <p className="text-sm text-muted-foreground">{invoice.clientEmail}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {CURRENCIES[invoice.currency]?.symbol ?? '$'}{invoice.amount.toLocaleString()}
                      </span>
                      {invoice.currency && invoice.currency !== 'USD' && (
                        <span className="text-xs text-muted-foreground ml-1">{invoice.currency}</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                    <TableCell>{format(new Date(invoice.dueDate), 'MMM d, yyyy')}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setSelectedInvoice(invoice);
                            setShowPreviewDialog(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => downloadPDF(invoice.id, invoice.invoiceNumber)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        {invoice.status === 'draft' && (
                          <Button 
                            size="sm"
                            className="h-8"
                            onClick={() => sendInvoiceMutation.mutate(invoice.id)}
                            disabled={sendInvoiceMutation.isPending}
                          >
                            <Send className="h-3.5 w-3.5 mr-1" />
                            Send
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setSelectedInvoice(invoice); setShowPreviewDialog(true); }}>
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => downloadPDF(invoice.id, invoice.invoiceNumber)}>
                              <Download className="h-4 w-4 mr-2" />
                              Download PDF
                            </DropdownMenuItem>
                            {invoice.status === 'draft' && (
                              <>
                                <DropdownMenuItem onClick={() => sendInvoiceMutation.mutate(invoice.id)}>
                                  <Send className="h-4 w-4 mr-2" />
                                  Send to Client
                                </DropdownMenuItem>
                              </>
                            )}
                            {(invoice.status === 'draft' || invoice.status === 'cancelled') && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => setPendingDeleteId(invoice.id)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Invoice {selectedInvoice?.invoiceNumber}</DialogTitle>
            </DialogHeader>
            
            {selectedInvoice && (
              <div className="space-y-6">
                <div className="flex justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Bill To</p>
                    <p className="font-medium">{selectedInvoice.clientName}</p>
                    <p className="text-sm text-muted-foreground">{selectedInvoice.clientEmail}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Invoice Date</p>
                    <p>{format(new Date(selectedInvoice.createdAt), 'MMM d, yyyy')}</p>
                    <p className="text-sm text-muted-foreground mt-2">Due Date</p>
                    <p>{format(new Date(selectedInvoice.dueDate), 'MMM d, yyyy')}</p>
                  </div>
                </div>
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedInvoice.items.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell>{item.description}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">${item.unitPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-right">${(item.quantity * item.unitPrice).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={3} className="text-right font-bold">Total</TableCell>
                      <TableCell className="text-right font-bold">${selectedInvoice.amount.toFixed(2)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                
                <div className="flex items-center justify-between">
                  {getStatusBadge(selectedInvoice.status)}
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => selectedInvoice && downloadPDF(selectedInvoice.id, selectedInvoice.invoiceNumber)}>
                      <Download className="h-4 w-4 mr-2" />
                      Download PDF
                    </Button>
                    {selectedInvoice.status === 'draft' && (
                      <Button onClick={() => sendInvoiceMutation.mutate(selectedInvoice.id)}>
                        <Send className="h-4 w-4 mr-2" />
                        Send Invoice
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Invoice Confirmation */}
        <AlertDialog open={!!pendingDeleteId} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this invoice? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (pendingDeleteId) {
                    deleteInvoiceMutation.mutate(pendingDeleteId);
                    setPendingDeleteId(null);
                  }
                }}
              >
                Delete Invoice
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      )}
    </AppLayout>
  );
}
