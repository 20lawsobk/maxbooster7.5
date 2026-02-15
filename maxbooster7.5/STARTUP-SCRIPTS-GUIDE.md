# 🚀 MAX BOOSTER 10.0 - STARTUP SCRIPTS GUIDE

This directory contains comprehensive startup scripts for running Max Booster across different platforms and environments.

---

## 📦 **Available Scripts**

### **Production Scripts**

| Script | Platform | Command | Description |
|--------|----------|---------|-------------|
| `start.sh` | Linux/Mac | `npm start` | Production server (Unix) |
| `start.bat` | Windows | `npm run start:windows` | Production server (Windows) |
| `start-replit.sh` | Replit | `npm run start:replit` | Production server (Replit) |

### **Development Scripts**

| Script | Platform | Command | Description |
|--------|----------|---------|-------------|
| `dev.sh` | Linux/Mac | `npm run dev` | Dev server with hot reload (Unix) |
| `dev.bat` | Windows | `npm run dev:windows` | Dev server with hot reload (Windows) |
| `dev-replit.sh` | Replit | `npm run dev:replit` | Dev server (Replit) |

---

## 🎯 **Quick Start**

### **Local Development (Unix/Linux/Mac)**
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### **Local Development (Windows)**
```powershell
# Install dependencies
npm install

# Start development server
npm run dev:windows
```

### **Production (Unix/Linux/Mac)**
```bash
# Build the project
npm run build

# Start production server
npm start
```

### **Production (Windows)**
```powershell
# Build the project
npm run build

# Start production server
npm run start:windows
```

### **Replit Deployment**
```bash
# One-command deployment
npm run deploy:replit

# Or step-by-step:
npm run build
npm run start:replit
```

---

## 🔧 **What Each Script Does**

### **Production Scripts** (`start.sh`, `start.bat`, `start-replit.sh`)

1. **Environment Setup**
   - Sets `NODE_ENV=production`
   - Configures `PORT` (default: 5000)

2. **Pre-flight Checks**
   - Verifies `dist/` folder exists
   - Checks `dist/index.cjs` bundle
   - Validates `node_modules` installed
   - Warns if `DATABASE_URL` not set

3. **Boosterstate Service** (Optional)
   - Starts Rust boosterstate service if binary exists
   - Handles graceful startup/shutdown
   - Waits for initialization (2-3 seconds)
   - Continues if not found (optional component)

4. **Max Booster Server**
   - Starts Node.js production server
   - Serves on configured PORT
   - Loads 413 plugins
   - Activates Pocket Dimension (903:1 compression)
   - Enables autonomous autopilot

5. **Cleanup Handler**
   - Registers SIGTERM/SIGINT handlers
   - Gracefully stops boosterstate on exit
   - Ensures clean shutdown

### **Development Scripts** (`dev.sh`, `dev.bat`, `dev-replit.sh`)

1. **Environment Setup**
   - Sets `NODE_ENV=development`
   - Configures `PORT` (default: 5000)
   - Enables hot reload

2. **Pre-flight Checks**
   - Checks `node_modules` installed
   - Verifies `server/index.ts` exists
   - Warns if `DATABASE_URL` not set

3. **Boosterstate Service** (Optional)
   - Starts if binary exists
   - Shorter wait time (1 second)
   - Non-blocking if not found

4. **Development Server**
   - Runs with `tsx` for TypeScript hot reload
   - Auto-reloads on file changes
   - Faster startup (no build step)
   - Full error stack traces

5. **Cleanup Handler**
   - Same as production
   - Ensures clean shutdown on Ctrl+C

---

## 🌐 **Platform-Specific Features**

### **Unix/Linux/Mac** (`start.sh`, `dev.sh`)
- ✅ Color-coded output (Green/Blue/Yellow/Red)
- ✅ Detailed status messages
- ✅ Proper signal handling (SIGTERM, SIGINT)
- ✅ Process ID tracking
- ✅ Graceful shutdown
- ✅ Visual startup banner

### **Windows** (`start.bat`, `dev.bat`)
- ✅ CMD-compatible syntax
- ✅ Color-coded output (via echo)
- ✅ Background process handling
- ✅ Timeout for initialization
- ✅ Error detection
- ✅ Visual startup banner

### **Replit** (`start-replit.sh`, `dev-replit.sh`)
- ✅ Optimized for Replit environment
- ✅ Auto-build if needed (production)
- ✅ Shorter wait times
- ✅ Replit-specific logging
- ✅ Port configuration from ENV
- ✅ Visual startup banner

---

## ⚙️ **Environment Variables**

