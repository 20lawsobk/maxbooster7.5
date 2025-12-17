/**
 * Swagger/OpenAPI Documentation Configuration
 * 
 * Provides interactive API documentation at /api-docs
 */

import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';
import { logger } from './logger.js';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Max Booster API',
      version: '1.0.0',
      description: `
# Max Booster API Documentation

AI-Powered Music Career Management Platform

## Features
- 🎵 Studio One-inspired DAW
- 📊 Analytics & Insights
- 🎤 Music Distribution
- 🛍️ Marketplace (BeatStars clone)
- 📱 Social Media Management (8 platforms)
- 🎯 AI-Powered Advertising
- 💰 Payments & Royalties

## Authentication
Most endpoints require authentication via session cookies.
Login at \`POST /api/auth/login\` to obtain a session.

## Rate Limiting
- 100 requests per minute for authenticated users
- 20 requests per minute for unauthenticated users

## Error Responses
All errors follow this format:
\`\`\`json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {},
    "requestId": "uuid",
    "timestamp": "ISO 8601"
  }
}
\`\`\`
      `,
      contact: {
        name: 'Max Booster Support',
        email: 'support@maxbooster.com',
      },
      license: {
        name: 'Proprietary',
      },
    },
    servers: [
      {
        url: process.env.DOMAIN || 'http://localhost:5000',
        description: 'Max Booster API Server',
      },
    ],
    components: {
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'connect.sid',
          description: 'Session cookie obtained from login',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'User UUID' },
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            subscriptionTier: {
              type: 'string',
              enum: ['free', 'starter', 'pro', 'elite'],
            },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: { type: 'object' },
                requestId: { type: 'string' },
                timestamp: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
        Track: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            duration: { type: 'number', description: 'Duration in seconds' },
            bpm: { type: 'number' },
            key: { type: 'string' },
            genre: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Authentication required',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        ValidationError: {
          description: 'Validation failed',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
      },
    },
    tags: [
      { name: 'Authentication', description: 'User authentication and sessions' },
      { name: 'Studio', description: 'DAW and audio processing' },
      { name: 'Distribution', description: 'Music distribution and releases' },
      { name: 'Marketplace', description: 'Buy and sell beats, stems, and tracks' },
      { name: 'Social Media', description: 'Multi-platform social management' },
      { name: 'Analytics', description: 'Insights and metrics' },
      { name: 'Payments', description: 'Stripe payments and royalties' },
      { name: 'Admin', description: 'Admin panel operations' },
    ],
  },
  apis: ['./server/routes.ts', './server/routes/*.ts'], // Path to route files
};

const swaggerSpec = swaggerJsdoc(options);

/**
 * Setup Swagger documentation for Express app
 */
export function setupSwagger(app: Express): void {
  // Serve Swagger UI
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Max Booster API Docs',
      customfavIcon: '/favicon.ico',
    })
  );

  // Serve raw OpenAPI spec
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  logger.info('📚 Swagger documentation available at /api-docs');
}

/**
 * Example JSDoc annotations for routes:
 * 
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Authenticate user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: SecurePass123!
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 message:
 *                   type: string
 *                   example: Login successful
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
