import { Router, Request, Response } from 'express';
import { paymentBypassService } from '../services/paymentBypassService';
import { logger } from '../logger';

const router = Router();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role?: string;
  };
}

const requireAdmin = (req: AuthenticatedRequest, res: Response, next: any) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

router.get('/status', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = await paymentBypassService.getStatus();
    res.json({
      success: true,
      ...status,
    });
  } catch (error) {
    logger.error('[PaymentBypass] Failed to get status:', error);
    res.status(500).json({ error: 'Failed to get payment bypass status' });
  }
});

router.post('/activate', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { durationHours = 2, reason } = req.body;
    const adminId = req.user!.id;

    const config = await paymentBypassService.activate(adminId, reason, durationHours);
    
    logger.info(`[PaymentBypass] Admin ${req.user!.email} activated payment bypass for ${durationHours} hours`);

    res.json({
      success: true,
      message: `Payment requirements bypassed for ${durationHours} hours`,
      config,
    });
  } catch (error) {
    logger.error('[PaymentBypass] Failed to activate:', error);
    res.status(500).json({ error: 'Failed to activate payment bypass' });
  }
});

router.post('/deactivate', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reason } = req.body;
    const adminId = req.user!.id;

    const config = await paymentBypassService.deactivate(adminId, reason);
    
    logger.info(`[PaymentBypass] Admin ${req.user!.email} deactivated payment bypass`);

    res.json({
      success: true,
      message: 'Payment requirements re-enabled',
      config,
    });
  } catch (error) {
    logger.error('[PaymentBypass] Failed to deactivate:', error);
    res.status(500).json({ error: 'Failed to deactivate payment bypass' });
  }
});

router.post('/extend', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { additionalHours = 1 } = req.body;
    const adminId = req.user!.id;

    const config = await paymentBypassService.extendBypass(adminId, additionalHours);
    
    logger.info(`[PaymentBypass] Admin ${req.user!.email} extended payment bypass by ${additionalHours} hours`);

    res.json({
      success: true,
      message: `Payment bypass extended by ${additionalHours} hours`,
      config,
    });
  } catch (error: any) {
    logger.error('[PaymentBypass] Failed to extend:', error);
    res.status(400).json({ error: error.message || 'Failed to extend payment bypass' });
  }
});

export default router;
