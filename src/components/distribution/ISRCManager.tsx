import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Hash,
  Plus,
  Copy,
  Search,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Download,
  Upload,
  History,
  Barcode,
  Music,
  Disc,
  FileText,
  ExternalLink,
  Trash2,
  Edit,
} from 'lucide-react';

interface ISRCCode {
  id: string;
  code: string;
  trackTitle: string;
  artistName: string;
  releaseId?: string;
  releaseTitle?: string;
  assignedAt: string;
  status: 'active' | 'pending' | 'revoked' | 'expired';
  registrar: string;
  countryCode: string;
  year: string;
  designationCode: string;
}

interface UPCCode {
  id: string;
  code: string;
  releaseTitle: string;
  artistName: string;
  releaseId?: string;
  releaseType: 'single' | 'EP' | 'album';
  assignedAt: string;
  status: 'active' | 'pending' | 'revoked';
  trackCount: number;
}

interface CodeGenerationRequest {
  type: 'isrc' | 'upc';
  count: number;
  tracks?: { title: string; artist: string }[];
  release?: { title: string; artist: string; type: 'single' | 'EP' | 'album' };
}

interface ISRCManagerProps {
  releaseId?: string;
  onCodeAssigned?: (code: string, type: 'isrc' | 'upc') => void;
}

