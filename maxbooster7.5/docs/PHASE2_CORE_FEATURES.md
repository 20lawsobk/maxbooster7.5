# PHASE 2: CORE FEATURE IDENTIFICATION AND SCOPE FREEZE
## Max Booster Production Hardening - Feature Scope
**Generated**: January 9, 2026

---

## 1. CORE FEATURES (REQUIRED FOR LAUNCH)

### CORE FEATURE 1: Authentication & User Management
| Aspect | Details |
|--------|---------|
| **Purpose** | Secure user authentication, registration, session management, and subscription billing |
| **Inputs** | Email, password, 2FA codes, payment information |
| **Expected Behavior** | Users can register, login, manage sessions, subscribe to plans, reset passwords |
| **Outputs** | Session tokens, user profiles, subscription status |
| **Side Effects** | Database writes (users, sessions), Stripe customer creation, SendGrid emails |
| **Endpoints** | `/api/auth/*`, `/api/billing/*`, `/api/security/*` |
| **Status** | REQUIRED - Critical path |

### CORE FEATURE 2: AI Studio (DAW)
| Aspect | Details |
|--------|---------|
| **Purpose** | Browser-based digital audio workstation with AI-powered features |
| **Inputs** | Audio files, MIDI data, project configuration, plugin settings |
| **Expected Behavior** | Users can create, edit, mix music; use plugins; collaborate in real-time |
| **Outputs** | Audio projects, exports, stems, session files |
| **Side Effects** | Object storage writes, WebSocket sessions, database project saves |
| **Endpoints** | `/api/studio/*`, `/api/studioPlugins/*`, `/api/studioMidi/*`, `/api/vstBridge/*` |
| **Status** | REQUIRED - Core product value |

### CORE FEATURE 3: Music Distribution
| Aspect | Details |
|--------|---------|
| **Purpose** | Distribute music to 150+ streaming platforms via LabelGrid |
| **Inputs** | Audio files, metadata, artwork, release scheduling, territory selection |
| **Expected Behavior** | Users can submit releases, track delivery, manage royalties |
| **Outputs** | Release tracking, delivery confirmations, royalty reports |
| **Side Effects** | LabelGrid API calls, database release records, notification emails |
| **Endpoints** | `/api/distribution/*`, `/api/releaseCountdown/*` |
| **Status** | REQUIRED - Core product value |

### CORE FEATURE 4: Social Media Management
| Aspect | Details |
|--------|---------|
| **Purpose** | Manage social media presence across multiple platforms |
| **Inputs** | Content, scheduling data, platform connections, approval workflows |
| **Expected Behavior** | Users can schedule posts, generate AI content, manage approvals, track engagement |
| **Outputs** | Scheduled posts, published content, engagement metrics |
| **Side Effects** | Social platform API calls, queue jobs, database writes |
| **Endpoints** | `/api/socialMedia/*`, `/api/socialAI/*`, `/api/socialBulk/*`, `/api/socialApprovals/*`, `/api/socialOAuth/*` |
| **Status** | REQUIRED - Core product value |

### CORE FEATURE 5: Beat Marketplace
| Aspect | Details |
|--------|---------|
| **Purpose** | Marketplace for buying and selling beats, samples, and licenses |
| **Inputs** | Beat uploads, pricing, license types, storefront configuration |
| **Expected Behavior** | Users can list beats, configure storefronts, process purchases |
| **Outputs** | Listings, sales, contracts, payout transactions |
| **Side Effects** | Stripe Connect payments, database transactions, file storage |
| **Endpoints** | `/api/marketplace/*`, `/api/storefront/*`, `/api/contracts/*` |
| **Status** | REQUIRED - Revenue generation |

### CORE FEATURE 6: Analytics Dashboard
| Aspect | Details |
|--------|---------|
| **Purpose** | Track streaming performance, revenue, and audience growth |
| **Inputs** | Platform analytics data, user queries, date ranges |
| **Expected Behavior** | Users see dashboards, charts, insights, alerts |
| **Outputs** | Analytics reports, visualizations, export data |
| **Side Effects** | Database reads, cache updates, alert notifications |
| **Endpoints** | `/api/analytics/*`, `/api/artistProgress/*`, `/api/careerCoach/*`, `/api/revenueForecast/*` |
| **Status** | REQUIRED - User retention |

