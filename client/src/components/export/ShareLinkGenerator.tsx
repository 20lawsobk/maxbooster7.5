import { useState, useCallback, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Link2,
  Copy,
  Check,
  Lock,
  Unlock,
  Clock,
  Calendar as CalendarIcon,
  Download,
  Eye,
  EyeOff,
  Trash2,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Users,
  Shield,
  Mail,
  Share2,
  Loader2,
  QrCode,
  Link,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

export interface ShareLink {
  id: string;
  url: string;
  shortCode: string;
  name: string;
  resourceType: 'audio' | 'project' | 'stems' | 'analytics' | 'document';
  resourceId: string;
  createdAt: Date;
  expiresAt?: Date;
  isPasswordProtected: boolean;
  password?: string;
  maxDownloads?: number;
  downloadCount: number;
  viewCount: number;
  isActive: boolean;
  createdBy: string;
  lastAccessedAt?: Date;
  allowedEmails?: string[];
  requiresEmail?: boolean;
}

interface ShareLinkGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceType: 'audio' | 'project' | 'stems' | 'analytics' | 'document';
  resourceId: string;
  resourceName: string;
  onLinkCreated?: (link: ShareLink) => void;
}

interface ShareLinkListProps {
  links: ShareLink[];
  onRevoke: (id: string) => void;
  onCopyLink: (url: string) => void;
  onUpdateLink?: (id: string, updates: Partial<ShareLink>) => void;
  className?: string;
}

const EXPIRATION_OPTIONS = [
  { value: 'never', label: 'Never expires' },
  { value: '1h', label: '1 hour' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'custom', label: 'Custom date' },
];

const DOWNLOAD_LIMIT_OPTIONS = [
  { value: 0, label: 'Unlimited' },
  { value: 1, label: '1 download' },
  { value: 5, label: '5 downloads' },
  { value: 10, label: '10 downloads' },
  { value: 25, label: '25 downloads' },
  { value: 50, label: '50 downloads' },
  { value: 100, label: '100 downloads' },
];

