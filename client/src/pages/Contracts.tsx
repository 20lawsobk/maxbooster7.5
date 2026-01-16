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
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { FileText, Plus, Download, Send, CheckCircle, Clock, PenTool, Eye, Users, Filter } from 'lucide-react';
import { format } from 'date-fns';

interface ContractTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  variables: string[];
}

interface Contract {
  id: string;
  templateId: string;
  templateName: string;
  status: 'draft' | 'pending_signature' | 'active' | 'voided' | 'expired';
  createdAt: string;
  parties: Array<{ name: string; email: string; signed: boolean }>;
}

export default function Contracts() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedTemplate, setSelectedTemplate] = useState<ContractTemplate | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [variables, setVariables] = useState<Record<string, string>>({});

  const { data: templatesData } = useQuery<{ templates: ContractTemplate[]; categories: string[] }>({
    queryKey: ['/api/contracts/templates'],
    enabled: !!user,
  });

  const { data: contractsData } = useQuery<{ contracts: Contract[] }>({
    queryKey: ['/api/contracts/my-contracts'],
    enabled: !!user,
  });

  const generateContractMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error('No template selected');
      const res = await fetch('/api/contracts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ templateId: selectedTemplate.id, variables }),
      });
      if (!res.ok) throw new Error('Failed to generate contract');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contracts/my-contracts'] });
      setShowCreateDialog(false);
      setSelectedTemplate(null);
      setVariables({});
      toast({ title: 'Contract created', description: 'Your contract has been generated.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  if (!user) {
    setLocation('/login');
    return null;
  }

  const templates = templatesData?.templates || [];
  const contracts = contractsData?.contracts || [];
  const filteredContracts = filterStatus === 'all' 
    ? contracts 
    : contracts.filter(c => c.status === filterStatus);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      draft: { variant: 'outline', label: 'Draft' },
      pending_signature: { variant: 'secondary', label: 'Awaiting Signature' },
      active: { variant: 'default', label: 'Active' },
      voided: { variant: 'destructive', label: 'Voided' },
      expired: { variant: 'outline', label: 'Expired' },
    };
    const { variant, label } = variants[status] || variants.draft;
    return <Badge variant={variant}>{label}</Badge>;
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'collaboration': return <Users className="h-4 w-4" />;
      case 'licensing': return <FileText className="h-4 w-4" />;
      case 'management': return <PenTool className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  return (
    <AppLayout>
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
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Contract
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>Create New Contract</DialogTitle>
                <DialogDescription>
                  {selectedTemplate 
                    ? `Fill in the details for ${selectedTemplate.name}`
                    : 'Choose a template to get started'
                  }
                </DialogDescription>
              </DialogHeader>
              
              {!selectedTemplate ? (
                <ScrollArea className="h-[400px] pr-4">
                  <div className="grid grid-cols-2 gap-3">
                    {templates.map((template) => (
                      <Card 
                        key={template.id}
                        className="cursor-pointer hover:border-primary transition-colors"
                        onClick={() => setSelectedTemplate(template)}
                      >
                        <CardHeader className="p-4">
                          <CardTitle className="text-sm flex items-center gap-2">
                            {getCategoryIcon(template.category)}
                            {template.name}
                          </CardTitle>
                          <CardDescription className="text-xs line-clamp-2">
                            {template.description}
                          </CardDescription>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="space-y-4">
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-sm">
                      {getCategoryIcon(selectedTemplate.category)}
                      <span className="font-medium">{selectedTemplate.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{selectedTemplate.description}</p>
                  </div>
                  
                  <ScrollArea className="h-[300px] pr-4">
                    <div className="space-y-4">
                      {selectedTemplate.variables.map((variable) => (
                        <div key={variable} className="space-y-2">
                          <Label htmlFor={variable}>
                            {variable.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </Label>
                          {variable.includes('description') || variable.includes('terms') ? (
                            <Textarea
                              id={variable}
                              value={variables[variable] || ''}
                              onChange={(e) => setVariables({ ...variables, [variable]: e.target.value })}
                              rows={3}
                            />
                          ) : (
                            <Input
                              id={variable}
                              value={variables[variable] || ''}
                              onChange={(e) => setVariables({ ...variables, [variable]: e.target.value })}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  
                  <DialogFooter className="flex gap-2">
                    <Button variant="outline" onClick={() => setSelectedTemplate(null)}>
                      Back to Templates
                    </Button>
                    <Button 
                      onClick={() => generateContractMutation.mutate()}
                      disabled={generateContractMutation.isPending}
                    >
                      {generateContractMutation.isPending ? 'Creating...' : 'Create Contract'}
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="my-contracts" className="space-y-4">
          <TabsList>
            <TabsTrigger value="my-contracts">My Contracts</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="pending">Pending Signatures</TabsTrigger>
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
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="voided">Voided</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <span className="text-sm text-muted-foreground">
                {filteredContracts.length} contract{filteredContracts.length !== 1 ? 's' : ''}
              </span>
            </div>

            {filteredContracts.length === 0 ? (
              <Card className="p-8 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium">No contracts yet</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Create your first contract using one of our templates
                </p>
                <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
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
                        <CardTitle className="text-lg">{contract.templateName}</CardTitle>
                        {getStatusBadge(contract.status)}
                      </div>
                      <CardDescription>
                        Created {format(new Date(contract.createdAt), 'MMM d, yyyy')}
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
                            {contract.parties.filter(p => p.signed).length}/{contract.parties.length} signed
                          </span>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          setSelectedContract(contract);
                          setShowPreviewDialog(true);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-1" />
                        Download PDF
                      </Button>
                      {contract.status === 'draft' && (
                        <Button size="sm">
                          <Send className="h-4 w-4 mr-1" />
                          Send for Signature
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="templates" className="space-y-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <Card key={template.id}>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      {getCategoryIcon(template.category)}
                      {template.name}
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                      {template.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Badge variant="outline" className="text-xs">
                      {template.category}
                    </Badge>
                  </CardContent>
                  <CardFooter>
                    <Button 
                      className="w-full"
                      onClick={() => {
                        setSelectedTemplate(template);
                        setShowCreateDialog(true);
                      }}
                    >
                      Use Template
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="pending" className="space-y-4">
            {contracts.filter(c => c.status === 'pending_signature').length === 0 ? (
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
                  .filter(c => c.status === 'pending_signature')
                  .map((contract) => (
                    <Card key={contract.id}>
                      <CardHeader>
                        <CardTitle className="text-lg">{contract.templateName}</CardTitle>
                        <CardDescription>
                          Waiting for signatures from:
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {contract.parties.filter(p => !p.signed).map((party, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                              <Clock className="h-4 w-4 text-amber-500" />
                              <span>{party.name}</span>
                              <span className="text-muted-foreground">({party.email})</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                      <CardFooter>
                        <Button variant="outline" size="sm">
                          <Send className="h-4 w-4 mr-1" />
                          Send Reminder
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedContract?.templateName}</DialogTitle>
              <DialogDescription>
                Contract preview
              </DialogDescription>
            </DialogHeader>
            <div className="bg-muted/50 rounded-lg p-6 min-h-[300px]">
              <p className="text-muted-foreground text-center">
                Contract preview would render here with full document content
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPreviewDialog(false)}>Close</Button>
              <Button>
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
