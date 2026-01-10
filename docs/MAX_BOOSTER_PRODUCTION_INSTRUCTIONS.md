# MAX BOOSTER - PRODUCTION HARDENING INSTRUCTIONS
## Updated for Max Booster's Full Feature Set

**System Statistics:**
- 40+ pages/views
- ~1,181 endpoints (1,044 route handlers + additional inline endpoints)
- 75 route files
- 176 service files
- Multiple subsystems (AI Studio, Distribution, Social Media, Marketplace, Analytics, etc.)

---

## WORKFLOW DOMAINS (COMPLETE LIST FOR MAX BOOSTER)

### 1. PROJECT LIFECYCLE WORKFLOWS
| Workflow | Endpoint | Description |
|----------|----------|-------------|
| Create project | POST `/api/studio/projects` | Create new studio project |
| Load project | GET `/api/studio/projects/:id` | Load existing project |
| Save project | PUT `/api/studio/projects/:id` | Save project state |
| Duplicate project | POST `/api/studio/projects/:id/duplicate` | Clone project |
| Delete project | DELETE `/api/studio/projects/:id` | Remove project |
| Autosave | PUT `/api/studio/projects/:id/autosave` | Background save |
| Project metadata | PUT `/api/studio/projects/:id/metadata` | Update info |
| List projects | GET `/api/studio/projects` | Get all projects |
| Export project | POST `/api/studio/projects/:id/export` | Export bundle |

### 2. DAW / AUDIO ENGINE WORKFLOWS
| Workflow | Endpoint | Description |
|----------|----------|-------------|
| Create track | POST `/api/studio/tracks` | Add new track |
| Delete track | DELETE `/api/studio/tracks/:id` | Remove track |
| Update track | PUT `/api/studio/tracks/:id` | Modify track |
| Add clip | POST `/api/studio/clips` | Add audio clip |
| Edit clip | PUT `/api/studio/clips/:id` | Modify clip |
| Delete clip | DELETE `/api/studio/clips/:id` | Remove clip |
| Comping | POST `/api/studioComping/takes` | Manage takes |
| Markers | POST `/api/studioMarkers` | Timeline markers |
| Warping | POST `/api/studioWarping/analyze` | Time stretch |
| Stems | POST `/api/studioStems/separate` | Stem separation |
| MIDI | POST `/api/studioMidi/import` | MIDI operations |
| Plugins | POST `/api/studioPlugins/:id/add` | Load plugin |
| Presets | GET `/api/studioPlugins/presets` | Plugin presets |
| AI Mix | POST `/api/studio/ai-mix` | Auto mixing |
| AI Master | POST `/api/studio/ai-master` | Auto mastering |
| AI Generate | POST `/api/studioGeneration/generate` | AI music gen |
| Export audio | POST `/api/studio/export` | Render audio |
| Upload audio | POST `/api/studio/upload` | Import audio |
| VST Bridge | POST `/api/vstBridge/scan` | VST plugins |

### 3. DISTRIBUTION WORKFLOWS
| Workflow | Endpoint | Description |
|----------|----------|-------------|
| Create release | POST `/api/distribution/releases` | New release |
| Update release | PUT `/api/distribution/releases/:id` | Edit release |
| Delete release | DELETE `/api/distribution/releases/:id` | Remove release |
| Add tracks | POST `/api/distribution/releases/:id/tracks` | Add tracks |
| Upload artwork | POST `/api/distribution/artwork` | Cover art |
| Get platforms | GET `/api/distribution/platforms` | 11+ DSPs |
| Select platforms | POST `/api/distribution/releases/:id/platforms` | Choose DSPs |
| Submit release | POST `/api/distribution/releases/:id/submit` | Submit to DSPs |
| Check status | GET `/api/distribution/releases/:id/status` | Delivery status |
| Content ID | POST `/api/distribution/contentId` | Register audio |
| Generate ISRC | POST `/api/distribution/isrc` | ISRC codes |
| Generate UPC | POST `/api/distribution/upc` | UPC codes |
| Royalty splits | POST `/api/distribution/splits` | Revenue sharing |
| Catalog import | POST `/api/distribution/catalog/import` | Import catalog |
| Sync licensing | POST `/api/distribution/sync` | Sync deals |
| LabelGrid API | POST `/api/distribution/labelgrid/*` | Partner API |

