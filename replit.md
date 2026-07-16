# Max Booster

AI-Powered Music Career Management Platform (v3.0.0) by B-Lawz Music.

## Stack

- **Frontend:** React 19, Vite, Tailwind CSS 4, Radix UI, Framer Motion, TanStack Query, Zustand
- **Backend:** Node.js (Express 5), TypeScript (tsx), Drizzle ORM (PostgreSQL/Neon)
- **Jobs:** BullMQ + Redis
- **AI:** OpenAI, Anthropic, custom MaxCore AI service

## How to Run

The main workflow is **"Start application"** — it runs the Express + Vite dev server on port 5000.

```
npm run dev
```

This skips the optional Rust boosterstate sidecar if not compiled, then starts `server/index.ts` via `tsx`.

## Required Environment Variables

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Auto-provided by Replit's built-in PostgreSQL |
| `SESSION_SECRET` | Set as a Replit Secret (min 32 chars) |

## Optional Environment Variables

See `.env.example` for the full list of 300+ optional variables (Stripe, SendGrid, OpenAI, social OAuth, etc.). Features degrade gracefully when these are absent.

## Database

Uses Replit's built-in PostgreSQL (`DATABASE_URL`). Schema is managed by Drizzle ORM.

To push schema changes: `npm run db:push`

## Key Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run db:push` | Sync Drizzle schema to database |
| `npm run bootstrap:admin` | Create the initial admin user |

## User Preferences

- Use pnpm for package installation (npm install can OOM on this large project)
- Run heavy installs via a Replit workflow, not ShellExec (detached bash gets reaped)
