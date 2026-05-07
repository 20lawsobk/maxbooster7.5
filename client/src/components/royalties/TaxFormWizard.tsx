import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Shield,
  Globe,
  Info,
  Loader2,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';

type TaxFormType = 'W-9' | 'W-8BEN' | 'W-8BEN-E';
type TaxFormStatus = 'not_started' | 'in_progress' | 'pending_review' | 'approved' | 'rejected';

interface TaxFormWizardProps {
  currentFormType?: TaxFormType | null;
  currentStatus?: TaxFormStatus;
  rejectionReason?: string;
  onSubmit: (formData: TaxFormData) => Promise<void>;
  onDownloadForm?: (formType: TaxFormType) => void;
  isUSPerson?: boolean;
  withholdingRate?: number;
  treatyCountry?: string;
}

export interface TaxFormData {
  formType: TaxFormType;
  name: string;
  businessName?: string;
  taxClassification?: string;
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  tinType: 'ssn' | 'ein' | 'itin' | 'foreign_tin';
  tin: string;
  countryOfCitizenship?: string;
  claimTreatyBenefits?: boolean;
  treatyCountry?: string;
  certify: boolean;
  signature: string;
  signatureDate: Date;
}

const STEPS = [
  { id: 'type', title: 'Form Type', description: 'Select your tax form' },
  { id: 'info', title: 'Personal Info', description: 'Your details' },
  { id: 'address', title: 'Address', description: 'Your address' },
  { id: 'tin', title: 'Tax ID', description: 'Tax identification' },
  { id: 'certify', title: 'Certify', description: 'Sign and submit' },
];

const COUNTRIES_WITH_TREATIES = [
  'Australia', 'Austria', 'Belgium', 'Canada', 'China', 'Czech Republic',
  'Denmark', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'India',
  'Ireland', 'Israel', 'Italy', 'Japan', 'Luxembourg', 'Mexico', 'Netherlands',
  'New Zealand', 'Norway', 'Poland', 'Portugal', 'Russia', 'Singapore',
  'South Africa', 'South Korea', 'Spain', 'Sweden', 'Switzerland', 'Turkey',
  'United Kingdom',
];