### 4. SOCIAL MEDIA WORKFLOWS
| Workflow | Endpoint | Description |
|----------|----------|-------------|
| Connect Twitter | GET `/api/socialOAuth/twitter/connect` | OAuth |
| Connect Facebook | GET `/api/socialOAuth/facebook/connect` | OAuth |
| Connect Instagram | GET `/api/socialOAuth/instagram/connect` | OAuth |
| Connect TikTok | GET `/api/socialOAuth/tiktok/connect` | OAuth |
| Connect YouTube | GET `/api/socialOAuth/youtube/connect` | OAuth |
| Connect LinkedIn | GET `/api/socialOAuth/linkedin/connect` | OAuth |
| Connect Threads | GET `/api/socialOAuth/threads/connect` | OAuth |
| Disconnect platform | DELETE `/api/socialOAuth/:platform` | Remove connection |
| Get connections | GET `/api/socialOAuth/connections` | List connected |
| Create post | POST `/api/socialMedia/posts` | Schedule post |
| Update post | PUT `/api/socialMedia/posts/:id` | Edit post |
| Delete post | DELETE `/api/socialMedia/posts/:id` | Remove post |
| Get queue | GET `/api/socialMedia/queue` | Pending posts |
| Bulk schedule | POST `/api/socialBulk/schedule` | Multiple posts |
| AI generate caption | POST `/api/socialAI/generate/caption` | AI captions |
| AI generate hashtags | POST `/api/socialAI/generate/hashtags` | AI hashtags |
| AI content ideas | GET `/api/socialAI/ideas` | Suggestions |
| A/B testing | POST `/api/socialAI/ab-test` | Test variants |
| Get pending approvals | GET `/api/social/approvals/pending` | Awaiting approval |
| Approve post | POST `/api/social/approvals/:id/approve` | Approve |
| Reject post | POST `/api/social/approvals/:id/reject` | Reject |
| Analytics | GET `/api/socialMedia/analytics` | Engagement data |
| Organic growth | POST `/api/organic/campaigns` | Growth tools |

### 5. MARKETPLACE WORKFLOWS
| Workflow | Endpoint | Description |
|----------|----------|-------------|
| Create listing | POST `/api/marketplace/listings` | New beat listing |
| Update listing | PUT `/api/marketplace/listings/:id` | Edit listing |
| Delete listing | DELETE `/api/marketplace/listings/:id` | Remove listing |
| Get listings | GET `/api/marketplace/listings` | Browse beats |
| Search listings | GET `/api/marketplace/search` | Search beats |
| Preview beat | GET `/api/marketplace/listings/:id/preview` | Audio preview |
| Get licenses | GET `/api/marketplace/licenses` | License types |
| Checkout | POST `/api/marketplace/checkout` | Purchase beat |
| Download | GET `/api/marketplace/downloads/:id` | Get files |
| Sales analytics | GET `/api/marketplace/analytics` | Seller stats |
| Contract templates | GET `/api/contracts/templates` | 10 templates |
| Create contract | POST `/api/contracts` | Custom contract |
| Sign contract | POST `/api/contracts/:id/sign` | E-sign |

### 6. STOREFRONT WORKFLOWS
| Workflow | Endpoint | Description |
|----------|----------|-------------|
| Get storefront | GET `/api/storefront` | Current config |
| Update storefront | PUT `/api/storefront` | Modify design |
| Custom domain | POST `/api/storefront/domain` | Add domain |
| Storefront analytics | GET `/api/storefront/analytics` | Visitor stats |
| Featured beats | PUT `/api/storefront/featured` | Highlight beats |
| Branding | PUT `/api/storefront/branding` | Colors/logo |

