# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is an enterprise-level AI-powered music career management platform designed to revolutionize music career management. It integrates browser-based DAW capabilities, music distribution, a marketplace, social media management, and comprehensive analytics. The platform aims to empower artists and music professionals with AI-driven tools for growth and efficiency, all under the B-Lawz Music brand.

## User Preferences
- B-Lawz Music branding with custom anime character logo
- Modern dark/light theme support
- Professional enterprise UI design
- All dialog menus must have solid, non-transparent backgrounds

## System Architecture
Max Booster employs a hybrid rule-based and ML autopilot architecture for its social media and advertising functionalities, combining deterministic rules with machine learning for optimal performance and adherence to platform guidelines. The platform features 9 operational autonomous systems for 24/7 operations, content generation, updates, and more. A self-healing security system detects and responds to threats 10 times faster than typical attack vectors. The Advertisement Autopilot leverages connected social media profiles as a "Personal Ad Network" to achieve the results of paid advertising organically, saving artists significant ad spend.

**Key Features:**
-   **Authentication:** Session-based with bcrypt.
-   **Distribution:** DDEX packaging, ISRC/UPC generation, catalog imports.
-   **Storefront:** Marketplace listings, membership tiers, payment processing.
-   **Analytics:** AI-powered predictions, streaming/revenue tracking.
-   **Social Media:** Approval workflows, bulk scheduling, organic growth.
-   **Studio:** Browser-based DAW with comping, markers, plugins, stems, warping.
-   **Workspace:** Team collaboration, RBAC, SSO integration.
-   **Simulation Environment:** Comprehensive testing across various time periods, user archetypes, and realistic event generators.

**Technology Stack:**
-   **Frontend:** React, Vite, TailwindCSS, shadcn/ui.
-   **Backend:** Express.js with TypeScript.
-   **Database:** PostgreSQL with Drizzle ORM.

**Project Structure:**
-   `client/`: Frontend React application.
-   `server/`: Backend Express server with routes, services, and middleware.
-   `shared/`: Shared code including Drizzle database schema.
-   `uploads/`: User file uploads.

## External Dependencies
-   **Payments:** Stripe
-   **Email:** SendGrid
-   **Storage:** Replit Object Storage, AWS S3
-   **Queue Management:** BullMQ (for Auto-Posting Service V2)
-   **Image Processing:** Sharp
-   **Social Media Integrations:** Twitter, Facebook, Instagram APIs (for various social media features)
-   **Monitoring:** Redis (for session persistence and job queues)