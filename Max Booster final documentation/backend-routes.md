# Backend Routes

All routes are registered in `server/index.ts` and live in `server/routes/`. Every protected route uses at minimum `requireAuth`. Admin routes use `requireAdmin` which checks `req.user.role === 'admin'`.

## Authentication & Identity

### `auth.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Create account (hashed password, email verification) |
| POST | `/api/auth/login` | Public | Login, returns JWT access + refresh token pair |
| POST | `/api/auth/logout` | Auth | Increments tokenVersion, invalidates all sessions |
| GET | `/api/auth/me` | Auth | Returns current user profile |
| POST | `/api/auth/refresh` | Public | Exchange refresh token for new token pair |
| POST | `/api/auth/verify-email` | Public | Verify email with token |
| POST | `/api/auth/reset-password` | Public | Trigger password reset email |
| POST | `/api/auth/forgot-password` | Public | Send reset link |

### `kyc.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/kyc/start` | Auth | Initiate KYC verification |
| POST | `/api/kyc/individual` | Auth | Submit individual identity |
| POST | `/api/kyc/business` | Auth | Submit business identity |
| POST | `/api/kyc/tax-form` | Auth | Submit tax form (W-9, W-8BEN) |
| POST | `/api/kyc/documents/upload` | Auth | Upload verification documents |
| GET | `/api/kyc/status` | Auth | Current KYC verification status |

## Administration

### `admin/index.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/users` | Admin | Paginated user list with filters |
| GET | `/api/admin/stats` | Admin | Platform-wide stats (users, revenue, active) |
| GET | `/api/admin/audit-logs` | Admin | Security audit trail |
| GET | `/api/admin/settings` | Admin | Read all system settings |
| PUT | `/api/admin/settings` | Admin | Update system settings (upserts to systemSettings table) |
| POST | `/api/admin/users/:id/ban` | Admin | Ban a user account |
| POST | `/api/admin/users/:id/verify` | Admin | Manually verify a user |

### `admin/metrics.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/metrics/system` | Admin | CPU, memory, event loop |
| GET | `/api/admin/metrics/active-users` | Admin | Currently active users |
| GET | `/api/admin/metrics/revenue` | Admin | Revenue KPIs |
| GET | `/api/admin/metrics/error-rates` | Admin | Error rate time series |

### `killSwitch.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/kill-switch/status` | Admin | Current system states |
| POST | `/api/kill-switch/kill-all` | Admin | Disable all autonomous systems |
| POST | `/api/kill-switch/resume-all` | Admin | Re-enable all autonomous systems |
| POST | `/api/kill-switch/kill/:system` | Admin | Disable a specific subsystem |

## AI & Automation

### `ai.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/ai/content/generate` | Auth | Generate social content |
| POST | `/api/ai/sentiment/analyze` | Auth | Analyze text sentiment |
| GET | `/api/ai/recommendations/get` | Auth | Personalized recommendations |

### `autopilot.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/autopilot/status` | Auth | Current autopilot state |
| POST | `/api/autopilot/start` | Auth | Enable autonomous posting |
| POST | `/api/autopilot/stop` | Auth | Disable autonomous posting |
| PUT | `/api/autopilot/config` | Auth | Update autopilot settings |

### `dualAutopilot.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/dual-autopilot/fanbase/daily-loop` | Auth | Trigger fanbase engagement cycle |
| POST | `/api/dual-autopilot/organic/weekly-loop` | Auth | Trigger organic growth cycle |
| POST | `/api/dual-autopilot/fanbase/memory/decay` | Auth | Age out stale engagement memory |

### `selfHealingApi.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/self-healing/status` | Auth | Security engine health |
| GET | `/api/self-healing/metrics` | Auth | Threat response metrics |
| GET | `/api/self-healing/proof` | Auth | Audit proof of healing actions |

## Studio & Creative

### `studio.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/studio/projects` | Auth | List user's projects |
| POST | `/api/studio/projects` | Auth | Create new project |
| GET | `/api/studio/projects/:id` | Auth | Load project (ownership checked) |
| PUT | `/api/studio/projects/:id/sync` | Auth | Save project state |
| DELETE | `/api/studio/projects/:id` | Auth | Delete project |
| GET | `/api/studio/recent-files` | Auth | Recent files (from studioRecentFiles table) |
| GET | `/api/studio/lyrics` | Auth | Read lyrics from project metadata |
| POST | `/api/studio/lyrics` | Auth | Write lyrics to project metadata |
| GET | `/api/studio/stem-exports/:projectId` | Auth | List stem exports (ownership checked) |
| POST | `/api/studio/projects/:projectId/export-stems` | Auth | Start stem export job |
| POST | `/api/studio/projects/:id/plugins/:pluginId/presets` | Auth | Save plugin preset |