### 7. ANALYTICS WORKFLOWS
| Workflow | Endpoint | Description |
|----------|----------|-------------|
| Overview | GET `/api/analytics/overview` | Key metrics |
| Streams | GET `/api/analytics/streams` | Play counts |
| Revenue | GET `/api/analytics/revenue` | Earnings |
| Audience | GET `/api/analytics/audience` | Demographics |
| Geographic | GET `/api/analytics/geo` | Locations |
| Spotify analytics | GET `/api/analytics/spotify` | Spotify data |
| Apple analytics | GET `/api/analytics/apple` | Apple data |
| YouTube analytics | GET `/api/analytics/youtube` | YouTube data |
| TikTok analytics | GET `/api/analytics/tiktok` | TikTok data |
| Playlist tracking | GET `/api/analytics/playlists` | Placements |
| Trigger cities | GET `/api/analytics/triggers` | Viral locations |
| Competitor analysis | GET `/api/analytics/competitors` | Benchmarking |
| Create alert | POST `/api/analytics/alerts` | Notifications |
| Export report | GET `/api/analytics/export` | PDF/CSV |
| Certified analytics | GET `/api/certifiedAnalytics/*` | Verified data |

### 8. BILLING & PAYMENT WORKFLOWS
| Workflow | Endpoint | Description |
|----------|----------|-------------|
| Get plans | GET `/api/billing/plans` | Available tiers |
| Get subscription | GET `/api/billing/subscription` | Current plan |
| Create checkout | POST `/api/billing/checkout` | Stripe session |
| Update payment | POST `/api/billing/payment-method` | Change card |
| Cancel subscription | POST `/api/billing/cancel` | End plan |
| Resume subscription | POST `/api/billing/resume` | Reactivate |
| Get invoices | GET `/api/invoices` | Payment history |
| Download invoice | GET `/api/invoices/:id/pdf` | PDF invoice |
| View balance | GET `/api/payouts/balance` | Available funds |
| Request payout | POST `/api/payouts/request` | Withdraw |
| Instant payout | POST `/api/payouts/instant` | Same-day |
| Payout history | GET `/api/payouts/history` | Past payouts |
| Split payments | POST `/api/payouts/splits` | Collaborator splits |
| KYC verification | POST `/api/kyc/verify` | Identity check |
| Stripe webhook | POST `/api/webhooks/stripe` | Payment events |

### 9. USER ACCOUNT / SESSION WORKFLOWS
| Workflow | Endpoint | Description |
|----------|----------|-------------|
| Register | POST `/api/auth/register` | Create account |
| Login | POST `/api/auth/login` | Sign in |
| Logout | POST `/api/auth/logout` | Sign out |
| Logout all | POST `/api/auth/logout-all` | All devices |
| Get current user | GET `/api/auth/me` | Session user |
| Verify email | GET `/api/auth/verify/:token` | Confirm email |
| Forgot password | POST `/api/auth/forgot-password` | Request reset |
| Reset password | POST `/api/auth/reset-password` | Set new password |
| Setup 2FA | POST `/api/auth/2fa/setup` | Enable 2FA |
| Verify 2FA | POST `/api/auth/2fa/verify` | Validate TOTP |
| Disable 2FA | POST `/api/auth/2fa/disable` | Remove 2FA |
| Update profile | PUT `/api/users/profile` | Modify info |
| Upload avatar | POST `/api/users/avatar` | Profile image |
| Delete account | DELETE `/api/users/account` | Remove account |

### 10. SETTINGS & PREFERENCES WORKFLOWS
| Workflow | Endpoint | Description |
|----------|----------|-------------|
| Get preferences | GET `/api/users/preferences` | Current settings |
| Update preferences | PUT `/api/users/preferences` | Modify settings |
| Email preferences | GET `/api/emailPreferences` | Email settings |
| Update email prefs | PUT `/api/emailPreferences` | Modify emails |
| Unsubscribe | POST `/api/emailPreferences/unsubscribe` | Stop emails |
| Notification settings | PUT `/api/users/notifications` | Alert prefs |

