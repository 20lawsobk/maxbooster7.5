# Max Booster - User Workflows & Actions Guide

**Date**: January 10, 2026  
**Total Endpoints**: ~1,181  
**Route Files**: 75

---

## 1. AUTHENTICATION WORKFLOWS

### 1.1 Registration Flow
| Step | Action | Endpoint | Expected Result |
|------|--------|----------|-----------------|
| 1 | Navigate to signup | `/signup` | Registration form |
| 2 | Enter email, password, username | POST `/api/auth/register` | Account created |
| 3 | Verify email (if enabled) | GET `/api/auth/verify/:token` | Email verified |
| 4 | Redirect to dashboard | `/dashboard` | User dashboard |

### 1.2 Login Flow
| Step | Action | Endpoint | Expected Result |
|------|--------|----------|-----------------|
| 1 | Navigate to login | `/login` | Login form |
| 2 | Enter credentials | POST `/api/auth/login` | Session created |
| 3 | 2FA (if enabled) | POST `/api/auth/2fa/verify` | 2FA validated |
| 4 | Redirect to dashboard | `/dashboard` | User dashboard |

### 1.3 Password Reset Flow
| Step | Action | Endpoint | Expected Result |
|------|--------|----------|-----------------|
| 1 | Click forgot password | `/forgot-password` | Reset form |
| 2 | Enter email | POST `/api/auth/forgot-password` | Email sent |
| 3 | Click email link | GET `/api/auth/reset/:token` | Reset form |
| 4 | Enter new password | POST `/api/auth/reset-password` | Password updated |

### 1.4 Security Actions
| Action | Endpoint | Description |
|--------|----------|-------------|
| Enable 2FA | POST `/api/auth/2fa/setup` | Generate QR code |
| Verify 2FA | POST `/api/auth/2fa/verify` | Validate TOTP |
| Disable 2FA | POST `/api/auth/2fa/disable` | Remove 2FA |
| Logout | POST `/api/auth/logout` | End session |
| Logout all devices | POST `/api/auth/logout-all` | Invalidate all sessions |

---

## 2. ONBOARDING WORKFLOWS

### 2.1 First Week Success Path
| Day | Task | Endpoint | Reward |
|-----|------|----------|--------|
| 1 | Complete profile | PUT `/api/users/profile` | 10 XP |
| 1 | Connect first social | POST `/api/socialOAuth/:platform/connect` | 20 XP |
| 2 | Upload first track | POST `/api/studio/upload` | 30 XP |
| 3 | Create first project | POST `/api/studio/projects` | 20 XP |
| 4 | Schedule first post | POST `/api/socialMedia/posts` | 25 XP |
| 5 | List first beat | POST `/api/marketplace/listings` | 30 XP |
| 6 | View analytics | GET `/api/analytics/overview` | 15 XP |
| 7 | Complete onboarding | POST `/api/onboarding/complete` | 50 XP |

### 2.2 Onboarding Endpoints
| Action | Endpoint | Description |
|--------|----------|-------------|
| Get tasks | GET `/api/onboarding/tasks` | List all tasks |
| Complete task | POST `/api/onboarding/tasks/:id/complete` | Mark task done |
| Get progress | GET `/api/onboarding/progress` | Current progress |
| Skip onboarding | POST `/api/onboarding/skip` | Skip tutorial |

---

## 3. AI STUDIO WORKFLOWS

### 3.1 Project Creation
| Step | Action | Endpoint | Expected Result |
|------|--------|----------|-----------------|
| 1 | Open studio | `/studio` | DAW interface |
| 2 | Create project | POST `/api/studio/projects` | Project ID |
| 3 | Add tracks | POST `/api/studio/tracks` | Track added |
| 4 | Upload audio | POST `/api/studio/upload` | File stored |
| 5 | Save project | PUT `/api/studio/projects/:id` | Project saved |

### 3.2 Audio Processing
| Action | Endpoint | Description |
|--------|----------|-------------|
| AI Mix | POST `/api/studio/ai-mix` | Automatic mixing |
| AI Master | POST `/api/studio/ai-master` | Automatic mastering |
| Stem separation | POST `/api/studio/stems/separate` | Extract stems |
| Time stretch | POST `/api/studio/warp` | Adjust tempo |
| Export | POST `/api/studio/export` | Render project |

