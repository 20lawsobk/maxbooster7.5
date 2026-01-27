import { Download, Monitor, Zap, Shield, Cpu, HardDrive, Globe, AlertCircle, FileText, CheckCircle, Smartphone, Tablet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRequireSubscription } from '@/hooks/useRequireAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function DesktopApp() {
  const { t } = useTranslation();
  const { user, isLoading } = useRequireSubscription();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          <p className="text-muted-foreground">Loading Desktop App...</p>
        </div>
      </div>
    );
  }

  const features = [
    {
      icon: Globe,
      title: 'Full Online Access',
      description: 'Connect directly to Max Booster servers with your internet connection. All your data syncs in real-time.',
    },
    {
      icon: Zap,
      title: 'Native Performance',
      description: 'Faster processing with direct hardware access. Upload files instantly from your computer.',
    },
    {
      icon: Shield,
      title: 'Enhanced Security',
      description: 'Secure connection to your account with native system integration and encrypted local storage.',
    },
    {
      icon: HardDrive,
      title: 'Local File Access',
      description: 'Browse and upload audio files directly from your computer with native file dialogs.',
    },
    {
      icon: Monitor,
      title: 'System Tray',
      description: 'Quick access from your system tray. Get notifications for distribution updates and analytics.',
    },
    {
      icon: Cpu,
      title: 'Desktop Shortcuts',
      description: 'Keyboard shortcuts, menu bar access, and native OS integration for power users.',
    },
  ];

  const GITHUB_RELEASES_URL = 'https://github.com/20lawsobk/maxbooster7.5/releases/latest/download';
  
  const desktopPlatforms = [
    {
      name: 'Windows',
      downloadUrl: `${GITHUB_RELEASES_URL}/Max-Booster-Setup-1.0.0.exe`,
      fallbackUrl: `${GITHUB_RELEASES_URL}/Max-Booster-1.0.0-win.zip`,
      icon: '🪟',
      requirements: t('desktopApp.requirements.windows'),
      available: true,
    },
    {
      name: 'macOS',
      downloadUrl: `${GITHUB_RELEASES_URL}/Max-Booster-1.0.0.dmg`,
      fallbackUrl: `${GITHUB_RELEASES_URL}/Max-Booster-1.0.0-mac.zip`,
      icon: '🍎',
      requirements: t('desktopApp.requirements.mac'),
      available: true,
    },
    {
      name: 'Linux',
      downloadUrl: `${GITHUB_RELEASES_URL}/Max-Booster-1.0.0.AppImage`,
      fallbackUrl: `${GITHUB_RELEASES_URL}/max-booster-1.0.0.tar.gz`,
      icon: '🐧',
      requirements: t('desktopApp.requirements.linux'),
      available: true,
    },
  ];

  const mobilePlatforms = [
    {
      name: 'iOS',
      downloadUrl: `${GITHUB_RELEASES_URL}/Max-Booster-iOS-1.0.0.ipa`,
      icon: '📱',
      storeIcon: '🍎',
      requirements: 'iOS 15.0 or later',
      available: true,
    },
    {
      name: 'Android',
      downloadUrl: `${GITHUB_RELEASES_URL}/Max-Booster-Android-1.0.0.apk`,
      icon: '📱',
      storeIcon: '🤖',
      requirements: 'Android 8.0 or later',
      available: true,
    },
  ];

  return (
    <AppLayout>
      <div className="container mx-auto p-6 space-y-8">
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-4 mb-4">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full">
            <Monitor className="w-8 h-8 text-primary" />
          </div>
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/10 rounded-full">
            <Smartphone className="w-8 h-8 text-green-500" />
          </div>
        </div>
        <h1 className="text-4xl font-bold tracking-tight">
          Desktop and Mobile Versions
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Take Max Booster everywhere. Native apps for your computer, phone, and tablet - all synced with your account.
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full">
          <Zap className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Included with your subscription</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <Card key={feature.title} className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-2">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{feature.description}</CardDescription>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-center gap-3">
          <Monitor className="w-8 h-8 text-primary" />
          <h2 className="text-3xl font-bold text-center">
            Desktop Apps
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {desktopPlatforms.map((platform) => (
            <Card key={platform.name} className="border-2">
              <CardHeader className="text-center">
                <div className="mb-4">
                  <Monitor className="w-16 h-16 mx-auto text-primary" />
                </div>
                <CardTitle className="text-2xl">{platform.name}</CardTitle>
                <CardDescription className="text-sm">
                  {platform.requirements}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button className="w-full" size="lg" asChild>
                  <a href={platform.downloadUrl} download>
                    <Download className="w-4 h-4 mr-2" />
                    {t('desktopApp.downloadButton')} {platform.name}
                  </a>
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  {t('desktopApp.version')}: 1.0.0
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-center gap-3">
          <Smartphone className="w-8 h-8 text-green-500" />
          <h2 className="text-3xl font-bold text-center">
            Mobile Apps
          </h2>
        </div>
        <p className="text-center text-muted-foreground max-w-2xl mx-auto">
          Access Max Booster on your phone or tablet. The same powerful features with a touch-optimized interface that adapts to any screen size.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {mobilePlatforms.map((platform) => (
            <Card key={platform.name} className="border-2 hover:border-green-500/50 transition-colors">
              <CardHeader className="text-center">
                <div className="mb-4">
                  <Smartphone className="w-16 h-16 mx-auto text-green-500" />
                </div>
                <CardTitle className="text-2xl flex items-center justify-center gap-2">
                  <span>{platform.storeIcon}</span>
                  {platform.name}
                </CardTitle>
                <CardDescription className="text-sm">
                  {platform.requirements}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button className="w-full bg-green-600 hover:bg-green-700" size="lg" asChild>
                  <a href={platform.downloadUrl} download>
                    <Download className="w-4 h-4 mr-2" />
                    Download {platform.name}
                  </a>
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Version: 1.0.0
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
        
        <Card className="border-2 border-green-500/20 bg-green-500/5 max-w-2xl mx-auto">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Tablet className="w-6 h-6 text-green-500" />
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold">Same Experience, Every Device</h4>
                <p className="text-sm text-muted-foreground">
                  Our dynamic layout system automatically adapts to your screen size. Whether you're on a phone, tablet, or desktop, you get the full Max Booster experience with an interface optimized for your device.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-2 border-amber-500/30 bg-amber-500/5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-amber-500" />
            <CardTitle className="text-amber-500">Important: First Launch Instructions</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-muted-foreground">
            Max Booster v1.0 is <strong>unsigned indie software</strong>. Your operating system will show a security warning on first launch. 
            This is normal and safe - it's the same code as the web version!
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Monitor className="w-5 h-5 text-primary" />
                <h4 className="font-semibold">Windows</h4>
              </div>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>Extract ZIP file to a folder</li>
                <li>Right-click <code className="px-1 py-0.5 bg-muted rounded text-xs">Max Booster.exe</code></li>
                <li>Select "Run as administrator"</li>
                <li>Click "More info" → "Run anyway"</li>
              </ol>
              <a 
                href="/downloads/README-Windows.md" 
                target="_blank"
                className="inline-flex items-center gap-2 text-xs text-primary hover:underline"
              >
                <FileText className="w-3 h-3" />
                View full Windows guide
              </a>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Monitor className="w-5 h-5 text-primary" />
                <h4 className="font-semibold">macOS</h4>
              </div>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>Extract ZIP and move to Applications</li>
                <li><strong>Right-click</strong> Max Booster.app</li>
                <li>Select "Open" from menu</li>
                <li>Click "Open" in confirmation dialog</li>
              </ol>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  Or run: <code className="px-1 py-0.5 bg-muted rounded text-xs">xattr -cr /Applications/Max\ Booster.app</code>
                </p>
                <a 
                  href="/downloads/README-macOS.md" 
                  target="_blank"
                  className="inline-flex items-center gap-2 text-xs text-primary hover:underline"
                >
                  <FileText className="w-3 h-3" />
                  View full macOS guide
                </a>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Monitor className="w-5 h-5 text-primary" />
                <h4 className="font-semibold">Linux</h4>
              </div>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>Extract tar.gz file</li>
                <li>Make executable: <code className="px-1 py-0.5 bg-muted rounded text-xs">chmod +x</code></li>
                <li>Run <code className="px-1 py-0.5 bg-muted rounded text-xs">./launch.sh</code></li>
                <li>Or double-click in file manager</li>
              </ol>
              <a 
                href="/downloads/README-Linux.md" 
                target="_blank"
                className="inline-flex items-center gap-2 text-xs text-primary hover:underline"
              >
                <FileText className="w-3 h-3" />
                View full Linux guide
              </a>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-green-500">Why is the app unsigned?</p>
              <p className="text-xs text-muted-foreground">
                Code-signing certificates cost $400-800/year. As an indie developer, I'm launching without signing to keep your subscription affordable. 
                The app is 100% safe - it's the exact same code as the web version, just packaged as a desktop app.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-2 border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Globe className="w-6 h-6 text-primary" />
            <CardTitle>{t('desktopApp.webVersion.title')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            {t('desktopApp.webVersion.description')}
          </p>
          <Button variant="outline" size="lg">
            {t('desktopApp.webVersion.button')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="w-5 h-5" />
            {t('desktopApp.systemRequirements.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h4 className="font-semibold mb-2">Windows</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• {t('desktopApp.systemRequirements.windows.os')}</li>
                <li>• {t('desktopApp.systemRequirements.common.ram')}</li>
                <li>• {t('desktopApp.systemRequirements.common.disk')}</li>
                <li>• {t('desktopApp.systemRequirements.common.internet')}</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">macOS</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• {t('desktopApp.systemRequirements.mac.os')}</li>
                <li>• {t('desktopApp.systemRequirements.common.ram')}</li>
                <li>• {t('desktopApp.systemRequirements.common.disk')}</li>
                <li>• {t('desktopApp.systemRequirements.common.internet')}</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Linux</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• {t('desktopApp.systemRequirements.linux.os')}</li>
                <li>• {t('desktopApp.systemRequirements.common.ram')}</li>
                <li>• {t('desktopApp.systemRequirements.common.disk')}</li>
                <li>• {t('desktopApp.systemRequirements.common.internet')}</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle>{t('desktopApp.faq.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">{t('desktopApp.faq.question1')}</h4>
            <p className="text-sm text-muted-foreground">
              {t('desktopApp.faq.answer1')}
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-2">{t('desktopApp.faq.question2')}</h4>
            <p className="text-sm text-muted-foreground">
              {t('desktopApp.faq.answer2')}
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-2">{t('desktopApp.faq.question3')}</h4>
            <p className="text-sm text-muted-foreground">
              {t('desktopApp.faq.answer3')}
            </p>
          </div>
        </CardContent>
      </Card>
      </div>
    </AppLayout>
  );
}
