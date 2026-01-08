import { Request, Response, NextFunction } from 'express';

interface AuthenticatedRequest extends Request {
  isAuthenticated(): boolean;
  user?: any;
}

export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    const now = new Date();

    // Check if user has an expired trial
    if (req.user.trialEndsAt) {
      const trialEnd = new Date(req.user.trialEndsAt);

      if (now > trialEnd) {
        // Trial has expired - block access
        return res.status(403).json({
          message:
            'Your 30-day trial has expired. Please contact support to continue using Max Booster.',
          trialExpired: true,
        });
      }
    }

    // Check if subscription has expired (monthly/yearly plans only, lifetime never expires)
    if (req.user.subscriptionEndsAt && req.user.subscriptionTier !== 'lifetime') {
      const subscriptionEnd = new Date(req.user.subscriptionEndsAt);

      if (now > subscriptionEnd) {
        // Subscription has expired - block access
        const planName = req.user.subscriptionTier === 'monthly' ? 'monthly' : 'yearly';
        return res.status(403).json({
          message: `Your ${planName} subscription has expired. Please renew your subscription to continue using Max Booster.`,
          subscriptionExpired: true,
          plan: req.user.subscriptionTier,
        });
      }
    }

    return next();
  }
  res.status(401).json({ message: 'Authentication required' });
};

export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.isAuthenticated() && req.user.role === 'admin') {
    return next();
  }
  res.status(403).json({ message: 'Admin access required' });
};
