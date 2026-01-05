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
- [ ] Run `npx tsx scripts/pre-launch-check.ts`
- [ ] Verify all circuit breakers are CLOSED
- [ ] Check database connection pool
- [ ] Verify Redis connection
- [ ] Test Stripe webhook with CLI: `stripe trigger payment_intent.succeeded`

### T-30 Minutes
- [ ] Clear any test data from production
- [ ] Verify admin account access
- [ ] Enable error monitoring (Sentry)
- [ ] Set up status page monitoring

### T-0 Launch
- [ ] Monitor `/api/system/status` every 30 seconds
- [ ] Watch Sentry for new errors
- [ ] Monitor Stripe dashboard for payments
- [ ] Watch server logs for unusual activity

### T+15 Minutes
- [ ] Verify first user registrations working
- [ ] Check email delivery (SendGrid)
- [ ] Confirm social OAuth flows
- [ ] Test payment flow end-to-end

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
