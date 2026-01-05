import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  AlertCircle,
  MessageSquare,
  User,
  Calendar,
  History,
  FileText,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface Post {
  id: string;
  campaignId: string;
  platform: string;
  content: string;
  mediaUrls?: string[];
  approvalStatus: 'draft' | 'pending_review' | 'approved' | 'scheduled' | 'rejected' | 'published';
  submittedBy?: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
  scheduledAt?: Date;
  createdAt: Date;
  submitterEmail?: string;
  submitterName?: string;
}

interface ApprovalHistoryItem {
  id: string;
  userId: string;
  action: string;
  fromStatus: string | null;
  toStatus: string;
  comment?: string;
  createdAt: Date;
  userEmail: string;
  userName: string;
}

const statusConfig = {
  draft: { color: 'bg-gray-500/20 text-gray-400', icon: FileText, label: 'Draft' },
  pending_review: {
    color: 'bg-yellow-500/20 text-yellow-400',
    icon: Clock,
    label: 'Pending Review',
  },
  approved: { color: 'bg-green-500/20 text-green-400', icon: CheckCircle2, label: 'Approved' },
  scheduled: { color: 'bg-purple-500/20 text-purple-400', icon: Calendar, label: 'Scheduled' },
  rejected: { color: 'bg-red-500/20 text-red-400', icon: XCircle, label: 'Rejected' },
  published: { color: 'bg-blue-500/20 text-blue-400', icon: Send, label: 'Published' },
};

/**
 * TODO: Add function documentation
 */
