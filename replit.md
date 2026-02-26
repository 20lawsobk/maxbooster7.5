# Max Booster

AI-Powered Music Career Management Platform by B-Lawz Music. This platform aims to empower musicians and artists by providing tools for career management, distribution, promotion, and analytics, leveraging AI for creative generation and insights. The project envisions becoming a leading platform in the music industry, offering comprehensive support for artists at various stages of their careers.

## User Preferences

I prefer iterative development with clear communication at each stage. Please ask before making any major architectural changes or introducing new external dependencies. I also prefer detailed explanations for complex technical decisions. Do not make changes to files in the `electron/` directory, `capacitor/` directory, or any files related to the desktop or mobile build processes. I prefer a coding style that prioritizes readability and maintainability, using TypeScript consistently.

## System Architecture

The Max Booster platform is built with a decoupled frontend and backend.

**Frontend:**
-   Developed using React, TypeScript, and Vite.
-   Utilizes Zustand for state management and Tailwind CSS v4 for styling.
-   The client application (`client/src/App.tsx`) is bundled into `dist/public/` for production.
-   UI/UX decisions focus on a clean, modern interface with a consistent color scheme.
-   Features include:
    -   Comprehensive notification system with various categories (e.g., account security, distribution, social media, royalties, achievements) and wired triggers for events like achievement unlocks, streak milestones, new logins, password changes, and payment failures.
    -   Admin-only notification category (`platform_admin`) for critical system alerts.
    -   In-app NPS survey and a cancellation exit survey to improve user retention.
    -   AI Creative Generators (`AIImageGenerator`) for image generation, integrated into advertising and social media tools.
    -   Audio sync using `requestAnimationFrame` for digital audio workstation (DAW) features.
    -   Robust settings with keyboard shortcut customization.

**Backend:**
-   Implemented with Express.js (Node.js/TypeScript), bundled to `dist/index.cjs` using esbuild.
-   A clustering mechanism (`server/cluster.ts`) is used in production for high availability and performance, forking workers and auto-restarting dead ones.
-   **Database:** PostgreSQL, accessed via Drizzle ORM and a Neon serverless driver. Schema definitions are in `shared/schema.ts`. Critical database indexes are implemented on new retention tables and hot query columns to optimize performance. Read replica routing is supported for SELECT queries when `DATABASE_REPLICA_URLS` is configured.
-   **Storage:** A three-layer hybrid storage system is employed:
    -   **Hot Tier:** Replit Object Storage (`@replit/object-storage`).
    -   **Cold Tier:** Pocket Dimension (custom compressed, chunked, content-addressed local storage).
    -   **Metadata Plane:** Pocket Dimension Fabric (distributed, DB-backed metadata plane with node/volume/pocket/object/chunk registries, placement strategy, and rebalancer).
    -   Files inactive for 30+ days are automatically tiered to cold storage.
    -   The `@replit/object-storage` Client uses `uploadFromBytes` and `downloadAsBytes` for all operations.
-   **State Engine:** BoosterState, a custom Rust-based KV store with Write-Ahead Log (WAL), CRC32 checksums, and fsync, running on port 9877. It is used for job queues and session backing.
-   **Caching:** `DistributedCache` backed by Redis, essential for production. Includes cache stampede protection using distributed locks.
-   **Rate Limiting:** `DistributedRateLimiter` using atomic Redis Lua sliding window.
-   **WebSocket Broadcasting:** Utilizes Redis Pub/Sub for cross-instance message delivery.
-   **TF Inference:** `TensorFlowWorkerPool` uses isolated `.cjs` workers for TensorFlow inference.
-   **Sessions:** `connect-redis` for Redis-backed session management.
-   **Job Queues:** BullMQ, a Redis-backed job queue with retries, exponential backoff, and a Dead Letter Queue (DLQ). Used for various background tasks and retention services. Concurrency is capped, and job persistence is configured. Distributed cron locks prevent multiple instances from running the same job.
-   **Autonomous Service:** In-memory maps for processing and learning data, with metrics persisted to Redis. Background loops are managed by BullMQ repeatable jobs.
-   **Security:** Mandatory safety middleware includes origin validation (replacing CSRF tokens), rate limiting, and Helmet. Webhook secrets require `WEBHOOK_SECRET` in production for signature verification.
-   **Retention & Long-term SaaS Success Systems:**
    -   Multi-step dunning for payment recovery.
    -   Customer health score computation.
    -   Re-engagement cron jobs for inactive users.
    -   Retention API for NPS, cancellation feedback, and feature events.
    -   Feature event write buffer that pushes to Redis lists and bulk-inserts to the DB.
-   **Scalability Hardening:**
    -   Admission control middleware to manage concurrent requests using Redis.
    -   Redis eviction policy set to `allkeys-lru`.
    -   DB table partitioning script for large tables.
    -   Kubernetes HPA metrics exposed for autoscaling.
    -   Prometheus metrics for TensorFlow worker queue depth.
    -   YJS cross-node pub/sub for collaborative editing.

## External Dependencies

-   **Database:** PostgreSQL (via Neon serverless driver)
-   **ORM:** Drizzle ORM
-   **Object Storage:** Replit Object Storage (`@replit/object-storage`)
-   **Email:** SendGrid
-   **Payments:** Stripe
-   **Monitoring:** Sentry (errors + distributed tracing), Prometheus (Grafana-compatible metrics)
-   **Caching/Messaging/Sessions/Job Queues:** Redis (via `connect-redis`, `ioredis`, BullMQ)
-   **AI/ML:** TensorFlow
-   **OAuth Providers:** Facebook, Google, Instagram, LinkedIn, TikTok, Twitter, YouTube, Threads, Spotify
-   **Push Notifications:** VAPID (for Web Push)
-   **Build Tools:** Vite, esbuild
-   **Deployment:** GitHub Actions (for Desktop and Mobile builds - Electron, Capacitor)