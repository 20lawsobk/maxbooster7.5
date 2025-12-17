import { Router } from 'express';
import { approvalService } from '../services/approvalService';
import { submitForReviewSchema, approvePostSchema, rejectPostSchema } from '@shared/schema';
import { z } from 'zod';
import { logger } from '../logger.js';

const router = Router();

interface AuthenticatedRequest extends Express.Request {
  user?: {
    id: string;
    email: string;
  };
}

router.get('/pending', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const hasPermission = await approvalService.checkPermission(req.user.id, 'approve');
    if (!hasPermission) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to view pending approvals',
      });
    }

    const pendingPosts = await approvalService.getPendingApprovals(req.user.id);

    return res.json({
      success: true,
      total: pendingPosts.length,
      posts: pendingPosts,
    });
  } catch (error: unknown) {
    logger.error('Get pending approvals error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:postId/submit', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { postId } = req.params;

    const validatedData = submitForReviewSchema.parse({ postId });

    const hasPermission = await approvalService.checkPermission(req.user.id, 'submit');
    if (!hasPermission) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to submit posts for review',
      });
    }

    const result = await approvalService.submitForReview(validatedData.postId, req.user.id);

    if (!result.success) {
      return res.status(400).json({
        error: result.error || 'Failed to submit for review',
      });
    }

    return res.json({
      success: true,
      message: 'Post submitted for review successfully',
    });
  } catch (error: unknown) {
    logger.error('Submit for review error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:postId/approve', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { postId } = req.params;
    const { comment } = req.body;

    const validatedData = approvePostSchema.parse({ postId, comment });

    const hasPermission = await approvalService.checkPermission(req.user.id, 'approve');
    if (!hasPermission) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to approve posts',
      });
    }

    const result = await approvalService.approvePost(
      validatedData.postId,
      req.user.id,
      validatedData.comment
    );

    if (!result.success) {
      return res.status(400).json({
        error: result.error || 'Failed to approve post',
      });
    }

    return res.json({
      success: true,
      message: 'Post approved successfully',
    });
  } catch (error: unknown) {
    logger.error('Approve post error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:postId/reject', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { postId } = req.params;
    const { reason, comment } = req.body;

    const validatedData = rejectPostSchema.parse({ postId, reason, comment });

    const hasPermission = await approvalService.checkPermission(req.user.id, 'reject');
    if (!hasPermission) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to reject posts',
      });
    }

    const result = await approvalService.rejectPost(
      validatedData.postId,
      req.user.id,
      validatedData.reason,
      validatedData.comment
    );

    if (!result.success) {
      return res.status(400).json({
        error: result.error || 'Failed to reject post',
      });
    }

    return res.json({
      success: true,
      message: 'Post rejected successfully',
    });
  } catch (error: unknown) {
    logger.error('Reject post error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/history/:postId', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { postId } = req.params;

    const history = await approvalService.getApprovalHistory(postId);

    return res.json({
      success: true,
      postId,
      history,
    });
  } catch (error: unknown) {
    logger.error('Get approval history error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/my-posts', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { status } = req.query;
    const posts = await approvalService.getUserPosts(req.user.id, status as any);

    return res.json({
      success: true,
      total: posts.length,
      posts,
    });
  } catch (error: unknown) {
    logger.error('Get my posts error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/stats', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const allPosts = await approvalService.getUserPosts(req.user.id);
    const userRole = await approvalService.getUserRole(req.user.id);

    const stats = {
      total: allPosts.length,
      draft: allPosts.filter((p) => p.approvalStatus === 'draft').length,
      pending_review: allPosts.filter((p) => p.approvalStatus === 'pending_review').length,
      approved: allPosts.filter((p) => p.approvalStatus === 'approved').length,
      rejected: allPosts.filter((p) => p.approvalStatus === 'rejected').length,
      published: allPosts.filter((p) => p.approvalStatus === 'published').length,
      userRole,
    };

    if (['reviewer', 'manager', 'admin'].includes(userRole)) {
      const pendingApprovals = await approvalService.getPendingApprovals(req.user.id);
      stats['pending_approvals'] = pendingApprovals.length;
    }

    return res.json({
      success: true,
      stats,
    });
  } catch (error: unknown) {
    logger.error('Get stats error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