### 11. ONBOARDING WORKFLOWS
| Workflow | Endpoint | Description |
|----------|----------|-------------|
| Get tasks | GET `/api/onboarding/tasks` | Onboarding list |
| Complete task | POST `/api/onboarding/tasks/:id/complete` | Mark done |
| Get progress | GET `/api/onboarding/progress` | Current progress |
| Skip onboarding | POST `/api/onboarding/skip` | Skip tutorial |
| First week path | GET `/api/onboarding/first-week` | Success path |

### 12. ACHIEVEMENTS & GAMIFICATION WORKFLOWS
| Workflow | Endpoint | Description |
|----------|----------|-------------|
| Get achievements | GET `/api/achievements` | Earned badges |
| Get progress | GET `/api/achievements/progress` | Unlock status |
| Leaderboard | GET `/api/achievements/leaderboard` | Rankings |
| Claim reward | POST `/api/achievements/:id/claim` | Get reward |

### 13. AUTOPILOT / AUTOMATION WORKFLOWS
| Workflow | Endpoint | Description |
|----------|----------|-------------|
| Enable autopilot | POST `/api/autopilot/enable` | Start automation |
| Disable autopilot | POST `/api/autopilot/disable` | Stop automation |
| Configure autopilot | PUT `/api/autopilot/config` | Set rules |
| View activity | GET `/api/autopilot/activity` | Recent actions |
| Pause autopilot | POST `/api/autopilot/pause` | Temporary stop |
| Resume autopilot | POST `/api/autopilot/resume` | Continue |
| Autopilot learning | GET `/api/autopilot-learning/insights` | AI insights |
| Advertising autopilot | POST `/api/advertisingAutopilot/campaigns` | Auto ads |
| Ad budget | PUT `/api/advertisingAutopilot/budget` | Spending |
| Ad performance | GET `/api/advertisingAutopilot/performance` | ROI |
| Dual autopilot | POST `/api/dualAutopilot/sync` | Sync modes |
| Autonomous social | POST `/api/autonomousSocial/enable` | Auto posting |

### 14. AI / AGENT WORKFLOWS
| Workflow | Endpoint | Description |
|----------|----------|-------------|
| AI recommendations | GET `/api/ai/recommendations` | AI advice |
| AI analysis | POST `/api/ai/analyze` | Analyze content |
| Career coach | GET `/api/careerCoach/recommendations` | Career advice |
| Revenue forecast | GET `/api/careerCoach/forecast` | Earnings projection |
| Goal tracking | GET `/api/careerCoach/goals` | Progress |
| Action items | GET `/api/careerCoach/actions` | Next steps |
| Content analysis | POST `/api/content-analysis/analyze` | AI content review |
| Audio analysis | POST `/api/audioAnalysis/analyze` | Audio insights |

### 15. PROMOTIONAL TOOLS WORKFLOWS
| Workflow | Endpoint | Description |
|----------|----------|-------------|
| Create promo video | POST `/api/promotionalTools/video` | Generate video |
| Create lyric video | POST `/api/promotionalTools/lyric-video` | Lyrics animation |
| Audio visualizer | POST `/api/promotionalTools/visualizer` | Waveform video |
| Social templates | GET `/api/promotionalTools/templates` | Pre-made designs |
| Download video | GET `/api/promotionalTools/download/:id` | Get video |
| Release countdown | POST `/api/releaseCountdown` | Set countdown |
| Update countdown | PUT `/api/releaseCountdown/:id` | Modify |
| Delete countdown | DELETE `/api/releaseCountdown/:id` | Cancel |

