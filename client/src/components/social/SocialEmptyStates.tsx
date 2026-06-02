import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Share2,
  Calendar,
  BarChart3,
  MessageSquare,
  Users,
  Eye,
  Globe,
  Plus,
  Link,
  Sparkles,
  TrendingUp,
  Bell,
  Clock,
  Search,
  Filter,
  FileText,
  Inbox,
  Hash,
  Zap,
  Target,
  Bot,
  Megaphone,
} from "lucide-react";
import {
  FacebookIcon,
  InstagramIcon,
  YouTubeIcon,
  TikTokIcon,
  LinkedInIcon,
  TwitterIcon,
} from "@/components/ui/brand-icons";

interface EmptyStateProps {
  onAction?: () => void;
  onSecondaryAction?: () => void;
}

export function NoPlatformsConnected({ onAction }: EmptyStateProps) {
  const platforms = [
    { icon: InstagramIcon, name: "Instagram", color: "#E4405F" },
    { icon: FacebookIcon, name: "Facebook", color: "#1877F2" },
    { icon: TwitterIcon, name: "Twitter", color: "#000000" },
    { icon: TikTokIcon, name: "TikTok", color: "#000000" },
    { icon: YouTubeIcon, name: "YouTube", color: "#FF0000" },
    { icon: LinkedInIcon, name: "LinkedIn", color: "#0077B5" },
  ];

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
          <Globe className="w-10 h-10 text-blue-500" />
        </div>
        <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center animate-pulse">
          <Link className="w-4 h-4 text-white" />
        </div>
      </div>

      <h3 className="text-xl font-semibold mb-2">Connect Your Social Media</h3>
      <p className="text-muted-foreground mb-6 max-w-md">
        Link your social media accounts to start creating, scheduling, and
        analyzing your content across all platforms.
      </p>

      <div className="flex flex-wrap justify-center gap-3 mb-6">
        {platforms.map((platform) => {
          const Icon = platform.icon;
          return (
            <div
              key={platform.name}
              className="w-12 h-12 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center hover:border-solid hover:border-blue-500 transition-all cursor-pointer"
              title={`Connect ${platform.name}`}
            >
              <Icon className="w-6 h-6" style={{ color: platform.color }} />
            </div>
          );
        })}
      </div>

      <Button onClick={onAction} className="gap-2">
        <Plus className="w-4 h-4" />
        Connect Your First Platform
      </Button>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar className="w-4 h-4 text-blue-500" />
          <span>Schedule posts across platforms</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <BarChart3 className="w-4 h-4 text-green-500" />
          <span>Track engagement analytics</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Sparkles className="w-4 h-4 text-purple-500" />
          <span>AI-powered content creation</span>
        </div>
      </div>
    </div>
  );
}

export function NoScheduledPosts({ onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
          <Calendar className="w-10 h-10 text-purple-500" />
        </div>
        <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
          <Clock className="w-3 h-3 text-muted-foreground" />
        </div>
      </div>

      <h3 className="text-xl font-semibold mb-2">No Scheduled Posts</h3>
      <p className="text-muted-foreground mb-6 max-w-md">
        Your content calendar is empty. Schedule your first post to maintain a
        consistent presence on social media.
      </p>

      <div className="flex gap-3">
        <Button onClick={onAction} className="gap-2">
          <Plus className="w-4 h-4" />
          Create New Post
        </Button>
        <Button variant="outline" className="gap-2">
          <Sparkles className="w-4 h-4" />
          Generate with AI
        </Button>
      </div>

      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg max-w-md">
        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
          <Zap className="w-4 h-4" />
          <span className="font-medium">Pro Tip</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Posting consistently at optimal times can increase your engagement by
          up to 3x. Try scheduling posts for when your audience is most active.
        </p>
      </div>
    </div>
  );
}

export function NoAnalyticsData({ onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
          <BarChart3 className="w-10 h-10 text-green-500" />
        </div>
      </div>

      <h3 className="text-xl font-semibold mb-2">No Analytics Data Yet</h3>
      <p className="text-muted-foreground mb-6 max-w-md">
        Analytics will appear here once you start publishing content. Connect
        your accounts and post to see engagement metrics.
      </p>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Followers", icon: Users, value: "—" },
          { label: "Engagement", icon: TrendingUp, value: "—" },
          { label: "Reach", icon: Eye, value: "—" },
        ].map((stat) => (
          <Card key={stat.label} className="bg-gray-50 dark:bg-gray-800/50">
            <CardContent className="p-4 text-center">
              <stat.icon className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-2xl font-bold text-muted-foreground">
                {stat.value}
              </p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button onClick={onAction} className="gap-2">
        <Share2 className="w-4 h-4" />
        Create Your First Post
      </Button>
    </div>
  );
}

export function EmptyInbox({ onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
          <Inbox className="w-10 h-10 text-blue-500" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
          <span className="text-white text-xs font-bold">✓</span>
        </div>
      </div>

      <h3 className="text-xl font-semibold mb-2">Inbox Zero! 🎉</h3>
      <p className="text-muted-foreground mb-6 max-w-md">
        You're all caught up! No new messages, comments, or mentions across your
        connected platforms.
      </p>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onAction} className="gap-2">
          <Search className="w-4 h-4" />
          Search Messages
        </Button>
        <Button variant="outline" className="gap-2">
          <Filter className="w-4 h-4" />
          Show Archived
        </Button>
      </div>

      <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
        <Bell className="w-4 h-4" />
        <span>We'll notify you when new messages arrive</span>
      </div>
    </div>
  );
}

