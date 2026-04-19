import { vi } from 'vitest';

// Provide minimal env vars so server modules can load without real secrets
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-min32chars-xxxx';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';
process.env.PORT = process.env.PORT || '5000';

// Global fetch is available in Node 18+, no polyfill needed