export function ApprovalDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [approveComment, setApproveComment] = useState('');

  const { data: stats } = useQuery({
    queryKey: ['/api/social/approvals/stats'],
  });

  const { data: pendingApprovals, isLoading: isLoadingPending } = useQuery({
    queryKey: ['/api/social/approvals/pending'],
  });

  const { data: myPosts, isLoading: isLoadingMyPosts } = useQuery({
    queryKey: ['/api/social/approvals/my-posts'],
  });

  const { data: approvalHistory } = useQuery({
    queryKey: ['/api/social/approvals/history', selectedPost?.id],
    enabled: !!selectedPost && showHistoryDialog,
  });

  const submitForReviewMutation = useMutation({
    mutationFn: async (postId: string) => {
      const res = await fetch(`/api/social/approvals/${postId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Post submitted for review',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/social/approvals'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const approvePostMutation = useMutation({
    mutationFn: async ({ postId, comment }: { postId: string; comment?: string }) => {
      const res = await fetch(`/api/social/approvals/${postId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ comment }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Post approved successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/social/approvals'] });
      setShowApproveDialog(false);
      setApproveComment('');
      setSelectedPost(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const rejectPostMutation = useMutation({
    mutationFn: async ({
      postId,
      reason,
      comment,
    }: {
      postId: string;
      reason: string;
      comment?: string;
    }) => {
      const res = await fetch(`/api/social/approvals/${postId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason, comment }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Post rejected',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/social/approvals'] });
      setShowRejectDialog(false);
      setRejectReason('');
      setSelectedPost(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleApprove = (post: Post) => {
    setSelectedPost(post);
    setShowApproveDialog(true);
  };

  const handleReject = (post: Post) => {
    setSelectedPost(post);
    setShowRejectDialog(true);
  };

  const handleViewHistory = (post: Post) => {
    setSelectedPost(post);
    setShowHistoryDialog(true);
  };

  const handleSubmitForReview = (postId: string) => {
    submitForReviewMutation.mutate(postId);
  };

  const confirmApprove = () => {
    if (selectedPost) {
      approvePostMutation.mutate({
        postId: selectedPost.id,
        comment: approveComment || undefined,
      });
    }
  };

  const confirmReject = () => {
    if (selectedPost && rejectReason.trim()) {
      rejectPostMutation.mutate({
        postId: selectedPost.id,
        reason: rejectReason,
      });
    }
  };

  const PostCard = ({ post, showActions = true }: { post: Post; showActions?: boolean }) => {
    const StatusIcon = statusConfig[post.approvalStatus].icon;
    const canReview =
      stats?.stats?.userRole && ['reviewer', 'manager', 'admin'].includes(stats.stats.userRole);
    const canSubmit = post.approvalStatus === 'draft' || post.approvalStatus === 'rejected';

    return (
      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Badge className="uppercase">{post.platform}</Badge>
                <Badge className={statusConfig[post.approvalStatus].color}>
                  <StatusIcon className="w-3 h-3 mr-1" />
                  {statusConfig[post.approvalStatus].label}
                </Badge>
              </div>
              <CardDescription className="text-sm">
                <User className="w-3 h-3 inline mr-1" />
                {post.submitterName || post.submitterEmail || 'Unknown'}
                {post.scheduledAt && (
                  <>
                    {' • '}
                    <Calendar className="w-3 h-3 inline mr-1" />
                    {new Date(post.scheduledAt).toLocaleString()}
                  </>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap mb-4">{post.content}</p>

          {post.rejectionReason && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-400">
                <AlertCircle className="w-4 h-4 inline mr-1" />
                <strong>Rejection Reason:</strong> {post.rejectionReason}
              </p>
            </div>
          )}

          {showActions && (
            <div className="flex gap-2">
              {canReview && post.approvalStatus === 'pending_review' && (
                <>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => handleApprove(post)}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleReject(post)}>
                    <XCircle className="w-4 h-4 mr-1" />
                    Reject
                  </Button>
                </>
              )}

              {canSubmit && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleSubmitForReview(post.id)}
                  disabled={submitForReviewMutation.isPending}
                >
                  <Send className="w-4 h-4 mr-1" />
                  Submit for Review
                </Button>
              )}

              <Button size="sm" variant="outline" onClick={() => handleViewHistory(post)}>
                <History className="w-4 h-4 mr-1" />
                History
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold gradient-text">Approval Dashboard</h2>
          <p className="text-muted-foreground mt-2">Manage and review social media posts</p>
        </div>
        {stats?.stats && (
          <Badge variant="outline" className="text-lg px-4 py-2">
            Role: {stats.stats.userRole?.replace('_', ' ').toUpperCase()}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-2xl font-bold text-gray-400">{stats?.stats?.draft || 0}</p>
            <p className="text-sm text-muted-foreground">Draft</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-2xl font-bold text-yellow-400">
              {stats?.stats?.pending_review || 0}
            </p>
            <p className="text-sm text-muted-foreground">Pending Review</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-2xl font-bold text-green-400">{stats?.stats?.approved || 0}</p>
            <p className="text-sm text-muted-foreground">Approved</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-2xl font-bold text-red-400">{stats?.stats?.rejected || 0}</p>
            <p className="text-sm text-muted-foreground">Rejected</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-2xl font-bold text-blue-400">{stats?.stats?.published || 0}</p>
            <p className="text-sm text-muted-foreground">Published</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pending">
            Pending Approvals
            {pendingApprovals?.total > 0 && (
              <Badge className="ml-2" variant="secondary">
                {pendingApprovals.total}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="my-posts">My Posts</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {isLoadingPending ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                Loading...
              </CardContent>
            </Card>
          ) : pendingApprovals?.posts?.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No pending approvals
              </CardContent>
            </Card>
          ) : (
            pendingApprovals?.posts?.map((post: Post) => <PostCard key={post.id} post={post} />)
          )}
        </TabsContent>

        <TabsContent value="my-posts" className="space-y-4">
          {isLoadingMyPosts ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                Loading...
              </CardContent>
            </Card>
          ) : myPosts?.posts?.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No posts found
              </CardContent>
            </Card>
          ) : (
            myPosts?.posts?.map((post: Post) => <PostCard key={post.id} post={post} />)
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Post</DialogTitle>
            <DialogDescription>Are you sure you want to approve this post?</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="approve-comment">Comment (Optional)</Label>
              <Textarea
                id="approve-comment"
                value={approveComment}
                onChange={(e) => setApproveComment(e.target.value)}
                placeholder="Add a comment..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={confirmApprove} disabled={approvePostMutation.isPending}>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Post</DialogTitle>
            <DialogDescription>Please provide a reason for rejecting this post.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reject-reason">Reason *</Label>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter rejection reason..."
                rows={4}
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={!rejectReason.trim() || rejectPostMutation.isPending}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Approval History</DialogTitle>
            <DialogDescription>Complete audit trail for this post</DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-96">
            <div className="space-y-4">
              {approvalHistory?.history?.map((item: ApprovalHistoryItem, index: number) => (
                <div key={item.id}>
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <MessageSquare className="w-4 h-4 text-primary" />
                      </div>
                      {index < approvalHistory.history.length - 1 && (
                        <div className="w-0.5 h-full bg-border mt-2" />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{item.userName || item.userEmail}</span>
                        <Badge variant="outline" className="text-xs">
                          {item.action}
                        </Badge>
                      </div>
                      {item.fromStatus && (
                        <p className="text-sm text-muted-foreground">
                          {statusConfig[item.fromStatus as keyof typeof statusConfig]?.label ||
                            item.fromStatus}{' '}
                          →{' '}
                          {statusConfig[item.toStatus as keyof typeof statusConfig]?.label ||
                            item.toStatus}
                        </p>
                      )}
                      {item.comment && (
                        <p className="text-sm mt-2 bg-muted p-2 rounded">{item.comment}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