### CORE FEATURE 7: Billing & Payments
| Aspect | Details |
|--------|---------|
| **Purpose** | Subscription management, payouts, invoicing |
| **Inputs** | Payment methods, subscription selections, payout requests |
| **Expected Behavior** | Users can subscribe, receive payouts, view invoices |
| **Outputs** | Payment confirmations, invoices, payout history |
| **Side Effects** | Stripe API calls, database transactions, emails |
| **Endpoints** | `/api/billing/*`, `/api/payouts/*`, `/api/invoices/*`, `/api/kyc/*` |
| **Status** | REQUIRED - Revenue critical |

### CORE FEATURE 8: Admin Dashboard
| Aspect | Details |
|--------|---------|
| **Purpose** | Platform administration, monitoring, user management |
| **Inputs** | Admin actions, configuration changes, queries |
| **Expected Behavior** | Admins can monitor health, manage users, view metrics |
| **Outputs** | System status, user lists, analytics |
| **Side Effects** | Database writes, system configuration changes |
| **Endpoints** | `/api/admin/*`, `/api/monitoring/*`, `/api/status/*` |
| **Status** | REQUIRED - Operations critical |

---

## 2. SECONDARY FEATURES (IMPORTANT BUT NOT CRITICAL)

### SECONDARY FEATURE 1: Advertising Autopilot
| Aspect | Details |
|--------|---------|
| **Purpose** | Automated advertising campaign management across platforms |
| **Endpoints** | `/api/advertising/*`, `/api/advertisingAutopilot/*` |
| **Status** | IMPORTANT - Can launch without if needed |

### SECONDARY FEATURE 2: Collaboration System
| Aspect | Details |
|--------|---------|
| **Purpose** | Artist collaboration, project sharing, real-time editing |
| **Endpoints** | `/api/collaborations/*`, `/api/workspace/*` |
| **Status** | IMPORTANT - Enhances core studio |

### SECONDARY FEATURE 3: Onboarding & Achievements
| Aspect | Details |
|--------|---------|
| **Purpose** | User onboarding, gamification, progress tracking |
| **Endpoints** | `/api/onboarding/*`, `/api/achievements/*` |
| **Status** | IMPORTANT - User retention |

### SECONDARY FEATURE 4: Help & Support
| Aspect | Details |
|--------|---------|
| **Purpose** | Help desk, AI support, documentation |
| **Endpoints** | `/api/helpDesk/*`, `/api/support/*` |
| **Status** | IMPORTANT - Customer support |

### SECONDARY FEATURE 5: Growth & Organic Tools
| Aspect | Details |
|--------|---------|
| **Purpose** | Organic growth strategies, promotional tools |
| **Endpoints** | `/api/growth/*`, `/api/organic/*`, `/api/promotionalTools/*` |
| **Status** | IMPORTANT - User value |

### SECONDARY FEATURE 6: DMCA & Contracts
| Aspect | Details |
|--------|---------|
| **Purpose** | Copyright management, contract generation |
| **Endpoints** | `/api/dmca/*`, `/api/contracts/*` |
| **Status** | IMPORTANT - Legal compliance |

---

## 3. EXPERIMENTAL / DEBUG FEATURES

### 3.1 Simulation System
| Feature | Purpose | Status |
|---------|---------|--------|
| `/api/simulation/*` | System behavior simulation | EXPERIMENTAL - Keep but document as admin-only |
| Lifecycle simulations | Test complete user journeys | DEBUG - Disable in production |

### 3.2 Testing & Chaos Engineering
| Feature | Purpose | Status |
|---------|---------|--------|
| `/api/testing/*` | Testing endpoints | DEBUG - Admin-only |
| Chaos tests | Worker crash testing | DEBUG - Remove from production |
| Burn-in tests | Long-running stability | DEBUG - CI/CD only |

### 3.3 Self-Healing & Kill Switch
| Feature | Purpose | Status |
|---------|---------|--------|
| `/api/selfHealingApi/*` | Automated incident response | EXPERIMENTAL - Keep, admin-only |
| `/api/killSwitch/*` | Emergency system controls | ADMIN-ONLY - Keep secured |

### 3.4 Developer API
| Feature | Purpose | Status |
|---------|---------|--------|
| `/api/developer/*` | Third-party API access | FUTURE - Partially implemented |

### 3.5 Offline Mode
| Feature | Purpose | Status |
|---------|---------|--------|
| `/api/offline/*` | Offline functionality | EXPERIMENTAL - Keep but mark beta |

