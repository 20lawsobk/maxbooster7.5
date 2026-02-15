import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Mail, TrendingUp, Users, Bell, DollarSign, Zap, Eye, Calendar } from 'lucide-react';

interface EmailPreferences {
  id: string;
  userId: string;
  weeklyInsights: boolean;
  weeklyInsightsFrequency: string;
  marketingEmails: boolean;
  releaseAlerts: boolean;
  collaborationAlerts: boolean;
  revenueAlerts: boolean;
  unsubscribedAt: string | null;
}

interface WeeklyReportPreview {
  userName: string;
  streamsThisWeek: number;
  streamsLastWeek: number;
  streamsChangePercent: number;
  topTrack: { title: string; streams: number } | null;
  newFollowers: number;
  revenueEarned: number;
  achievementsUnlocked: Array<{ name: string; description: string; icon: string }>;
  aiRecommendation: { title: string; description: string } | null;
  upcomingPosts: Array<{ platform: string; scheduledAt: string; content: string }>;
}

export function EmailPreferences() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPreview, setShowPreview] = useState(false);

  const { data: preferences, isLoading } = useQuery<EmailPreferences>({
    queryKey: ['/api/email-preferences'],
  });

  const { data: previewData, isLoading: previewLoading } = useQuery<WeeklyReportPreview>({
    queryKey: ['/api/email-preferences/preview'],
    enabled: showPreview,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<EmailPreferences>) => {
      const res = await fetch('/api/email-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update preferences');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email-preferences'] });
      toast({
        title: 'Preferences updated',
        description: 'Your email preferences have been saved.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update preferences. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleToggle = (key: keyof EmailPreferences, value: boolean) => {
    updateMutation.mutate({ [key]: value });
  };

  const handleFrequencyChange = (value: string) => {
    updateMutation.mutate({ weeklyInsightsFrequency: value });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Preferences
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Email Preferences
          </CardTitle>
          <CardDescription>
            Choose which emails you'd like to receive from Max Booster. We'll only send you valuable updates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 rounded-lg border border-purple-100 dark:border-purple-900">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="weeklyInsights" className="text-base font-semibold">Weekly Insights</Label>
                  <p className="text-sm text-muted-foreground">
                    Get a personalized weekly summary of your streams, revenue, achievements, and AI-powered recommendations.
                  </p>
                  {preferences?.weeklyInsights && (
                    <div className="flex items-center gap-2 mt-2">
                      <Select
                        value={preferences.weeklyInsightsFrequency || 'weekly'}
                        onValueChange={handleFrequencyChange}
                      >
                        <SelectTrigger className="w-[180px] h-8">
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Every Monday</SelectItem>
                          <SelectItem value="biweekly">Every 2 Weeks</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
              <Switch
                id="weeklyInsights"
                checked={preferences?.weeklyInsights ?? true}
                onCheckedChange={(checked) => handleToggle('weeklyInsights', checked)}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                  <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="revenueAlerts" className="text-base font-medium">Revenue Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when you receive payments or when your royalties are ready.
                  </p>
                </div>
              </div>
              <Switch
                id="revenueAlerts"
                checked={preferences?.revenueAlerts ?? true}
                onCheckedChange={(checked) => handleToggle('revenueAlerts', checked)}
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="releaseAlerts" className="text-base font-medium">Release Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Updates about your music distribution status and when releases go live.
                  </p>
                </div>
              </div>
              <Switch
                id="releaseAlerts"
                checked={preferences?.releaseAlerts ?? true}
                onCheckedChange={(checked) => handleToggle('releaseAlerts', checked)}
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
                  <Users className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="collaborationAlerts" className="text-base font-medium">Collaboration Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Notifications about project invites, splits updates, and team activity.
                  </p>
                </div>
              </div>
              <Switch
                id="collaborationAlerts"
                checked={preferences?.collaborationAlerts ?? true}
                onCheckedChange={(checked) => handleToggle('collaborationAlerts', checked)}
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-pink-100 dark:bg-pink-900 rounded-lg">
                  <Zap className="h-5 w-5 text-pink-600 dark:text-pink-400" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="marketingEmails" className="text-base font-medium">Product Updates & Tips</Label>
                  <p className="text-sm text-muted-foreground">
                    New features, music industry tips, and promotional opportunities.
                  </p>
                </div>
              </div>
              <Switch
                id="marketingEmails"
                checked={preferences?.marketingEmails ?? true}
                onCheckedChange={(checked) => handleToggle('marketingEmails', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            Preview Weekly Insights Email
          </CardTitle>
          <CardDescription>
            See what your personalized weekly email will look like based on your current data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!showPreview ? (
            <Button onClick={() => setShowPreview(true)} variant="outline" className="w-full">
              <Eye className="mr-2 h-4 w-4" />
              Show Email Preview
            </Button>
          ) : previewLoading ? (
            <div className="space-y-4">
              <div className="h-64 bg-muted animate-pulse rounded-lg" />
            </div>
          ) : previewData ? (
            <div className="border rounded-lg overflow-hidden bg-white dark:bg-gray-900">
              <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white text-center">
                <h2 className="text-xl font-bold">🎵 Max Booster</h2>
                <p className="text-purple-100 text-sm mt-1">Your Weekly Music Career Insights</p>
              </div>
              
              <div className="p-6 space-y-6">
                <p className="text-lg">Hey {previewData.userName}! 👋</p>
                <p className="text-muted-foreground">Here's how your music performed this week.</p>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-blue-600">{previewData.streamsThisWeek.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Streams</div>
                    <div className={`text-xs mt-1 ${previewData.streamsChangePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {previewData.streamsChangePercent >= 0 ? '📈' : '📉'} {previewData.streamsChangePercent >= 0 ? '+' : ''}{previewData.streamsChangePercent}%
                    </div>
                  </div>
                  <div className="bg-green-50 dark:bg-green-950/30 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-green-600">${previewData.revenueEarned.toFixed(2)}</div>
                    <div className="text-sm text-muted-foreground">Revenue</div>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-950/30 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-purple-600">+{previewData.newFollowers}</div>
                    <div className="text-sm text-muted-foreground">Followers</div>
                  </div>
                  <div className="bg-yellow-50 dark:bg-yellow-950/30 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-yellow-600">{previewData.achievementsUnlocked.length}</div>
                    <div className="text-sm text-muted-foreground">Achievements</div>
                  </div>
                </div>

                {previewData.topTrack && (
                  <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-purple-500">
                    <h4 className="font-semibold text-sm mb-1">🎤 Top Performing Track</h4>
                    <p className="font-medium">{previewData.topTrack.title}</p>
                    <p className="text-sm text-muted-foreground">{previewData.topTrack.streams.toLocaleString()} streams</p>
                  </div>
                )}

                {previewData.aiRecommendation && (
                  <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 p-4 rounded-lg">
                    <h4 className="font-semibold text-sm mb-1 text-purple-700 dark:text-purple-300">🤖 AI Recommendation</h4>
                    <p className="font-medium">{previewData.aiRecommendation.title}</p>
                    <p className="text-sm text-muted-foreground">{previewData.aiRecommendation.description}</p>
                  </div>
                )}

                {previewData.upcomingPosts.length > 0 && (
                  <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg">
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Upcoming Posts
                    </h4>
                    {previewData.upcomingPosts.map((post, i) => (
                      <div key={i} className="py-2 border-b last:border-0 border-blue-100 dark:border-blue-900">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium capitalize">{post.platform}</span>
                          <span className="text-muted-foreground">
                            {new Date(post.scheduledAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{post.content}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="text-center pt-4">
                  <div className="inline-block px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold">
                    Log in to see more →
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No preview data available. Start creating content to see your insights!
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default EmailPreferences;