export function ISRCManager({ releaseId, onCodeAssigned }: ISRCManagerProps) {
  const [activeTab, setActiveTab] = useState('isrc');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [generateType, setGenerateType] = useState<'isrc' | 'upc'>('isrc');
  const [generateCount, setGenerateCount] = useState(1);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    message: string;
  } | null>(null);
  const [codeToValidate, setCodeToValidate] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: isrcCodes = [], isLoading: isrcLoading } = useQuery<ISRCCode[]>({
    queryKey: ['/api/distribution/codes/isrc'],
  });

  const { data: upcCodes = [], isLoading: upcLoading } = useQuery<UPCCode[]>({
    queryKey: ['/api/distribution/codes/upc'],
  });

  const { data: codeStats } = useQuery<{
    totalISRC: number;
    usedISRC: number;
    availableISRC: number;
    totalUPC: number;
    usedUPC: number;
    availableUPC: number;
  }>({
    queryKey: ['/api/distribution/codes/stats'],
  });

  const generateCodeMutation = useMutation({
    mutationFn: async (request: CodeGenerationRequest) => {
      const response = await apiRequest('POST', '/api/distribution/codes/generate', request);
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/codes/isrc'] });
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/codes/upc'] });
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/codes/stats'] });
      setIsGenerateOpen(false);
      toast({
        title: 'Codes Generated',
        description: `Successfully generated ${variables.count} ${variables.type.toUpperCase()} code(s)`,
      });
      if (data.code && onCodeAssigned) {
        onCodeAssigned(data.code, variables.type);
      }
    },
    onError: () => {
      toast({
        title: 'Generation Failed',
        description: 'Unable to generate codes. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const validateCodeMutation = useMutation({
    mutationFn: async ({ code, type }: { code: string; type: 'isrc' | 'upc' }) => {
      const response = await apiRequest('POST', '/api/distribution/codes/validate', { code, type });
      return response.json();
    },
    onSuccess: (data) => {
      setValidationResult(data);
    },
    onError: () => {
      setValidationResult({ valid: false, message: 'Validation failed' });
    },
  });

  const assignCodeMutation = useMutation({
    mutationFn: async ({
      codeId,
      releaseId,
      trackId,
    }: {
      codeId: string;
      releaseId: string;
      trackId?: string;
    }) => {
      const response = await apiRequest('POST', `/api/distribution/codes/${codeId}/assign`, {
        releaseId,
        trackId,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/codes/isrc'] });
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/codes/upc'] });
      toast({
        title: 'Code Assigned',
        description: 'The code has been assigned to the release',
      });
    },
  });

  const revokeCodeMutation = useMutation({
    mutationFn: async (codeId: string) => {
      const response = await apiRequest('POST', `/api/distribution/codes/${codeId}/revoke`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/codes/isrc'] });
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/codes/upc'] });
      toast({
        title: 'Code Revoked',
        description: 'The code has been revoked',
      });
    },
  });

  const mockISRCCodes: ISRCCode[] = isrcCodes.length ? isrcCodes : [
    {
      id: '1',
      code: 'USRC12300001',
      trackTitle: 'Midnight Dreams',
      artistName: 'John Doe',
      releaseId: 'rel-1',
      releaseTitle: 'Nocturnal',
      assignedAt: '2024-01-15T10:30:00Z',
      status: 'active',
      registrar: 'US',
      countryCode: 'US',
      year: '23',
      designationCode: '00001',
    },
    {
      id: '2',
      code: 'USRC12300002',
      trackTitle: 'Sunrise',
      artistName: 'John Doe',
      releaseId: 'rel-1',
      releaseTitle: 'Nocturnal',
      assignedAt: '2024-01-15T10:31:00Z',
      status: 'active',
      registrar: 'US',
      countryCode: 'US',
      year: '23',
      designationCode: '00002',
    },
    {
      id: '3',
      code: 'USRC12300003',
      trackTitle: '',
      artistName: '',
      assignedAt: '2024-01-20T14:00:00Z',
      status: 'pending',
      registrar: 'US',
      countryCode: 'US',
      year: '23',
      designationCode: '00003',
    },
    {
      id: '4',
      code: 'GBAYE2300001',
      trackTitle: 'London Calling',
      artistName: 'Jane Smith',
      releaseId: 'rel-2',
      releaseTitle: 'Urban Stories',
      assignedAt: '2024-02-01T09:00:00Z',
      status: 'active',
      registrar: 'GB',
      countryCode: 'GB',
      year: '23',
      designationCode: '00001',
    },
  ];

  const mockUPCCodes: UPCCode[] = upcCodes.length ? upcCodes : [
    {
      id: '1',
      code: '012345678901',
      releaseTitle: 'Nocturnal',
      artistName: 'John Doe',
      releaseId: 'rel-1',
      releaseType: 'album',
      assignedAt: '2024-01-15T10:30:00Z',
      status: 'active',
      trackCount: 12,
    },
    {
      id: '2',
      code: '012345678902',
      releaseTitle: 'Urban Stories',
      artistName: 'Jane Smith',
      releaseId: 'rel-2',
      releaseType: 'EP',
      assignedAt: '2024-02-01T09:00:00Z',
      status: 'active',
      trackCount: 5,
    },
    {
      id: '3',
      code: '012345678903',
      releaseTitle: '',
      artistName: '',
      releaseType: 'single',
      assignedAt: '2024-02-15T11:00:00Z',
      status: 'pending',
      trackCount: 0,
    },
  ];

  const mockStats = codeStats || {
    totalISRC: 100,
    usedISRC: 45,
    availableISRC: 55,
    totalUPC: 50,
    usedUPC: 12,
    availableUPC: 38,
  };

  const filteredISRC = mockISRCCodes.filter(
    (code) =>
      code.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      code.trackTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      code.artistName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredUPC = mockUPCCodes.filter(
    (code) =>
      code.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      code.releaseTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      code.artistName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: 'Copied',
      description: `${code} copied to clipboard`,
    });
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-500/10 text-green-500 border-green-500/20',
      pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      revoked: 'bg-red-500/10 text-red-500 border-red-500/20',
      expired: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
    };
    return <Badge className={styles[status] || styles.pending}>{status}</Badge>;
  };

  const validateCode = (code: string) => {
    const type = code.length === 12 ? 'isrc' : code.length === 12 || code.length === 13 ? 'upc' : null;
    
    if (!type) {
      setValidationResult({ valid: false, message: 'Invalid code length' });
      return;
    }

    if (type === 'isrc') {
      const isrcPattern = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
      if (isrcPattern.test(code)) {
        setValidationResult({ valid: true, message: 'Valid ISRC format' });
      } else {
        setValidationResult({ valid: false, message: 'Invalid ISRC format. Expected: CC-XXX-YY-NNNNN' });
      }
    } else {
      const upcPattern = /^\d{12,13}$/;
      if (upcPattern.test(code)) {
        setValidationResult({ valid: true, message: 'Valid UPC format' });
      } else {
        setValidationResult({ valid: false, message: 'Invalid UPC format. Expected: 12-13 digits' });
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5" />
              ISRC & UPC Manager
            </CardTitle>
            <CardDescription>
              Generate, manage, and track ISRC and UPC codes for your releases
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={isGenerateOpen} onOpenChange={setIsGenerateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Generate Codes
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Generate New Codes</DialogTitle>
                  <DialogDescription>
                    Generate ISRC codes for tracks or UPC codes for releases
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Code Type</Label>
                    <Select
                      value={generateType}
                      onValueChange={(v) => setGenerateType(v as 'isrc' | 'upc')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="isrc">ISRC (Track Codes)</SelectItem>
                        <SelectItem value="upc">UPC (Release Codes)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {generateType === 'isrc'
                        ? 'ISRC codes uniquely identify individual sound recordings'
                        : 'UPC codes identify complete releases (albums, EPs, singles)'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Number of Codes</Label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={generateCount}
                      onChange={(e) => setGenerateCount(parseInt(e.target.value) || 1)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Available: {generateType === 'isrc' ? mockStats.availableISRC : mockStats.availableUPC}
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsGenerateOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() =>
                      generateCodeMutation.mutate({
                        type: generateType,
                        count: generateCount,
                      })
                    }
                    disabled={generateCodeMutation.isPending}
                  >
                    {generateCodeMutation.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Generate {generateCount} Code{generateCount > 1 ? 's' : ''}
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{mockStats.totalISRC}</div>
              <p className="text-xs text-muted-foreground">Total ISRC</p>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-500">{mockStats.usedISRC}</div>
              <p className="text-xs text-muted-foreground">Used ISRC</p>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-500">{mockStats.availableISRC}</div>
              <p className="text-xs text-muted-foreground">Available ISRC</p>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{mockStats.totalUPC}</div>
              <p className="text-xs text-muted-foreground">Total UPC</p>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-500">{mockStats.usedUPC}</div>
              <p className="text-xs text-muted-foreground">Used UPC</p>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-500">{mockStats.availableUPC}</div>
              <p className="text-xs text-muted-foreground">Available UPC</p>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search codes, tracks, or releases..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Validate code..."
                value={codeToValidate}
                onChange={(e) => {
                  setCodeToValidate(e.target.value);
                  setValidationResult(null);
                }}
                className="w-48"
              />
              <Button
                variant="outline"
                onClick={() => validateCode(codeToValidate)}
                disabled={!codeToValidate}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Validate
              </Button>
            </div>
          </div>

          {validationResult && (
            <Alert variant={validationResult.valid ? 'default' : 'destructive'}>
              {validationResult.valid ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertDescription>{validationResult.message}</AlertDescription>
            </Alert>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="isrc" className="gap-2">
              <Music className="h-4 w-4" />
              ISRC Codes
            </TabsTrigger>
            <TabsTrigger value="upc" className="gap-2">
              <Disc className="h-4 w-4" />
              UPC Codes
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="isrc" className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedCodes.length === filteredISRC.length}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedCodes(filteredISRC.map((c) => c.id));
                        } else {
                          setSelectedCodes([]);
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead>ISRC Code</TableHead>
                  <TableHead>Track</TableHead>
                  <TableHead>Artist</TableHead>
                  <TableHead>Release</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredISRC.map((code) => (
                  <TableRow key={code.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedCodes.includes(code.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedCodes([...selectedCodes, code.id]);
                          } else {
                            setSelectedCodes(selectedCodes.filter((id) => id !== code.id));
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-sm bg-muted px-2 py-1 rounded">
                          {code.code}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(code.code)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {code.trackTitle || (
                        <span className="text-muted-foreground italic">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {code.artistName || (
                        <span className="text-muted-foreground italic">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {code.releaseTitle ? (
                        <Badge variant="outline">{code.releaseTitle}</Badge>
                      ) : (
                        <span className="text-muted-foreground italic">-</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(code.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(code.assignedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {code.status === 'pending' && (
                          <Button variant="ghost" size="sm">
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {code.status === 'active' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => revokeCodeMutation.mutate(code.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {filteredISRC.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Music className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No ISRC codes found</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setGenerateType('isrc');
                    setIsGenerateOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Generate ISRC Codes
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="upc" className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedCodes.length === filteredUPC.length}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedCodes(filteredUPC.map((c) => c.id));
                        } else {
                          setSelectedCodes([]);
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead>UPC Code</TableHead>
                  <TableHead>Release</TableHead>
                  <TableHead>Artist</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Tracks</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUPC.map((code) => (
                  <TableRow key={code.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedCodes.includes(code.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedCodes([...selectedCodes, code.id]);
                          } else {
                            setSelectedCodes(selectedCodes.filter((id) => id !== code.id));
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-sm bg-muted px-2 py-1 rounded">
                          {code.code}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(code.code)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {code.releaseTitle || (
                        <span className="text-muted-foreground italic">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {code.artistName || (
                        <span className="text-muted-foreground italic">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {code.releaseType}
                      </Badge>
                    </TableCell>
                    <TableCell>{code.trackCount || '-'}</TableCell>
                    <TableCell>{getStatusBadge(code.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(code.assignedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {code.status === 'pending' && (
                          <Button variant="ghost" size="sm">
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {code.status === 'active' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => revokeCodeMutation.mutate(code.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {filteredUPC.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Disc className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No UPC codes found</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setGenerateType('upc');
                    setIsGenerateOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Generate UPC Codes
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <div className="space-y-4">
              {[...mockISRCCodes, ...mockUPCCodes]
                .sort(
                  (a, b) =>
                    new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()
                )
                .slice(0, 20)
                .map((code) => {
                  const isISRC = 'trackTitle' in code;
                  return (
                    <Card key={code.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {isISRC ? (
                            <Music className="h-8 w-8 text-primary" />
                          ) : (
                            <Disc className="h-8 w-8 text-primary" />
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <code className="font-mono font-medium">{code.code}</code>
                              <Badge variant="outline">{isISRC ? 'ISRC' : 'UPC'}</Badge>
                              {getStatusBadge(code.status)}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {isISRC
                                ? `${(code as ISRCCode).trackTitle || 'Unassigned'} - ${(code as ISRCCode).artistName || 'Unknown'}`
                                : `${(code as UPCCode).releaseTitle || 'Unassigned'} - ${(code as UPCCode).artistName || 'Unknown'}`}
                            </p>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(code.assignedAt).toLocaleString()}
                        </div>
                      </div>
                    </Card>
                  );
                })}
            </div>
          </TabsContent>
        </Tabs>

        {selectedCodes.length > 0 && (
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <span className="text-sm">
              {selectedCodes.length} code{selectedCodes.length > 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export Selected
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  selectedCodes.forEach((id) => revokeCodeMutation.mutate(id));
                  setSelectedCodes([]);
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Revoke Selected
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
