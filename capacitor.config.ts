import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.blawzmusic.maxbooster',
  appName: 'Max Booster',
  webDir: 'dist/public',
  
  server: {
    hostname: 'maxbooster.replit.app',
    androidScheme: 'https',
    cleartext: false
  },
  
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#1a1a2e',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      spinnerColor: '#9333ea',
      iosSpinnerStyle: 'small',
      splashFullScreen: true,
      splashImmersive: true
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
    },
    
    LocalNotifications: {
      smallIcon: 'ic_stat_notification',
      iconColor: '#9333ea'
    },
    
    Camera: {
      permissions: {
        androidCameraPermission: 'Camera access is needed for profile photos and content creation',
        androidStoragePermission: 'Storage access is needed to save and upload media'
      }
    },
    
    Filesystem: {
      directory: 'Documents'
    },
    
    Share: {
      androidShareDefaultText: 'Check out Max Booster - AI-Powered Music Career Management'
    }
  },
  
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'maxbooster',
    allowsLinkPreview: true,
    scrollEnabled: true,
    backgroundColor: '#1a1a2e',
    limitsNavigationsToAppBoundDomains: true
  },
  
  android: {
    backgroundColor: '#1a1a2e',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    loggingBehavior: 'none',
    useLegacyBridge: false,
    overrideUserAgent: 'MaxBooster/Mobile Android',
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
      releaseType: 'APK'
    }
  }
};

export default config;
