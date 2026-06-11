import { useState, useEffect } from "react";
import {
  Download,
  Monitor,
  Zap,
  Shield,
  Cpu,
  HardDrive,
  Globe,
  AlertCircle,
  FileText,
  CheckCircle,
  Smartphone,
  Tablet,
  ExternalLink,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRequireSubscription } from "@/hooks/useRequireAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface DownloadAsset {
  platform: string;
  downloadUrl: string;
  fileName: string;
  fileSize: string;
  buildDate?: string;
  fallbackUrl?: string;
  fallbackName?: string;
  extras?: Array<{ label: string; url: string; name: string; size: string }>;
}

interface ReleaseData {
  available: boolean;
  version?: string;
  publishedAt?: string;
  fetchedAt?: string;
  releasesPageUrl?: string;
  allReleasesUrl?: string;
  desktop?: DownloadAsset[];
  mobile?: DownloadAsset[];
  fallbackUrl?: string;
  message?: string;
}

const GITHUB_ACTIONS_URL = "https://github.com/20lawsobk/maxbooster7.5/actions";

const platformDescriptions: Record<string, string> = {
  Android: "Android 8.0 or later",
  iOS: "iOS 14.0 or later — install via AltStore (free)",
};

export default function DesktopApp() {
  const { t } = useTranslation();
  const {  isLoading } = useRequireSubscription();
  const [releaseData, setReleaseData] = useState<ReleaseData | null>(null);
  const [loadingRelease, setLoadingRelease] = useState(true);
  const [expandedLinux, setExpandedLinux] = useState(false);

  useEffect(() => {
    async function fetchRelease() {
      try {
        const response = await fetch("/api/downloads/latest");
        if (response.ok) {
          const data = await response.json();
          setReleaseData(data);
        } else {
          setReleaseData({
            available: false,
            fallbackUrl: GITHUB_RELEASES_URL,
          });
        }
      } catch {
        setReleaseData({ available: false, fallbackUrl: GITHUB_RELEASES_URL });
      } finally {
        setLoadingRelease(false);
      }
    }
    fetchRelease();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">
            Preparing the desktop experience…
          </p>
        </div>
      </div>
    );
  }

  const features = [
    {
      icon: Globe,
      title: "Full Online Access",
      description:
        "Connect directly to Max Booster servers with your internet connection. All your data syncs in real-time.",
    },
    {
      icon: Zap,
      title: "Native Performance",
      description:
        "Faster processing with direct hardware access. Upload files instantly from your computer.",
    },
    {
      icon: Shield,
      title: "Enhanced Security",
      description:
        "Secure connection to your account with native system integration and encrypted local storage.",
    },
    {
      icon: HardDrive,
      title: "Local File Access",
      description:
        "Browse and upload audio files directly from your computer with native file dialogs.",
    },
    {
      icon: Monitor,
      title: "System Tray",
      description:
        "Quick access from your system tray. Get notifications for distribution updates and analytics.",
    },
    {
      icon: Cpu,
      title: "Desktop Shortcuts",
      description:
        "Keyboard shortcuts, menu bar access, and native OS integration for power users.",
    },
  ];

  const version = releaseData?.version || "latest";

  function renderDownloadButton(asset: DownloadAsset, isMobile = false) {
    const isIos = asset.platform === "iOS";
    return (
      <div className="space-y-3">
        <Button
          className={`w-full ${isMobile ? (isIos ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700") : ""}`}
          size="lg"
          asChild
        >
          <a href={asset.downloadUrl}>
            <Download className="w-4 h-4 mr-2" />
            Download {asset.platform}
          </a>
        </Button>
        <div className="text-center space-y-1">
          <p className="text-xs text-muted-foreground">
            {asset.fileName} &bull; {asset.fileSize}
          </p>
          {asset.buildDate && (
            <p className="text-xs text-muted-foreground">
              Built {asset.buildDate}
            </p>
          )}
          {!isIos && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Downloads as a ZIP — extract to get the installer
            </p>
          )}
        </div>
        {asset.fallbackUrl && (
          <Button variant="ghost" size="sm" className="w-full text-xs" asChild>
            <a href={asset.fallbackUrl}>
              <Download className="w-3 h-3 mr-1" />
              Alt: {asset.fallbackName || "Alternative download"}
            </a>
          </Button>
        )}
        {asset.extras &&
          asset.extras.length > 0 &&
          asset.platform === "Linux" && (
            <div className="space-y-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => setExpandedLinux(!expandedLinux)}
              >
                <ChevronDown
                  className={`w-3 h-3 mr-1 transition-transform ${expandedLinux ? "rotate-180" : ""}`}
                />
                More formats
              </Button>
              {expandedLinux && (
                <div className="space-y-1">
                  {asset.extras.map((extra) => (
                    <Button
                      key={extra.url}
                      variant="outline"
                      size="sm"
                      className="w-full text-xs justify-between"
                      asChild
                    >
                      <a href={extra.url}>
                        <span>{extra.label}</span>
                        <span className="text-muted-foreground">
                          ({extra.size})
                        </span>
                      </a>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}
      </div>
    );
  }

  function renderFallbackButton(platform: string, isMobile = false) {
    const url = releaseData?.allReleasesUrl || GITHUB_ACTIONS_URL;
    return (
      <div className="space-y-3">
        <Button
          className={`w-full ${isMobile ? "bg-green-600 hover:bg-green-700" : ""}`}
          size="lg"
          asChild
        >
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="w-4 h-4 mr-2" />
            Download {platform}
          </a>
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          Opens CI builds page
        </p>
      </div>
    );
  }

  const desktopPlatformNames = ["Windows", "macOS", "Linux"];
  const mobilePlatformNames = ["Android", "iOS"];

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
            Take Max Booster everywhere. Native apps for your computer, phone,
            and tablet - all synced with your account.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">
                Included with your subscription
              </span>
            </div>
            {releaseData?.available && (
              <Badge variant="secondary" className="text-sm px-3 py-1">
                v{version}
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card
                key={feature.title}
                className="border-2 hover:border-primary/50 transition-colors"
              >
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
            <h2 className="text-3xl font-bold text-center">Desktop Apps</h2>
          </div>

          {loadingRelease ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">
                Checking for latest version...
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {desktopPlatformNames.map((platformName) => {
                const asset = releaseData?.desktop?.find(
                  (d) => d.platform === platformName,
                );
                return (
                  <Card key={platformName} className="border-2">
                    <CardHeader className="text-center">
                      <div className="mb-4">
                        <Monitor className="w-16 h-16 mx-auto text-primary" />
                      </div>
                      <CardTitle className="text-2xl">{platformName}</CardTitle>
                      <CardDescription className="text-sm">
                        {t(
                          `desktopApp.requirements.${platformName === "macOS" ? "mac" : platformName.toLowerCase()}`,
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {asset
                        ? renderDownloadButton(asset)
                        : renderFallbackButton(platformName)}
                      <p className="text-xs text-muted-foreground text-center">
                        {t("desktopApp.version")}: {version}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-center gap-3">
            <Smartphone className="w-8 h-8 text-green-500" />
            <h2 className="text-3xl font-bold text-center">Mobile App</h2>
          </div>
          <p className="text-center text-muted-foreground max-w-2xl mx-auto">
            Access Max Booster on your Android or iPhone. Touch-optimized
            interface that adapts to any screen size, fully synced with your
            account.
          </p>

          {loadingRelease ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-green-500" />
              <span className="ml-3 text-muted-foreground">
                Checking for latest version...
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
              {mobilePlatformNames.map((platformName) => {
                const isIos = platformName === "iOS";
                const accentColor = isIos ? "blue" : "green";
                const asset = releaseData?.mobile?.find(
                  (d) => d.platform === platformName,
                );
                return (
                  <Card
                    key={platformName}
                    className={`border-2 hover:border-${accentColor}-500/50 transition-colors`}
                  >
                    <CardHeader className="text-center">
                      <div className="mb-4">
                        <Smartphone
                          className={`w-16 h-16 mx-auto text-${accentColor}-500`}
                        />
                      </div>
                      <CardTitle className="text-2xl">{platformName}</CardTitle>
                      <CardDescription className="text-sm">
                        {platformDescriptions[platformName] || platformName}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {asset ? (
                        renderDownloadButton(asset, true)
                      ) : isIos ? (
                        <div className="space-y-3">
                          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 text-center space-y-2">
                            <p className="text-sm font-medium text-blue-500">
                              Build in progress
                            </p>
                            <p className="text-xs text-muted-foreground">
                              The iOS IPA is built by Codemagic CI and published
                              here automatically after each commit.
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Once available, install free via{" "}
                              <a
                                href="https://altstore.io"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline text-blue-500"
                              >
                                AltStore
                              </a>{" "}
                              or{" "}
                              <a
                                href="https://sideloadly.io"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline text-blue-500"
                              >
                                Sideloadly
                              </a>
                              .
                            </p>
                          </div>
                        </div>
                      ) : (
                        renderFallbackButton(platformName, true)
                      )}
                      <p className="text-xs text-muted-foreground text-center">
                        Version: {version}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <Card className="border-2 border-green-500/20 bg-green-500/5 max-w-2xl mx-auto">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Tablet className="w-6 h-6 text-green-500" />
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold">
                    Same Experience, Every Device
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Our dynamic layout system automatically adapts to your
                    screen size. Whether you're on a phone, tablet, or desktop,
                    you get the full Max Booster experience with an interface
                    optimized for your device.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-center">
          <Button variant="outline" size="lg" asChild>
            <a
              href={releaseData?.allReleasesUrl || GITHUB_ACTIONS_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              View CI Builds on GitHub
            </a>
          </Button>
        </div>

        <Card className="border-2 border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-amber-500" />
              <CardTitle className="text-amber-500">
                Important: First Launch Instructions
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground">
              Max Booster is <strong>unsigned indie software</strong>. Your
              operating system will show a security warning on first launch.
              This is normal and safe - it's the same code as the web version!
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-primary" />
                  <h4 className="font-semibold">Windows</h4>
                </div>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>Run the installer (.exe)</li>
                  <li>Click "More info" on SmartScreen</li>
                  <li>Click "Run anyway"</li>
                  <li>Follow the installation wizard</li>
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
                  <li>Extract the downloaded ZIP file</li>
                  <li>
                    Move <strong>Max Booster.app</strong> to Applications
                  </li>
                  <li>
                    <strong>Right-click</strong> the app, select "Open"
                  </li>
                  <li>Click "Open" in the Gatekeeper dialog</li>
                </ol>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Or run:{" "}
                    <code className="px-1 py-0.5 bg-muted rounded text-xs">
                      xattr -cr /Applications/Max\ Booster.app
                    </code>
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
                  <li>Download the AppImage</li>
                  <li>
                    Make executable:{" "}
                    <code className="px-1 py-0.5 bg-muted rounded text-xs">
                      chmod +x *.AppImage
                    </code>
                  </li>
                  <li>Double-click or run from terminal</li>
                  <li>Or install the .deb package</li>
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

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-blue-500" />
                  <h4 className="font-semibold">iOS (iPhone / iPad)</h4>
                </div>
                <p className="text-xs text-muted-foreground">
                  The IPA is unsigned. Sideload it for free using one of these
                  tools:
                </p>
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Via AltStore (recommended)
                    </p>
                    <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>
                        Install{" "}
                        <a
                          href="https://altstore.io"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline text-blue-500"
                        >
                          AltStore
                        </a>{" "}
                        on your Mac/PC
                      </li>
                      <li>Download the .ipa file above</li>
                      <li>Open AltStore and sideload the IPA</li>
                      <li>
                        Trust the app in Settings → General → VPN & Device
                        Management
                      </li>
                    </ol>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Via Sideloadly
                    </p>
                    <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>
                        Install{" "}
                        <a
                          href="https://sideloadly.io"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline text-blue-500"
                        >
                          Sideloadly
                        </a>
                      </li>
                      <li>Drag the .ipa onto Sideloadly</li>
                      <li>Sign in with your Apple ID (free)</li>
                      <li>Trust in Settings after install</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-green-500">
                  Why is the app unsigned?
                </p>
                <p className="text-xs text-muted-foreground">
                  Code-signing certificates cost $400-800/year. As an indie
                  developer, I'm launching without signing to keep your
                  subscription affordable. The app is 100% safe - it's the exact
                  same code as the web version, just packaged as a desktop app.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Globe className="w-6 h-6 text-primary" />
              <CardTitle>{t("desktopApp.webVersion.title")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              {t("desktopApp.webVersion.description")}
            </p>
            <Button variant="outline" size="lg">
              {t("desktopApp.webVersion.button")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="w-5 h-5" />
              {t("desktopApp.systemRequirements.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h4 className="font-semibold mb-2">Windows</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• {t("desktopApp.systemRequirements.windows.os")}</li>
                  <li>• {t("desktopApp.systemRequirements.common.ram")}</li>
                  <li>• {t("desktopApp.systemRequirements.common.disk")}</li>
                  <li>
                    • {t("desktopApp.systemRequirements.common.internet")}
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">macOS</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• {t("desktopApp.systemRequirements.mac.os")}</li>
                  <li>• {t("desktopApp.systemRequirements.common.ram")}</li>
                  <li>• {t("desktopApp.systemRequirements.common.disk")}</li>
                  <li>
                    • {t("desktopApp.systemRequirements.common.internet")}
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Linux</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• {t("desktopApp.systemRequirements.linux.os")}</li>
                  <li>• {t("desktopApp.systemRequirements.common.ram")}</li>
                  <li>• {t("desktopApp.systemRequirements.common.disk")}</li>
                  <li>
                    • {t("desktopApp.systemRequirements.common.internet")}
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle>{t("desktopApp.faq.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">
                {t("desktopApp.faq.question1")}
              </h4>
              <p className="text-sm text-muted-foreground">
                {t("desktopApp.faq.answer1")}
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">
                {t("desktopApp.faq.question2")}
              </h4>
              <p className="text-sm text-muted-foreground">
                {t("desktopApp.faq.answer2")}
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">
                {t("desktopApp.faq.question3")}
              </h4>
              <p className="text-sm text-muted-foreground">
                {t("desktopApp.faq.answer3")}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