export function NoCompetitors({ onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center">
          <Target className="w-10 h-10 text-orange-500" />
        </div>
      </div>

      <h3 className="text-xl font-semibold mb-2">Track Your Competitors</h3>
      <p className="text-muted-foreground mb-6 max-w-md">
        Add competitors to benchmark your social media performance. See how you
        compare in followers, engagement, and content strategy.
      </p>

      <Button onClick={onAction} className="gap-2">
        <Plus className="w-4 h-4" />
        Add Competitor
      </Button>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm max-w-md">
        <div className="flex items-start gap-2 text-muted-foreground">
          <BarChart3 className="w-4 h-4 mt-0.5 text-blue-500" />
          <span>Compare engagement rates and growth</span>
        </div>
        <div className="flex items-start gap-2 text-muted-foreground">
          <FileText className="w-4 h-4 mt-0.5 text-green-500" />
          <span>Analyze their content strategy</span>
        </div>
        <div className="flex items-start gap-2 text-muted-foreground">
          <Clock className="w-4 h-4 mt-0.5 text-purple-500" />
          <span>See their posting frequency</span>
        </div>
        <div className="flex items-start gap-2 text-muted-foreground">
          <Hash className="w-4 h-4 mt-0.5 text-orange-500" />
          <span>Discover trending hashtags they use</span>
        </div>
      </div>
    </div>
  );
}

export function NoListeningAlerts({ onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
          <Eye className="w-10 h-10 text-cyan-500" />
        </div>
      </div>

      <h3 className="text-xl font-semibold mb-2">Social Listening</h3>
      <p className="text-muted-foreground mb-6 max-w-md">
        Monitor mentions of your brand, track keywords, and stay on top of
        industry trends. Set up alerts to never miss important conversations.
      </p>

      <div className="flex gap-3">
        <Button onClick={onAction} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Keywords
        </Button>
        <Button variant="outline" className="gap-2">
          <Megaphone className="w-4 h-4" />
          Setup Brand Monitoring
        </Button>
      </div>
    </div>
  );
}

export function AutopilotNotActive({ onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center">
          <Bot className="w-10 h-10 text-violet-500" />
        </div>
        <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
          <span className="text-sm">💤</span>
        </div>
      </div>

      <h3 className="text-xl font-semibold mb-2">Activate Social Autopilot</h3>
      <p className="text-muted-foreground mb-6 max-w-md">
        Let AI manage your social media automatically. Autopilot generates
        content, schedules posts at optimal times, and engages with your
        audience 24/7.
      </p>

      <Button
        onClick={onAction}
        className="gap-2 bg-gradient-to-r from-violet-600 to-purple-600"
      >
        <Zap className="w-4 h-4" />
        Activate Autopilot
      </Button>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        <div className="p-3 bg-violet-50 dark:bg-violet-900/20 rounded-lg">
          <Sparkles className="w-5 h-5 text-violet-500 mx-auto mb-1" />
          <p className="font-medium">AI Content</p>
          <p className="text-xs text-muted-foreground">Auto-generated posts</p>
        </div>
        <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
          <Clock className="w-5 h-5 text-purple-500 mx-auto mb-1" />
          <p className="font-medium">Smart Scheduling</p>
          <p className="text-xs text-muted-foreground">Optimal post times</p>
        </div>
        <div className="p-3 bg-pink-50 dark:bg-pink-900/20 rounded-lg">
          <MessageSquare className="w-5 h-5 text-pink-500 mx-auto mb-1" />
          <p className="font-medium">Auto Engage</p>
          <p className="text-xs text-muted-foreground">Reply to comments</p>
        </div>
      </div>
    </div>
  );
}

export function NoAIInsights({ onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
          <Sparkles className="w-10 h-10 text-amber-500" />
        </div>
      </div>

      <h3 className="text-xl font-semibold mb-2">
        Your AI Insights Are Being Built
      </h3>
      <p className="text-muted-foreground mb-6 max-w-md">
        Post your first few pieces of content and Max Booster's AI will start
        analyzing your performance — giving you personalized strategies to grow
        faster.
      </p>

      <Button onClick={onAction} className="gap-2 gradient-bg text-white">
        <Share2 className="w-4 h-4" />
        Create Your First Post
      </Button>

      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {[
          "Best Posting Times",
          "Hashtag Strategy",
          "Content Ideas",
          "Audience Breakdown",
        ].map((insight) => (
          <div
            key={insight}
            className="px-3 py-1 bg-primary/10 border border-primary/20 rounded-full text-xs font-medium text-primary"
          >
            {insight}
          </div>
        ))}
      </div>
    </div>
  );
}

export default {
  NoPlatformsConnected,
  NoScheduledPosts,
  NoAnalyticsData,
  EmptyInbox,
  NoCompetitors,
  NoListeningAlerts,
  AutopilotNotActive,
  NoAIInsights,
};