### `studioGeneration.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/studio/generation/text` | Auth | Text-to-music generation |
| POST | `/api/studio/generation/audio` | Auth | Audio-to-audio transformation |
| POST | `/api/studio/generation/pattern/melody` | Auth | Generate MIDI melody pattern |
| POST | `/api/studio/generation/pattern/drums` | Auth | Generate MIDI drum pattern |

### `studioComping.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/studio/projects/:id/comping/groups` | Auth | List take groups |
| POST | `/api/studio/projects/:id/comping/groups` | Auth | Create take group |
| GET | `/api/studio/projects/:id/comping/lanes` | Auth | List take lanes |
| POST | `/api/studio/projects/:id/comping/segments` | Auth | Add take segment |

### `studioStems.ts`, `studioWarping.ts`, `studioMidi.ts`, `studioMarkers.ts`, `studioPlugins.ts`
Domain-specific studio operation routes (stems management, time-warp, MIDI data, cue markers, plugin management).

### `vstBridge.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/vst/plugins` | Auth | List available VST plugins |
| POST | `/api/vst/plugins/:id/load` | Auth | Load plugin into project |
| PUT | `/api/vst/plugins/:id/params` | Auth | Update plugin parameters |

## Distribution

### `distribution.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/distribution/releases` | Auth | List user's releases |
| POST | `/api/distribution/releases` | Auth | Create new release |
| PUT | `/api/distribution/releases/:id` | Auth | Update release metadata |
| DELETE | `/api/distribution/releases/:id` | Auth | Cancel/delete release |
| POST | `/api/distribution/releases/:id/submit` | Auth | Submit to distribution network |
| GET | `/api/distribution/platforms/verify` | Auth | Verify DSP credentials |
| POST | `/api/distribution/codes/upc` | Auth | Generate UPC code |
| POST | `/api/distribution/codes/isrc` | Auth | Generate ISRC code |

## Marketplace

### `marketplace.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/marketplace/beats` | Public | Browse beat listings |
| POST | `/api/marketplace/beats` | Auth | Create beat listing |
| PUT | `/api/marketplace/beats/:id` | Auth | Update beat (ownership checked) |
| DELETE | `/api/marketplace/beats/:id` | Auth | Remove beat listing |
| GET | `/api/marketplace/license-templates` | Public | Available license types |
| POST | `/api/marketplace/purchases` | Auth | Purchase a beat |
| POST | `/api/marketplace/escrow` | Auth | Place funds in escrow |
| GET | `/api/marketplace/beats/:id/analytics` | Auth | Beat performance metrics |

## Social Media & Content

### `socialMedia.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/social/post` | Auth | Immediately post content |
| POST | `/api/social/schedule` | Auth | Schedule future post |
| GET | `/api/social/accounts` | Auth | Connected social accounts |
| GET | `/api/social/engagement-metrics` | Auth | Engagement analytics |
| DELETE | `/api/social/posts/:id` | Auth | Delete scheduled post |

### `organic.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/organic/viral-score` | Auth | Viral potential score for content |
| GET | `/api/organic/optimal-timing` | Auth | Best posting times by platform |
| GET | `/api/organic/algorithm-insights` | Auth | Platform algorithm recommendations |

## Advertising

### `advertising.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/advertising/campaigns` | Auth | List AI-managed campaigns |
| POST | `/api/advertising/campaigns` | Auth | Create campaign (AI handles allocation) |
| GET | `/api/advertising/audience-segments` | Auth | AI-discovered audience segments |
| GET | `/api/advertising/creative-fatigue` | Auth | Detect creative fatigue signals |
| GET | `/api/advertising/roas/forecast` | Auth | Return-on-investment forecast |
| GET | `/api/advertising/roas/audience-segments` | Auth | Audience ROAS by segment |

## Analytics

