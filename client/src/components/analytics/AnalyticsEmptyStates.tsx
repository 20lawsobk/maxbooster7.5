import { motion } from 'framer-motion';
import { 
  BarChart3, 
  Music, 
  Users, 
  DollarSign, 
  ListMusic,
  Globe,
  TrendingUp,
  Upload,
  Zap,
  Sparkles,
  Clock,
  Calendar,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  variant?: 'default' | 'compact' | 'card';
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  secondaryAction,
  className,
  variant = 'default',
}: EmptyStateProps) {
  const content = (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex flex-col items-center justify-center text-center",
        variant === 'compact' ? "py-6 px-4" : "py-12 px-6",
        className
      )}
    >
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1 }}
        className={cn(
          "rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900",
          "flex items-center justify-center mb-4",
          variant === 'compact' ? "w-12 h-12" : "w-16 h-16"
        )}
      >
        <div className="text-slate-400 dark:text-slate-500">
          {icon}
        </div>
      </motion.div>
      <h3 className={cn(
        "font-semibold text-slate-900 dark:text-slate-100 mb-2",
        variant === 'compact' ? "text-sm" : "text-lg"
      )}>
        {title}
      </h3>
      <p className={cn(
        "text-slate-500 dark:text-slate-400 max-w-sm mb-4",
        variant === 'compact' ? "text-xs" : "text-sm"
      )}>
        {description}
      </p>
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3">
          {action && (
            <Button onClick={action.onClick} size={variant === 'compact' ? 'sm' : 'default'}>
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button 
              variant="outline" 
              onClick={secondaryAction.onClick}
              size={variant === 'compact' ? 'sm' : 'default'}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );

  if (variant === 'card') {
    return (
      <Card className={className}>
        <CardContent className="p-0">
          {content}
        </CardContent>
      </Card>
    );
  }

  return content;
}

export function StreamingEmptyState({ onUpload }: { onUpload?: () => void }) {
  return (
    <EmptyState
      icon={<BarChart3 className="h-8 w-8" />}
      title="No streaming data yet"
      description="Once your music is distributed and starts getting plays, you'll see your streaming analytics here."
      action={onUpload ? { label: 'Upload Music', onClick: onUpload } : undefined}
      secondaryAction={{ label: 'Learn More', onClick: () => window.open('https://support.maxbooster.app/analytics', '_blank', 'noopener,noreferrer') }}
    />
  );
}

export function RevenueEmptyState({ onSetup }: { onSetup?: () => void }) {
  return (
    <EmptyState
      icon={<DollarSign className="h-8 w-8" />}
      title="No revenue data available"
      description="Set up your payment information and distribute your music to start tracking earnings."
      action={onSetup ? { label: 'Set Up Payments', onClick: onSetup } : undefined}
    />
  );
}

export function AudienceEmptyState({ onPromote }: { onPromote?: () => void }) {
  return (
    <EmptyState
      icon={<Users className="h-8 w-8" />}
      title="Building your audience"
      description="As more listeners discover your music, you'll see demographic insights and fan data here."
      action={onPromote ? { label: 'Promote Music', onClick: onPromote } : undefined}
    />
  );
}

export function PlaylistEmptyState({ onSubmit }: { onSubmit?: () => void }) {
  return (
    <EmptyState
      icon={<ListMusic className="h-8 w-8" />}
      title="No playlist placements yet"
      description="Submit your tracks to playlists to increase your reach and track playlist performance."
      action={onSubmit ? { label: 'Submit to Playlists', onClick: onSubmit } : undefined}
    />
  );
}

export function GeoEmptyState() {
  return (
    <EmptyState
      icon={<Globe className="h-8 w-8" />}
      title="Geographic data loading"
      description="Location data will appear as your music reaches listeners around the world."
      variant="compact"
    />
  );
}

export function DateRangeEmptyState({ range, onChangeRange }: { range: string; onChangeRange?: () => void }) {
  return (
    <EmptyState
      icon={<Calendar className="h-8 w-8" />}
      title="No data for this period"
      description={`There's no analytics data available for the selected date range (${range}). Try selecting a different time period.`}
      action={onChangeRange ? { label: 'Change Date Range', onClick: onChangeRange } : undefined}
      variant="compact"
    />
  );
}

export function ExportEmptyState({ onExport }: { onExport?: () => void }) {
  return (
    <EmptyState
      icon={<FileText className="h-8 w-8" />}
      title="No reports generated"
      description="Export your analytics data to CSV or PDF format to share or analyze offline."
      action={onExport ? { label: 'Generate Report', onClick: onExport } : undefined}
      variant="compact"
    />
  );
}

export function NewArtistWelcome({ 
  onGetStarted, 
  onLearnMore 
}: { 
  onGetStarted?: () => void;
  onLearnMore?: () => void;
}) {
  return (
    <Card className="border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-purple-500/5">
      <CardContent className="py-12 px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center mb-6 shadow-lg"
          >
            <Sparkles className="h-10 w-10 text-white" />
          </motion.div>
          
          <h2 className="text-2xl font-bold mb-3 bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
            Welcome to Analytics!
          </h2>
          
          <p className="text-slate-600 dark:text-slate-400 max-w-md mb-6">
            Your music journey starts here. Upload your first track, distribute it to streaming platforms, 
            and watch your analytics come to life.
          </p>

          <div className="grid grid-cols-3 gap-6 mb-8 w-full max-w-lg">
            <div className="flex flex-col items-center p-4 rounded-lg bg-white/50 dark:bg-slate-800/50">
              <Upload className="h-6 w-6 text-blue-500 mb-2" />
              <span className="text-xs font-medium">Upload</span>
            </div>
            <div className="flex flex-col items-center p-4 rounded-lg bg-white/50 dark:bg-slate-800/50">
              <Music className="h-6 w-6 text-green-500 mb-2" />
              <span className="text-xs font-medium">Distribute</span>
            </div>
            <div className="flex flex-col items-center p-4 rounded-lg bg-white/50 dark:bg-slate-800/50">
              <TrendingUp className="h-6 w-6 text-purple-500 mb-2" />
              <span className="text-xs font-medium">Grow</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {onGetStarted && (
              <Button onClick={onGetStarted} className="bg-gradient-to-r from-primary to-purple-600">
                <Zap className="h-4 w-4 mr-2" />
                Get Started
              </Button>
            )}
            {onLearnMore && (
              <Button variant="outline" onClick={onLearnMore}>
                Learn More
              </Button>
            )}
          </div>
        </motion.div>
      </CardContent>
    </Card>
  );
}

export function LoadingDataState({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        className="w-10 h-10 rounded-full border-3 border-primary border-t-transparent mb-4"
      />
      <p className="text-sm text-muted-foreground">
        {message || 'Loading analytics data...'}
      </p>
    </div>
  );
}

export function RefreshingState({ message }: { message?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-10 rounded-lg"
    >
      <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-primary/10 text-primary">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <Clock className="h-4 w-4" />
        </motion.div>
        <span className="text-sm font-medium">{message || 'Refreshing...'}</span>
      </div>
    </motion.div>
  );
}
