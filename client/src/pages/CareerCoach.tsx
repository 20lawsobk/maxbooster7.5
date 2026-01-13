import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { 
  Brain, Target, TrendingUp, Calendar, CheckCircle, Clock, 
  Lightbulb, Rocket, Star, ArrowRight, MessageSquare, Send,
  Music, DollarSign, Users, BarChart3, Sparkles
} from 'lucide-react';

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

interface CoachMessage {
  id: string;
  role: 'user' | 'coach';
  content: string;
  timestamp: string;
}

export default function CareerCoach() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<CoachMessage[]>([
    {
      id: '1',
      role: 'coach',
      content: "Hi! I'm your AI Career Coach. I analyze your music career data to provide personalized recommendations. How can I help you grow today?",
      timestamp: new Date().toISOString(),
    }
  ]);

  const { data: goalsData } = useQuery<{ goals: CareerGoal[] }>({
    queryKey: ['/api/career-coach/goals'],
    enabled: !!user,
  });

  const { data: recommendationsData } = useQuery<{ recommendations: Recommendation[] }>({
    queryKey: ['/api/career-coach/recommendations'],
    enabled: !!user,
  });

  const { data: insightsData } = useQuery<{ insights: any }>({
    queryKey: ['/api/career-coach/insights'],
    enabled: !!user,
  });

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch('/api/career-coach/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error('Failed to get response');
      return res.json();
    },
    onSuccess: (data) => {
      setChatMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'coach',
          content: data.response,
          timestamp: new Date().toISOString(),
        },
      ]);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to get AI response', variant: 'destructive' });
    },
  });

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    
    setChatMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: 'user',
        content: chatInput,
        timestamp: new Date().toISOString(),
      },
    ]);
    
    chatMutation.mutate(chatInput);
    setChatInput('');
  };

  if (!user) {
    setLocation('/login');
    return null;
  }

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

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
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
                {recommendations.length === 0 ? (
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
                {goals.length === 0 ? (
                  <Card className="p-8 text-center">
                    <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="font-medium">Set your first career goal</h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                      Define what success looks like for you, and I'll help you create a roadmap to get there
                    </p>
                    <Button className="mt-4">
                      Create Goal
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
                            <Badge variant={goal.status === 'completed' ? 'default' : 'outline'}>
                              {goal.status}
                            </Badge>
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
                <div className="grid md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-green-500" />
                        Growth Rate
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold">+24%</p>
                      <p className="text-sm text-muted-foreground">vs last month</p>
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
                      <p className="text-3xl font-bold">87/100</p>
                      <p className="text-sm text-muted-foreground">Above average</p>
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
                      <p className="text-3xl font-bold">2.5</p>
                      <p className="text-sm text-muted-foreground">tracks/month avg</p>
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
                      <p className="text-3xl font-bold">+18%</p>
                      <p className="text-sm text-muted-foreground">quarterly growth</p>
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
                            strokeDasharray={`${78 * 2.51} ${100 * 2.51}`}
                            className="text-primary"
                          />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold">
                          78
                        </span>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-green-500">Good</h4>
                        <p className="text-sm text-muted-foreground">
                          Your career is on a healthy trajectory. Focus on consistency and expanding your network.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-4">
            <Card className="h-[600px] flex flex-col">
              <CardHeader className="border-b">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Chat with Coach
                </CardTitle>
              </CardHeader>
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg p-3 ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        <p className="text-sm">{msg.content}</p>
                      </div>
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
              </ScrollArea>
              <div className="p-4 border-t">
                <div className="flex gap-2">
                  <Input
                    placeholder="Ask me anything..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  />
                  <Button 
                    size="icon" 
                    onClick={handleSendMessage}
                    disabled={chatMutation.isPending || !chatInput.trim()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <Target className="h-4 w-4 mr-2" />
                  Set a new goal
                </Button>
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  View full analytics
                </Button>
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <Calendar className="h-4 w-4 mr-2" />
                  Plan my release
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