### `api/v1/analytics.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/analytics/streams` | Auth | Streaming data across platforms |
| GET | `/api/v1/analytics/engagement` | Auth | Engagement metrics |
| GET | `/api/v1/analytics/demographics` | Auth | Audience demographics |
| GET | `/api/v1/analytics/global-ranking` | Auth | Global artist ranking |

### `revenueForecast.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/revenue-forecast/daily` | Auth | 30-day daily projection |
| GET | `/api/revenue-forecast/monthly` | Auth | 12-month projection |
| GET | `/api/revenue-forecast/scenarios` | Auth | Best/base/worst case scenarios |

## Financial Operations

### `billing.ts`
Subscription management (Stripe integration): plan selection, payment methods, subscription upgrade/downgrade, invoice history.

### `payouts.ts`
Withdrawal requests, payout method management (bank, PayPal, Stripe, crypto), payout history, minimum threshold configuration.

### `contracts.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/contracts/split-sheets/create` | Auth | Create royalty split sheet |
| POST | `/api/contracts/split-sheets/:id/sign` | Auth | Sign split sheet |
| GET | `/api/contracts/marketplace-disputes` | Auth | Active marketplace disputes |
| POST | `/api/contracts/tax-forms/generate` | Auth | Generate 1099/W-8BEN |

## Storage

### `storage.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/storage/upload` | Auth | Single file upload |
| POST | `/api/storage/upload/chunk` | Auth | Chunked upload (large files) |
| GET | `/api/storage/file/*key` | Auth | Serve stored file |
| GET | `/api/storage/quota` | Auth | Used/available storage quota |

### `fabric.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/fabric/pockets` | Auth | List storage pockets |
| GET | `/api/fabric/volumes` | Auth | List storage volumes |
| GET | `/api/fabric/objects` | Auth | List objects in pocket |
| GET | `/api/fabric/nodes` | Admin | Node health overview |

## Batch Operations

### `batch.ts`
All 16 batch operations with IDOR protection (per-ID ownership check):

| Method | Endpoint | Auth | Operation |
|---|---|---|---|
| POST | `/api/batch/releases/submit` | Auth | Bulk submit releases (sets status = pending) |
| POST | `/api/batch/releases/takedown` | Auth | Bulk takedown releases |
| PUT | `/api/batch/releases/update` | Auth | Bulk update release metadata |
| DELETE | `/api/batch/releases/delete` | Auth | Bulk soft-delete releases |
| POST | `/api/batch/posts/schedule` | Auth | Bulk schedule posts |
| DELETE | `/api/batch/posts/delete` | Auth | Bulk delete posts |
| PUT | `/api/batch/posts/update` | Auth | Bulk update posts |
| POST | `/api/batch/posts/approve` | Auth | Bulk approve posts (sets approvalStatus) |
| DELETE | `/api/batch/files/delete` | Auth | Bulk soft-delete files |
| PUT | `/api/batch/files/move` | Auth | Bulk move files to folder |
| PUT | `/api/batch/files/update` | Auth | Bulk update file metadata |
| PUT | `/api/batch/marketplace/update` | Auth | Bulk update listings |
| DELETE | `/api/batch/marketplace/delete` | Auth | Bulk unpublish listings |
| PUT | `/api/batch/beats/update` | Auth | Bulk update beats |
| DELETE | `/api/batch/beats/delete` | Auth | Bulk unpublish beats |
| PUT | `/api/batch/tracks/move` | Auth | Bulk move tracks between projects |
| PUT | `/api/batch/tracks/tag` | Auth | Bulk update track tags |
| DELETE | `/api/batch/tracks/delete` | Auth | Bulk delete tracks |

## Platform & Utilities

### `status.ts`
Public status page: service health, active incidents, maintenance windows.

### `webhooks/stripe.ts`
Stripe event handling: `payment_intent.succeeded`, `invoice.paid`, `customer.subscription.updated`, `account.updated`.

### `webhooks/sendgrid.ts`
Email event handling: delivery, bounce, open, click events.

### `dmca.ts`
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/dmca/notice` | Public | Submit DMCA takedown notice |
| POST | `/api/dmca/counter` | Auth | Submit counter-notice |
| GET | `/api/dmca/strikes` | Auth | View DMCA strikes on account |
| POST | `/api/dmca/legal-holds` | Admin | Place content on legal hold |

### `search.ts`
Unified search across beats, artists, projects, and releases.

### `notifications.ts`
In-app notifications: list, mark-read, mark-all-read, push subscription management.
