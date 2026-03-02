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
 *   npx tsx scripts/build-apps.ts desktop        # Build desktop app (current platform)
 *   npx tsx scripts/build-apps.ts mobile         # Setup mobile apps (requires native IDEs)
 *   npx tsx scripts/build-apps.ts desktop+mobile # Build desktop AND mobile in one pass
 *   npx tsx scripts/build-apps.ts all            # Alias for desktop+mobile
 *   npx tsx scripts/build-apps.ts version        # Bump patch version
 *   npx tsx scripts/build-apps.ts github         # Show GitHub Actions instructions
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const APP_NAME = 'Max Booster';
const APP_ID = 'com.blawzmusic.maxbooster';
const PRODUCTION_URL = 'https://maxbooster.replit.app';

function log(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') {
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warn: '⚠️' };
  console.log(`${icons[type]} ${message}`);
}

function runCommand(command: string, options: { cwd?: string; stdio?: 'inherit' | 'pipe' } = {}): string {
  log(`Running: ${command}`, 'info');
  try {
    const result = execSync(command, {
      cwd: options.cwd || process.cwd(),
      stdio: options.stdio || 'inherit',
      encoding: 'utf-8',
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

/** Build the web/Vite bundle that both Electron and Capacitor serve. */
function buildWebAssets(): void {
  log('Building web assets...', 'info');
  runCommand('npm run build');
  log('Web assets built successfully', 'success');
}

/**
 * Build the Electron desktop app for the current platform.
 * In the Replit environment this validates config only; full builds
 * require GitHub Actions or a local desktop machine.
 */
function buildDesktop(): void {
  log('='.repeat(60), 'info');
  log('BUILDING DESKTOP APPLICATION', 'info');
  log('='.repeat(60), 'info');

  const pkg = getPackageJson();

  ensureDirectory('electron/assets');
  if (!fs.existsSync('electron/assets/icon.png')) {
    log('Warning: Missing icon at electron/assets/icon.png', 'warn');
  }

  if (!fs.existsSync('electron/package.json')) {
    throw new Error('No electron-builder config found at electron/package.json.');
  }

  if (!fs.existsSync('electron/main.js') && !fs.existsSync('electron/main.ts')) {
    throw new Error('Electron main process file not found (electron/main.js or electron/main.ts).');
  }

  if (!fs.existsSync('dist/public/index.html')) {
    throw new Error('Compiled frontend not found at dist/public/index.html. Run the web build first.');
  }

  log(`Building ${APP_NAME} v${pkg.version} for desktop...`, 'info');

  const isReplit = process.env.REPLIT || process.env.REPLIT_DEV_DOMAIN;
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  const forceFullBuild = process.env.FORCE_FULL_BUILD === 'true';

  if (isReplit && !isCI && !forceFullBuild) {
    log('Detected Replit environment — validating config only', 'info');
    log('Full installers must be built via GitHub Actions (or a local desktop machine).', 'info');
    log('Run: npx tsx scripts/build-apps.ts github   for instructions', 'info');

    try {
      runCommand('python3 --version', { stdio: 'pipe' });
      log('Python available for native modules', 'success');
    } catch {
      log('Python not found — native modules may fail during packaging', 'warn');
    }

    log('electron-builder config ✓', 'success');
    log('Electron main process   ✓', 'success');
    log('Desktop config validation complete', 'success');
    return;
  }

  const platform = process.platform;
  let buildCmd: string;
  if (platform === 'linux') {
    log('Building Linux packages (AppImage, DEB)...', 'info');
    buildCmd = 'npx electron-builder --linux --projectDir electron';
  } else if (platform === 'darwin') {
    log('Building macOS packages (DMG, ZIP)...', 'info');
    buildCmd = 'npx electron-builder --mac --projectDir electron';
  } else if (platform === 'win32') {
    log('Building Windows packages (NSIS, Portable)...', 'info');
    buildCmd = 'npx electron-builder --win --projectDir electron';
  } else {
    throw new Error(`Unsupported build platform: ${platform}. Use GitHub Actions for cross-platform builds.`);
  }

  runCommand(buildCmd);

  log('Desktop build completed!', 'success');
  log('Output directory: dist-installers/', 'info');

  if (fs.existsSync('dist-installers')) {
    const files = fs.readdirSync('dist-installers').filter(f => !f.endsWith('.yml'));
    if (files.length > 0) {
      log('Generated installers:', 'info');
      files.forEach(file => console.log(`  - ${file}`));
    }
  }
}

/**
 * Validate that capacitor.config.ts exists and is correct.
 * The authoritative config lives in capacitor.config.ts — this script
 * never overwrites it. If it is missing we print the required content.
 */
function validateCapacitorConfig(): void {
  if (fs.existsSync('capacitor.config.ts')) {
    log('capacitor.config.ts exists ✓', 'success');
    return;
  }
  if (fs.existsSync('capacitor.config.json')) {
    log('capacitor.config.json exists ✓', 'success');
    return;
  }

  log('No Capacitor config found — creating capacitor.config.ts', 'warn');

  const configContent = `import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: '${APP_ID}',
  appName: '${APP_NAME}',
  webDir: 'dist/public',
  server: {
    url: '${PRODUCTION_URL}',
    cleartext: false,
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#1a1a2e',
      showSpinner: true,
      spinnerColor: '#9333ea',
    },
    StatusBar: { style: 'Dark', backgroundColor: '#1a1a2e' },
    Keyboard: { resize: 'body', resizeOnFullScreen: true },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'maxbooster',
  },
  android: {
    backgroundColor: '#1a1a2e',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
`;

  fs.writeFileSync('capacitor.config.ts', configContent);
  log('capacitor.config.ts created', 'success');
}

/** Actually install Capacitor packages if they are missing. */
function ensureCapacitorInstalled(): boolean {
  if (fs.existsSync('node_modules/@capacitor/core')) {
    log('@capacitor/core is installed ✓', 'success');
    return true;
  }

  log('@capacitor/core not found — installing Capacitor packages...', 'warn');

  const deps = [
    '@capacitor/core',
    '@capacitor/cli',
    '@capacitor/android',
    '@capacitor/ios',
    '@capacitor/app',
    '@capacitor/browser',
    '@capacitor/camera',
    '@capacitor/filesystem',
    '@capacitor/haptics',
    '@capacitor/keyboard',
    '@capacitor/local-notifications',
    '@capacitor/network',
    '@capacitor/preferences',
    '@capacitor/push-notifications',
    '@capacitor/share',
    '@capacitor/splash-screen',
    '@capacitor/status-bar',
  ].join(' ');

  try {
    runCommand(`npm install ${deps}`);
    log('Capacitor packages installed', 'success');
    return true;
  } catch (err) {
    log(`Failed to install Capacitor packages: ${err}`, 'error');
    log('Run manually: npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios', 'info');
    return false;
  }
}

/**
 * Set up Capacitor and sync web assets to native projects.
 * Pass webAssetsAlreadyBuilt=true to skip rebuilding the Vite bundle.
 */
function podAvailable(): boolean {
  try {
    execSync('pod --version', { stdio: 'pipe', encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

function buildMobile(webAssetsAlreadyBuilt = false): void {
  log('='.repeat(60), 'info');
  log('BUILDING MOBILE APPLICATIONS', 'info');
  log('='.repeat(60), 'info');

  validateCapacitorConfig();

  if (!webAssetsAlreadyBuilt) {
    buildWebAssets();
  }

  const installed = ensureCapacitorInstalled();
  if (!installed) {
    log('Cannot proceed with mobile build — Capacitor packages missing', 'error');
    process.exit(1);
  }

  if (!fs.existsSync('android')) {
    log('Adding Android platform...', 'info');
    runCommand('npx cap add android');
  }

  if (!fs.existsSync('ios')) {
    log('Adding iOS platform...', 'info');
    runCommand('npx cap add ios');
  }

  const hasPod = podAvailable();
  const isMacOS = process.platform === 'darwin';

  if (hasPod && isMacOS) {
    log('Syncing all Capacitor projects (Android + iOS)...', 'info');
    runCommand('npx cap sync');
    log('Mobile build setup completed!', 'success');
  } else {
    log('Syncing Android...', 'info');
    runCommand('npx cap sync android');
    log('Android sync complete ✓', 'success');

    if (!isMacOS) {
      log('iOS sync skipped — CocoaPods requires macOS + Xcode', 'warn');
      log('iOS builds run automatically via GitHub Actions on macOS runners', 'info');
    } else {
      log('iOS sync skipped — CocoaPods (pod) not found', 'warn');
      log('Install CocoaPods: sudo gem install cocoapods', 'info');
    }

    log('Mobile build setup completed (Android ready)!', 'success');
  }

  console.log('');
  log('Next steps:', 'info');
  log('  Android: npx cap open android   (requires Android Studio)', 'info');
  log('  iOS:     npx cap open ios        (requires macOS + Xcode)', 'info');
  log('  CI/CD:   GitHub Actions builds both automatically on tagged releases', 'info');
}

/** Build web assets once, then desktop and mobile. */
function buildAll(): void {
  log('='.repeat(60), 'info');
  log('BUILDING DESKTOP + MOBILE APPLICATIONS', 'info');
  log('='.repeat(60), 'info');

  const pkg = getPackageJson();
  log(`Building ${APP_NAME} v${pkg.version} for all platforms...`, 'info');

  buildWebAssets();
  buildDesktop();
  buildMobile(true);

  console.log('');
  log('='.repeat(60), 'info');
  log('BUILD SUMMARY', 'success');
  log('='.repeat(60), 'info');
  log('Desktop: dist-installers/', 'success');
  log('Mobile:  android/ and ios/ (open in native IDEs to compile)', 'success');
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
        electron: pkg.devDependencies?.electron || pkg.dependencies?.electron || 'not installed',
        windows: ['NSIS Installer', 'Portable'],
        macos: ['DMG', 'ZIP'],
        linux: ['AppImage', 'DEB'],
      },
      mobile: {
        ios: { minVersion: '15.0', scheme: 'maxbooster' },
        android: { minSdk: 22, targetSdk: 34 },
      },
      web: { url: PRODUCTION_URL },
    },
  };

  fs.writeFileSync('build-info.json', JSON.stringify(buildInfo, null, 2) + '\n');
  log('Build info written to build-info.json', 'success');
}

function showGitHubInstructions(): void {
  console.log(`
${APP_NAME} - GitHub Actions Build Instructions
================================================

RECOMMENDED: Use GitHub Actions for production builds on all platforms.

1. SETUP SECRETS
   GitHub → Settings → Secrets and variables → Actions
   See .github/SECRETS_SETUP.md for the full list of required secrets.

2. TRIGGER A BUILD

   Automatic (push a version tag):
     git tag v3.1.0
     git push origin v3.1.0

   Manual:
     GitHub → Actions → "Build Desktop Apps" or "Build Mobile Apps" → Run workflow

3. DOWNLOAD ARTIFACTS
   GitHub → Actions → select the run → download from the Artifacts section.

4. RELEASES
   Tagged builds automatically create GitHub Releases with installers attached.

WORKFLOW FILES:
  .github/workflows/build-desktop.yml  — Windows, macOS, Linux
  .github/workflows/build-mobile.yml   — iOS, Android
`);
}

function showHelp(): void {
  console.log(`
${APP_NAME} Build Script
========================

Usage:
  npx tsx scripts/build-apps.ts <command>

Commands:
  desktop        Build desktop app for the current OS (Electron)
  mobile         Setup mobile apps locally (Capacitor + Android/iOS)
  desktop+mobile Build desktop AND mobile (web assets built only once)
  all            Alias for desktop+mobile
  version        Bump patch version in package.json
  version:minor  Bump minor version
  version:major  Bump major version
  info           Write build-info.json
  github         Show GitHub Actions instructions (RECOMMENDED for production)
  help           Show this help message

Environment variables:
  FORCE_FULL_BUILD=true   Run a full Electron build even inside Replit

Examples:
  npx tsx scripts/build-apps.ts github         # Preferred for production
  npx tsx scripts/build-apps.ts desktop        # Local build for current OS
  npx tsx scripts/build-apps.ts desktop+mobile # Build both in one pass
  npx tsx scripts/build-apps.ts mobile         # Capacitor setup only
`);
}

async function main(): Promise<void> {
  const command = process.argv[2] || 'help';

  console.log('');
  log(`${APP_NAME} Build System`, 'info');
  log('='.repeat(40), 'info');
  console.log('');

  try {
    switch (command) {
      case 'desktop':
        buildWebAssets();
        buildDesktop();
        break;

      case 'mobile':
        buildMobile();
        break;

      case 'desktop+mobile':
      case 'desktop-mobile':
      case 'both':
      case 'all':
        buildAll();
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
