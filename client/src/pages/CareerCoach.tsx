import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { 
  Brain, Target, TrendingUp, Calendar, CheckCircle, Clock, 
  Lightbulb, Rocket, Star, ArrowRight, MessageSquare, Send,
  Music, DollarSign, Users, BarChart3, Sparkles, Zap, Trash2, Plus
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface CareerGoal {
  id: string;
  title: string;
  category: 'growth' | 'revenue' | 'releases' | 'networking' | 'skills';
  targetDate: string;
  progress: number;
  status: 'active' | 'completed' | 'paused';
  milestones: Array<{ id: string; title: string; completed: boolean }>;
}

interface Recommendation {
  id: string;
  type: 'action' | 'insight' | 'opportunity';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  estimatedImpact: string;
  actionUrl?: string;
}

interface QuickAction {
  label: string;
  prompt: string;
}

interface CoachMessage {
  id: string;
  role: 'user' | 'assistant' | 'coach';
  content: string;
  timestamp: string;
  quickActions?: QuickAction[];
  proactiveSuggestions?: string[];
}

export default function CareerCoach() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<CoachMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [showCreateGoalDialog, setShowCreateGoalDialog] = useState(false);
  const [newGoalForm, setNewGoalForm] = useState({
    title: '',
    goalType: 'growth',
    targetValue: 1000,
    unit: '',
    deadline: '',
    description: '',
  });

  const { data: goalsData, isLoading: isLoadingGoals } = useQuery<{ goals: CareerGoal[] }>({
    queryKey: ['/api/career-coach/goals'],
    enabled: !!user,
  });

  const { data: recommendationsData, isLoading: isLoadingRecs } = useQuery<{ recommendations: Recommendation[] }>({
    queryKey: ['/api/career-coach/recommendations'],
    enabled: !!user,
  });

  const { data: insightsData, isLoading: isLoadingInsights } = useQuery<{ insights: any }>({
    queryKey: ['/api/career-coach/insights'],
    enabled: !!user,
  });

  const { data: historyData } = useQuery<{ messages: any[] }>({
    queryKey: ['/api/assistant/history'],
    enabled: !!user,
  });

  useEffect(() => {
    if (historyData && !historyLoaded) {
      const historical = (historyData.messages || []).map((m: any) => ({
        id: m.id || String(m.createdAt),
        role: m.role === 'assistant' ? 'coach' as const : 'user' as const,
        content: m.content,
        timestamp: m.createdAt,
      }));

      if (historical.length > 0) {
        setChatMessages(historical);
      } else {
        setChatMessages([{
          id: 'welcome',
          role: 'coach',
          content: "Hi! I'm Max, your AI Career Coach. I analyze your music career data to provide personalized recommendations. Ask me anything about growing your career, releasing music, building your fan base, or running your business as an artist.",
          timestamp: new Date().toISOString(),
          quickActions: [
            { label: 'How do I grow my fan base?', prompt: 'How do I grow my fan base?' },
            { label: 'Distribute my music', prompt: 'How do I distribute my music to all platforms?' },
            { label: 'Boost my streams', prompt: 'What can I do to boost my streaming numbers?' },
            { label: 'Start earning royalties', prompt: 'How do I start earning royalties from my music?' },
          ],
        }]);
      }
      setHistoryLoaded(true);
    }
  }, [historyData, historyLoaded]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest('POST', '/api/assistant/chat', { message });
      return res.json();
    },
    onSuccess: (data) => {
      const quickActions: QuickAction[] = data.quickActions || [];
      const proactiveSuggestions: string[] = data.proactiveSuggestions || [];
      setChatMessages((prev) => [
        ...prev,
        {
          id: data.assistantMessageId || Date.now().toString(),
          role: 'coach',
          content: data.content || data.response || "I'm here to help you grow your music career. What would you like to work on?",
          timestamp: new Date().toISOString(),
          quickActions: quickActions.length > 0 ? quickActions : undefined,
          proactiveSuggestions: proactiveSuggestions.length > 0 ? proactiveSuggestions : undefined,
        },
      ]);
      inputRef.current?.focus();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to get AI response', variant: 'destructive' });
    },
  });

  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', '/api/assistant/history');
    },
    onSuccess: () => {
      setChatMessages([{
        id: 'welcome-new',
        role: 'coach',
        content: "Conversation cleared! I'm ready to start fresh. What would you like to work on today?",
        timestamp: new Date().toISOString(),
        quickActions: [
          { label: 'Grow my fan base', prompt: 'How do I grow my fan base?' },
          { label: 'Distribute music', prompt: 'How do I distribute my music?' },
          { label: 'Boost streams', prompt: 'How do I boost my streaming numbers?' },
          { label: 'Earn royalties', prompt: 'How do I maximize my royalty earnings?' },
        ],
      }]);
      setHistoryLoaded(true);
      toast({ title: 'Cleared', description: 'Conversation history has been cleared.' });
    },
  });

  const createGoalMutation = useMutation({
    mutationFn: async (data: { title: string; goalType: string; targetValue: number; unit?: string; deadline?: string; description?: string }) => {
      const res = await apiRequest('POST', '/api/career-coach/goals', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/career-coach/goals'] });
      setShowCreateGoalDialog(false);
      setNewGoalForm({ title: '', goalType: 'growth', targetValue: 1000, unit: '', deadline: '', description: '' });
      toast({ title: 'Goal created!', description: 'Your career goal has been added.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create goal', variant: 'destructive' });
    },
  });

  const deleteGoalMutation = useMutation({
    mutationFn: async (goalId: string) => {
      const res = await apiRequest('DELETE', `/api/career-coach/goals/${goalId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/career-coach/goals'] });
      toast({ title: 'Goal deleted' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete goal', variant: 'destructive' });
    },
  });

  const handleSendMessage = (text?: string) => {
    const msg = (text || chatInput).trim();
    if (!msg) return;
    
    setChatMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: 'user',
        content: msg,
        timestamp: new Date().toISOString(),
      },
    ]);
    
    chatMutation.mutate(msg);
    setChatInput('');
  };

  const goals = goalsData?.goals || [];
  const recommendations = recommendationsData?.recommendations || [];
  const insights = insightsData?.insights;

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'growth': return <TrendingUp className="h-4 w-4" />;
      case 'revenue': return <DollarSign className="h-4 w-4" />;
      case 'releases': return <Music className="h-4 w-4" />;
      case 'networking': return <Users className="h-4 w-4" />;
      case 'skills': return <Lightbulb className="h-4 w-4" />;
      default: return <Target className="h-4 w-4" />;
    }
  };

  const getPriorityBadge = (priority: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
      high: 'default',
      medium: 'secondary',
      low: 'outline',
    };
    return <Badge variant={variants[priority]}>{priority}</Badge>;
  };

  const getRecommendationIcon = (type: string) => {
    switch (type) {
      case 'action': return <Rocket className="h-5 w-5 text-blue-500" />;
      case 'insight': return <Lightbulb className="h-5 w-5 text-amber-500" />;
      case 'opportunity': return <Star className="h-5 w-5 text-green-500" />;
      default: return <Sparkles className="h-5 w-5" />;
    }
  };

  if (!user) {
    setLocation('/login');
    return null;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Brain className="h-8 w-8 text-primary" />
              AI Career Coach
            </h1>
            <p className="text-muted-foreground mt-1">
              Personalized guidance to accelerate your music career
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Tabs defaultValue="recommendations" className="space-y-4">
              <TabsList>
                <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
                <TabsTrigger value="goals">Goals</TabsTrigger>
                <TabsTrigger value="insights">Insights</TabsTrigger>
              </TabsList>

              <TabsContent value="recommendations" className="space-y-4">
                {isLoadingRecs ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Card key={i}>
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3 flex-1">
                              <Skeleton className="h-5 w-5 rounded-full mt-0.5" />
                              <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-48" />
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-3/4" />
                              </div>
                            </div>
                            <Skeleton className="h-5 w-16 rounded-full ml-3" />
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-4">
                            <Skeleton className="h-5 w-20 rounded-full" />
                            <Skeleton className="h-4 w-28" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : recommendations.length === 0 ? (
                  <Card className="p-8 text-center">
                    <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="font-medium">No recommendations yet</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      As you use the platform, I'll provide personalized recommendations
                    </p>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {recommendations.map((rec) => (
                      <Card key={rec.id}>
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              {getRecommendationIcon(rec.type)}
                              <div>
                                <CardTitle className="text-base">{rec.title}</CardTitle>
                                <CardDescription className="mt-1">
                                  {rec.description}
                                </CardDescription>
                              </div>
                            </div>
                            {getPriorityBadge(rec.priority)}
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-4 text-sm">
                            <Badge variant="outline">{rec.category}</Badge>
                            <span className="text-muted-foreground">
                              Impact: {rec.estimatedImpact}
                            </span>
                          </div>
                        </CardContent>
                        {rec.actionUrl && (
                          <CardFooter>
                            <Button size="sm" onClick={() => setLocation(rec.actionUrl!)}>
                              Take Action
                              <ArrowRight className="h-4 w-4 ml-1" />
                            </Button>
                          </CardFooter>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="goals" className="space-y-4">
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => setShowCreateGoalDialog(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    New Goal
                  </Button>
                </div>
                {isLoadingGoals ? (
                  <div className="space-y-4">
                    {[1, 2].map((i) => (
                      <Card key={i}>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Skeleton className="h-4 w-4" />
                              <Skeleton className="h-4 w-48" />
                            </div>
                            <Skeleton className="h-5 w-16 rounded-full" />
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Skeleton className="h-3 w-3" />
                            <Skeleton className="h-3 w-32" />
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <div className="flex justify-between mb-1">
                              <Skeleton className="h-3 w-16" />
                              <Skeleton className="h-3 w-8" />
                            </div>
                            <Skeleton className="h-2 w-full rounded-full" />
                          </div>
                          <div className="space-y-2">
                            {[1, 2, 3].map((j) => (
                              <div key={j} className="flex items-center gap-2">
                                <Skeleton className="h-4 w-4 rounded-full" />
                                <Skeleton className="h-3 w-40" />
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : goals.length === 0 ? (
                  <Card className="p-8 text-center">
                    <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="font-medium">Set your first career goal</h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                      Define what success looks like for you, and I'll help you create a roadmap to get there
                    </p>
                    <Button className="mt-4" onClick={() => handleSendMessage('Help me set a career goal for my music')}>
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Ask Coach to Help
                    </Button>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {goals.map((goal) => (
                      <Card key={goal.id}>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2">
                              {getCategoryIcon(goal.category)}
                              {goal.title}
                            </CardTitle>
                            <div className="flex items-center gap-2">
                              <Badge variant={goal.status === 'completed' ? 'default' : 'outline'}>
                                {goal.status}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() => deleteGoalMutation.mutate(goal.id)}
                                disabled={deleteGoalMutation.isPending}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <CardDescription className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            Target: {new Date(goal.targetDate).toLocaleDateString()}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span>Progress</span>
                              <span>{goal.progress}%</span>
                            </div>
                            <Progress value={goal.progress} className="h-2" />
                          </div>
                          
                          <div className="space-y-2">
                            {goal.milestones.slice(0, 3).map((milestone) => (
                              <div key={milestone.id} className="flex items-center gap-2 text-sm">
                                {milestone.completed ? (
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                ) : (
                                  <Clock className="h-4 w-4 text-muted-foreground" />
                                )}
                                <span className={milestone.completed ? 'line-through text-muted-foreground' : ''}>
                                  {milestone.title}
                                </span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="insights" className="space-y-4">
                {isLoadingInsights ? (
                  <div className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      {[1, 2, 3, 4].map((i) => (
                        <Card key={i}>
                          <CardHeader>
                            <div className="flex items-center gap-2">
                              <Skeleton className="h-5 w-5" />
                              <Skeleton className="h-4 w-28" />
                            </div>
                          </CardHeader>
                          <CardContent>
                            <Skeleton className="h-8 w-20 mb-1" />
                            <Skeleton className="h-3 w-36" />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    <Card>
                      <CardHeader>
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-64 mt-1" />
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-4">
                          <Skeleton className="h-24 w-24 rounded-full" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-full" />
                            <Skeleton className="h-3 w-3/4" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                <><div className="grid md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-green-500" />
                        Growth Rate
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold">{insights?.growthRateDisplay ?? '—'}</p>
                      <p className="text-sm text-muted-foreground">streams vs last month</p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-blue-500" />
                        Engagement Score
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold">{insights != null ? `${insights.engagementScore}/100` : '—'}</p>
                      <p className="text-sm text-muted-foreground">
                        {insights?.engagementScore >= 70 ? 'Above average' : insights?.engagementScore >= 40 ? 'Average' : 'Below average'}
                      </p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Music className="h-5 w-5 text-purple-500" />
                        Release Velocity
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold">{insights?.releaseVelocity ?? '—'}</p>
                      <p className="text-sm text-muted-foreground">tracks/month (90-day avg)</p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-amber-500" />
                        Revenue Trend
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold">{insights?.revenueTrendDisplay ?? '—'}</p>
                      <p className="text-sm text-muted-foreground">vs last 30 days</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Career Health Score</CardTitle>
                    <CardDescription>Based on your activity and performance metrics</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div className="relative h-24 w-24">
                        <svg className="h-full w-full -rotate-90">
                          <circle
                            cx="48"
                            cy="48"
                            r="40"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="8"
                            className="text-muted"
                          />
                          <circle
                            cx="48"
                            cy="48"
                            r="40"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="8"
                            strokeDasharray={`${(insights?.careerHealthScore ?? 0) * 2.51} ${100 * 2.51}`}
                            className="text-primary"
                          />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold">
                          {insights?.careerHealthScore ?? '—'}
                        </span>
                      </div>
                      <div className="flex-1">
                        <h4 className={`font-medium ${(insights?.careerHealthScore ?? 0) >= 80 ? 'text-green-500' : (insights?.careerHealthScore ?? 0) >= 60 ? 'text-blue-500' : 'text-amber-500'}`}>
                          {insights?.healthLabel ?? 'Analyzing your career…'}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {(insights?.careerHealthScore ?? 0) >= 60
                            ? 'Your career is on a healthy trajectory. Focus on consistency and expanding your network.'
                            : 'Post more content, release music regularly, and engage with your audience to boost your score.'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                </>)}
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-4">
            <Card className="h-[600px] flex flex-col">
              <CardHeader className="border-b flex-shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Chat with Max
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    title="Clear conversation"
                    onClick={() => clearHistoryMutation.mutate()}
                    disabled={clearHistoryMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatMessages.length === 0 && (
                  <div className="flex justify-center items-center h-full text-muted-foreground">
                    <div className="text-center">
                      <Brain className="h-10 w-10 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">Loading your conversation...</p>
                    </div>
                  </div>
                )}
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[88%] rounded-lg px-3 py-2 ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>

                    {msg.quickActions && msg.quickActions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2 max-w-[88%]">
                        {msg.quickActions.map((qa, i) => (
                          <button
                            key={i}
                            onClick={() => handleSendMessage(qa.prompt)}
                            className="text-xs px-2.5 py-1 rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
                          >
                            {qa.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {msg.proactiveSuggestions && msg.proactiveSuggestions.length > 0 && (
                      <div className="flex flex-col gap-1 mt-2 max-w-[88%]">
                        {msg.proactiveSuggestions.map((tip, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                            <Zap className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />
                            {tip}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {chatMutation.isPending && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg p-3">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                        <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce delay-100" />
                        <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce delay-200" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-4 border-t flex-shrink-0">
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    placeholder="Ask me anything..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                  />
                  <Button 
                    size="icon" 
                    onClick={() => handleSendMessage()}
                    disabled={chatMutation.isPending || !chatInput.trim()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Questions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { icon: Target, label: 'Set a career goal', prompt: 'Help me set a music career goal for this quarter' },
                  { icon: BarChart3, label: 'Analyze my performance', prompt: 'Give me an analysis of my music career performance and what I should focus on' },
                  { icon: Calendar, label: 'Plan my next release', prompt: 'Help me plan my next music release strategy' },
                  { icon: DollarSign, label: 'Grow my revenue', prompt: 'What are the best ways for me to grow my music revenue?' },
                  { icon: Users, label: 'Build my fan base', prompt: 'How can I grow my fan base and build a stronger community?' },
                ].map(({ icon: Icon, label, prompt }) => (
                  <Button
                    key={label}
                    variant="outline"
                    className="w-full justify-start text-sm h-auto py-2"
                    size="sm"
                    onClick={() => handleSendMessage(prompt)}
                    disabled={chatMutation.isPending}
                  >
                    <Icon className="h-4 w-4 mr-2 flex-shrink-0" />
                    {label}
                  </Button>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={showCreateGoalDialog} onOpenChange={setShowCreateGoalDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Career Goal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Goal Title *</Label>
              <Input
                placeholder="e.g. Reach 10,000 monthly listeners"
                value={newGoalForm.title}
                onChange={(e) => setNewGoalForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Goal Type</Label>
              <Select
                value={newGoalForm.goalType}
                onValueChange={(v) => setNewGoalForm(f => ({ ...f, goalType: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="growth">Fan Growth</SelectItem>
                  <SelectItem value="revenue">Revenue</SelectItem>
                  <SelectItem value="releases">Music Releases</SelectItem>
                  <SelectItem value="networking">Networking</SelectItem>
                  <SelectItem value="streams">Streams</SelectItem>
                  <SelectItem value="skills">Skills</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Target Value *</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="e.g. 10000"
                  value={newGoalForm.targetValue}
                  onChange={(e) => setNewGoalForm(f => ({ ...f, targetValue: Number(e.target.value) || 1 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Input
                  placeholder="e.g. listeners, streams"
                  value={newGoalForm.unit}
                  onChange={(e) => setNewGoalForm(f => ({ ...f, unit: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Deadline</Label>
              <Input
                type="date"
                value={newGoalForm.deadline}
                onChange={(e) => setNewGoalForm(f => ({ ...f, deadline: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Describe your goal and why it matters..."
                value={newGoalForm.description}
                onChange={(e) => setNewGoalForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateGoalDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!newGoalForm.title.trim()) {
                  toast({ title: 'Title required', variant: 'destructive' });
                  return;
                }
                if (!newGoalForm.targetValue || newGoalForm.targetValue < 1) {
                  toast({ title: 'Target value must be at least 1', variant: 'destructive' });
                  return;
                }
                createGoalMutation.mutate({
                  title: newGoalForm.title,
                  goalType: newGoalForm.goalType,
                  targetValue: newGoalForm.targetValue,
                  unit: newGoalForm.unit || undefined,
                  deadline: newGoalForm.deadline ? new Date(newGoalForm.deadline).toISOString() : undefined,
                  description: newGoalForm.description || undefined,
                });
              }}
              disabled={createGoalMutation.isPending}
            >
              {createGoalMutation.isPending ? 'Creating...' : 'Create Goal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