### 16. COLLABORATION WORKFLOWS
| Workflow | Endpoint | Description |
|----------|----------|-------------|
| Invite collaborator | POST `/api/collaborations/invite` | Send invite |
| Accept invite | POST `/api/collaborations/accept/:id` | Join project |
| Decline invite | POST `/api/collaborations/decline/:id` | Reject |
| Leave project | POST `/api/collaborations/leave/:id` | Exit |
| Get collaborators | GET `/api/collaborations/members/:id` | List members |
| Real-time sync | WebSocket `/ws/studio` | Live collab |

### 17. DEVELOPER API WORKFLOWS
| Workflow | Endpoint | Description |
|----------|----------|-------------|
| Create API key | POST `/api/developer/keys` | Generate key |
| List API keys | GET `/api/developer/keys` | All keys |
| Revoke API key | DELETE `/api/developer/keys/:id` | Disable key |
| API usage stats | GET `/api/developer/usage` | Call counts |
| Create webhook | POST `/api/developer/webhooks` | Register endpoint |
| List webhooks | GET `/api/developer/webhooks` | All webhooks |
| Test webhook | POST `/api/developer/webhooks/:id/test` | Send test |
| Webhook logs | GET `/api/developer/webhooks/:id/logs` | Delivery history |

### 18. SUPPORT & HELP WORKFLOWS
| Workflow | Endpoint | Description |
|----------|----------|-------------|
| Create ticket | POST `/api/helpDesk/tickets` | Submit issue |
| View tickets | GET `/api/helpDesk/tickets` | All tickets |
| Update ticket | PUT `/api/helpDesk/tickets/:id` | Add info |
| Close ticket | POST `/api/helpDesk/tickets/:id/close` | Resolve |
| AI support | POST `/api/helpDesk/ai` | Get AI help |
| Support chat | POST `/api/support/chat` | Live support |

### 19. ADMIN WORKFLOWS
| Workflow | Endpoint | Description |
|----------|----------|-------------|
| Admin dashboard | GET `/api/admin/dashboard` | Overview |
| List users | GET `/api/admin/users` | All users |
| View user | GET `/api/admin/users/:id` | User details |
| Update user | PUT `/api/admin/users/:id` | Modify account |
| Suspend user | POST `/api/admin/users/:id/suspend` | Disable |
| Delete user | DELETE `/api/admin/users/:id` | Remove |
| Revenue report | GET `/api/admin/revenue` | Financial data |
| System logs | GET `/api/admin/logs` | System logs |
| Security events | GET `/api/admin/security` | Threats |
| Executive dashboard | GET `/api/executive/dashboard` | Exec view |
| Admin metrics | GET `/api/adminMetrics` | Performance |

### 20. SYSTEM / BACKGROUND WORKFLOWS
| Workflow | Endpoint | Description |
|----------|----------|-------------|
| Health check | GET `/api/health` | Quick status |
| System status | GET `/api/system/status` | Detailed status |
| Circuit breakers | GET `/api/health/circuits` | Service health |
| Reset circuit | POST `/api/health/circuits/:name/reset` | Reset breaker |
| Memory monitoring | GET `/api/system/memory` | Memory usage |
| Database metrics | GET `/api/system/database/metrics` | Query stats |
| Prometheus metrics | GET `/api/system/metrics` | Monitoring |
| Audit log | GET `/api/audit/log` | All actions |
| Security threats | GET `/api/security/threats` | Detected threats |
| Block IP | POST `/api/security/block` | Blacklist IP |
| Kill switch | POST `/api/killSwitch/activate` | Emergency stop |
| Self-healing status | GET `/api/selfHealing/status` | Healing status |
| Backup | POST `/api/backup/create` | System backup |
| Restore | POST `/api/backup/restore/:id` | Restore backup |

### 21. DMCA & LEGAL WORKFLOWS
| Workflow | Endpoint | Description |
|----------|----------|-------------|
| Submit DMCA | POST `/api/dmca/submit` | File complaint |
| View DMCA | GET `/api/dmca/complaints` | All complaints |
| Respond to DMCA | POST `/api/dmca/respond/:id` | Counter-notice |

