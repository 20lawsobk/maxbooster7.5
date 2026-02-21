# Max Booster - AI-Powered Music Career Management Platform

## Overview
Max Booster is a full-stack AI-powered music career management platform designed to empower musical artists. It provides a comprehensive suite of tools including professional AI studio functionalities, social media management, a beat marketplace, advanced analytics, and music distribution services. The platform aims to streamline and enhance various aspects of an artist's career, leveraging AI to offer cutting-edge creative and promotional support.

## User Preferences
I prefer detailed explanations.
Do not make changes to the folder `ai_model/gpu`.
Do not make changes to the file `ai_model/video/cinematic_engine.py`.
Do not make changes to the file `ai_model/gpu/digital_gpu.py`.
Do not make changes to the file `ai_model/gpu/torch_backend.py`.
Do not make changes to the file `ai_model/gpu/accelerated_transformer.py`.
Do not make changes to the file `ai_model/gpu/gpu_trainer.py`.

## System Architecture
The application employs a microservices architecture. The user interface is built with React, Vite, and TailwindCSS, located in the `client/` directory. The backend is an Express.js application written in TypeScript, residing in the `server/` directory. A dedicated AI Model, implemented in PyTorch, handles content generation and runs as a separate service. State management is offloaded to a Rust-based microservice named "BoosterState". Data persistence is managed using PostgreSQL with Drizzle ORM. The platform also supports desktop and mobile applications via Electron and Capacitor.

**Key Features and Implementations:**
-   **AI Model**: A custom PyTorch transformer model generates social media content for 8 different platforms. It includes agents for script generation (hook, body, CTA), distribution strategies (captions, hashtags, timing), visual specifications (thumbnails), and optimization. The model leverages a custom Digital GPU for accelerated training and inference, featuring a 32-lane SIMD core and PyTorch autograd backend integration.
-   **Multi-Stream Digital GPU**: Upgraded GPU engine supporting simultaneous training of all AI agent models. Features GPU Streams with isolated VRAM partitions per model, a LaneAllocator that dynamically distributes SIMD lanes across concurrent workloads, and a shared-backbone + agent-specific-heads architecture (MultiHeadModel) that reduces memory usage by sharing transformer weights across all 4 agents (script, distribution, visual_spec, optimization). Training is orchestrated via interleaved multi-task learning with per-agent loss tracking and profiling. New files: `ai_model/gpu/multi_stream.py`, `ai_model/gpu/multi_backend.py`, `ai_model/model/multi_head_model.py`, `ai_model/training/multi_trainer.py`. API endpoints: `POST /train/multi`, `GET /train/multi/status`, `GET /gpu/multi/status`.
-   **Video Generation**: A dual-quality video rendering system (Quick and Cinematic modes) allows for creating promotional videos. The Cinematic mode offers multi-scene composition, various templates, aspect ratios, and advanced effects (animated gradients, color grades, transitions). The system can auto-generate video content from AI model outputs.
-   **Content Quality Pipeline**: Utilizes the AI model for headline, body, and CTA generation, with graceful fallback to template-based content if AI output is insufficient.
-   **Security**: Comprehensive security measures include XSS prevention, IDOR protection, data leak prevention, input validation, admin-only access for infrastructure, log injection prevention, secure session management (httpOnly, sameSite, secure cookies), rate limiting on authentication endpoints, and circuit breakers for external streaming services.
-   **Development Environment**: The Express server serves both API routes and the Vite development frontend. Database schema is managed via Drizzle Kit. `esbuild` is pinned to version 0.25.12 for Drizzle Kit compatibility.

## External Dependencies
-   **Stripe**: For payment processing.
-   **SendGrid**: For email communications.
-   **Social Media APIs**: Integrations with platforms such as Twitter/X, Facebook, Instagram, and TikTok for social media management features.
-   **Sentry**: For error tracking and monitoring.
-   **LabelGrid**: For music distribution services.