### 3.3 Studio Plugins
| Action | Endpoint | Description |
|--------|----------|-------------|
| Get plugins | GET `/api/studioPlugins` | List plugins |
| Get presets | GET `/api/studioPlugins/presets` | Plugin presets |
| Add plugin | POST `/api/studioPlugins/:id/add` | Add to project |
| Configure plugin | PUT `/api/studioPlugins/:id/config` | Update settings |

### 3.4 Collaboration
| Action | Endpoint | Description |
|--------|----------|-------------|
| Invite collaborator | POST `/api/collaborations/invite` | Send invite |
| Join session | POST `/api/collaborations/join/:id` | Join project |
| Real-time sync | WebSocket `/ws/studio` | Live collaboration |

---

## 4. DISTRIBUTION WORKFLOWS

### 4.1 Release Creation
| Step | Action | Endpoint | Expected Result |
|------|--------|----------|-----------------|
| 1 | Create release | POST `/api/distribution/releases` | Release ID |
| 2 | Upload artwork | POST `/api/distribution/artwork` | Image stored |
| 3 | Add tracks | POST `/api/distribution/releases/:id/tracks` | Tracks added |
| 4 | Set metadata | PUT `/api/distribution/releases/:id` | Metadata saved |
| 5 | Select platforms | POST `/api/distribution/releases/:id/platforms` | DSPs selected |
| 6 | Submit | POST `/api/distribution/releases/:id/submit` | Submitted |

### 4.2 Platform Management
| Action | Endpoint | Description |
|--------|----------|-------------|
| Get platforms | GET `/api/distribution/platforms` | 11+ DSPs |
| Platform status | GET `/api/distribution/platforms/:id/status` | Delivery status |
| Content ID | POST `/api/distribution/contentId` | Register audio |
| ISRC codes | POST `/api/distribution/isrc` | Generate codes |
| UPC codes | POST `/api/distribution/upc` | Generate codes |

### 4.3 Royalty Management
| Action | Endpoint | Description |
|--------|----------|-------------|
| View earnings | GET `/api/distribution/earnings` | Revenue data |
| Set splits | POST `/api/distribution/splits` | Collaborator splits |
| Sync licensing | POST `/api/distribution/sync` | License for media |

---

## 5. SOCIAL MEDIA WORKFLOWS

### 5.1 Platform Connection
| Step | Action | Endpoint | Expected Result |
|------|--------|----------|-----------------|
| 1 | Select platform | - | Platform list |
| 2 | Authorize | GET `/api/socialOAuth/:platform/connect` | OAuth redirect |
| 3 | Callback | GET `/api/socialOAuth/:platform/callback` | Token stored |
| 4 | Verify connection | GET `/api/socialOAuth/connections` | Platform connected |

### 5.2 Supported Platforms
| Platform | OAuth | Posting | Analytics |
|----------|-------|---------|-----------|
| Twitter/X | ✅ | ✅ | ✅ |
| Facebook | ✅ | ✅ | ✅ |
| Instagram | ✅ | ✅ | ✅ |
| TikTok | ✅ | ✅ | ✅ |
| YouTube | ✅ | ✅ | ✅ |
| LinkedIn | ✅ | ✅ | ✅ |
| Threads | ✅ | ✅ | ✅ |
| Google Business | ✅ | ✅ | ✅ |

### 5.3 Post Scheduling
| Action | Endpoint | Description |
|--------|----------|-------------|
| Create post | POST `/api/socialMedia/posts` | Schedule post |
| Bulk schedule | POST `/api/socialBulk/schedule` | Multiple posts |
| View queue | GET `/api/socialMedia/queue` | Pending posts |
| Edit post | PUT `/api/socialMedia/posts/:id` | Modify scheduled |
| Cancel post | DELETE `/api/socialMedia/posts/:id` | Remove from queue |

### 5.4 AI Content Generation
| Action | Endpoint | Description |
|--------|----------|-------------|
| Generate caption | POST `/api/socialAI/generate/caption` | AI captions |
| Generate hashtags | POST `/api/socialAI/generate/hashtags` | Trending tags |
| A/B testing | POST `/api/socialAI/ab-test` | Test variants |
| Content ideas | GET `/api/socialAI/ideas` | Suggestions |

### 5.5 Approval Workflow
| Action | Endpoint | Description |
|--------|----------|-------------|
| View pending | GET `/api/social/approvals/pending` | Posts awaiting approval |
| Approve post | POST `/api/social/approvals/:id/approve` | Approve for posting |
| Reject post | POST `/api/social/approvals/:id/reject` | Reject with feedback |
| Request changes | POST `/api/social/approvals/:id/changes` | Request edits |