### 22. OFFLINE / PWA WORKFLOWS
| Workflow | Endpoint | Description |
|----------|----------|-------------|
| Sync offline | POST `/api/offline/sync` | Sync changes |
| Get offline data | GET `/api/offline/data` | Cached data |
| Clear offline cache | DELETE `/api/offline/cache` | Clear cache |

---

## USER ACTION CATEGORIES (COMPLETE LIST FOR MAX BOOSTER)

### 1. PROJECT ACTIONS
| Action | Type | Description |
|--------|------|-------------|
| New project | Create | Create studio project |
| Open project | Read | Load existing project |
| Save project | Update | Save current state |
| Save As | Create | Save copy |
| Duplicate project | Create | Clone project |
| Delete project | Delete | Remove project |
| Export project | Export | Download bundle |
| Import project | Import | Upload bundle |
| Rename project | Update | Change name |
| Archive project | Update | Move to archive |

### 2. EDITING ACTIONS (STUDIO)
| Action | Type | Description |
|--------|------|-------------|
| Add track | Create | New audio/MIDI track |
| Remove track | Delete | Delete track |
| Mute track | Toggle | Mute/unmute |
| Solo track | Toggle | Solo/unsolo |
| Adjust volume | Update | Volume slider |
| Adjust pan | Update | Pan knob |
| Add clip | Create | Add audio clip |
| Move clip | Update | Drag clip |
| Resize clip | Update | Trim clip |
| Split clip | Edit | Cut clip |
| Merge clips | Edit | Join clips |
| Delete clip | Delete | Remove clip |
| Add effect | Create | Insert plugin |
| Remove effect | Delete | Remove plugin |
| Configure effect | Update | Plugin settings |
| Add marker | Create | Timeline marker |
| Move marker | Update | Reposition marker |
| Delete marker | Delete | Remove marker |
| Add take | Create | Recording take |
| Select take | Update | Choose take |
| AI mix | Action | Auto mix |
| AI master | Action | Auto master |
| Generate music | Action | AI generation |
| Separate stems | Action | Extract stems |
| Time stretch | Action | Warp audio |

### 3. DISTRIBUTION ACTIONS
| Action | Type | Description |
|--------|------|-------------|
| Create release | Create | New release |
| Upload artwork | Upload | Cover image |
| Add track to release | Update | Include track |
| Remove track from release | Update | Exclude track |
| Set release date | Update | Schedule release |
| Select platforms | Update | Choose DSPs |
| Submit release | Action | Send to DSPs |
| Check delivery status | Read | View status |
| Generate ISRC | Action | Get codes |
| Generate UPC | Action | Get codes |
| Set royalty splits | Update | Revenue sharing |
| Register Content ID | Action | Protect content |
| Request takedown | Action | DMCA request |

### 4. SOCIAL MEDIA ACTIONS
| Action | Type | Description |
|--------|------|-------------|
| Connect platform | Auth | OAuth connect |
| Disconnect platform | Auth | Remove connection |
| Create post | Create | New scheduled post |
| Edit post | Update | Modify post |
| Delete post | Delete | Cancel post |
| Schedule post | Update | Set time |
| Publish now | Action | Immediate post |
| Bulk schedule | Create | Multiple posts |
| Generate caption | AI | AI captions |
| Generate hashtags | AI | AI hashtags |
| Approve post | Workflow | Approve content |
| Reject post | Workflow | Reject content |
| View analytics | Read | Engagement data |
| A/B test | Action | Test variants |

### 5. MARKETPLACE ACTIONS
| Action | Type | Description |
|--------|------|-------------|
| List beat | Create | New listing |
| Edit listing | Update | Modify listing |
| Delete listing | Delete | Remove listing |
| Set price | Update | Pricing |
| Preview beat | Read | Listen preview |
| Search beats | Read | Find beats |
| Filter beats | Read | Narrow results |
| Add to cart | Action | Shopping cart |
| Checkout | Action | Purchase |
| Download purchase | Download | Get files |
| Leave review | Create | Rate seller |
| Favorite beat | Toggle | Save beat |
| Contact seller | Action | Send message |

