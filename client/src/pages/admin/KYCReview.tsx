import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { 
  Shield, 
  CheckCircle, 
  XCircle, 
  Clock, 
  User, 
  Building2, 
  FileText, 
  Eye, 
  ChevronDown, 
  ChevronUp,
  Loader2,
  Download,
  AlertCircle
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface KYCDocument {
  id: string;
  documentType: string;
  fileName: string;
  storagePath: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  reviewedBy?: string;
  createdAt: string;
}

interface KYCVerification {
  id: string;
  userId: string;
  verificationType: 'individual' | 'business';
  level: string;
  status: string;
  firstName?: string;
  lastName?: string;
  businessName?: string;
  dateOfBirth?: string;
  nationality?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  taxIdNumber?: string;
  businessType?: string;
  businessRegistrationNumber?: string;
  submittedAt?: string;
  createdAt: string;
  documents?: KYCDocument[];
  user?: {
    email: string;
    username: string;
  };
}

interface PendingVerificationsResponse {
  verifications: KYCVerification[];
}

export default function KYCReview() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedVerification, setSelectedVerification] = useState<KYCVerification | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('under_review');

  const { data: pendingData, isLoading } = useQuery<PendingVerificationsResponse>({
    queryKey: ['/api/kyc/admin/pending', statusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/kyc/admin/pending?status=${statusFilter}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch verifications');
      return res.json();
    },
    enabled: !!user?.isAdmin,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ verificationId, action, notes, reason }: { 
      verificationId: string; 
      action: 'approve' | 'reject';
      notes?: string;
      reason?: string;
    }) => {
      const res = await fetch(`/api/kyc/admin/review/${verificationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, notes, reason }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to review verification');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/kyc/admin/pending'] });
      toast({ 
        title: `Verification ${variables.action === 'approve' ? 'approved' : 'rejected'}`,
        description: `The verification has been ${variables.action === 'approve' ? 'approved' : 'rejected'} successfully.`
      });
      setSelectedVerification(null);
      setReviewAction(null);
      setRejectionReason('');
      setReviewNotes('');
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const documentReviewMutation = useMutation({
    mutationFn: async ({ documentId, approved, reason }: { 
      documentId: string; 
      approved: boolean;
      reason?: string;
    }) => {
      const res = await fetch(`/api/kyc/admin/documents/${documentId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ approved, reason }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to review document');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/kyc/admin/pending'] });
      toast({ title: 'Document reviewed', description: 'Document status updated.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>You don't have permission to access this page.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const verifications = pendingData?.verifications || [];

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
      pending: { variant: 'outline', icon: <Clock className="h-3 w-3" /> },
      under_review: { variant: 'secondary', icon: <FileText className="h-3 w-3" /> },
      verified: { variant: 'default', icon: <CheckCircle className="h-3 w-3" /> },
      rejected: { variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
      expired: { variant: 'destructive', icon: <AlertCircle className="h-3 w-3" /> },
    };
    const { variant, icon } = variants[status] || variants.pending;
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        {icon}
        {status.replace('_', ' ').charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
      </Badge>
    );
  };

  const getDocumentTypeName = (type: string) => {
    const names: Record<string, string> = {
      government_id: 'Government ID',
      passport: 'Passport',
      drivers_license: "Driver's License",
      proof_of_address: 'Proof of Address',
      bank_statement: 'Bank Statement',
      business_registration: 'Business Registration',
      articles_of_incorporation: 'Articles of Incorporation',
      tax_id_document: 'Tax ID Document',
      selfie: 'Selfie Verification',
      w9: 'W-9 Form',
      w8ben: 'W-8BEN Form',
      w8bene: 'W-8BEN-E Form',
      other: 'Other Document',
    };
    return names[type] || type;
  };

  const handleReview = () => {
    if (!selectedVerification || !reviewAction) return;
    
    if (reviewAction === 'reject' && !rejectionReason.trim()) {
      toast({ title: 'Error', description: 'Please provide a rejection reason.', variant: 'destructive' });
      return;
    }

    reviewMutation.mutate({
      verificationId: selectedVerification.id,
      action: reviewAction,
      notes: reviewNotes || undefined,
      reason: reviewAction === 'reject' ? rejectionReason : undefined,
    });
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Shield className="h-8 w-8 text-primary" />
              KYC Verification Review
            </h1>
            <p className="text-muted-foreground mt-1">
              Review and approve identity verification requests
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="pending">Pending Documents</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="outline" className="text-lg px-4 py-2">
              {verifications.length} {statusFilter === 'all' ? 'Total' : statusFilter.replace('_', ' ')}
            </Badge>
          </div>
        </div>

        {verifications.length === 0 ? (
          <Card className="bg-muted/30">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
              <h3 className="text-xl font-semibold">No Pending Verifications</h3>
              <p className="text-muted-foreground">
                All verification requests have been reviewed.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {verifications.map((verification) => (
              <Collapsible
                key={verification.id}
                open={expandedId === verification.id}
                onOpenChange={(open) => setExpandedId(open ? verification.id : null)}
              >
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-full ${verification.verificationType === 'individual' ? 'bg-blue-500/10' : 'bg-purple-500/10'}`}>
                          {verification.verificationType === 'individual' ? (
                            <User className="h-6 w-6 text-blue-500" />
                          ) : (
                            <Building2 className="h-6 w-6 text-purple-500" />
                          )}
                        </div>
                        <div>
                          <CardTitle className="text-lg">
                            {verification.verificationType === 'individual' 
                              ? `${verification.firstName || ''} ${verification.lastName || ''}`.trim() || 'Individual Verification'
                              : verification.businessName || 'Business Verification'}
                          </CardTitle>
                          <CardDescription>
                            {verification.user?.email || 'No email'} | Submitted {verification.submittedAt ? new Date(verification.submittedAt).toLocaleDateString() : 'N/A'}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getStatusBadge(verification.status)}
                        <Badge variant="outline">{verification.level}</Badge>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm">
                            {expandedId === verification.id ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                    </div>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="pt-4 border-t">
                      <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <h4 className="font-semibold">Personal/Business Information</h4>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            {verification.verificationType === 'individual' ? (
                              <>
                                <div>
                                  <span className="text-muted-foreground">Full Name:</span>
                                  <p className="font-medium">{verification.firstName} {verification.lastName}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Date of Birth:</span>
                                  <p className="font-medium">{verification.dateOfBirth ? new Date(verification.dateOfBirth).toLocaleDateString() : 'N/A'}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Nationality:</span>
                                  <p className="font-medium">{verification.nationality || 'N/A'}</p>
                                </div>
                              </>
                            ) : (
                              <>
                                <div>
                                  <span className="text-muted-foreground">Business Name:</span>
                                  <p className="font-medium">{verification.businessName}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Business Type:</span>
                                  <p className="font-medium">{verification.businessType || 'N/A'}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Registration #:</span>
                                  <p className="font-medium">{verification.businessRegistrationNumber || 'N/A'}</p>
                                </div>
                              </>
                            )}
                            <div>
                              <span className="text-muted-foreground">Tax ID:</span>
                              <p className="font-medium">{verification.taxIdNumber || 'N/A'}</p>
                            </div>
                            <div className="col-span-2">
                              <span className="text-muted-foreground">Address:</span>
                              <p className="font-medium">
                                {[verification.address, verification.city, verification.state, verification.postalCode, verification.country].filter(Boolean).join(', ') || 'N/A'}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h4 className="font-semibold">Uploaded Documents</h4>
                          {verification.documents && verification.documents.length > 0 ? (
                            <div className="space-y-2">
                              {verification.documents.map((doc) => (
                                <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                                  <div className="flex items-center gap-3">
                                    <FileText className="h-5 w-5 text-muted-foreground" />
                                    <div>
                                      <p className="font-medium text-sm">{getDocumentTypeName(doc.documentType)}</p>
                                      <p className="text-xs text-muted-foreground">{doc.fileName}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {doc.status === 'approved' && (
                                      <Badge className="bg-green-500">Approved</Badge>
                                    )}
                                    {doc.status === 'rejected' && (
                                      <Badge variant="destructive">Rejected</Badge>
                                    )}
                                    {doc.status === 'pending' && (
                                      <>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => window.open(`/api/kyc/admin/documents/${doc.id}/view`, '_blank')}
                                        >
                                          <Eye className="h-3 w-3 mr-1" />
                                          View
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="text-green-500 hover:text-green-600"
                                          onClick={() => documentReviewMutation.mutate({ documentId: doc.id, approved: true })}
                                          disabled={documentReviewMutation.isPending}
                                        >
                                          <CheckCircle className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="text-destructive hover:text-destructive/80"
                                          onClick={() => documentReviewMutation.mutate({ documentId: doc.id, approved: false, reason: 'Document does not meet requirements' })}
                                          disabled={documentReviewMutation.isPending}
                                        >
                                          <XCircle className="h-4 w-4" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-muted-foreground text-sm">No documents uploaded</p>
                          )}
                        </div>
                      </div>

                      {verification.status === 'under_review' && (
                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                          <Button
                            variant="outline"
                            className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                            onClick={() => {
                              setSelectedVerification(verification);
                              setReviewAction('reject');
                            }}
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Reject
                          </Button>
                          <Button
                            className="bg-green-500 hover:bg-green-600"
                            onClick={() => {
                              setSelectedVerification(verification);
                              setReviewAction('approve');
                            }}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Approve
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))}
          </div>
        )}
      </div>

      <Dialog open={reviewAction !== null} onOpenChange={() => {
        setReviewAction(null);
        setSelectedVerification(null);
        setRejectionReason('');
        setReviewNotes('');
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === 'approve' ? 'Approve Verification' : 'Reject Verification'}
            </DialogTitle>
            <DialogDescription>
              {reviewAction === 'approve' 
                ? 'Confirm approval of this identity verification request.'
                : 'Please provide a reason for rejecting this verification.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {selectedVerification && (
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="font-medium">
                  {selectedVerification.verificationType === 'individual'
                    ? `${selectedVerification.firstName} ${selectedVerification.lastName}`
                    : selectedVerification.businessName}
                </p>
                <p className="text-sm text-muted-foreground">{selectedVerification.user?.email}</p>
              </div>
            )}
            
            {reviewAction === 'reject' && (
              <div className="space-y-2">
                <Label htmlFor="reason">Rejection Reason *</Label>
                <Textarea
                  id="reason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Explain why this verification is being rejected..."
                  rows={3}
                  required
                />
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="notes">Internal Notes (optional)</Label>
              <Textarea
                id="notes"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add any internal notes for this review..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setReviewAction(null);
              setSelectedVerification(null);
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleReview}
              disabled={reviewMutation.isPending || (reviewAction === 'reject' && !rejectionReason.trim())}
              className={reviewAction === 'approve' ? 'bg-green-500 hover:bg-green-600' : 'bg-destructive hover:bg-destructive/90'}
            >
              {reviewMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  {reviewAction === 'approve' ? (
                    <><CheckCircle className="h-4 w-4 mr-2" />Approve</>
                  ) : (
                    <><XCircle className="h-4 w-4 mr-2" />Reject</>
                  )}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
