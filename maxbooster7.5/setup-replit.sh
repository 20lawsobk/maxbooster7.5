#!/bin/bash
# Max Booster Replit Quick Setup Script

set -e

echo "🚀 MAX BOOSTER 10.0 - REPLIT QUICK SETUP"
echo "========================================"
echo ""

# Check if .env exists
if [ -f ".env" ]; then
  echo "⚠️  .env file already exists!"
  read -p "Do you want to overwrite it? (y/N): " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Setup cancelled."
    exit 1
  fi
fi

echo "📝 Creating .env file from template..."
cp .env.example .env

echo ""
echo "🔐 Generating secure secrets..."

# Generate secrets
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Replace in .env
sed -i "s/SESSION_SECRET=.*/SESSION_SECRET=$SESSION_SECRET/" .env
sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
sed -i "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$ENCRYPTION_KEY/" .env

echo "✅ Secrets generated and added to .env"
echo ""

# Check for required environment variables
echo "🔍 Checking for required environment variables..."
echo ""

MISSING=()

if ! grep -q "^DATABASE_URL=postgresql://" .env; then
  MISSING+=("DATABASE_URL")
fi

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "⚠️  WARNING: The following required variables are not set:"
  for var in "${MISSING[@]}"; do
    echo "   - $var"
  done
  echo ""
  echo "Please edit .env and add these values before running the app."
  echo ""
fi

echo "📦 Installing dependencies..."
npm install

echo ""
echo "🗄️  Setting up database..."
echo "Make sure your DATABASE_URL is set in .env first!"
read -p "Press Enter to run database migrations, or Ctrl+C to cancel..."

npm run db:push

echo ""
echo "👤 Creating admin user..."
npm run bootstrap:admin

echo ""
echo "✅ SETUP COMPLETE!"
echo ""
echo "🚀 Next steps:"
echo "   1. Edit .env and add your API keys (Stripe, Meta, Google, etc.)"
echo "   2. Run 'npm run build' to build the app"
echo "   3. Run 'npm run start:replit' to start the server"
echo "   4. Or click 'Run' button in Replit!"
echo ""
echo "📖 Full documentation: REPLIT-DEPLOYMENT-GUIDE.md"
echo ""
echo "🎵 Welcome to Max Booster 10.0!"