---

## 6. BEAT MARKETPLACE WORKFLOWS

### 6.1 Listing Creation
| Step | Action | Endpoint | Expected Result |
|------|--------|----------|-----------------|
| 1 | Upload beat | POST `/api/marketplace/upload` | File stored |
| 2 | Set metadata | - | Title, BPM, key |
| 3 | Set pricing | - | License tiers |
| 4 | Create listing | POST `/api/marketplace/listings` | Listing live |
| 5 | Manage storefront | PUT `/api/storefront` | Customize shop |

### 6.2 License Types
| License | Use | Streaming | Distribution |
|---------|-----|-----------|--------------|
| Basic | Personal | Unlimited | No |
| Premium | Commercial | 100K | Yes |
| Exclusive | Full rights | Unlimited | Yes |
| Custom | Negotiated | Varies | Varies |

### 6.3 Purchase Flow
| Step | Action | Endpoint | Expected Result |
|------|--------|----------|-----------------|
| 1 | Browse beats | GET `/api/marketplace/listings` | Beat catalog |
| 2 | Preview | GET `/api/marketplace/listings/:id/preview` | Audio preview |
| 3 | Select license | - | License terms |
| 4 | Checkout | POST `/api/marketplace/checkout` | Stripe session |
| 5 | Download | GET `/api/marketplace/downloads/:id` | Beat files |

### 6.4 Seller Actions
| Action | Endpoint | Description |
|--------|----------|-------------|
| View sales | GET `/api/marketplace/sales` | Sales history |
| Analytics | GET `/api/marketplace/analytics` | Performance |
| Manage pricing | PUT `/api/marketplace/listings/:id/pricing` | Update prices |
| Request payout | POST `/api/payouts/request` | Withdraw earnings |

---

## 7. ANALYTICS WORKFLOWS

### 7.1 Dashboard Views
| View | Endpoint | Data |
|------|----------|------|
| Overview | GET `/api/analytics/overview` | Key metrics |
| Streams | GET `/api/analytics/streams` | Play counts |
| Revenue | GET `/api/analytics/revenue` | Earnings |
| Audience | GET `/api/analytics/audience` | Demographics |
| Geographic | GET `/api/analytics/geo` | Locations |

### 7.2 Platform Analytics
| Platform | Endpoint | Metrics |
|----------|----------|---------|
| Spotify | GET `/api/analytics/spotify` | Streams, saves, followers |
| Apple Music | GET `/api/analytics/apple` | Plays, adds, subscribers |
| YouTube | GET `/api/analytics/youtube` | Views, watch time |
| TikTok | GET `/api/analytics/tiktok` | Uses, views, engagement |
| Instagram | GET `/api/analytics/instagram` | Reach, engagement |

### 7.3 Advanced Features
| Action | Endpoint | Description |
|--------|----------|-------------|
| Playlist tracking | GET `/api/analytics/playlists` | Playlist placements |
| Trigger cities | GET `/api/analytics/triggers` | Viral locations |
| Competitor analysis | GET `/api/analytics/competitors` | Benchmarking |
| Alerts | POST `/api/analytics/alerts` | Set notifications |
| Export report | GET `/api/analytics/export` | PDF/CSV report |

---

## 8. BILLING & PAYMENT WORKFLOWS

### 8.1 Subscription Flow
| Step | Action | Endpoint | Expected Result |
|------|--------|----------|-----------------|
| 1 | View plans | GET `/api/billing/plans` | Available tiers |
| 2 | Select plan | - | Monthly/Yearly/Lifetime |
| 3 | Checkout | POST `/api/billing/checkout` | Stripe session |
| 4 | Payment | - | Stripe payment |
| 5 | Webhook | POST `/api/webhooks/stripe` | Subscription activated |

### 8.2 Pricing Tiers
| Plan | Price | Features |
|------|-------|----------|
| Free | $0 | Basic features |
| Pro Monthly | $49/mo | Full access |
| Pro Yearly | $468/yr | Full access + savings |
| Lifetime | $699 | Forever access |