### 3.6 Dual Autopilot
| Feature | Purpose | Status |
|---------|---------|--------|
| `/api/dualAutopilot/*` | Combined social/ad automation | EXPERIMENTAL - Recently added, needs testing |

---

## 4. PARTIALLY IMPLEMENTED / UNUSED SERVICES

Based on Phase 1 analysis, these services have 0 direct imports and may be dead code:

| Service | Status | Recommendation |
|---------|--------|----------------|
| `accountDeletionService` | UNUSED | Keep - GDPR compliance needed |
| `advertisingAIService` | UNUSED | Verify if dynamically loaded |
| `advertisingDispatchService` | UNUSED | Verify if dynamically loaded |
| `advertisingNormalizationService` | UNUSED | Verify if dynamically loaded |
| `advertisingRulesService` | UNUSED | Verify if dynamically loaded |
| `aiAnalyticsService` | UNUSED | Verify if dynamically loaded |
| `aiContentService` | UNUSED | Verify if dynamically loaded |
| `aiInsightsEngine` | UNUSED | Verify if dynamically loaded |
| `aiMusicService` | UNUSED | Verify if dynamically loaded |
| `aiService` | UNUSED | Verify if dynamically loaded |

**Recommendation**: Audit these services to determine if they're loaded dynamically or truly unused.

---

## 5. FEATURE LAUNCH MATRIX

### LAUNCH REQUIRED (P0)
| Feature | Endpoints | Test Coverage | Status |
|---------|-----------|---------------|--------|
| Authentication | `/api/auth/*` | Pre-launch check | READY |
| Billing | `/api/billing/*` | Stripe verification | READY |
| Studio Core | `/api/studio/*` | Manual testing | READY |
| Distribution | `/api/distribution/*` | LabelGrid check | READY |
| Social Media Core | `/api/socialMedia/*` | OAuth testing | READY |
| Marketplace | `/api/marketplace/*` | Manual testing | READY |
| Analytics | `/api/analytics/*` | Pre-launch check | READY |
| Admin | `/api/admin/*` | Admin login test | READY |

### CAN SOFT-LAUNCH (P1)
| Feature | Risk if Broken | Action |
|---------|----------------|--------|
| Advertising Autopilot | Users can still manually advertise | Monitor closely |
| Onboarding | Users can skip | Keep enabled |
| Achievements | Gamification reduced | Keep enabled |
| Collaboration | Single-user mode works | Keep enabled |

### CAN DISABLE IF UNSTABLE (P2)
| Feature | How to Disable | Impact |
|---------|----------------|--------|
| Simulation | Remove from routes.ts | None for users |
| Testing endpoints | Remove from routes.ts | None for users |
| Offline mode | Feature flag | Minimal |
| Dual Autopilot | Feature flag | Users use single autopilot |

### KEEP HIDDEN / ADMIN-ONLY (P3)
| Feature | Access Control | Reason |
|---------|----------------|--------|
| Kill Switch | Admin role required | Security |
| Self-Healing API | Admin role required | Security |
| Executive Dashboard | Admin role required | Internal metrics |
| Developer API | Future feature | Not ready for public |

---

## 6. PROPOSED SCOPE FREEZE

### FROZEN FOR LAUNCH:
1. **No new features** - Only bug fixes and stability improvements
2. **No new endpoints** - Existing ~1,136 endpoints are final
3. **No new tables** - 160 database tables are final
4. **No new dependencies** - Package.json is locked

### ALLOWED CHANGES:
1. Bug fixes for P0 and P1 features
2. Error handling improvements
3. Logging and observability enhancements
4. Security hardening
5. Performance optimizations
6. Documentation updates

### NOT ALLOWED:
1. New user-facing features
2. Schema changes (except critical fixes)
3. Major refactors that change behavior
4. New external integrations
5. New package additions

---

## 7. CONFIRMATION CHECKLIST

Before proceeding to Phase 3, confirm:

- [ ] Core features (8) are correctly identified
- [ ] Secondary features (6) are acceptable for soft-launch
- [ ] Experimental features (6 categories) are correctly marked
- [ ] Unused services (10) should be audited
- [ ] Launch matrix priorities are correct
- [ ] Scope freeze rules are acceptable

---

## 8. NEXT STEPS (Phase 3)

1. Audit unused services for dynamic loading
2. Add feature flags for experimental features
3. Improve separation between core and experimental modules
4. Document admin-only endpoints clearly
5. Verify all P0 features pass pre-launch checks

---

*Awaiting confirmation on core feature list before major architectural changes.*
