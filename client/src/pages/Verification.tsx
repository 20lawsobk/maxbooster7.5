import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Shield, Upload, CheckCircle, AlertCircle, Clock, FileText, User, Building2, CreditCard } from 'lucide-react';

interface VerificationStatus {
  status: 'not_started' | 'pending' | 'submitted' | 'approved' | 'rejected';
  verification?: {
    id: string;
    type: 'individual' | 'business';
    level: string;
    currentStep: number;
    totalSteps: number;
    rejectionReason?: string;
  };
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
  
  const [verificationType, setVerificationType] = useState<'individual' | 'business'>('individual');
  const [step, setStep] = useState(1);
  
  const [individualInfo, setIndividualInfo] = useState<IndividualInfo>({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    nationality: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
  });
  
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>({
    businessName: '',
    businessType: '',
    businessRegistrationNumber: '',
    taxIdNumber: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
  });

  const { data: status, isLoading } = useQuery<VerificationStatus>({
    queryKey: ['/api/kyc/status'],
    enabled: !!user,
  });

  const startVerificationMutation = useMutation({
    mutationFn: async (type: 'individual' | 'business') => {
      const res = await fetch('/api/kyc/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type, level: 'enhanced' }),
      });
      if (!res.ok) throw new Error('Failed to start verification');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/kyc/status'] });
      setStep(2);
      toast({ title: 'Verification started', description: 'Please provide your information.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const submitInfoMutation = useMutation({
    mutationFn: async () => {
      const endpoint = verificationType === 'individual' ? '/api/kyc/individual' : '/api/kyc/business';
      const data = verificationType === 'individual' ? individualInfo : businessInfo;
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to submit information');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/kyc/status'] });
      setStep(3);
      toast({ title: 'Information saved', description: 'Please upload your documents.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  if (!user) {
    setLocation('/login');
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const getStatusBadge = () => {
    const s = status?.status || 'not_started';
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
      not_started: { variant: 'outline', icon: <Clock className="h-3 w-3" /> },
      pending: { variant: 'secondary', icon: <Clock className="h-3 w-3" /> },
      submitted: { variant: 'secondary', icon: <FileText className="h-3 w-3" /> },
      approved: { variant: 'default', icon: <CheckCircle className="h-3 w-3" /> },
      rejected: { variant: 'destructive', icon: <AlertCircle className="h-3 w-3" /> },
    };
    const { variant, icon } = variants[s] || variants.not_started;
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        {icon}
        {s.replace('_', ' ').charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}
      </Badge>
    );
  };

  if (status?.status === 'approved') {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-2xl mx-auto">
          <Card className="border-green-500/50 bg-green-500/5">
            <CardHeader className="text-center">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <CardTitle className="text-2xl">Identity Verified</CardTitle>
              <CardDescription>
                Your identity has been verified. You can now receive payouts and access all platform features.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button onClick={() => setLocation('/dashboard')}>Return to Dashboard</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
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

        {status?.verification?.rejectionReason && (
          <Card className="border-destructive bg-destructive/10">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Verification Rejected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p>{status.verification.rejectionReason}</p>
              <Button className="mt-4" onClick={() => startVerificationMutation.mutate(verificationType)}>
                Start New Verification
              </Button>
            </CardContent>
          </Card>
        )}

        {status?.verification && status.status !== 'rejected' && (
          <Card>
            <CardHeader>
              <CardTitle>Verification Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <Progress 
                value={(status.verification.currentStep / status.verification.totalSteps) * 100} 
                className="h-3"
              />
              <p className="text-sm text-muted-foreground mt-2">
                Step {status.verification.currentStep} of {status.verification.totalSteps}
              </p>
            </CardContent>
          </Card>
        )}

        {(status?.status === 'not_started' || !status?.verification) && step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Choose Verification Type</CardTitle>
              <CardDescription>
                Select whether you're verifying as an individual artist or a business entity
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Tabs value={verificationType} onValueChange={(v) => setVerificationType(v as 'individual' | 'business')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="individual" className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Individual
                  </TabsTrigger>
                  <TabsTrigger value="business" className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Business
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="individual" className="mt-4">
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <h4 className="font-medium">Individual Verification</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Government-issued photo ID (passport, driver's license)</li>
                      <li>• Proof of address (utility bill, bank statement)</li>
                      <li>• Selfie for facial verification</li>
                      <li>• Tax information (W-9 for US residents)</li>
                    </ul>
                  </div>
                </TabsContent>
                <TabsContent value="business" className="mt-4">
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <h4 className="font-medium">Business Verification</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Business registration documents</li>
                      <li>• Articles of incorporation</li>
                      <li>• Tax ID documentation (EIN)</li>
                      <li>• Proof of business address</li>
                      <li>• Authorized representative ID</li>
                    </ul>
                  </div>
                </TabsContent>
              </Tabs>

              <Button 
                className="w-full" 
                onClick={() => startVerificationMutation.mutate(verificationType)}
                disabled={startVerificationMutation.isPending}
              >
                {startVerificationMutation.isPending ? 'Starting...' : 'Start Verification'}
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>
                {verificationType === 'individual' ? 'Personal Information' : 'Business Information'}
              </CardTitle>
              <CardDescription>
                Please provide accurate information matching your official documents
              </CardDescription>
            </CardHeader>
            <CardContent>
              {verificationType === 'individual' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={individualInfo.firstName}
                      onChange={(e) => setIndividualInfo({ ...individualInfo, firstName: e.target.value })}
                      placeholder="John"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={individualInfo.lastName}
                      onChange={(e) => setIndividualInfo({ ...individualInfo, lastName: e.target.value })}
                      placeholder="Doe"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dob">Date of Birth</Label>
                    <Input
                      id="dob"
                      type="date"
                      value={individualInfo.dateOfBirth}
                      onChange={(e) => setIndividualInfo({ ...individualInfo, dateOfBirth: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nationality">Nationality</Label>
                    <Input
                      id="nationality"
                      value={individualInfo.nationality}
                      onChange={(e) => setIndividualInfo({ ...individualInfo, nationality: e.target.value })}
                      placeholder="United States"
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="address">Street Address</Label>
                    <Input
                      id="address"
                      value={individualInfo.address}
                      onChange={(e) => setIndividualInfo({ ...individualInfo, address: e.target.value })}
                      placeholder="123 Main St"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={individualInfo.city}
                      onChange={(e) => setIndividualInfo({ ...individualInfo, city: e.target.value })}
                      placeholder="Los Angeles"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State/Province</Label>
                    <Input
                      id="state"
                      value={individualInfo.state}
                      onChange={(e) => setIndividualInfo({ ...individualInfo, state: e.target.value })}
                      placeholder="California"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postalCode">Postal Code</Label>
                    <Input
                      id="postalCode"
                      value={individualInfo.postalCode}
                      onChange={(e) => setIndividualInfo({ ...individualInfo, postalCode: e.target.value })}
                      placeholder="90001"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Select
                      value={individualInfo.country}
                      onValueChange={(v) => setIndividualInfo({ ...individualInfo, country: v })}
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
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="businessName">Business Name</Label>
                    <Input
                      id="businessName"
                      value={businessInfo.businessName}
                      onChange={(e) => setBusinessInfo({ ...businessInfo, businessName: e.target.value })}
                      placeholder="Acme Records LLC"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="businessType">Business Type</Label>
                    <Select
                      value={businessInfo.businessType}
                      onValueChange={(v) => setBusinessInfo({ ...businessInfo, businessType: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="llc">LLC</SelectItem>
                        <SelectItem value="corporation">Corporation</SelectItem>
                        <SelectItem value="partnership">Partnership</SelectItem>
                        <SelectItem value="sole_proprietorship">Sole Proprietorship</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="regNumber">Registration Number</Label>
                    <Input
                      id="regNumber"
                      value={businessInfo.businessRegistrationNumber}
                      onChange={(e) => setBusinessInfo({ ...businessInfo, businessRegistrationNumber: e.target.value })}
                      placeholder="12-3456789"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="taxId">Tax ID (EIN)</Label>
                    <Input
                      id="taxId"
                      value={businessInfo.taxIdNumber}
                      onChange={(e) => setBusinessInfo({ ...businessInfo, taxIdNumber: e.target.value })}
                      placeholder="XX-XXXXXXX"
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="bizAddress">Business Address</Label>
                    <Input
                      id="bizAddress"
                      value={businessInfo.address}
                      onChange={(e) => setBusinessInfo({ ...businessInfo, address: e.target.value })}
                      placeholder="456 Business Ave"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bizCity">City</Label>
                    <Input
                      id="bizCity"
                      value={businessInfo.city}
                      onChange={(e) => setBusinessInfo({ ...businessInfo, city: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bizState">State</Label>
                    <Input
                      id="bizState"
                      value={businessInfo.state}
                      onChange={(e) => setBusinessInfo({ ...businessInfo, state: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bizPostal">Postal Code</Label>
                    <Input
                      id="bizPostal"
                      value={businessInfo.postalCode}
                      onChange={(e) => setBusinessInfo({ ...businessInfo, postalCode: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bizCountry">Country</Label>
                    <Select
                      value={businessInfo.country}
                      onValueChange={(v) => setBusinessInfo({ ...businessInfo, country: v })}
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
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button 
                  className="flex-1"
                  onClick={() => submitInfoMutation.mutate()}
                  disabled={submitInfoMutation.isPending}
                >
                  {submitInfoMutation.isPending ? 'Saving...' : 'Save & Continue'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Document Upload
              </CardTitle>
              <CardDescription>
                Upload clear photos or scans of your documents
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                {verificationType === 'individual' ? (
                  <>
                    <DocumentUploadCard title="Government ID" description="Passport, driver's license, or national ID" type="government_id" />
                    <DocumentUploadCard title="Proof of Address" description="Utility bill or bank statement (last 3 months)" type="proof_of_address" />
                    <DocumentUploadCard title="Selfie Verification" description="Take a selfie holding your ID" type="selfie" />
                  </>
                ) : (
                  <>
                    <DocumentUploadCard title="Business Registration" description="Certificate of incorporation or registration" type="business_registration" />
                    <DocumentUploadCard title="Tax ID Document" description="EIN letter or equivalent" type="tax_id_document" />
                    <DocumentUploadCard title="Proof of Address" description="Business utility bill or bank statement" type="proof_of_address" />
                  </>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button className="flex-1">Submit for Review</Button>
              </div>
            </CardContent>
          </Card>
        )}

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
      </div>
    </div>
  );
}

function DocumentUploadCard({ title, description, type }: { title: string; description: string; type: string }) {
  const [uploaded, setUploaded] = useState(false);
  
  return (
    <div className={`border rounded-lg p-4 ${uploaded ? 'border-green-500 bg-green-500/5' : 'border-dashed'}`}>
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium">{title}</h4>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {uploaded ? (
          <CheckCircle className="h-6 w-6 text-green-500" />
        ) : (
          <Button variant="outline" size="sm" onClick={() => setUploaded(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload
          </Button>
        )}
      </div>
    </div>
  );
}