### 6. BILLING & PAYMENT ACTIONS
| Action | Type | Description |
|--------|------|-------------|
| View plans | Read | See options |
| Subscribe | Action | Start subscription |
| Upgrade plan | Update | Change tier |
| Downgrade plan | Update | Reduce tier |
| Cancel subscription | Action | End subscription |
| Update payment method | Update | Change card |
| View invoices | Read | Payment history |
| Download invoice | Download | PDF invoice |
| Request payout | Action | Withdraw funds |
| Instant payout | Action | Same-day transfer |
| Set split percentages | Update | Revenue shares |
| Complete KYC | Action | Identity verify |

### 7. SETTINGS ACTIONS
| Action | Type | Description |
|--------|------|-------------|
| Update profile | Update | Personal info |
| Upload avatar | Upload | Profile picture |
| Change password | Update | New password |
| Enable 2FA | Action | Security setup |
| Disable 2FA | Action | Remove 2FA |
| Email preferences | Update | Notification settings |
| Notification settings | Update | Alert preferences |
| Theme settings | Update | Dark/light mode |
| Audio settings | Update | DAW preferences |
| Language settings | Update | Localization |
| Delete account | Delete | Remove account |

### 8. NAVIGATION ACTIONS
| Action | Type | Description |
|--------|------|-------------|
| Go to Dashboard | Navigate | Main dashboard |
| Go to Studio | Navigate | DAW interface |
| Go to Distribution | Navigate | Releases |
| Go to Social | Navigate | Social media |
| Go to Marketplace | Navigate | Beat store |
| Go to Analytics | Navigate | Stats |
| Go to Settings | Navigate | Preferences |
| Go to Admin | Navigate | Admin panel |
| Open modal | UI | Show dialog |
| Close modal | UI | Hide dialog |
| Switch tab | UI | Tab navigation |
| Expand panel | UI | Show panel |
| Collapse panel | UI | Hide panel |
| Search | UI | Global search |

### 9. AUTOPILOT ACTIONS
| Action | Type | Description |
|--------|------|-------------|
| Enable autopilot | Toggle | Start automation |
| Disable autopilot | Toggle | Stop automation |
| Pause autopilot | Toggle | Temporary stop |
| Resume autopilot | Toggle | Continue |
| Configure rules | Update | Automation settings |
| View activity log | Read | Recent actions |
| Set budget | Update | Ad spending |
| Create campaign | Create | Auto campaign |
| Review suggestions | Read | AI recommendations |
| Accept suggestion | Action | Apply recommendation |
| Reject suggestion | Action | Dismiss recommendation |

### 10. COLLABORATION ACTIONS
| Action | Type | Description |
|--------|------|-------------|
| Invite collaborator | Action | Send invite |
| Accept invite | Action | Join project |
| Decline invite | Action | Reject invite |
| Remove collaborator | Action | Remove member |
| Leave project | Action | Exit collab |
| Set permissions | Update | Access rights |
| Chat message | Create | Send message |
| View history | Read | Collaboration log |

### 11. SUPPORT ACTIONS
| Action | Type | Description |
|--------|------|-------------|
| Create ticket | Create | New support ticket |
| Reply to ticket | Update | Add message |
| Close ticket | Action | Resolve issue |
| Rate support | Create | Feedback |
| Search help | Read | Find articles |
| Contact support | Action | Live chat |
| Report bug | Create | Bug report |
| Request feature | Create | Feature request |