### 8.3 Payment Actions
| Action | Endpoint | Description |
|--------|----------|-------------|
| Get subscription | GET `/api/billing/subscription` | Current plan |
| Update payment | POST `/api/billing/payment-method` | Change card |
| Cancel subscription | POST `/api/billing/cancel` | End subscription |
| View invoices | GET `/api/invoices` | Payment history |
| Download invoice | GET `/api/invoices/:id/pdf` | PDF invoice |

### 8.4 Payouts (Creators)
| Action | Endpoint | Description |
|--------|----------|-------------|
| View balance | GET `/api/payouts/balance` | Available funds |
| Request payout | POST `/api/payouts/request` | Initiate transfer |
| Payout history | GET `/api/payouts/history` | Past payouts |
| Instant payout | POST `/api/payouts/instant` | Same-day transfer |
| Split payments | POST `/api/payouts/splits` | Collaborator splits |

---

## 9. ADMIN WORKFLOWS

### 9.1 Admin Dashboard
| Section | Endpoint | Purpose |
|---------|----------|---------|
| Overview | GET `/api/admin/dashboard` | System metrics |
| Users | GET `/api/admin/users` | User management |
| Revenue | GET `/api/admin/revenue` | Financial data |
| Security | GET `/api/admin/security` | Security events |
| Logs | GET `/api/admin/logs` | System logs |

### 9.2 User Management
| Action | Endpoint | Description |
|--------|----------|-------------|
| List users | GET `/api/admin/users` | All users |
| View user | GET `/api/admin/users/:id` | User details |
| Update user | PUT `/api/admin/users/:id` | Modify account |
| Suspend user | POST `/api/admin/users/:id/suspend` | Disable access |
| Delete user | DELETE `/api/admin/users/:id` | Remove account |

### 9.3 System Health
| Action | Endpoint | Description |
|--------|----------|-------------|
| Health check | GET `/api/health` | Quick status |
| System status | GET `/api/system/status` | Detailed status |
| Circuit breakers | GET `/api/health/circuits` | Service health |
| Memory | GET `/api/system/memory` | Memory usage |
| Database | GET `/api/system/database/metrics` | Query telemetry |

### 9.4 Security Actions
| Action | Endpoint | Description |
|--------|----------|-------------|
| View threats | GET `/api/security/threats` | Detected threats |
| Block IP | POST `/api/security/block` | Add to blacklist |
| Unblock IP | DELETE `/api/security/block/:ip` | Remove from blacklist |
| Audit log | GET `/api/audit/log` | All actions |
| Kill switch | POST `/api/killSwitch/activate` | Emergency shutdown |

---

## 10. PROMOTIONAL TOOLS WORKFLOWS

### 10.1 Video Creation
| Action | Endpoint | Description |
|--------|----------|-------------|
| Create promo video | POST `/api/promotionalTools/video` | Generate video |
| Create lyric video | POST `/api/promotionalTools/lyric-video` | Lyrics animation |
| Audio visualizer | POST `/api/promotionalTools/visualizer` | Waveform video |
| Social templates | GET `/api/promotionalTools/templates` | Pre-made designs |

### 10.2 Release Countdown
| Action | Endpoint | Description |
|--------|----------|-------------|
| Create countdown | POST `/api/releaseCountdown` | Set up launch |
| Get countdown | GET `/api/releaseCountdown/:id` | View details |
| Update countdown | PUT `/api/releaseCountdown/:id` | Modify date |
| Delete countdown | DELETE `/api/releaseCountdown/:id` | Cancel countdown |

### 10.3 Storefront Customization
| Action | Endpoint | Description |
|--------|----------|-------------|
| Get storefront | GET `/api/storefront` | Current config |
| Update storefront | PUT `/api/storefront` | Modify design |
| Custom domain | POST `/api/storefront/domain` | Add domain |
| Analytics | GET `/api/storefront/analytics` | Visitor stats |

---

## 11. AUTOPILOT WORKFLOWS

### 11.1 Autopilot Configuration
| Action | Endpoint | Description |
|--------|----------|-------------|
| Enable autopilot | POST `/api/autopilot/enable` | Start automation |
| Configure rules | PUT `/api/autopilot/config` | Set preferences |
| View activity | GET `/api/autopilot/activity` | Recent actions |
| Pause autopilot | POST `/api/autopilot/pause` | Temporary stop |

### 11.2 Automated Actions
| Type | Trigger | Action |
|------|---------|--------|
| Posting | Schedule | Auto-post content |
| Engagement | New followers | Auto-respond |
| Analytics | Weekly | Send reports |
| Promotion | Release date | Launch campaign |

