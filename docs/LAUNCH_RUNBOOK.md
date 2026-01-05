# Max Booster Launch Day Runbook

## Quick Reference

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| Uptime | >99.9% | 99-99.9% | <99% |
| Response Time | <200ms | 200-500ms | >500ms |
| Error Rate | <0.1% | 0.1-1% | >1% |
| Memory Usage | <70% | 70-85% | >85% |
| Circuit Breakers | All closed | 1-2 open | 3+ open |

---

## Pre-Launch Checklist

### 1. Environment Verification
```bash
# Run pre-launch checks
npx tsx scripts/pre-launch-check.ts
```

### 2. Required Environment Variables
All must be set in production:

| Variable | Purpose | Where to Get |
|----------|---------|--------------|
| `DATABASE_URL` | PostgreSQL connection | Replit Database panel |
| `SESSION_SECRET` | Session encryption | Auto-generated |
| `STRIPE_SECRET_KEY` | Payment processing | Stripe Dashboard |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhooks | Stripe Webhooks page |
| `SENDGRID_API_KEY` | Email delivery | SendGrid Dashboard |
| `REDIS_URL` | Session store | Redis Cloud |
| `SENTRY_DSN` | Error tracking | Sentry Dashboard |

### 3. Webhook Verification
Ensure these webhooks are configured in respective platforms:

**Stripe Webhooks** (Dashboard > Webhooks):
- Endpoint: `https://your-domain.com/api/webhooks/stripe`
- Events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.*`, `charge.refunded`

**Social OAuth Callbacks**:
- Twitter: `https://your-domain.com/api/social/callback/twitter`
- Facebook: `https://your-domain.com/api/social/callback/facebook`
- Instagram: `https://your-domain.com/api/social/callback/instagram`
- TikTok: `https://your-domain.com/api/social/callback/tiktok`
- YouTube: `https://your-domain.com/api/social/callback/youtube`

---

## Monitoring Endpoints

### Public Health Checks
```bash
# Simple status (for external monitoring)
curl https://your-domain.com/api/system/status

# Detailed health
curl https://your-domain.com/api/system/health

# Circuit breaker status
curl https://your-domain.com/api/health/circuits
```

### Admin Dashboards (requires auth)
- Security Metrics: `/api/security/metrics`
- Executive Dashboard: `/api/executive/dashboard`
- Queue Monitor: `/api/admin/queues`

---

## Launch Day Timeline

### T-60 Minutes
- [ ] Run `npm run prelaunch` - comprehensive 25+ point check
- [ ] Verify all circuit breakers are CLOSED
- [ ] Check database connection pool
- [ ] Verify Redis connection: `curl /api/system/health`
- [ ] Test Stripe webhook with CLI: `stripe trigger payment_intent.succeeded`
- [ ] Send test email via SendGrid API

### T-45 Minutes: AI & Video Validation
- [ ] Login as admin and verify AI Studio presets load
- [ ] Navigate to Social Media page, select "Video" format - verify VideoContentGenerator loads
- [ ] Navigate to Advertisement > Creative AI tab - verify video option available
- [ ] Check Autopilot actions include video creation types
- [ ] Test onboarding flow - verify persona selection works
- [ ] Verify First Week Success Path tasks display correctly

### T-30 Minutes
- [ ] Clear any test data from production
- [ ] Verify admin account access to Executive Dashboard
- [ ] Enable error monitoring (Sentry) - verify events arrive
- [ ] Set up external status page monitoring (UptimeRobot, etc.)
- [ ] Verify queue health: check `/api/system/health` for queue metrics

### T-15 Minutes: Integration Verification
- [ ] Test Stripe checkout flow (use test card if sandbox)
- [ ] Verify webhook endpoint responds: `POST /api/webhooks/stripe`
- [ ] Test social OAuth for at least one platform (Twitter/Facebook)
- [ ] Verify LabelGrid API responds: `GET /api/distribution/platforms`
- [ ] Confirm object storage accessible: upload/download test file

### T-0 Launch
- [ ] Monitor `/api/system/status` every 30 seconds
- [ ] Watch Sentry for new errors
- [ ] Monitor Stripe dashboard for payments
- [ ] Watch server logs for unusual activity
- [ ] Check queue health for stuck jobs

### T+15 Minutes
- [ ] Verify first user registrations working
- [ ] Check email delivery (SendGrid activity logs)
- [ ] Confirm social OAuth flows complete successfully
- [ ] Test payment flow end-to-end
- [ ] Verify onboarding tasks unlock correctly

### T+30 Minutes: Feature Validation
- [ ] Test AI music generation with new user account
- [ ] Verify video creation in Social Media page
- [ ] Check distribution platform list loads
- [ ] Confirm marketplace displays correctly
- [ ] Verify achievement system triggers on actions

---

## Incident Response

### High Error Rate (>1%)
1. Check `/api/health/circuits` for open circuits
2. Review Sentry for error patterns
3. Check database connection: `SELECT 1` via admin
4. If external service issue, circuit breaker will auto-recover

### Memory Pressure (>85%)
1. Check `/api/system/health` for memory stats
2. Memory manager will auto-trigger GC
3. If persists, consider restart via Replit console

### Database Issues
1. Check circuit breaker state for `dsp` circuit
2. Verify `DATABASE_URL` is correct
3. Check Replit Database panel for connection limits
4. Database resilience will auto-retry failed queries

### Payment Failures
1. Check Stripe Dashboard for declined payments
2. Verify `STRIPE_WEBHOOK_SECRET` matches
3. Check `/api/health/circuits` for `stripe` circuit
4. Review Stripe webhook logs

---

## Rollback Procedure

If critical issues occur:

1. **Use Replit Checkpoints**: Click "View Checkpoints" in Replit
2. **Select Last Known Good**: Choose checkpoint before issue
3. **Rollback**: Restores code, chat, and database

---

## Key Contacts

- **Stripe Support**: https://support.stripe.com
- **SendGrid Support**: https://support.sendgrid.com
- **Sentry Support**: https://sentry.io/support
- **Replit Support**: https://replit.com/support

---

## Success Metrics (First 24 Hours)

| Metric | Target |
|--------|--------|
| User Registrations | Track all |
| Successful Payments | 100% of attempts |
| OAuth Connections | Monitor success rate |
| AI Feature Usage | Track engagement |
| Support Tickets | Monitor volume |
| Error Rate | <0.1% |
| Uptime | 100% |

---

## Post-Launch Review (T+24 Hours)

1. Review Sentry error patterns
2. Analyze user onboarding completion
3. Check AI feature discovery metrics
4. Review payment success rates
5. Assess support ticket themes
6. Plan first iteration improvements
