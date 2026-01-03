# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is a comprehensive music career management platform powered by AI. It provides tools for music production, distribution, social media management, marketplace, and analytics.

## Tech Stack
- **Frontend**: React 18 with TypeScript, Vite, TailwindCSS, shadcn/ui components
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Build System**: Vite for frontend, tsx for server

## Project Structure
```
├── client/               # React frontend application
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── contexts/     # React contexts
│   │   ├── hooks/        # Custom React hooks
│   │   ├── lib/          # Utility libraries
│   │   ├── pages/        # Page components
│   │   └── i18n/         # Internationalization
├── server/               # Express backend
│   ├── routes/           # API route handlers
│   ├── services/         # Business logic services
│   ├── middleware/       # Express middleware
│   ├── monitoring/       # System monitoring
│   └── safety/           # Security features
├── shared/               # Shared code between client/server
│   └── schema.ts         # Drizzle database schema
├── migrations/           # Database migrations
└── public/               # Static assets
```

## Development
- **Start dev server**: `npm run dev` (runs on port 5000)
- **Database push**: `npm run db:push`
- **Build**: `npm run build`
- **Production**: `npm run start`

## Configuration
The application requires several environment variables for full functionality:

### Required for Core Features
- `DATABASE_URL` - PostgreSQL connection string (auto-configured)
- `SESSION_SECRET` - Session encryption secret (auto-configured)

### Optional External Services
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` - Payment processing
- `SENDGRID_API_KEY` - Email delivery
- `REDIS_URL` - Redis for session storage and queues
- Social media API keys (Twitter, Facebook, Instagram, TikTok, YouTube, LinkedIn)

## Features
- Professional AI Studio for music production
- Beat Marketplace for selling beats
- Music Distribution to streaming platforms
- Social Media Management with AI assistance
- Analytics Dashboard
- Organic Marketing Tools

## Notes
- The server binds to 0.0.0.0:5000 for both frontend and API
- Vite is configured with `allowedHosts: true` for Replit proxy compatibility
- In production, the frontend is served from `dist/public`
