import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  Cpu,
  Download,
  ExternalLink,
  Globe,
  HardDrive,
  Loader2,
  Monitor,
  Shield,
  Smartphone,
  Tablet,
  Zap,
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
import {
  normalizeReleaseData,
  readReleaseJson,
  type DownloadAsset,
  type ReleaseData,
} from "@/lib/downloadReleaseContracts";
import { useState } from "react";

const GITHUB_ACTIONS_URL = "https://github.com/20lawsobk/maxbooster7.5/actions";
const GITHUB_RELEASES_URL = "https://github.com/20lawsobk/maxbooster7.5/releases";
const ALTSTORE_URL = "https://altstore.io/";
const SIDELOADLY_URL = "https://sideloadly.io/";
const RELEASE_REQUEST_TIMEOUT_MS = 10_000;

const platformDescriptions: Record<string, string> = {
  Android: "Android 8.0 or later",
  iOS: "iOS 14.0 or later — sideload a published IPA with a supported tool",
};

async function fetchReleaseMetadata(): Promise<ReleaseData> {
  const controller = new AbortController();
  const timer = window.setTimeout(
    () => controller.abort(),
    RELEASE_REQUEST_TIMEOUT_MS,
  );
  try {
    const response = await fetch("/api/downloads/latest", {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`The download service returned HTTP ${response.status}.`);
    }
    return normalizeReleaseData(await readReleaseJson(response));
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The download service timed out.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function ExternalAnchor({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  );
}

export default function DesktopAppPageImpl() {
  const { t } = useTranslation();
  const { user, isLoading: authLoading } = useRequireSubscription();
  const [expandedLinux, setExpandedLinux] = useState(false);

  const releaseQuery = useQuery({
    queryKey: ["/api/downloads/latest"],
    enabled: Boolean(user),
    queryFn: fetchReleaseMetadata,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  if (authLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-900"
        role="status"
        aria-label="Preparing desktop downloads"
      >
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Preparing the desktop experience…</p>
        </div>
      </div>
    );
  }
  if (!user) return null;

  const releaseData = releaseQuery.data;
  const releaseError = releaseQuery.error
    ? releaseQuery.error instanceof Error
      ? releaseQuery.error.message
      : "The download service could not be reached."
    : releaseData && !releaseData.available
      ? releaseData.message || "No current release is published."
      : null;
  const version = releaseData?.version || "latest";
  const releasePage = releaseData?.releasesPageUrl || GITHUB_RELEASES_URL;
  const allReleases = releaseData?.allReleasesUrl || GITHUB_RELEASES_URL;

  const features = [
    {
      icon: Globe,
      title: "Full Online Access",
      description:
        "Connect to Max Booster services and keep your account data synchronized while you are online.",
    },
    {
      icon: Zap,
      title: "Native Desktop Shell",
      description:
        "Use Max Booster from a dedicated desktop window with native file-selection and operating-system integration.",
    },
    {
      icon: Shield,
      title: "Account Security",
      description:
        "The desktop app uses the same authenticated Max Booster account and server authorization model as the web app.",
    },
    {
      icon: HardDrive,
      title: "Local File Access",
      description:
        "Choose local audio files through desktop file dialogs when a workflow requires an upload.",
    },
    {
      icon: Monitor,
      title: "Desktop Integration",
      description:
        "Run Max Booster as a dedicated desktop application instead of a browser tab.",
    },
    {
      icon: Cpu,
      title: "Cross-platform Builds",
      description:
        "Published releases can include Windows, macOS, Linux, Android, and iOS artifacts when those builds are available.",
    },
  ];

  const renderDownloadButton = (asset: DownloadAsset, mobile = false) => {
    const isIos = asset.platform === "iOS";
    const primaryClass = mobile
      ? isIos
        ? "bg-blue-600 hover:bg-blue-700"
        : "bg-green-600 hover:bg-green-700"
      : "";
    return (
      <div className="space-y-3">
        <Button className={`w-full ${primaryClass}`} size="lg" asChild>
          <ExternalAnchor href={asset.downloadUrl}>
            <Download className="w-4 h-4 mr-2" />
            Download {asset.platform}
          </ExternalAnchor>
        </Button>
        <div className="text-center space-y-1">
          <p className="text-xs text-muted-foreground">
            {asset.fileName} &bull; {asset.fileSize}
          </p>
          {asset.buildDate && (
            <p className="text-xs text-muted-foreground">Built {asset.buildDate}</p>
          )}
          {asset.fileName.toLowerCase().endsWith(".zip") && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              This download is a ZIP archive — extract it before launching the app.
            </p>
          )}
        </div>
        {asset.fallbackUrl && (
          <Button variant="ghost" size="sm" className="w-full text-xs" asChild>
            <ExternalAnchor href={asset.fallbackUrl}>
              <Download className="w-3 h-3 mr-1" />
              Alt: {asset.fallbackName || "Alternative download"}
            </ExternalAnchor>
          </Button>
        )}
        {asset.platform === "Linux" && asset.extras?.length ? (
          <div className="space-y-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              aria-expanded={expandedLinux}
              onClick={() => setExpandedLinux((current) => !current)}
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
                    <ExternalAnchor href={extra.url}>
                      <span>{extra.label}</span>
                      <span className="text-muted-foreground">({extra.size})</span>
                    </ExternalAnchor>
                  </Button>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  };

  const renderFallbackButton = (platform: string, mobile = false) => (
    <div className="space-y-3">
      <Button
        className={`w-full ${mobile ? "bg-green-600 hover:bg-green-700" : ""}`}
        size="lg"
        asChild
      >
        <ExternalAnchor href={allReleases || GITHUB_ACTIONS_URL}>
          <ExternalLink className="w-4 h-4 mr-2" />
          Check {platform} releases
        </ExternalAnchor>
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        Opens the official Max Booster GitHub releases page
      </p>
    </div>
  );

  const desktopPlatforms = ["Windows", "macOS", "Linux"] as const;
  const mobilePlatforms = ["Android", "iOS"] as const;

  return (
    <AppLayout>
      <main className="container mx-auto p-6 space-y-8">
        <section className="text-center space-y-4">
          <div className="flex items-center justify-center gap-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full">
              <Monitor className="w-8 h-8 text-primary" />
            </div>
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/10 rounded-full">
              <Smartphone className="w-8 h-8 text-green-500" />
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Desktop and Mobile Versions</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Use Max Booster from supported desktop and mobile builds. Published artifacts below are read from the official repository release feed.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Available to your Max Booster account</span>
            </div>
            {releaseData?.available && (
              <Badge variant="secondary" className="text-sm px-3 py-1">v{version}</Badge>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-label="Application features">
          {features.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-2">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-lg">{title}</CardTitle>
              </CardHeader>
              <CardContent><CardDescription>{description}</CardDescription></CardContent>
            </Card>
          ))}
        </section>

        {releaseError && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm" role="alert">
            <span>Current release information is unavailable: {releaseError}</span>
            <Button variant="outline" size="sm" onClick={() => void releaseQuery.refetch()} disabled={releaseQuery.isFetching}>
              {releaseQuery.isFetching ? "Retrying…" : "Retry"}
            </Button>
          </div>
        )}

        <section className="space-y-6" aria-labelledby="desktop-downloads-heading">
          <div className="flex items-center justify-center gap-3">
            <Monitor className="w-8 h-8 text-primary" />
            <h2 id="desktop-downloads-heading" className="text-3xl font-bold">Desktop Apps</h2>
          </div>
          {releaseQuery.isLoading ? (
            <div className="flex items-center justify-center py-12" role="status">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">Checking for the latest release…</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {desktopPlatforms.map((platform) => {
                const asset = releaseData?.desktop?.find((item) => item.platform === platform);
                return (
                  <Card key={platform} className="border-2">
                    <CardHeader className="text-center">
                      <Monitor className="w-16 h-16 mx-auto text-primary mb-4" />
                      <CardTitle className="text-2xl">{platform}</CardTitle>
                      <CardDescription>
                        {t(`desktopApp.requirements.${platform === "macOS" ? "mac" : platform.toLowerCase()}`)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {asset ? renderDownloadButton(asset) : renderFallbackButton(platform)}
                      <p className="text-xs text-muted-foreground text-center">{t("desktopApp.version")}: {version}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-6" aria-labelledby="mobile-downloads-heading">
          <div className="flex items-center justify-center gap-3">
            <Smartphone className="w-8 h-8 text-green-500" />
            <h2 id="mobile-downloads-heading" className="text-3xl font-bold">Mobile Apps</h2>
          </div>
          <p className="text-center text-muted-foreground max-w-2xl mx-auto">
            Mobile releases appear here only when a corresponding APK or IPA is actually published in the official release.
          </p>
          {releaseQuery.isLoading ? (
            <div className="flex items-center justify-center py-12" role="status">
              <Loader2 className="w-8 h-8 animate-spin text-green-500" />
              <span className="ml-3 text-muted-foreground">Checking for the latest release…</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
              {mobilePlatforms.map((platform) => {
                const isIos = platform === "iOS";
                const asset = releaseData?.mobile?.find((item) => item.platform === platform);
                const cardClass = isIos
                  ? "border-2 hover:border-blue-500/50 transition-colors"
                  : "border-2 hover:border-green-500/50 transition-colors";
                const iconClass = isIos
                  ? "w-16 h-16 mx-auto text-blue-500"
                  : "w-16 h-16 mx-auto text-green-500";
                return (
                  <Card key={platform} className={cardClass}>
                    <CardHeader className="text-center">
                      <Smartphone className={iconClass} />
                      <CardTitle className="text-2xl">{platform}</CardTitle>
                      <CardDescription>{platformDescriptions[platform]}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {asset ? (
                        renderDownloadButton(asset, true)
                      ) : isIos ? (
                        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 text-center space-y-2">
                          <p className="text-sm font-medium text-blue-500">No iOS build is currently published</p>
                          <p className="text-xs text-muted-foreground">Check the official release page for a future IPA. If one is published, follow the sideloading tool’s current instructions.</p>
                          <p className="text-xs text-muted-foreground">
                            Tools: <ExternalAnchor href={ALTSTORE_URL} className="underline text-blue-500">AltStore</ExternalAnchor>{" "}or{" "}<ExternalAnchor href={SIDELOADLY_URL} className="underline text-blue-500">Sideloadly</ExternalAnchor>.
                          </p>
                        </div>
                      ) : (
                        renderFallbackButton(platform, true)
                      )}
                      <p className="text-xs text-muted-foreground text-center">Version: {version}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <Card className="border-2 border-green-500/20 bg-green-500/5 max-w-2xl mx-auto">
            <CardContent className="p-6 flex items-start gap-4">
              <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center shrink-0">
                <Tablet className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <h3 className="font-semibold">Same account across devices</h3>
                <p className="text-sm text-muted-foreground mt-1">When a native build is available, it connects to the same Max Booster account and server-side data as the web application.</p>
              </div>
            </CardContent>
          </Card>
        </section>

        <div className="flex justify-center">
          <Button variant="outline" size="lg" asChild>
            <ExternalAnchor href={allReleases}>
              <ExternalLink className="w-4 h-4 mr-2" />View releases on GitHub
            </ExternalAnchor>
          </Button>
        </div>

        <Card className="border-2 border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-amber-500" />
              <CardTitle className="text-amber-600 dark:text-amber-400">First-launch security guidance</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground">
              Some current Max Booster desktop/mobile artifacts are unsigned. An unsigned build is not authenticated by an operating-system publisher certificate, so your device may warn before launch. Only use artifacts linked from the official repository release page, and do not bypass a warning for a file obtained elsewhere.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <h3 className="font-semibold mb-2">Windows</h3>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>Download from the official release linked above.</li>
                  <li>Confirm the file name matches the published release.</li>
                  <li>Review any SmartScreen warning before choosing to continue.</li>
                  <li>Stop if the file source or publisher details are unexpected.</li>
                </ol>
              </div>
              <div>
                <h3 className="font-semibold mb-2">macOS</h3>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>Open the published DMG, or extract the ZIP build if that is the available format.</li>
                  <li>Move Max Booster to Applications when appropriate.</li>
                  <li>Use Finder’s Open action to review Gatekeeper details.</li>
                  <li>Do not remove quarantine attributes unless you have independently verified the artifact source.</li>
                </ol>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Linux</h3>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>Choose the published AppImage, DEB, or archive format.</li>
                  <li>Make an AppImage executable only after verifying its source.</li>
                  <li>Install packages using your distribution’s normal tools.</li>
                  <li>Keep the downloaded release metadata for troubleshooting.</li>
                </ol>
              </div>
              <div>
                <h3 className="font-semibold mb-2">iOS</h3>
                <p className="text-sm text-muted-foreground">
                  If an IPA is published, follow the current instructions from your chosen sideloading tool. Apple account requirements and re-signing intervals can vary by signing method.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-700 dark:text-green-400">Verify the source, not a blanket safety claim</p>
                <p className="text-xs text-muted-foreground mt-1">This page only renders download URLs that match approved GitHub release hosts. Operating-system warnings still deserve review, especially for unsigned artifacts.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-primary/20 bg-primary/5">
          <CardHeader><CardTitle className="flex items-center gap-2"><Globe className="w-6 h-6 text-primary" />{t("desktopApp.webVersion.title")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{t("desktopApp.webVersion.description")}</p>
            <Button variant="outline" size="lg" asChild><a href="/dashboard">{t("desktopApp.webVersion.button")}</a></Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><HardDrive className="w-5 h-5" />{t("desktopApp.systemRequirements.title")}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {["windows", "mac", "linux"].map((platform) => (
                <div key={platform}>
                  <h3 className="font-semibold mb-2">{platform === "mac" ? "macOS" : platform[0].toUpperCase() + platform.slice(1)}</h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• {t(`desktopApp.systemRequirements.${platform}.os`)}</li>
                    <li>• {t("desktopApp.systemRequirements.common.ram")}</li>
                    <li>• {t("desktopApp.systemRequirements.common.disk")}</li>
                    <li>• {t("desktopApp.systemRequirements.common.internet")}</li>
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/50">
          <CardHeader><CardTitle>{t("desktopApp.faq.title")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((number) => (
              <div key={number}>
                <h3 className="font-semibold mb-2">{t(`desktopApp.faq.question${number}`)}</h3>
                <p className="text-sm text-muted-foreground">{t(`desktopApp.faq.answer${number}`)}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Release metadata last checked: {releaseData?.fetchedAt ? new Date(releaseData.fetchedAt).toLocaleString() : "not available"}. Official release page: <ExternalAnchor href={releasePage} className="underline">GitHub</ExternalAnchor>.
        </p>
      </main>
    </AppLayout>
  );
}