export function TaxFormWizard({
  currentFormType,
  currentStatus = 'not_started',
  rejectionReason,
  onSubmit,
  onDownloadForm,
  isUSPerson,
  withholdingRate,
  treatyCountry,
}: TaxFormWizardProps) {
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<Partial<TaxFormData>>({
    formType: currentFormType || undefined,
    address: {
      street: '',
      city: '',
      state: '',
      postalCode: '',
      country: isUSPerson ? 'United States' : '',
    },
    certify: false,
    signature: '',
    signatureDate: new Date(),
  });

  const progress = useMemo(() => {
    return ((step + 1) / STEPS.length) * 100;
  }, [step]);

  const getStatusBadge = () => {
    const badges: Record<TaxFormStatus, { className: string; icon: React.ReactNode; label: string }> = {
      not_started: {
        className: 'bg-muted text-muted-foreground',
        icon: <AlertCircle className="w-3 h-3" />,
        label: 'Not Started',
      },
      in_progress: {
        className: 'bg-blue-500/20 text-blue-500',
        icon: <Clock className="w-3 h-3" />,
        label: 'In Progress',
      },
      pending_review: {
        className: 'bg-amber-500/20 text-amber-500',
        icon: <Clock className="w-3 h-3" />,
        label: 'Pending Review',
      },
      approved: {
        className: 'bg-green-500/20 text-green-500',
        icon: <CheckCircle className="w-3 h-3" />,
        label: 'Approved',
      },
      rejected: {
        className: 'bg-red-500/20 text-red-500',
        icon: <XCircle className="w-3 h-3" />,
        label: 'Rejected',
      },
    };

    const config = badges[currentStatus];
    return (
      <Badge className={`${config.className} flex items-center gap-1`}>
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const handleSubmit = async () => {
    if (!formData.certify || !formData.signature) return;

    setIsSubmitting(true);
    try {
      await onSubmit(formData as TaxFormData);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateFormData = (updates: Partial<TaxFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const updateAddress = (updates: Partial<TaxFormData['address']>) => {
    setFormData((prev) => ({
      ...prev,
      address: { ...prev.address!, ...updates },
    }));
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4" data-testid="step-form-type">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(['W-9', 'W-8BEN', 'W-8BEN-E'] as TaxFormType[]).map((type) => (
                <div
                  key={type}
                  onClick={() => {
                    updateFormData({ formType: type });
                    updateAddress({ country: type === 'W-9' ? 'United States' : '' });
                  }}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    formData.formType === type
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                  data-testid={`form-type-${type}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <FileText className="w-6 h-6" />
                    <span className="font-semibold">{type}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {type === 'W-9' && 'For US persons (citizens, residents, entities)'}
                    {type === 'W-8BEN' && 'For foreign individuals'}
                    {type === 'W-8BEN-E' && 'For foreign entities'}
                  </p>
                </div>
              ))}
            </div>

            {withholdingRate !== undefined && (
              <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-amber-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-500">Tax Withholding</p>
                    <p className="text-sm text-muted-foreground">
                      Current withholding rate: {withholdingRate}%
                      {treatyCountry && ` (${treatyCountry} treaty applied)`}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 1:
        return (
          <div className="space-y-4" data-testid="step-personal-info">
            <div className="space-y-2">
              <Label htmlFor="name">Legal Name *</Label>
              <Input
                id="name"
                placeholder="As shown on your tax return"
                value={formData.name || ''}
                onChange={(e) => updateFormData({ name: e.target.value })}
                data-testid="input-legal-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessName">Business Name (if different)</Label>
              <Input
                id="businessName"
                placeholder="DBA or disregarded entity name"
                value={formData.businessName || ''}
                onChange={(e) => updateFormData({ businessName: e.target.value })}
              />
            </div>

            {formData.formType === 'W-9' && (
              <div className="space-y-2">
                <Label>Tax Classification *</Label>
                <Select
                  value={formData.taxClassification || ''}
                  onValueChange={(value) => updateFormData({ taxClassification: value })}
                >
                  <SelectTrigger data-testid="select-tax-classification">
                    <SelectValue placeholder="Select classification" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual/Sole Proprietor</SelectItem>
                    <SelectItem value="c_corp">C Corporation</SelectItem>
                    <SelectItem value="s_corp">S Corporation</SelectItem>
                    <SelectItem value="partnership">Partnership</SelectItem>
                    <SelectItem value="trust">Trust/Estate</SelectItem>
                    <SelectItem value="llc">LLC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {(formData.formType === 'W-8BEN' || formData.formType === 'W-8BEN-E') && (
              <div className="space-y-2">
                <Label>Country of Citizenship *</Label>
                <Select
                  value={formData.countryOfCitizenship || ''}
                  onValueChange={(value) => updateFormData({ countryOfCitizenship: value })}
                >
                  <SelectTrigger data-testid="select-country-citizenship">
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES_WITH_TREATIES.map((country) => (
                      <SelectItem key={country} value={country}>
                        {country}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-4" data-testid="step-address">
            <div className="space-y-2">
              <Label htmlFor="street">Street Address *</Label>
              <Input
                id="street"
                placeholder="123 Main St, Apt 4"
                value={formData.address?.street || ''}
                onChange={(e) => updateAddress({ street: e.target.value })}
                data-testid="input-street"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={formData.address?.city || ''}
                  onChange={(e) => updateAddress({ city: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State/Province *</Label>
                <Input
                  id="state"
                  value={formData.address?.state || ''}
                  onChange={(e) => updateAddress({ state: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="postalCode">Postal Code *</Label>
                <Input
                  id="postalCode"
                  value={formData.address?.postalCode || ''}
                  onChange={(e) => updateAddress({ postalCode: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country *</Label>
                <Input
                  id="country"
                  value={formData.address?.country || ''}
                  onChange={(e) => updateAddress({ country: e.target.value })}
                  disabled={formData.formType === 'W-9'}
                />
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4" data-testid="step-tax-id">
            <div className="space-y-2">
              <Label>Tax ID Type *</Label>
              <Select
                value={formData.tinType || ''}
                onValueChange={(value: TaxFormData['tinType']) => updateFormData({ tinType: value })}
              >
                <SelectTrigger data-testid="select-tin-type">
                  <SelectValue placeholder="Select TIN type" />
                </SelectTrigger>
                <SelectContent>
                  {formData.formType === 'W-9' ? (
                    <>
                      <SelectItem value="ssn">Social Security Number (SSN)</SelectItem>
                      <SelectItem value="ein">Employer Identification Number (EIN)</SelectItem>
                      <SelectItem value="itin">Individual Taxpayer ID (ITIN)</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="foreign_tin">Foreign Tax ID</SelectItem>
                      <SelectItem value="ssn">US SSN (if applicable)</SelectItem>
                      <SelectItem value="itin">US ITIN (if applicable)</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tin">Tax Identification Number *</Label>
              <Input
                id="tin"
                type="password"
                placeholder="XXX-XX-XXXX"
                value={formData.tin || ''}
                onChange={(e) => updateFormData({ tin: e.target.value })}
                data-testid="input-tin"
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Shield className="w-3 h-3" />
                Your tax ID is encrypted and stored securely
              </p>
            </div>

            {(formData.formType === 'W-8BEN' || formData.formType === 'W-8BEN-E') && (
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="claimTreaty"
                    checked={formData.claimTreatyBenefits || false}
                    onCheckedChange={(checked) =>
                      updateFormData({ claimTreatyBenefits: checked as boolean })
                    }
                  />
                  <Label htmlFor="claimTreaty" className="flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    Claim tax treaty benefits
                  </Label>
                </div>

                {formData.claimTreatyBenefits && (
                  <div className="space-y-2 pl-6">
                    <Label>Treaty Country</Label>
                    <Select
                      value={formData.treatyCountry || ''}
                      onValueChange={(value) => updateFormData({ treatyCountry: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select treaty country" />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRIES_WITH_TREATIES.map((country) => (
                          <SelectItem key={country} value={country}>
                            {country}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </div>
        );

      case 4:
        return (
          <div className="space-y-4" data-testid="step-certify">
            <div className="p-4 rounded-lg bg-muted/50 text-sm space-y-2">
              <p className="font-semibold">Certification</p>
              <p>Under penalties of perjury, I certify that:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>The number shown on this form is my correct taxpayer identification number</li>
                <li>I am not subject to backup withholding</li>
                {formData.formType === 'W-9' && (
                  <li>I am a U.S. citizen or other U.S. person</li>
                )}
                {formData.formType !== 'W-9' && (
                  <li>I am the beneficial owner of the income to which this form relates</li>
                )}
              </ol>
            </div>

            <div className="flex items-start space-x-2">
              <Checkbox
                id="certify"
                checked={formData.certify || false}
                onCheckedChange={(checked) => updateFormData({ certify: checked as boolean })}
                data-testid="checkbox-certify"
              />
              <Label htmlFor="certify" className="text-sm">
                I certify that the information provided above is true and correct.
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="signature">Electronic Signature *</Label>
              <Input
                id="signature"
                placeholder="Type your full legal name"
                value={formData.signature || ''}
                onChange={(e) => updateFormData({ signature: e.target.value })}
                data-testid="input-signature"
              />
              <p className="text-xs text-muted-foreground">
                Date: {new Date().toLocaleDateString()}
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const canProceed = () => {
    switch (step) {
      case 0:
        return !!formData.formType;
      case 1:
        return !!formData.name && (formData.formType !== 'W-9' || !!formData.taxClassification);
      case 2:
        return !!(
          formData.address?.street &&
          formData.address?.city &&
          formData.address?.state &&
          formData.address?.postalCode &&
          formData.address?.country
        );
      case 3:
        return !!formData.tinType && !!formData.tin;
      case 4:
        return !!formData.certify && !!formData.signature;
      default:
        return false;
    }
  };

  if (currentStatus === 'approved') {
    return (
      <Card className="glassmorphism" data-testid="tax-form-approved">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Tax Information
            </CardTitle>
            {getStatusBadge()}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-8">
            <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
            <p className="text-xl font-semibold mb-2">Tax Form Approved</p>
            <p className="text-muted-foreground text-center mb-4">
              Your {currentFormType} form has been verified. You're all set to receive payouts.
            </p>
            {onDownloadForm && currentFormType && (
              <Button variant="outline" onClick={() => onDownloadForm(currentFormType)}>
                <FileText className="w-4 h-4 mr-2" />
                Download Copy
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (currentStatus === 'pending_review') {
    return (
      <Card className="glassmorphism" data-testid="tax-form-pending">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Tax Information
            </CardTitle>
            {getStatusBadge()}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-8">
            <Clock className="w-16 h-16 text-amber-500 mb-4" />
            <p className="text-xl font-semibold mb-2">Under Review</p>
            <p className="text-muted-foreground text-center">
              Your {currentFormType} form has been submitted and is being reviewed.
              This usually takes 1-2 business days.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glassmorphism" data-testid="tax-form-wizard">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Tax Information
            </CardTitle>
            <CardDescription className="mt-1">{STEPS[step].description}</CardDescription>
          </div>
          {currentStatus !== 'not_started' && getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {currentStatus === 'rejected' && rejectionReason && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20" data-testid="rejection-notice">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
              <div>
                <p className="font-medium text-red-500">Form Rejected</p>
                <p className="text-sm text-muted-foreground">{rejectionReason}</p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>{STEPS[step].title}</span>
            <span className="text-muted-foreground">
              Step {step + 1} of {STEPS.length}
            </span>
          </div>
          <Progress value={progress} />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          {STEPS.map((s, index) => (
            <div
              key={s.id}
              className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs whitespace-nowrap ${
                index < step
                  ? 'bg-green-500/20 text-green-500'
                  : index === step
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {index < step ? (
                <CheckCircle className="w-3 h-3" />
              ) : (
                <span>{index + 1}</span>
              )}
              {s.title}
            </div>
          ))}
        </div>

        {renderStep()}

        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={step === 0}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button onClick={handleNext} disabled={!canProceed()}>
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!canProceed() || isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Submit Form
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
