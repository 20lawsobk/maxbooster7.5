# Modular Routes Structure

This directory contains modularized route files extracted from the monolithic `routes.ts`.

## Structure

```
server/routes/
├── auth.ts          - Authentication & user management
├── studio.ts        - DAW, audio processing, plugins
├── distribution.ts  - Music distribution, releases
├── marketplace.ts   - BeatStars marketplace, transactions
├── social.ts        - Social media, OAuth, posting
├── analytics.ts     - Analytics, insights, metrics
└── admin.ts         - Admin panel, settings
```

## Migration Status

⏳ **In Progress** - Refactoring from monolithic routes.ts

## Usage Pattern

Each route module exports an Express router:

```typescript
import express from 'express';
const router = express.Router();

// Define routes
router.get('/endpoint', handler);

export default router;
```

Main server imports and mounts:

```typescript
import authRoutes from './routes/auth.js';
app.use('/api/auth', authRoutes);
```