export function ShareLinkGenerator({
  open,
  onOpenChange,
  resourceType,
  resourceId,
  resourceName,
  onLinkCreated,
}: ShareLinkGeneratorProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<ShareLink | null>(null);
  
  const [expiration, setExpiration] = useState('7d');
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  const [enablePassword, setEnablePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [downloadLimit, setDownloadLimit] = useState(0);
  const [requireEmail, setRequireEmail] = useState(false);
  const [allowedEmails, setAllowedEmails] = useState('');

  useEffect(() => {
    if (open) {
      setGeneratedLink(null);
      setCopied(false);
      setExpiration('7d');
      setEnablePassword(false);
      setPassword('');
      setDownloadLimit(0);
      setRequireEmail(false);
      setAllowedEmails('');
    }
  }, [open]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      let expiresAt: Date | null = null;
      
      if (expiration !== 'never') {
        if (expiration === 'custom' && customDate) {
          expiresAt = customDate;
        } else {
          const now = new Date();
          const durations: Record<string, number> = {
            '1h': 60 * 60 * 1000,
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000,
            '90d': 90 * 24 * 60 * 60 * 1000,
          };
          expiresAt = new Date(now.getTime() + (durations[expiration] || 0));
        }
      }

      const emails = allowedEmails
        .split(',')
        .map(e => e.trim())
        .filter(e => e.length > 0);

      const response = await apiRequest('POST', '/api/export/share-links', {
        resourceType,
        resourceId,
        name: resourceName,
        expiresAt,
        password: enablePassword ? password : null,
        maxDownloads: downloadLimit || null,
        requiresEmail: requireEmail,
        allowedEmails: emails.length > 0 ? emails : null,
      });
      
      return response.json();
    },
    onSuccess: (data: ShareLink) => {
      setGeneratedLink(data);
      onLinkCreated?.(data);
      toast({
        title: 'Link Created',
        description: 'Your shareable link has been generated',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to Create Link',
        description: error.message || 'An error occurred',
      });
    },
  });

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: 'Copied!',
        description: 'Link copied to clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Copy Failed',
        description: 'Failed to copy to clipboard',
      });
    }
  }, [toast]);

  const generatePassword = useCallback(() => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let result = '';
    for (let i = 0; i < 12; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(result);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-lg">
              <Share2 className="h-5 w-5 text-blue-400" />
            </div>
            Share "{resourceName}"
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Create a shareable link with custom permissions
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {!generatedLink ? (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6 py-4"
            >
              <div className="space-y-3">
                <Label className="text-sm">Link Expiration</Label>
                <Select value={expiration} onValueChange={setExpiration}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    {EXPIRATION_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {expiration === 'custom' && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left border-zinc-700 bg-zinc-900"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customDate ? format(customDate, 'PPP') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-zinc-900 border-zinc-700">
                      <Calendar
                        mode="single"
                        selected={customDate}
                        onSelect={setCustomDate}
                        disabled={(date) => date < new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              <Separator className="bg-zinc-800" />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm flex items-center gap-2">
                      <Lock className="h-4 w-4 text-amber-400" />
                      Password Protection
                    </Label>
                    <p className="text-xs text-zinc-500">Require password to access</p>
                  </div>
                  <Switch checked={enablePassword} onCheckedChange={setEnablePassword} />
                </div>

                {enablePassword && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter password"
                          className="bg-zinc-900 border-zinc-700 pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-zinc-700"
                        onClick={generatePassword}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <Separator className="bg-zinc-800" />

              <div className="space-y-3">
                <Label className="text-sm flex items-center gap-2">
                  <Download className="h-4 w-4 text-blue-400" />
                  Download Limit
                </Label>
                <Select
                  value={downloadLimit.toString()}
                  onValueChange={(v) => setDownloadLimit(parseInt(v))}
                >
                  <SelectTrigger className="bg-zinc-900 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    {DOWNLOAD_LIMIT_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value.toString()}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator className="bg-zinc-800" />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm flex items-center gap-2">
                      <Mail className="h-4 w-4 text-green-400" />
                      Require Email
                    </Label>
                    <p className="text-xs text-zinc-500">Collect email before download</p>
                  </div>
                  <Switch checked={requireEmail} onCheckedChange={setRequireEmail} />
                </div>

                {requireEmail && (
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-500">
                      Allowed emails (comma-separated, leave empty to allow any)
                    </Label>
                    <Input
                      value={allowedEmails}
                      onChange={(e) => setAllowedEmails(e.target.value)}
                      placeholder="email1@example.com, email2@example.com"
                      className="bg-zinc-900 border-zinc-700"
                    />
                  </div>
                )}
              </div>

              <Button
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending || (enablePassword && !password)}
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4 mr-2" />
                    Generate Link
                  </>
                )}
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6 py-4"
            >
              <div className="p-4 bg-green-950/30 border border-green-900/50 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-green-500/20 rounded-lg">
                    <Check className="h-5 w-5 text-green-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-green-400">Link Created!</p>
                    <p className="text-sm text-green-300/80 mt-0.5">
                      Your shareable link is ready to use
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Shareable Link</Label>
                <div className="flex gap-2">
                  <Input
                    value={generatedLink.url}
                    readOnly
                    className="bg-zinc-900 border-zinc-700 font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    className="border-zinc-700 shrink-0"
                    onClick={() => copyToClipboard(generatedLink.url)}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                  <div className="flex items-center gap-2 text-zinc-400 mb-1">
                    <Clock className="h-3.5 w-3.5" />
                    Expires
                  </div>
                  <p className="font-medium">
                    {generatedLink.expiresAt
                      ? format(new Date(generatedLink.expiresAt), 'PPP')
                      : 'Never'}
                  </p>
                </div>
                <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                  <div className="flex items-center gap-2 text-zinc-400 mb-1">
                    <Download className="h-3.5 w-3.5" />
                    Downloads
                  </div>
                  <p className="font-medium">
                    {generatedLink.maxDownloads || 'Unlimited'}
                  </p>
                </div>
                <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                  <div className="flex items-center gap-2 text-zinc-400 mb-1">
                    {generatedLink.isPasswordProtected ? (
                      <Lock className="h-3.5 w-3.5 text-amber-400" />
                    ) : (
                      <Unlock className="h-3.5 w-3.5" />
                    )}
                    Password
                  </div>
                  <p className="font-medium">
                    {generatedLink.isPasswordProtected ? 'Protected' : 'None'}
                  </p>
                </div>
                <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                  <div className="flex items-center gap-2 text-zinc-400 mb-1">
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </div>
                  <p className="font-medium">
                    {generatedLink.requiresEmail ? 'Required' : 'Not required'}
                  </p>
                </div>
              </div>

              {generatedLink.isPasswordProtected && password && (
                <div className="p-3 bg-amber-950/30 border border-amber-900/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-amber-400" />
                      <span className="text-sm text-amber-300">Password:</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono bg-amber-950/50 px-2 py-0.5 rounded">
                        {password}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => copyToClipboard(password)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 border-zinc-700"
                  onClick={() => setGeneratedLink(null)}
                >
                  Create Another
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    window.open(generatedLink.url, '_blank');
                  }}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Link
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

const ShareLinkRow = memo(function ShareLinkRow({
  link,
  onCopyLink,
  onRevoke,
}: {
  link: ShareLink;
  onCopyLink: (url: string) => void;
  onRevoke: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const isExpired = link.expiresAt && new Date(link.expiresAt) < new Date();
  const isLimitReached = link.maxDownloads && link.downloadCount >= link.maxDownloads;
  const isDisabled = !link.isActive || isExpired || isLimitReached;

  const handleCopy = useCallback(() => {
    onCopyLink(link.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [link.url, onCopyLink]);

  return (
    <div className={cn(
      "p-4 rounded-lg border transition-all",
      isDisabled
        ? "bg-zinc-900/50 border-zinc-800 opacity-60"
        : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link className="h-4 w-4 text-zinc-500" />
            <span className="font-medium truncate">{link.name}</span>
            {link.isPasswordProtected && (
              <Lock className="h-3.5 w-3.5 text-amber-400" />
            )}
            {isDisabled && (
              <Badge variant="destructive" className="text-[10px]">
                {!link.isActive ? 'Revoked' : isExpired ? 'Expired' : 'Limit Reached'}
              </Badge>
            )}
          </div>
          <p className="text-xs text-zinc-500 font-mono truncate">{link.url}</p>
          
          <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {link.viewCount} views
            </span>
            <span className="flex items-center gap-1">
              <Download className="h-3 w-3" />
              {link.downloadCount}{link.maxDownloads ? `/${link.maxDownloads}` : ''} downloads
            </span>
            {link.expiresAt && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {isExpired ? 'Expired' : `Expires ${format(new Date(link.expiresAt), 'MMM d')}`}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={handleCopy}
            disabled={isDisabled}
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          {link.isActive && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
              onClick={() => onRevoke(link.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});

export function ShareLinkList({
  links,
  onRevoke,
  onCopyLink,
  className,
}: ShareLinkListProps) {
  const activeLinks = links.filter(l => l.isActive);
  const inactiveLinks = links.filter(l => !l.isActive);

  if (links.length === 0) {
    return (
      <Card className={cn("bg-zinc-950 border-zinc-800", className)}>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-4">
            <Link2 className="h-8 w-8 text-zinc-600" />
          </div>
          <h3 className="font-medium text-zinc-400">No Shared Links</h3>
          <p className="text-sm text-zinc-600 mt-1">Create a link to share your files</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("bg-zinc-950 border-zinc-800", className)}>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Link2 className="h-5 w-5 text-blue-400" />
          Shared Links
        </CardTitle>
        <CardDescription>
          {activeLinks.length} active · {inactiveLinks.length} inactive
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-3">
            {activeLinks.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Active Links
                </h4>
                {activeLinks.map(link => (
                  <ShareLinkRow
                    key={link.id}
                    link={link}
                    onCopyLink={onCopyLink}
                    onRevoke={onRevoke}
                  />
                ))}
              </div>
            )}
            
            {inactiveLinks.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mt-4">
                  Inactive Links
                </h4>
                {inactiveLinks.map(link => (
                  <ShareLinkRow
                    key={link.id}
                    link={link}
                    onCopyLink={onCopyLink}
                    onRevoke={onRevoke}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export default ShareLinkGenerator;