### 12. ADMIN ACTIONS
| Action | Type | Description |
|--------|------|-------------|
| View users | Read | User list |
| Search users | Read | Find user |
| Edit user | Update | Modify account |
| Suspend user | Action | Disable access |
| Unsuspend user | Action | Restore access |
| Delete user | Delete | Remove account |
| View logs | Read | System logs |
| View security events | Read | Threats |
| Block IP | Action | Blacklist |
| Unblock IP | Action | Remove from blacklist |
| Activate kill switch | Action | Emergency stop |
| View revenue | Read | Financial data |
| Export report | Export | Download data |
| Reset circuit breaker | Action | Service recovery |

---

## PAGES (40 TOTAL)

| # | Page | Path | Purpose |
|---|------|------|---------|
| 1 | Landing | `/` | Marketing homepage |
| 2 | Login | `/login` | User sign in |
| 3 | Register | `/register` | Account creation |
| 4 | Register Payment | `/register/payment` | Subscription setup |
| 5 | Register Success | `/register/success` | Confirmation |
| 6 | Forgot Password | `/forgot-password` | Password reset |
| 7 | Dashboard | `/dashboard` | User home |
| 8 | Simplified Dashboard | `/dashboard/simple` | Basic view |
| 9 | Studio | `/studio` | DAW interface |
| 10 | Projects | `/projects` | Project browser |
| 11 | Distribution | `/distribution` | Release management |
| 12 | Social Media | `/social` | Social management |
| 13 | Marketplace | `/marketplace` | Beat store |
| 14 | Storefront | `/storefront` | Producer shop |
| 15 | Analytics | `/analytics` | Statistics |
| 16 | Royalties | `/royalties` | Earnings |
| 17 | Settings | `/settings` | Preferences |
| 18 | Onboarding | `/onboarding` | New user tutorial |
| 19 | Subscribe | `/subscribe` | Pricing page |
| 20 | Pricing | `/pricing` | Plan comparison |
| 21 | Admin | `/admin` | Admin panel |
| 22 | Admin Dashboard | `/admin/dashboard` | Admin overview |
| 23 | Admin Autonomy | `/admin/autonomy` | Automation admin |
| 24 | Advertisement | `/advertising` | Ad management |
| 25 | Developer API | `/developer` | API docs |
| 26 | API | `/api-docs` | Swagger UI |
| 27 | Help | `/help` | Help center |
| 28 | Documentation | `/docs` | User guides |
| 29 | Features | `/features` | Feature list |
| 30 | About | `/about` | Company info |
| 31 | Blog | `/blog` | Articles |
| 32 | Privacy | `/privacy` | Privacy policy |
| 33 | Terms | `/terms` | Terms of service |
| 34 | DMCA | `/dmca` | Copyright info |
| 35 | Security Page | `/security` | Security info |
| 36 | Desktop App | `/desktop` | Desktop download |
| 37 | Producer Profile | `/producer/:id` | Public profile |
| 38 | Show Page | `/show/:id` | Public content |
| 39 | Solo Founder Story | `/story` | About founder |
| 40 | Not Found | `/404` | Error page |

---

## ENDPOINT SUMMARY BY DOMAIN

| Domain | Route Files | Endpoints |
|--------|-------------|-----------|
| Authentication | 1 | 15 |
| Onboarding | 2 | 14 |
| AI Studio/DAW | 10 | 170+ |
| Distribution | 3 | 100+ |
| Social Media | 8 | 150+ |
| Marketplace | 3 | 85+ |
| Analytics | 5 | 85+ |
| Billing/Payments | 4 | 50+ |
| Storefront | 1 | 20+ |
| Promotional Tools | 2 | 35+ |
| Autopilot | 6 | 95+ |
| AI/Career Coach | 2 | 25+ |
| Collaboration | 1 | 15+ |
| Developer API | 2 | 20+ |
| Support | 2 | 20+ |
| Admin | 4 | 40+ |
| System/Health | 5 | 60+ |
| Security | 2 | 25+ |
| DMCA | 1 | 10+ |
| Offline | 1 | 10+ |
| Webhooks | 3 | 25+ |
| **TOTAL** | **75** | **~1,181** |

---

*This document represents the complete workflow and action mapping for Max Booster.*
