# Render.com Deployment Guide

## ✅ Build Status
The build is now working! The app successfully compiles and bundles.

## 🔧 Required Environment Variables

You need to configure these environment variables in your Render.com dashboard:

### Critical (Required for App to Start)

1. **DATABASE_URL** (Required)
   - PostgreSQL connection string
   - Format: `postgresql://user:password@host:port/database`
   - You can create a PostgreSQL database in Render.com or use an external service like Neon, Supabase, etc.

2. **SESSION_SECRET** (Required in Production)
   - A secure random string for session encryption
   - Generate with: `openssl rand -base64 32`
   - Must be at least 32 characters long

### Payment Processing (Required for Payments)

3. **STRIPE_SECRET_KEY**
   - Your Stripe secret API key
   - Production: Must start with `sk_live_`
   - Test: Can use `sk_test_` for development

4. **STRIPE_PUBLISHABLE_KEY**
   - Your Stripe publishable API key
   - Production: Must start with `pk_live_`
   - Test: Can use `pk_test_` for development

5. **STRIPE_WEBHOOK_SECRET**
   - Stripe webhook signing secret
   - Must start with `whsec_`
   - Get this from your Stripe Dashboard → Webhooks

### Email Service (Required for User Communication)

6. **SENDGRID_API_KEY**
   - SendGrid API key for transactional emails
   - Must start with `SG.`
   - Get from SendGrid Dashboard → Settings → API Keys

7. **SENDGRID_FROM_EMAIL** (Optional)
   - Default sender email address
   - Must be a verified sender in SendGrid

### Optional but Recommended

8. **REDIS_URL** (Optional but Recommended for Production)
   - Redis connection URL for sessions and caching
   - Format: `redis://user:password@host:port` or `rediss://` for SSL
   - If not set, uses in-memory session store (sessions won't persist across restarts)

9. **SENTRY_DSN** (Optional)
   - Sentry DSN for error tracking
   - Format: `https://xxx@sentry.io/xxx`

10. **PORT** (Optional)
    - Server port (defaults to 5000)
    - Render.com usually sets this automatically

## 📝 How to Set Environment Variables in Render.com

1. Go to your Render.com dashboard
2. Select your web service
3. Click on "Environment" in the left sidebar
4. Click "Add Environment Variable"
5. Add each variable with its value
6. Click "Save Changes"
7. Render will automatically redeploy

## 🗄️ Database Setup

### Option 1: Render.com PostgreSQL (Recommended)
1. In Render.com dashboard, create a new PostgreSQL database
2. Copy the "Internal Database URL" or "External Database URL"
3. Set it as `DATABASE_URL` in your web service environment variables

### Option 2: External Database (Neon, Supabase, etc.)
1. Create a database in your preferred provider
2. Copy the connection string
3. Set it as `DATABASE_URL` in your web service environment variables

## 🔐 Generating SESSION_SECRET

Run this command to generate a secure session secret:

```bash
openssl rand -base64 32
```

Or use an online generator, then set it as `SESSION_SECRET` in Render.com.

## ✅ Verification

After setting all environment variables, your app should start successfully. Check the logs in Render.com to verify:

- ✅ Database connection successful
- ✅ Server started on port 5000 (or your configured PORT)
- ✅ No configuration errors

## 🐛 Troubleshooting

### "DATABASE_URL must be set"
- Make sure you've added `DATABASE_URL` in Render.com environment variables
- Verify the connection string is correct
- Check that the database is accessible from Render.com

### "SESSION_SECRET must be set in production"
- Add `SESSION_SECRET` environment variable
- Ensure it's at least 32 characters long
- Use a cryptographically secure random string

### Build succeeds but app crashes
- Check the Render.com logs for specific error messages
- Verify all required environment variables are set
- Ensure database is accessible and credentials are correct

## 📚 Additional Resources

- [Render.com Environment Variables Docs](https://render.com/docs/environment-variables)
- [Render.com PostgreSQL Docs](https://render.com/docs/databases)

