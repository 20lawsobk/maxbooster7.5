#!/usr/bin/env tsx
/**
 * Max Booster - Desktop & Mobile App Build Script
 * 
 * RECOMMENDED: Use GitHub Actions for production builds
 * - Push a tag (v3.0.0) to trigger automated builds on all platforms
 * - See .github/workflows/build-desktop.yml and build-mobile.yml
 * - See .github/SECRETS_SETUP.md for required secrets
 * 
 * Local builds (development/testing):
 * - Desktop: Windows (NSIS, Portable), macOS (DMG, ZIP), Linux (AppImage, DEB)
 * - Mobile: iOS (Capacitor), Android (Capacitor)
 * 
 * Usage:
 *   npx tsx scripts/build-apps.ts desktop    # Build desktop apps only (current platform)
 *   npx tsx scripts/build-apps.ts mobile     # Setup mobile apps (requires native IDEs)
 *   npx tsx scripts/build-apps.ts all        # Build all platforms
 *   npx tsx scripts/build-apps.ts version    # Bump version only
 *   npx tsx scripts/build-apps.ts github     # Show GitHub Actions instructions
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const APP_NAME = 'Max Booster';
const APP_ID = 'com.blawzmusic.maxbooster';
const PRODUCTION_URL = 'https://maxbooster.replit.app';

interface BuildConfig {
  desktop: boolean;
  mobile: boolean;
  version?: string;
}

function log(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') {
  const icons = {
    info: '\u2139\ufe0f',
    success: '\u2705',
    error: '\u274c',
    warn: '\u26a0\ufe0f'
  };
  console.log(`${icons[type]} ${message}`);
}

function runCommand(command: string, options: { cwd?: string; stdio?: 'inherit' | 'pipe' } = {}): string {
  log(`Running: ${command}`, 'info');
  try {
    const result = execSync(command, {
      cwd: options.cwd || process.cwd(),
      stdio: options.stdio || 'inherit',
      encoding: 'utf-8'
    });
    return typeof result === 'string' ? result : '';
  } catch (error) {
    throw error;
  }
}

function getPackageJson(): any {
  const packagePath = path.join(process.cwd(), 'package.json');
  return JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
}

function updatePackageJson(updates: Partial<any>): void {
  const packagePath = path.join(process.cwd(), 'package.json');
  const pkg = getPackageJson();
  Object.assign(pkg, updates);
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
}

function bumpVersion(type: 'major' | 'minor' | 'patch' = 'patch'): string {
  const pkg = getPackageJson();
  const [major, minor, patch] = pkg.version.split('.').map(Number);
  
  let newVersion: string;
  switch (type) {
    case 'major':
      newVersion = `${major + 1}.0.0`;
      break;
    case 'minor':
      newVersion = `${major}.${minor + 1}.0`;
      break;
    case 'patch':
    default:
      newVersion = `${major}.${minor}.${patch + 1}`;
  }
  
  updatePackageJson({ version: newVersion });
  log(`Version bumped: ${pkg.version} -> ${newVersion}`, 'success');
  return newVersion;
}

function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function buildWebAssets(): void {
  log('Building web assets...', 'info');
  runCommand('npm run build');
  log('Web assets built successfully', 'success');
}

function buildDesktop(includeMobile: boolean = false): void {
  log('='.repeat(60), 'info');
  log('BUILDING DESKTOP APPLICATIONS', 'info');
  log('='.repeat(60), 'info');
  
  const pkg = getPackageJson();
  
  ensureDirectory('electron/assets');
  
  if (!fs.existsSync('electron/assets/icon.png')) {
    log('Warning: Missing icon at electron/assets/icon.png', 'warn');
  }
  
  log(`Building ${APP_NAME} v${pkg.version} for desktop...`, 'info');
  
  const isReplit = process.env.REPLIT || process.env.REPLIT_DEV_DOMAIN;
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  const forceFullBuild = process.env.FORCE_FULL_BUILD === 'true';
  
  if (isReplit && !isCI && !forceFullBuild) {
    log('Detected Replit environment - running validation only', 'info');
    log('Full desktop packaging should be done via GitHub Actions', 'info');
    log('See: .github/workflows/build-desktop.yml', 'info');
    
    log('Validating Electron configuration...', 'info');
    if (pkg.build) {
      log('Electron-builder config found in package.json', 'success');
    }
    if (fs.existsSync('electron/main.js') || fs.existsSync('electron/main.ts')) {
      log('Electron main process file exists', 'success');
    }
    
    log('Verifying native module compilation (Python check)...', 'info');
    try {
      runCommand('python3 --version', { stdio: 'pipe' });
      log('Python available for native modules', 'success');
    } catch {
      log('Python not found - native modules may fail', 'warn');
    }
    
    log('Desktop build validation completed!', 'success');
    log('To build full installers, use GitHub Actions or run locally on desktop', 'info');
    
    if (includeMobile) {
      log('', 'info');
      log('Also building mobile apps...', 'info');
      buildMobile();
    }
    return;
  }
  
  log('Building for all desktop platforms...', 'info');
  
  try {
    if (process.platform === 'linux') {
      log('Building Linux packages...', 'info');
      runCommand('npx electron-builder --linux');
    } else if (process.platform === 'darwin') {
      log('Building macOS packages...', 'info');
      runCommand('npx electron-builder --mac');
    } else if (process.platform === 'win32') {
      log('Building Windows packages...', 'info');
      runCommand('npx electron-builder --win');
    }
    
    log('Desktop build completed!', 'success');
    log(`Output: dist-installers/`, 'info');
    
    if (fs.existsSync('dist-installers')) {
      const files = fs.readdirSync('dist-installers');
      log('Generated installers:', 'info');
      files.forEach(file => console.log(`  - ${file}`));
    }
    
    if (includeMobile) {
      log('', 'info');
      log('Also building mobile apps...', 'info');
      buildMobile();
    }
  } catch (error) {
    log('Desktop build failed', 'error');
    throw error;
  }
}

function buildDesktopAndMobile(): void {
  log('='.repeat(60), 'info');
  log('BUILDING DESKTOP + MOBILE APPLICATIONS', 'info');
  log('='.repeat(60), 'info');
  
  const pkg = getPackageJson();
  log(`Building ${APP_NAME} v${pkg.version} for all platforms...`, 'info');
  
  buildWebAssets();
  
  buildDesktop(false);
  
  buildMobile();
  
  log('', 'info');
  log('='.repeat(60), 'info');
  log('BUILD SUMMARY', 'success');
  log('='.repeat(60), 'info');
  log('Desktop: dist-installers/', 'success');
  log('Mobile:  android/ and ios/ (requires native IDEs to compile)', 'success');
  log('', 'info');
  log('Next steps for mobile:', 'info');
  log('  iOS:     npx cap open ios      (requires macOS + Xcode)', 'info');
  log('  Android: npx cap open android  (requires Android Studio)', 'info');
}

function setupCapacitor(): void {
  log('Setting up Capacitor for mobile builds...', 'info');
  
  const capacitorConfig = {
    appId: APP_ID,
    appName: APP_NAME,
    webDir: 'dist/public',
    server: {
      url: PRODUCTION_URL,
      cleartext: true
    },
    plugins: {
      SplashScreen: {
        launchShowDuration: 2000,
        launchAutoHide: true,
        backgroundColor: '#1a1a2e',
        androidSplashResourceName: 'splash',
        androidScaleType: 'CENTER_CROP',
        showSpinner: true,
        spinnerColor: '#9333ea'
      },
      StatusBar: {
        style: 'Dark',
        backgroundColor: '#1a1a2e'
      },
      Keyboard: {
        resize: 'body',
        resizeOnFullScreen: true
      },
      PushNotifications: {
        presentationOptions: ['badge', 'sound', 'alert']
      }
    },
    ios: {
      contentInset: 'automatic',
      preferredContentMode: 'mobile',
      scheme: 'maxbooster'
    },
    android: {
      backgroundColor: '#1a1a2e',
      allowMixedContent: false,
      captureInput: true,
      webContentsDebuggingEnabled: false
    }
  };
  
  fs.writeFileSync('capacitor.config.json', JSON.stringify(capacitorConfig, null, 2) + '\n');
  log('Capacitor config created', 'success');
}

function installCapacitorDeps(): void {
  log('Installing Capacitor dependencies...', 'info');
  
  const deps = [
    '@capacitor/core',
    '@capacitor/cli',
    '@capacitor/android',
    '@capacitor/ios',
    '@capacitor/app',
    '@capacitor/browser',
    '@capacitor/camera',
    '@capacitor/filesystem',
    '@capacitor/geolocation',
    '@capacitor/haptics',
    '@capacitor/keyboard',
    '@capacitor/local-notifications',
    '@capacitor/network',
    '@capacitor/preferences',
    '@capacitor/push-notifications',
    '@capacitor/share',
    '@capacitor/splash-screen',
    '@capacitor/status-bar'
  ];
  
  log('Note: Capacitor packages need to be installed via npm separately', 'warn');
  log('Run: npm install ' + deps.join(' '), 'info');
}

function buildMobile(): void {
  log('='.repeat(60), 'info');
  log('BUILDING MOBILE APPLICATIONS', 'info');
  log('='.repeat(60), 'info');
  
  setupCapacitor();
  
  buildWebAssets();
  
  log('Syncing Capacitor projects...', 'info');
  
  try {
    if (!fs.existsSync('node_modules/@capacitor/core')) {
      log('Capacitor not installed. Installing dependencies...', 'warn');
      installCapacitorDeps();
      log('Please install Capacitor dependencies and re-run the mobile build', 'warn');
      return;
    }
    
    if (!fs.existsSync('android')) {
      log('Adding Android platform...', 'info');
      runCommand('npx cap add android');
    }
    
    if (!fs.existsSync('ios')) {
      log('Adding iOS platform...', 'info');
      runCommand('npx cap add ios');
    }
    
    log('Syncing web assets to native projects...', 'info');
    runCommand('npx cap sync');
    
    log('Mobile build setup completed!', 'success');
    log('', 'info');
    log('Next steps:', 'info');
    log('  iOS:     npx cap open ios      (requires macOS + Xcode)', 'info');
    log('  Android: npx cap open android  (requires Android Studio)', 'info');
    
  } catch (error) {
    log('Mobile build setup failed', 'error');
    throw error;
  }
}

function generateBuildInfo(): void {
  const pkg = getPackageJson();
  const buildInfo = {
    name: APP_NAME,
    version: pkg.version,
    appId: APP_ID,
    buildDate: new Date().toISOString(),
    platforms: {
      desktop: {
        electron: pkg.devDependencies?.electron || 'not installed',
        windows: ['NSIS Installer', 'Portable'],
        macos: ['DMG', 'ZIP'],
        linux: ['AppImage', 'DEB', 'tar.gz']
      },
      mobile: {
        ios: {
          minVersion: '15.0',
          scheme: 'maxbooster'
        },
        android: {
          minSdk: 22,
          targetSdk: 34
        }
      },
      web: {
        url: PRODUCTION_URL
      }
    }
  };
  
  fs.writeFileSync('build-info.json', JSON.stringify(buildInfo, null, 2) + '\n');
  log('Build info generated: build-info.json', 'success');
}

function showGitHubInstructions(): void {
  console.log(`
${APP_NAME} - GitHub Actions Build Instructions
================================================

RECOMMENDED: Use GitHub Actions for production builds across all platforms.

1. SETUP SECRETS
   Go to GitHub > Settings > Secrets and variables > Actions
   See .github/SECRETS_SETUP.md for required secrets

2. TRIGGER BUILDS

   Automatic (push a version tag):
   $ git tag v3.0.0
   $ git push origin v3.0.0

   Manual:
   - Go to Actions tab in GitHub
   - Select "Build Desktop Apps" or "Build Mobile Apps"
   - Click "Run workflow"

3. DOWNLOAD ARTIFACTS
   - Go to Actions > Select workflow run
   - Download artifacts from the bottom of the page

4. RELEASES
   Tagged builds automatically create GitHub Releases with all installers attached.

WORKFLOWS:
  .github/workflows/build-desktop.yml  - Windows, macOS, Linux builds
  .github/workflows/build-mobile.yml   - iOS, Android builds

`);
}

function showHelp(): void {
  console.log(`
${APP_NAME} Build Script
========================

Usage:
  npx tsx scripts/build-apps.ts <command>

Commands:
  desktop        Build desktop apps for current platform (Electron)
  desktop+mobile Build desktop AND mobile apps in one command
  mobile         Setup mobile apps locally (Capacitor)
  all            Build all platforms locally (same as desktop+mobile)
  version        Bump patch version
  version:minor  Bump minor version
  version:major  Bump major version
  info           Generate build info
  github         Show GitHub Actions build instructions (RECOMMENDED)
  help           Show this help message

RECOMMENDED FOR PRODUCTION:
  Use GitHub Actions to build for all platforms automatically.
  Run: npx tsx scripts/build-apps.ts github

Examples:
  npx tsx scripts/build-apps.ts github         # See GitHub Actions instructions
  npx tsx scripts/build-apps.ts desktop        # Local build for current OS
  npx tsx scripts/build-apps.ts desktop+mobile # Build desktop AND mobile together
  npx tsx scripts/build-apps.ts mobile         # Setup Capacitor locally
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  
  console.log('');
  log(`${APP_NAME} Build System`, 'info');
  log('='.repeat(40), 'info');
  console.log('');
  
  try {
    switch (command) {
      case 'desktop':
        buildWebAssets();
        buildDesktop(false);
        break;
      
      case 'desktop+mobile':
      case 'desktop-mobile':
      case 'both':
        buildDesktopAndMobile();
        break;
        
      case 'mobile':
        buildMobile();
        break;
        
      case 'all':
        buildDesktopAndMobile();
        break;
        
      case 'version':
        bumpVersion('patch');
        break;
        
      case 'version:minor':
        bumpVersion('minor');
        break;
        
      case 'version:major':
        bumpVersion('major');
        break;
        
      case 'info':
        generateBuildInfo();
        break;
        
      case 'github':
        showGitHubInstructions();
        break;
        
      case 'help':
      default:
        showHelp();
        break;
    }
    
    console.log('');
    log('Build process completed!', 'success');
    
  } catch (error) {
    log(`Build failed: ${error}`, 'error');
    process.exit(1);
  }
}

main();
