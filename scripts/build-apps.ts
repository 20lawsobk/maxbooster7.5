#!/usr/bin/env tsx
/**
 * Max Booster - Desktop & Mobile App Build Script
 * 
 * Builds:
 * - Desktop: Windows (NSIS, Portable), macOS (DMG, ZIP), Linux (AppImage, DEB)
 * - Mobile: iOS (Capacitor), Android (Capacitor)
 * 
 * Usage:
 *   npx tsx scripts/build-apps.ts desktop    # Build desktop apps only
 *   npx tsx scripts/build-apps.ts mobile     # Build mobile apps only
 *   npx tsx scripts/build-apps.ts all        # Build all platforms
 *   npx tsx scripts/build-apps.ts version    # Bump version only
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

function buildDesktop(): void {
  log('='.repeat(60), 'info');
  log('BUILDING DESKTOP APPLICATIONS', 'info');
  log('='.repeat(60), 'info');
  
  const pkg = getPackageJson();
  
  ensureDirectory('electron/assets');
  
  if (!fs.existsSync('electron/assets/icon.png')) {
    log('Warning: Missing icon at electron/assets/icon.png', 'warn');
  }
  
  log(`Building ${APP_NAME} v${pkg.version} for desktop...`, 'info');
  
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
  } catch (error) {
    log('Desktop build failed', 'error');
    throw error;
  }
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

function showHelp(): void {
  console.log(`
${APP_NAME} Build Script
========================

Usage:
  npx tsx scripts/build-apps.ts <command>

Commands:
  desktop     Build desktop applications (Electron)
  mobile      Setup and build mobile applications (Capacitor)
  all         Build all platforms
  version     Bump patch version
  version:minor  Bump minor version
  version:major  Bump major version
  info        Generate build info
  help        Show this help message

Examples:
  npx tsx scripts/build-apps.ts desktop
  npx tsx scripts/build-apps.ts mobile
  npx tsx scripts/build-apps.ts all
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
        buildDesktop();
        break;
        
      case 'mobile':
        buildMobile();
        break;
        
      case 'all':
        buildWebAssets();
        buildDesktop();
        buildMobile();
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
