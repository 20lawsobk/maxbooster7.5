# Max Booster Production Test Matrix

**Version:** 1.0
**Last Updated:** 2026-01-09
**Status:** Active Testing

---

## Test Summary

| Category | Total Tests | Passing | Failing | Pending |
|----------|-------------|---------|---------|---------|
| Authentication | 8 | - | - | 8 |
| AI Studio (DAW) | 10 | - | - | 10 |
| Marketplace | 6 | - | - | 6 |
| Distribution | 6 | - | - | 6 |
| Social Media | 6 | - | - | 6 |
| Analytics | 4 | - | - | 4 |
| Payments | 8 | - | - | 8 |
| Admin | 4 | - | - | 4 |
| Infrastructure | 10 | - | - | 10 |

---

## Test Cases

### 1. INFRASTRUCTURE TESTS

| ID | Name | Steps | Expected Result | Status |
|----|------|-------|-----------------|--------|
| INF-01 | Server Boot | Start application | Server starts on port 5000 without errors | PASS |
| INF-02 | Health Check | GET /api/health | Returns `{"status":"ok"}` | PASS |
| INF-03 | System Status | GET /api/system/status | Returns status with uptime | PASS |
| INF-04 | Circuit Breakers | GET /api/health/circuits | All 12 circuits healthy | PASS |
| INF-05 | Database Connection | Check DB queries | Queries execute successfully | PASS |
| INF-06 | Redis Connection | Check session store | Redis connected and ready | PASS |
| INF-07 | WebSocket Server | Connect to /ws | WebSocket accepts connections | PENDING |
| INF-08 | Static Assets | GET / | Frontend loads | PASS |
| INF-09 | Environment Vars | Server startup | All 18 required vars validated | PASS |
| INF-10 | Background Workers | Check worker status | 4 workers running (audio, csv, analytics, email) | PASS |

### 2. AUTHENTICATION TESTS

| ID | Name | Steps | Expected Result | Status |
|----|------|-------|-----------------|--------|
| AUTH-01 | Register User | POST /api/auth/register with valid data | User created, session started | PENDING |
| AUTH-02 | Register Validation | POST /api/auth/register with weak password | Returns validation error | PENDING |
| AUTH-03 | Login | POST /api/auth/login with valid credentials | Session created, user returned | PENDING |
| AUTH-04 | Login Invalid | POST /api/auth/login with wrong password | Returns 401 | PENDING |
| AUTH-05 | Get Current User | GET /api/auth/me while logged in | Returns user object | PENDING |
| AUTH-06 | Logout | POST /api/auth/logout | Session destroyed | PENDING |
| AUTH-07 | Password Reset | POST /api/auth/forgot-password | Reset email sent | PENDING |
| AUTH-08 | 2FA Setup | POST /api/auth/2fa/setup | QR code generated | PENDING |

### 3. AI STUDIO (DAW) TESTS

| ID | Name | Steps | Expected Result | Status |
|----|------|-------|-----------------|--------|
| DAW-01 | Load Studio | Navigate to /studio | Studio page loads without errors | PENDING |
| DAW-02 | Create Project | POST /api/studio/projects | Project created with ID | PENDING |
| DAW-03 | Load Project | GET /api/studio/projects/:id | Project data returned | PENDING |
| DAW-04 | Add Track | POST /api/studio/tracks | Track added to project | PENDING |
| DAW-05 | Audio Upload | POST /api/studio/upload | Audio file uploaded to storage | PENDING |
| DAW-06 | Play Audio | Click play in UI | Audio plays without errors | PENDING |
| DAW-07 | Save Project | PUT /api/studio/projects/:id | Project saved to database | PENDING |
| DAW-08 | Audio Engine Init | Initialize AudioContext | AudioContext created successfully | PENDING |
| DAW-09 | Plugin Catalog | GET /api/studio/plugins | Plugin list returned | PENDING |
| DAW-10 | Export Audio | POST /api/studio/export | Audio file exported | PENDING |

### 4. MARKETPLACE TESTS

| ID | Name | Steps | Expected Result | Status |
|----|------|-------|-----------------|--------|
| MKT-01 | List Beats | GET /api/marketplace/listings | Listings returned | PENDING |
| MKT-02 | Create Listing | POST /api/marketplace/listings | Listing created | PENDING |
| MKT-03 | Search Beats | GET /api/marketplace/search?q=hip+hop | Results returned | PENDING |
| MKT-04 | Purchase Beat | POST /api/marketplace/purchase | Stripe checkout initiated | PENDING |
| MKT-05 | Download Beat | GET /api/marketplace/download/:id | File downloaded | PENDING |
| MKT-06 | Producer Profile | GET /api/marketplace/producer/:id | Profile data returned | PENDING |