### 11.3 Advertising Autopilot
| Action | Endpoint | Description |
|--------|----------|-------------|
| Create campaign | POST `/api/advertisingAutopilot/campaigns` | Auto-optimized ads |
| Set budget | PUT `/api/advertisingAutopilot/budget` | Spending limits |
| View performance | GET `/api/advertisingAutopilot/performance` | ROI metrics |

---

## 12. CAREER COACH WORKFLOWS

### 12.1 AI Guidance
| Action | Endpoint | Description |
|--------|----------|-------------|
| Get recommendations | GET `/api/careerCoach/recommendations` | AI advice |
| Revenue forecast | GET `/api/careerCoach/forecast` | Earnings projection |
| Goal tracking | GET `/api/careerCoach/goals` | Progress metrics |
| Action items | GET `/api/careerCoach/actions` | Next steps |

### 12.2 Achievements
| Action | Endpoint | Description |
|--------|----------|-------------|
| View achievements | GET `/api/achievements` | Earned badges |
| Progress | GET `/api/achievements/progress` | Unlock status |
| Leaderboard | GET `/api/achievements/leaderboard` | Rankings |

---

## 13. DEVELOPER API WORKFLOWS

### 13.1 API Key Management
| Action | Endpoint | Description |
|--------|----------|-------------|
| Create key | POST `/api/developer/keys` | Generate API key |
| List keys | GET `/api/developer/keys` | All keys |
| Revoke key | DELETE `/api/developer/keys/:id` | Disable key |
| Usage stats | GET `/api/developer/usage` | API calls |

### 13.2 Webhooks
| Action | Endpoint | Description |
|--------|----------|-------------|
| Create webhook | POST `/api/developer/webhooks` | Register endpoint |
| List webhooks | GET `/api/developer/webhooks` | All webhooks |
| Test webhook | POST `/api/developer/webhooks/:id/test` | Send test event |
| View logs | GET `/api/developer/webhooks/:id/logs` | Delivery history |

---

## 14. SUPPORT WORKFLOWS

### 14.1 Help Desk
| Action | Endpoint | Description |
|--------|----------|-------------|
| Create ticket | POST `/api/helpDesk/tickets` | Submit issue |
| View tickets | GET `/api/helpDesk/tickets` | All tickets |
| Update ticket | PUT `/api/helpDesk/tickets/:id` | Add info |
| AI support | POST `/api/helpDesk/ai` | Get AI help |

### 14.2 Documentation
| Resource | Path | Description |
|----------|------|-------------|
| API docs | `/api-docs` | Swagger UI |
| Help center | `/help` | User guides |
| Tutorials | `/tutorials` | Video guides |

---

## 15. SETTINGS WORKFLOWS

### 15.1 Profile Settings
| Action | Endpoint | Description |
|--------|----------|-------------|
| Get profile | GET `/api/users/profile` | Current settings |
| Update profile | PUT `/api/users/profile` | Modify info |
| Upload avatar | POST `/api/users/avatar` | Profile image |
| Delete account | DELETE `/api/users/account` | Remove account |

### 15.2 Notification Preferences
| Action | Endpoint | Description |
|--------|----------|-------------|
| Get preferences | GET `/api/emailPreferences` | Current settings |
| Update preferences | PUT `/api/emailPreferences` | Modify alerts |
| Unsubscribe | POST `/api/emailPreferences/unsubscribe` | Stop emails |

---

## ENDPOINT SUMMARY BY CATEGORY

| Category | Route Files | Endpoints (approx) |
|----------|-------------|-------------------|
| Authentication | 1 | 15 |
| Onboarding | 2 | 14 |
| AI Studio | 10 | 160+ |
| Distribution | 3 | 100+ |
| Social Media | 8 | 150+ |
| Marketplace | 3 | 80+ |
| Analytics | 5 | 80+ |
| Billing/Payouts | 4 | 45 |
| Admin | 4 | 35+ |
| Promotional | 3 | 60+ |
| Autopilot | 6 | 90+ |
| Career Coach | 2 | 20 |
| Developer API | 2 | 15 |
| Support | 2 | 15 |
| Settings | 2 | 15 |
| **TOTAL** | **75** | **~1,181** |

---

*This document provides a comprehensive guide to all user workflows and actions available in Max Booster.*