All scripts support these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production`/`development` | Runtime environment |
| `PORT` | `5000` | Server port |
| `DATABASE_URL` | (required) | PostgreSQL connection string |
| `STRIPE_SECRET_KEY` | (optional) | Stripe payment integration |
| `META_APP_ID` | (optional) | Meta/Facebook integration |
| `GOOGLE_CLIENT_ID` | (optional) | Google/YouTube integration |
| `TWITTER_API_KEY` | (optional) | Twitter/X integration |
| `TIKTOK_CLIENT_KEY` | (optional) | TikTok integration |

**Set environment variables:**

**Unix/Linux/Mac:**
```bash
export DATABASE_URL="postgresql://..."
export PORT=8080
npm start
```

**Windows:**
```powershell
$env:DATABASE_URL="postgresql://..."
$env:PORT=8080
npm run start:windows
```

**Replit:**
- Use "Tools" → "Secrets" in Replit UI

---

## 🐛 **Troubleshooting**

### **Problem: "dist folder not found"**
```bash
# Solution: Build first
npm run build
```

### **Problem: "node_modules not found"**
```bash
# Solution: Install dependencies
npm install
```

### **Problem: "boosterstate not found"**
```
This is normal! boosterstate is optional.
The platform will work fine without it.
```

### **Problem: "Port already in use"**

**Unix/Linux/Mac:**
```bash
# Kill process on port 5000
lsof -ti:5000 | xargs kill -9

# Or change port
export PORT=8080
npm start
```

**Windows:**
```powershell
# Kill process on port 5000
Get-Process -Id (Get-NetTCPConnection -LocalPort 5000).OwningProcess | Stop-Process -Force

# Or change port
$env:PORT=8080
npm run start:windows
```

### **Problem: "Permission denied" (Unix)**
```bash
# Make scripts executable
chmod +x start.sh dev.sh start-replit.sh dev-replit.sh
```

### **Problem: Database connection error**
```bash
# Check DATABASE_URL is set
echo $DATABASE_URL  # Unix
echo %DATABASE_URL%  # Windows

# Test connection (requires psql)
psql $DATABASE_URL -c "SELECT 1"
```

---

## 📊 **Startup Sequence**

```
1. Environment Configuration
   └─ NODE_ENV, PORT

2. Pre-flight Checks
   ├─ Build artifacts (production)
   ├─ Dependencies installed
   └─ Database configured

3. Optional Services
   └─ boosterstate (Rust service)

4. Max Booster Server
   ├─ Load safety middleware
   ├─ Initialize database
   ├─ Load 413 plugins
   ├─ Start Pocket Dimension
   ├─ Activate autopilot
   ├─ Start HTTP server
   └─ Listen on PORT

5. Ready! 🎉
```

---

## 🎯 **Best Practices**

### **Development**
1. Always use dev scripts (`npm run dev`)
2. Hot reload saves time
3. Check logs for errors
4. Test features locally before deploying

### **Production**
1. Always build first (`npm run build`)
2. Use production scripts (`npm start`)
3. Set `DATABASE_URL` in environment
4. Configure all API keys
5. Enable monitoring (Sentry)
6. Use process manager (PM2, systemd)

### **Replit**
1. Use `npm run deploy:replit` for one-command deploy
2. Configure secrets in Replit UI
3. Enable Always-On for 24/7 uptime
4. Monitor logs in Replit console

---

## 🔒 **Security Notes**

1. **Never commit `.env` files** to git
2. **Use environment variables** for secrets
3. **Rotate API keys** regularly
4. **Enable HTTPS** in production
5. **Use strong passwords** for database
6. **Monitor logs** for suspicious activity

---

## 📈 **Performance Tips**

1. **Production:**
   - Build is minified and optimized
   - Static assets are compressed
   - Database queries are indexed
   - API responses are cached

2. **Development:**
   - Hot reload is fast
   - Source maps enabled
   - Detailed error traces
   - No optimization overhead

3. **Scaling:**
   - Use load balancer for multiple instances
   - Enable Redis for session storage
   - Use CDN for static assets
   - Database connection pooling enabled

---

## 🎉 **Success Indicators**

When Max Booster starts successfully, you'll see:

```
╔════════════════════════════════════════════════════════════════╗
║              MAX BOOSTER 10.0 STARTING                         ║
║                                                                ║
║  Port:          5000                                           ║
║  Environment:   production                                     ║
║  Plugins:       413                                            ║
║  Compression:   903:1                                          ║
║  AI Engine:     Custom (100%)                                  ║
║  Autopilot:     Active                                         ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝

✅ Server running on http://0.0.0.0:5000
🎵 413 plugins loaded
💾 Pocket Dimension active (903:1 compression)
🤖 AI engine ready
⚡ Autonomous autopilot enabled
```

---

## 🚀 **Next Steps After Startup**

1. **Access the application:**
   - Local: http://localhost:5000
   - Replit: Click "Open in new tab"

2. **Log in:**
   - Use admin credentials from `bootstrap:admin`

3. **Verify features:**
   - Check `/studio` for 413 plugins
   - Upload file to test Pocket Dimension
   - Connect social media accounts
   - Configure advertising platforms

4. **Monitor:**
   - Check logs for errors
   - Monitor performance metrics
   - Track API usage
   - Review analytics

---

## 📖 **Related Documentation**

- `REPLIT-DEPLOYMENT-GUIDE.md` - Full Replit deployment guide
- `READY-TO-LAUNCH.md` - Launch checklist
- `env.template` - Environment variables template
- `setup-replit.sh` - One-click setup for Replit

---

**Platform**: Max Booster 10.0  
**Repository**: https://github.com/20lawsobk/maxbooster7.5.git  
**Support**: blawzmusic@gmail.com

# 🎵 **Happy Coding!** 🚀
