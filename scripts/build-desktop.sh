#!/bin/bash

# Max Booster Desktop Build Script
# Builds desktop apps for Linux, Windows, and macOS in stages

set -e

echo "=============================================="
echo "Max Booster Desktop Build Script v1.0.0"
echo "=============================================="

# Configuration
APP_NAME="MaxBooster"
VERSION="1.0.0"
OUTPUT_DIR="dist-portable"
ELECTRON_DIR="electron"
DIST_DIR="dist"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Common ignore patterns (split into groups to avoid regex complexity)
IGNORE_HEAVY="node_modules/@tensorflow|node_modules/canvas|node_modules/sharp"
IGNORE_SERVER="node_modules/bullmq|node_modules/ioredis|node_modules/@sendgrid"
IGNORE_BUILD="node_modules/ffmpeg-static|node_modules/@ffmpeg-installer"
IGNORE_DIRS="tests|scripts|server|shared|client|migrations|docs|logs|uploads|attached_assets|dist-electron|infrastructure|public"

FULL_IGNORE="${IGNORE_HEAVY}|${IGNORE_SERVER}|${IGNORE_BUILD}|${IGNORE_DIRS}"

echo ""
echo "Stage 1: Building Linux x64..."
echo "----------------------------------------------"

npx electron-packager . "$APP_NAME" \
  --platform=linux \
  --arch=x64 \
  --out="$OUTPUT_DIR" \
  --overwrite \
  --asar \
  --prune=true \
  --icon="${ELECTRON_DIR}/assets/icon.png" \
  --app-version="$VERSION" \
  --app-copyright="Copyright © 2025 B-LAWZ MUSIC" \
  --ignore="$FULL_IGNORE"

echo "✅ Linux build complete"

echo ""
echo "Stage 2: Building Windows x64..."
echo "----------------------------------------------"

npx electron-packager . "$APP_NAME" \
  --platform=win32 \
  --arch=x64 \
  --out="$OUTPUT_DIR" \
  --overwrite \
  --asar \
  --prune=true \
  --icon="${ELECTRON_DIR}/assets/icon.ico" \
  --app-version="$VERSION" \
  --app-copyright="Copyright © 2025 B-LAWZ MUSIC" \
  --ignore="$FULL_IGNORE"

echo "✅ Windows build complete"

echo ""
echo "Stage 3: Building macOS x64..."
echo "----------------------------------------------"

npx electron-packager . "$APP_NAME" \
  --platform=darwin \
  --arch=x64 \
  --out="$OUTPUT_DIR" \
  --overwrite \
  --asar \
  --prune=true \
  --icon="${ELECTRON_DIR}/assets/icon.icns" \
  --app-version="$VERSION" \
  --app-copyright="Copyright © 2025 B-LAWZ MUSIC" \
  --ignore="$FULL_IGNORE"

echo "✅ macOS build complete"

echo ""
echo "Stage 4: Creating distribution archives..."
echo "----------------------------------------------"

cd "$OUTPUT_DIR"

# Create Linux archive
if [ -d "${APP_NAME}-linux-x64" ]; then
  echo "Creating Linux archive..."
  # Add README
  cat > "${APP_NAME}-linux-x64/README.txt" << 'EOF'
Max Booster - Desktop Application for Linux

Installation:
1. Extract this archive to your preferred location
2. Run ./run-maxbooster.sh or ./MaxBooster

Requirements:
- 64-bit Linux (Ubuntu 20.04+, Fedora 33+, or equivalent)
- GTK3 libraries

For support, visit: https://maxbooster.com/help
EOF

  # Add launch script
  cat > "${APP_NAME}-linux-x64/run-maxbooster.sh" << 'EOF'
#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$DIR/MaxBooster" "$@"
EOF
  chmod +x "${APP_NAME}-linux-x64/run-maxbooster.sh"
  
  tar -czf "Max-Booster-${VERSION}-Linux-x64.tar.gz" "${APP_NAME}-linux-x64"
  echo "✅ Created Max-Booster-${VERSION}-Linux-x64.tar.gz"
fi

# Create Windows archive
if [ -d "${APP_NAME}-win32-x64" ]; then
  echo "Creating Windows archive..."
  cat > "${APP_NAME}-win32-x64/README.txt" << 'EOF'
Max Booster - Desktop Application for Windows

Installation:
1. Extract this archive to your preferred location
2. Run MaxBooster.exe

Requirements:
- Windows 10 or later (64-bit)

For support, visit: https://maxbooster.com/help
EOF

  zip -r -q "Max-Booster-${VERSION}-Windows-x64.zip" "${APP_NAME}-win32-x64"
  echo "✅ Created Max-Booster-${VERSION}-Windows-x64.zip"
fi

# Create macOS archive
if [ -d "${APP_NAME}-darwin-x64" ]; then
  echo "Creating macOS archive..."
  cat > "${APP_NAME}-darwin-x64/README.txt" << 'EOF'
Max Booster - Desktop Application for macOS

Installation:
1. Extract this archive
2. Drag MaxBooster.app to your Applications folder
3. Right-click and select "Open" on first launch

Requirements:
- macOS 10.15 (Catalina) or later

For support, visit: https://maxbooster.com/help
EOF

  zip -r -q "Max-Booster-${VERSION}-macOS-x64.zip" "${APP_NAME}-darwin-x64"
  echo "✅ Created Max-Booster-${VERSION}-macOS-x64.zip"
fi

echo ""
echo "=============================================="
echo "BUILD COMPLETE!"
echo "=============================================="
echo ""
echo "Distribution packages created in $OUTPUT_DIR:"
ls -lh Max-Booster-*.{zip,tar.gz} 2>/dev/null || echo "No archives found"
echo ""
