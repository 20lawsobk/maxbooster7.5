import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { logger } from '../logger.js';
import { paymentBypassService } from '../services/paymentBypassService';

const GRACE_PERIOD_DAYS = 7;

export const requirePremium = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please log in to access this feature',
    });
  }

  const userId = req.user.id;

  try {
    const isBypassed = await paymentBypassService.isPaymentBypassed();
    if (isBypassed) {
      res.setHeader('X-Payment-Bypass', 'active');
      return next();
    }

    const user = await storage.getUser(userId);

    if (!user) {
      return res.status(401).json({
        error: 'User not found',
        message: 'Your account could not be verified',
      });
    }

    const now = new Date();

    if (user.isAdmin) {
      return next();
    }

    const hasLifetimeAccess = user.subscriptionTier === 'lifetime';
    if (hasLifetimeAccess) {
      return next();
    }

    const hasActiveSubscription = user.subscriptionStatus === 'active';
    if (hasActiveSubscription) {
      return next();
    }

    const trialEndDate = user.trialEndsAt ? new Date(user.trialEndsAt) : null;
    const inActiveTrial = trialEndDate && trialEndDate > now;
    if (inActiveTrial) {
      return next();
    }

    const subscriptionEndDate = user.subscriptionEndsAt ? new Date(user.subscriptionEndsAt) : null;
    if (subscriptionEndDate) {
      const gracePeriodEnd = new Date(subscriptionEndDate);
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + GRACE_PERIOD_DAYS);

      const inGracePeriod = now <= gracePeriodEnd;
      if (inGracePeriod) {
        const daysRemaining = Math.ceil(
          (gracePeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        res.setHeader('X-Grace-Period-Days-Remaining', daysRemaining.toString());
        return next();
      }
    }

    return res.status(403).json({
      error: 'Premium subscription required',
      message: 'This feature requires an active premium subscription',
      upgradeUrl: '/pricing',
      subscriptionStatus: user.subscriptionStatus || 'none',
      trialExpired: trialEndDate ? trialEndDate < now : false,
    });
  } catch (error: unknown) {
    logger.error('Premium check error:', error);
    return res.status(500).json({
      error: 'Subscription verification failed',
      message: 'Unable to verify your subscription status',
    });
  }
};
