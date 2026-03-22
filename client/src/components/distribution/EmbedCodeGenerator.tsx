import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Copy,
  Check,
  ExternalLink,
  Download,
  QrCode,
  Code2,
  Music,
  Play,
  Link2,
  Monitor,
  Smartphone,
  Palette,
  LayoutGrid,
  ChevronRight,
  Layers,
  Globe,
  AlertCircle,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import QRCode from 'qrcode';

interface Release {
  id: string;
  title: string;
  artistName: string;
  status: string;
  upcCode?: string;
  hyperFollowUrl?: string;
  albumArt?: string;
}

type CopiedKey = string | null;

function useCopy(): [CopiedKey, (key: string, text: string) => void] {
  const { toast } = useToast();
  const [copied, setCopied] = useState<CopiedKey>(null);

  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      toast({ title: 'Copied to clipboard' });
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return [copied, copy];
}

function CodeBlock({
  code,
  copyKey,
  onCopy,
  copied,
}: {
  code: string;
  copyKey: string;
  onCopy: (key: string, text: string) => void;
  copied: CopiedKey;
}) {
  return (
    <div className="relative group">
      <pre className="bg-gray-950 text-green-400 text-xs rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed border border-gray-800">
        {code}
      </pre>
      <Button
        size="sm"
        variant="secondary"
        className="absolute top-2 right-2 h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onCopy(copyKey, code)}
      >
        {copied === copyKey ? (
          <Check className="h-3 w-3 text-green-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}

function QRCodePanel({ url, label }: { url: string; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    if (!url) return;
    QRCode.toCanvas(
      canvasRef.current,
      url,
      {
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      },
      () => {
        if (canvasRef.current) {
          setDataUrl(canvasRef.current.toDataURL('image/png'));
        }
      }
    );
  }, [url]);

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `qr-${label.toLowerCase().replace(/\s+/g, '-')}.png`;
    a.click();
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="p-3 bg-white rounded-xl shadow-sm border">
        <canvas ref={canvasRef} className="block" />
      </div>
      <p className="text-xs text-muted-foreground text-center max-w-[200px] truncate">{url}</p>
      <Button size="sm" variant="outline" onClick={handleDownload} disabled={!dataUrl}>
        <Download className="h-3 w-3 mr-1" />
        Download PNG
      </Button>
    </div>
  );
}

function PlayerPreview({
  type,
  color,
  showTracklist,
  title,
  artist,
  artwork,
}: {
  type: 'full' | 'mini' | 'artwork';
  color: string;
  showTracklist: boolean;
  title: string;
  artist: string;
  artwork?: string;
}) {
  const bg = artwork
    ? `url(${artwork})`
    : `linear-gradient(135deg, ${color}33 0%, ${color}11 100%)`;

  if (type === 'artwork') {
    return (
      <div className="relative w-48 h-48 rounded-xl overflow-hidden shadow-lg mx-auto">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ background: bg }}
        />
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg"
            style={{ backgroundColor: color }}
          >
            <Play className="h-6 w-6 text-white ml-1" fill="white" />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60">
          <p className="text-white text-xs font-semibold truncate">{title || 'Track Title'}</p>
          <p className="text-white/70 text-xs truncate">{artist || 'Artist Name'}</p>
        </div>
      </div>
    );
  }

  if (type === 'mini') {
    return (
      <div className="w-full max-w-sm mx-auto rounded-lg border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 p-3">
          <div
            className="w-10 h-10 rounded-md flex-shrink-0 flex items-center justify-center"
            style={{ background: bg, backgroundColor: `${color}22` }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{title || 'Track Title'}</p>
            <p className="text-xs text-muted-foreground truncate">{artist || 'Artist Name'}</p>
          </div>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: color }}
          >
            <Play className="h-3 w-3 text-white ml-0.5" fill="white" />
          </div>
        </div>
        <div className="h-1 bg-muted mx-3 mb-3 rounded-full overflow-hidden">
          <div className="h-full w-1/3 rounded-full" style={{ backgroundColor: color }} />
        </div>
      </div>
    );
  }

  // full
  return (
    <div className="w-full max-w-sm mx-auto rounded-xl border bg-card shadow-md overflow-hidden">
      <div
        className="h-48 flex items-center justify-center"
        style={{ background: bg, backgroundColor: `${color}22` }}
      >
        {artwork ? (
          <img src={artwork} className="h-full w-full object-cover" alt="artwork" />
        ) : (
          <Music className="h-16 w-16 text-muted-foreground/30" />
        )}
      </div>
      <div className="p-4 space-y-3">
        <div>
          <p className="font-semibold text-sm">{title || 'Track Title'}</p>
          <p className="text-xs text-muted-foreground">{artist || 'Artist Name'}</p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: color }}
          >
            <Play className="h-4 w-4 text-white ml-0.5" fill="white" />
          </div>
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full w-1/4 rounded-full" style={{ backgroundColor: color }} />
          </div>
          <span className="text-xs text-muted-foreground">3:24</span>
        </div>
        {showTracklist && (
          <div className="border-t pt-2 space-y-1.5">
            {['Track 1', 'Track 2', 'Track 3'].map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-4">{i + 1}</span>
                <span className={i === 0 ? 'font-medium' : 'text-muted-foreground'}>{t}</span>
                <span className="ml-auto text-muted-foreground">3:2{i}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SmartLinkButtonPreview({
  text,
  style,
  color,
  size,
}: {
  text: string;
  style: 'button' | 'text' | 'icon';
  color: string;
  size: 'small' | 'medium' | 'large';
}) {
  const sizes = { small: 'text-xs px-3 py-1.5', medium: 'text-sm px-5 py-2.5', large: 'text-base px-8 py-3.5' };
  const cls = sizes[size];

  if (style === 'text') {
    return (
      <span className={`${cls} font-medium underline cursor-pointer`} style={{ color }}>
        {text || 'Listen Now'}
      </span>
    );
  }
  if (style === 'icon') {
    return (
      <div className="flex items-center gap-2 cursor-pointer" style={{ color }}>
        <Play className="h-5 w-5" fill="currentColor" />
        <span className={`${cls.replace(/px-\d+/, '').replace(/py-\d+/, '')} font-medium`}>
          {text || 'Listen Now'}
        </span>
      </div>
    );
  }
  return (
    <button
      className={`${cls} rounded-full font-semibold text-white shadow-md transition-opacity hover:opacity-90`}
      style={{ backgroundColor: color }}
    >
      {text || 'Listen Now'}
    </button>
  );
}

export function EmbedCodeGenerator() {
  const { toast } = useToast();
  const [copied, copy] = useCopy();

  const [selectedReleaseId, setSelectedReleaseId] = useState<string>('');

  // Smart link params
  const [slText, setSlText] = useState('Listen Now');
  const [slStyle, setSlStyle] = useState<'button' | 'text' | 'icon'>('button');
  const [slColor, setSlColor] = useState('#6366f1');
  const [slSize, setSlSize] = useState<'small' | 'medium' | 'large'>('medium');

  // Release widget params
  const [rwTheme, setRwTheme] = useState<'light' | 'dark' | 'auto'>('auto');
  const [rwSize, setRwSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [rwShowTitle, setRwShowTitle] = useState(true);
  const [rwShowArtist, setRwShowArtist] = useState(true);
  const [rwShowArtwork, setRwShowArtwork] = useState(true);

  // Player params
  const [plType, setPlType] = useState<'full' | 'mini' | 'artwork'>('full');
  const [plAutoplay, setPlAutoplay] = useState(false);
  const [plShowTracklist, setPlShowTracklist] = useState(true);
  const [plColor, setPlColor] = useState('#6366f1');

  const { data: releases = [] } = useQuery<Release[]>({
    queryKey: ['/api/distribution/releases'],
  });

  const selectedRelease = releases.find((r) => r.id === selectedReleaseId);
  const releaseId = selectedRelease?.id || 'YOUR_RELEASE_ID';
  const upcCode = selectedRelease?.upcCode || 'YOUR_UPC';
  const title = selectedRelease?.title || 'Your Release';
  const artist = selectedRelease?.artistName || 'Your Artist';

  // Smart link URL — use the release's hyperFollowUrl if available, else build lnk.to
  const slug = selectedRelease?.title
    ? selectedRelease.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    : 'your-release';
  const smartLinkUrl = selectedRelease?.hyperFollowUrl || `https://lnk.to/${slug}`;

  // Heights for iframes
  const iframeHeights: Record<string, number> = {
    'rw-small': 150,
    'rw-medium': 240,
    'rw-large': 340,
    'pl-full': 420,
    'pl-mini': 90,
    'pl-artwork': 220,
  };

  // Shortcodes
  const shortcodeSmartLink = [
    `[labelgrid_smartlink`,
    `  url="${smartLinkUrl}"`,
    `  text="${slText}"`,
    `  style="${slStyle}"`,
    `  color="${slColor}"`,
    `  size="${slSize}"`,
    `]`,
  ].join('\n');

  const shortcodeRelease = [
    `[labelgrid_release`,
    `  id="${releaseId}"`,
    `  theme="${rwTheme}"`,
    `  size="${rwSize}"`,
    `  show_title="${rwShowTitle ? 'yes' : 'no'}"`,
    `  show_artist="${rwShowArtist ? 'yes' : 'no'}"`,
    `  show_artwork="${rwShowArtwork ? 'yes' : 'no'}"`,
    `]`,
  ].join('\n');

  const shortcodePlayer = [
    `[labelgrid_player`,
    `  id="${releaseId}"`,
    `  type="${plType}"`,
    `  autoplay="${plAutoplay ? 'yes' : 'no'}"`,
    `  show_tracklist="${plShowTracklist ? 'yes' : 'no'}"`,
    `  color="${plColor}"`,
    `]`,
  ].join('\n');

  // HTML iframes
  const iframeRelease = `<iframe
  src="https://player.labelgrid.com/release/${releaseId}?theme=${rwTheme}&size=${rwSize}&show_title=${rwShowTitle ? 1 : 0}&show_artist=${rwShowArtist ? 1 : 0}&show_artwork=${rwShowArtwork ? 1 : 0}"
  width="100%"
  height="${iframeHeights[`rw-${rwSize}`]}"
  frameborder="0"
  scrolling="no"
  allow="autoplay"
  style="border-radius:12px;overflow:hidden;">
</iframe>`;

  const iframePlayer = `<iframe
  src="https://player.labelgrid.com/player/${releaseId}?type=${plType}&autoplay=${plAutoplay ? 1 : 0}&show_tracklist=${plShowTracklist ? 1 : 0}&color=${encodeURIComponent(plColor)}"
  width="100%"
  height="${iframeHeights[`pl-${plType}`]}"
  frameborder="0"
  scrolling="no"
  allow="autoplay"
  style="border-radius:12px;overflow:hidden;">
</iframe>`;

  const htmlSmartLinkButton = `<a
  href="${smartLinkUrl}"
  target="_blank"
  rel="noopener noreferrer"
  style="display:inline-block;background-color:${slColor};color:#fff;font-family:sans-serif;font-size:${slSize === 'small' ? '13px' : slSize === 'large' ? '17px' : '15px'};font-weight:600;padding:${slSize === 'small' ? '8px 16px' : slSize === 'large' ? '14px 32px' : '11px 22px'};border-radius:9999px;text-decoration:none;">
  ${slText}
</a>`;

  const noReleaseSelected = !selectedReleaseId;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Share & Embed</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            Generate smart links, WordPress shortcodes, HTML embed codes, and QR codes for your releases
          </p>
        </div>
        {smartLinkUrl && selectedRelease && (
          <Button variant="outline" size="sm" asChild>
            <a href={smartLinkUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Smart Link
            </a>
          </Button>
        )}
      </div>

      {/* Release Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 min-w-fit">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <Label className="font-medium whitespace-nowrap">Select a release</Label>
            </div>
            <Select value={selectedReleaseId} onValueChange={setSelectedReleaseId}>
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Choose a release to generate embed codes…" />
              </SelectTrigger>
              <SelectContent>
                {releases.length === 0 ? (
                  <SelectItem value="__none" disabled>No releases found</SelectItem>
                ) : (
                  releases.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{r.title}</span>
                        <span className="text-muted-foreground text-xs">— {r.artistName}</span>
                        <Badge variant="outline" className="text-xs capitalize ml-1">{r.status}</Badge>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {selectedRelease && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground ml-auto">
                <span>ID:</span>
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{releaseId.slice(0, 12)}…</code>
                {upcCode && upcCode !== 'YOUR_UPC' && (
                  <>
                    <span>UPC:</span>
                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{upcCode}</code>
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {noReleaseSelected && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-dashed text-muted-foreground">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <p className="text-sm">Select a release above to generate personalized embed codes and links.</p>
        </div>
      )}

      {/* Main Tabs */}
      <Tabs defaultValue="smartlink">
        <TabsList className="w-full justify-start bg-muted/50 overflow-x-auto">
          <TabsTrigger value="smartlink" className="gap-1.5">
            <Link2 className="h-3.5 w-3.5" />
            Smart Link
          </TabsTrigger>
          <TabsTrigger value="release-widget" className="gap-1.5">
            <LayoutGrid className="h-3.5 w-3.5" />
            Release Widget
          </TabsTrigger>
          <TabsTrigger value="player" className="gap-1.5">
            <Play className="h-3.5 w-3.5" />
            Player
          </TabsTrigger>
          <TabsTrigger value="all-codes" className="gap-1.5">
            <Code2 className="h-3.5 w-3.5" />
            All Codes
          </TabsTrigger>
        </TabsList>

        {/* ── SMART LINK TAB ─────────────────────────────────── */}
        <TabsContent value="smartlink" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left – Controls */}
            <div className="space-y-5">
              {/* Smart Link URL */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Globe className="h-4 w-4 text-blue-500" />
                    Smart Link URL
                  </CardTitle>
                  <CardDescription className="text-xs">
                    One link that routes fans to their preferred streaming platform
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      value={smartLinkUrl}
                      readOnly
                      className="font-mono text-xs bg-muted"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => copy('smart-url', smartLinkUrl)}
                    >
                      {copied === 'smart-url' ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={smartLinkUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                  {!selectedRelease && (
                    <p className="text-xs text-muted-foreground">
                      Select a release to get its actual smart link URL.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Button Customization */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Palette className="h-4 w-4 text-purple-500" />
                    Button Customization
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Button Text</Label>
                    <Input
                      value={slText}
                      onChange={(e) => setSlText(e.target.value)}
                      placeholder="Listen Now"
                      className="text-sm h-8"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Style</Label>
                      <Select value={slStyle} onValueChange={(v) => setSlStyle(v as any)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="button">Button</SelectItem>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="icon">Icon</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Size</Label>
                      <Select value={slSize} onValueChange={(v) => setSlSize(v as any)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="small">Small</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="large">Large</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Color</Label>
                      <div className="flex items-center gap-1.5 h-8">
                        <input
                          type="color"
                          value={slColor}
                          onChange={(e) => setSlColor(e.target.value)}
                          className="h-8 w-8 rounded cursor-pointer border border-input p-0.5"
                        />
                        <Input
                          value={slColor}
                          onChange={(e) => setSlColor(e.target.value)}
                          className="text-xs h-8 font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Generated Codes */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">WordPress Shortcode</Label>
                  <CodeBlock code={shortcodeSmartLink} copyKey="sl-shortcode" onCopy={copy} copied={copied} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">HTML Button</Label>
                  <CodeBlock code={htmlSmartLinkButton} copyKey="sl-html" onCopy={copy} copied={copied} />
                </div>
              </div>
            </div>

            {/* Right – Preview + QR */}
            <div className="space-y-5">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Button Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="min-h-[80px] flex items-center justify-center rounded-lg bg-muted/40 border border-dashed">
                    <SmartLinkButtonPreview
                      text={slText}
                      style={slStyle}
                      color={slColor}
                      size={slSize}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 text-center">Live preview — adjust controls on the left</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <QrCode className="h-4 w-4 text-violet-500" />
                    QR Code
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Print on flyers, merch, and show posters — fans scan to stream instantly
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center py-2">
                  <QRCodePanel url={smartLinkUrl} label={title} />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── RELEASE WIDGET TAB ────────────────────────────── */}
        <TabsContent value="release-widget" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Controls */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Widget Options</CardTitle>
                  <CardDescription className="text-xs">
                    Customise how the release card looks on your website
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Theme</Label>
                      <Select value={rwTheme} onValueChange={(v) => setRwTheme(v as any)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto (system)</SelectItem>
                          <SelectItem value="light">Light</SelectItem>
                          <SelectItem value="dark">Dark</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Size</Label>
                      <Select value={rwSize} onValueChange={(v) => setRwSize(v as any)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="small">Small</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="large">Large</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    {[
                      { label: 'Show title', value: rwShowTitle, setter: setRwShowTitle },
                      { label: 'Show artist name', value: rwShowArtist, setter: setRwShowArtist },
                      { label: 'Show artwork', value: rwShowArtwork, setter: setRwShowArtwork },
                    ].map(({ label, value, setter }) => (
                      <div key={label} className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">{label}</Label>
                        <Switch checked={value} onCheckedChange={setter} />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">WordPress Shortcode</Label>
                  <CodeBlock code={shortcodeRelease} copyKey="rw-shortcode" onCopy={copy} copied={copied} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">HTML iframe</Label>
                  <CodeBlock code={iframeRelease} copyKey="rw-iframe" onCopy={copy} copied={copied} />
                </div>
              </div>
            </div>

            {/* Preview */}
            <div>
              <Card className="h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Widget Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className={`rounded-xl border p-4 ${rwTheme === 'dark' ? 'bg-gray-900 border-gray-700' : rwTheme === 'light' ? 'bg-white border-gray-200' : 'bg-card border-border'}`}
                  >
                    <div className={`flex gap-3 items-center ${rwSize === 'small' ? 'flex-row' : 'flex-col text-center'}`}>
                      {rwShowArtwork && (
                        <div
                          className={`rounded-lg bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center flex-shrink-0
                          ${rwSize === 'small' ? 'w-12 h-12' : rwSize === 'medium' ? 'w-24 h-24' : 'w-36 h-36'}`}
                        >
                          {selectedRelease?.albumArt ? (
                            <img src={selectedRelease.albumArt} className="w-full h-full object-cover rounded-lg" alt="" />
                          ) : (
                            <Music className="h-6 w-6 text-white/60" />
                          )}
                        </div>
                      )}
                      <div className={`${rwSize !== 'small' ? 'space-y-1' : ''}`}>
                        {rwShowTitle && (
                          <p className={`font-semibold ${rwSize === 'small' ? 'text-sm' : rwSize === 'medium' ? 'text-base' : 'text-lg'} ${rwTheme === 'dark' ? 'text-white' : ''}`}>
                            {title}
                          </p>
                        )}
                        {rwShowArtist && (
                          <p className={`${rwSize === 'small' ? 'text-xs' : 'text-sm'} ${rwTheme === 'dark' ? 'text-gray-400' : 'text-muted-foreground'}`}>
                            {artist}
                          </p>
                        )}
                        <div className="flex gap-2 mt-2 flex-wrap justify-center">
                          {['Spotify', 'Apple Music', 'YouTube'].map((p) => (
                            <span key={p} className={`text-xs px-2 py-0.5 rounded-full border ${rwTheme === 'dark' ? 'border-gray-600 text-gray-300' : 'border-border text-muted-foreground'}`}>{p}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 text-center">Approximate preview — actual widget may vary</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── PLAYER TAB ────────────────────────────────────── */}
        <TabsContent value="player" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Controls */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Player Options</CardTitle>
                  <CardDescription className="text-xs">
                    Choose how the music player appears on your website
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Player Type</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['full', 'mini', 'artwork'] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setPlType(t)}
                          className={`p-3 rounded-lg border text-center transition-all ${plType === t ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-muted-foreground/50'}`}
                        >
                          <div className="flex justify-center mb-1">
                            {t === 'full' ? <Maximize2 className="h-4 w-4" /> : t === 'mini' ? <Minimize2 className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                          </div>
                          <span className="text-xs font-medium capitalize">{t}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {plType === 'full' ? 'Full player with artwork, controls, and optional tracklist' :
                       plType === 'mini' ? 'Compact single-row player — great for sidebars' :
                       'Artwork-only with play button overlay — ideal for visual layouts'}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Accent Color</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={plColor}
                        onChange={(e) => setPlColor(e.target.value)}
                        className="h-8 w-8 rounded cursor-pointer border border-input p-0.5"
                      />
                      <Input
                        value={plColor}
                        onChange={(e) => setPlColor(e.target.value)}
                        className="text-xs h-8 font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {[
                      { label: 'Autoplay', value: plAutoplay, setter: setPlAutoplay, desc: 'Starts playing immediately (may be blocked by browsers)' },
                      { label: 'Show Tracklist', value: plShowTracklist, setter: setPlShowTracklist, desc: 'Display track listing below the player', hide: plType !== 'full' },
                    ].filter(item => !item.hide).map(({ label, value, setter, desc }) => (
                      <div key={label}>
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">{label}</Label>
                          <Switch checked={value} onCheckedChange={setter} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">WordPress Shortcode</Label>
                  <CodeBlock code={shortcodePlayer} copyKey="pl-shortcode" onCopy={copy} copied={copied} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">HTML iframe</Label>
                  <CodeBlock code={iframePlayer} copyKey="pl-iframe" onCopy={copy} copied={copied} />
                </div>
              </div>
            </div>

            {/* Preview */}
            <div>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Player Preview</CardTitle>
                  <CardDescription className="text-xs">
                    Adjust the options on the left to see changes live
                  </CardDescription>
                </CardHeader>
                <CardContent className="py-4">
                  <PlayerPreview
                    type={plType}
                    color={plColor}
                    showTracklist={plShowTracklist}
                    title={title}
                    artist={artist}
                    artwork={selectedRelease?.albumArt}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── ALL CODES TAB ─────────────────────────────────── */}
        <TabsContent value="all-codes" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* WordPress column */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-blue-500" />
                <h3 className="font-semibold text-sm">WordPress Shortcodes</h3>
                <Badge variant="outline" className="text-xs">Copy & paste into any WP post/page</Badge>
              </div>

              {[
                { label: 'Smart Link Button', code: shortcodeSmartLink, key: 'all-sl' },
                { label: 'Release Widget', code: shortcodeRelease, key: 'all-rw' },
                { label: 'Music Player', code: shortcodePlayer, key: 'all-pl' },
              ].map(({ label, code, key }) => (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs"
                      onClick={() => copy(key, code)}
                    >
                      {copied === key ? <Check className="h-3 w-3 text-green-500 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                      Copy
                    </Button>
                  </div>
                  <CodeBlock code={code} copyKey={`${key}-block`} onCopy={copy} copied={copied} />
                </div>
              ))}
            </div>

            {/* HTML column */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-green-500" />
                <h3 className="font-semibold text-sm">HTML Embed Codes</h3>
                <Badge variant="outline" className="text-xs">Any website or CMS</Badge>
              </div>

              {[
                { label: 'Smart Link Button', code: htmlSmartLinkButton, key: 'html-sl' },
                { label: 'Release iframe', code: iframeRelease, key: 'html-rw' },
                { label: 'Player iframe', code: iframePlayer, key: 'html-pl' },
              ].map(({ label, code, key }) => (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs"
                      onClick={() => copy(key, code)}
                    >
                      {copied === key ? <Check className="h-3 w-3 text-green-500 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                      Copy
                    </Button>
                  </div>
                  <CodeBlock code={code} copyKey={`${key}-block`} onCopy={copy} copied={copied} />
                </div>
              ))}

              {/* QR at bottom of all codes */}
              <div className="space-y-1.5 pt-2 border-t">
                <Label className="text-xs text-muted-foreground">Smart Link QR Code</Label>
                <div className="flex justify-center pt-2">
                  <QRCodePanel url={smartLinkUrl} label={title} />
                </div>
              </div>
            </div>
          </div>

          {/* Quick tips */}
          <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
            <CardContent className="p-4">
              <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">Tips for embedding on your website</h4>
              <ul className="text-xs text-blue-800 dark:text-blue-400 space-y-1.5 list-disc list-inside">
                <li><strong>WordPress users:</strong> Install the LabelGrid plugin, then paste shortcodes directly into any block or Classic editor post.</li>
                <li><strong>Non-WordPress sites:</strong> Paste the HTML iframe code anywhere in your page's HTML — works with Squarespace, Wix, Webflow, and more.</li>
                <li><strong>Smart link buttons:</strong> Add the HTML button code to your email signature, EPK, or anywhere fans click to stream.</li>
                <li><strong>QR codes:</strong> Download and add to flyers, album artwork, merchandise, or show posters.</li>
                <li><strong>Autoplay:</strong> Most mobile browsers block autoplay by default — leave it off for the best fan experience.</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