### 5. DISTRIBUTION TESTS

| ID | Name | Steps | Expected Result | Status |
|----|------|-------|-----------------|--------|
| DIST-01 | Get Platforms | GET /api/distribution/platforms | 53 platforms returned | PENDING |
| DIST-02 | Create Release | POST /api/distribution/releases | Release created | PENDING |
| DIST-03 | Upload Artwork | POST /api/distribution/artwork | Artwork validated and stored | PENDING |
| DIST-04 | Submit Release | POST /api/distribution/submit | Release submitted to LabelGrid | PENDING |
| DIST-05 | Track Status | GET /api/distribution/releases/:id/status | Status returned | PENDING |
| DIST-06 | Generate Codes | POST /api/distribution/codes | ISRC/UPC generated | PENDING |

### 6. SOCIAL MEDIA TESTS

| ID | Name | Steps | Expected Result | Status |
|----|------|-------|-----------------|--------|
| SOC-01 | Connect Account | GET /api/social/oauth/:platform | OAuth flow initiated | PENDING |
| SOC-02 | Create Post | POST /api/social/posts | Post created and scheduled | PENDING |
| SOC-03 | Bulk Schedule | POST /api/social/bulk-schedule | Multiple posts scheduled | PENDING |
| SOC-04 | Get Analytics | GET /api/social/analytics | Social metrics returned | PENDING |
| SOC-05 | AI Content Gen | POST /api/social/ai/generate | AI content generated | PENDING |
| SOC-06 | Approval Flow | POST /api/social/approvals/:id/approve | Post approved | PENDING |

### 7. PAYMENTS & BILLING TESTS

| ID | Name | Steps | Expected Result | Status |
|----|------|-------|-----------------|--------|
| PAY-01 | Create Checkout | POST /api/billing/checkout | Stripe session created | PENDING |
| PAY-02 | Webhook Receipt | POST /webhooks/stripe | Webhook processed | PENDING |
| PAY-03 | Get Subscription | GET /api/billing/subscription | Subscription status returned | PENDING |
| PAY-04 | Cancel Sub | POST /api/billing/cancel | Subscription cancelled | PENDING |
| PAY-05 | Request Payout | POST /api/payouts/request | Payout initiated | PENDING |
| PAY-06 | Get Invoices | GET /api/invoices | Invoice list returned | PENDING |
| PAY-07 | Stripe Connect | GET /api/payouts/connect | Connect account status | PENDING |
| PAY-08 | Refund Webhook | POST /webhooks/stripe (refund) | Refund processed | PENDING |

### 8. ANALYTICS TESTS

| ID | Name | Steps | Expected Result | Status |
|----|------|-------|-----------------|--------|
| ANA-01 | Dashboard Data | GET /api/analytics/dashboard | Analytics data returned | PENDING |
| ANA-02 | Streams Chart | GET /api/analytics/streams | Stream data returned | PENDING |
| ANA-03 | Revenue Report | GET /api/analytics/revenue | Revenue data returned | PENDING |
| ANA-04 | Export Report | POST /api/analytics/export | Report generated | PENDING |

### 9. ADMIN TESTS

| ID | Name | Steps | Expected Result | Status |
|----|------|-------|-----------------|--------|
| ADM-01 | Admin Login | Login as admin | Full admin access granted | PENDING |
| ADM-02 | User List | GET /api/admin/users | User list returned | PENDING |
| ADM-03 | System Metrics | GET /api/admin/metrics | Metrics returned | PENDING |
| ADM-04 | Kill Switch | POST /api/admin/killswitch | System halted | PENDING |

---

## Critical Path Tests (Must Pass for Launch)

1. **INF-01 through INF-06**: Server boots and infrastructure works
2. **AUTH-01, AUTH-03, AUTH-05**: Users can register, login, access account
3. **DAW-01, DAW-02, DAW-06**: Studio loads, projects work, audio plays
4. **PAY-01, PAY-02**: Payments process correctly
5. **ADM-01**: Admin can access system

---

## Running Tests

```bash
# Pre-launch comprehensive check
npm run prelaunch

# Smoke tests (post-deployment)
npx tsx tests/smoke/post-deployment-tests.ts

# Load tests
npm run test:load

# Security audit
npm run security:audit
```

---

## Known Issues

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| - | None documented yet | - | - |

---

## Post-Launch Improvements

- Add E2E tests with Playwright
- Increase unit test coverage to 80%
- Add performance benchmarks
