import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Music,
  TrendingUp,
  Share2,
  Target,
  Plus,
  Play,
  Upload,
  Settings,
  Sparkles,
  Zap,
  Crown,
  ArrowRight,
  CheckCircle,
} from 'lucide-react';

interface SimplifiedDashboardProps {
  onUpgrade: () => void;
  userLevel: 'beginner' | 'intermediate' | 'advanced' | string;
}

export default function SimplifiedDashboard({ onUpgrade, userLevel }: SimplifiedDashboardProps) {
  const [, setLocation] = useLocation();
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);

  const quickActions = [
    {
      id: 'upload-music',
      title: 'Upload Your Music',
      description: 'Get your music on all major platforms',
      icon: <Upload className="w-6 h-6" />,
      color: 'bg-blue-500',
      href: '/distribution',
    },
    {
      id: 'create-beat',
      title: 'Create a Beat',
      description: 'Use our AI-powered studio',
      icon: <Music className="w-6 h-6" />,
      color: 'bg-purple-500',
      href: '/studio',
    },
    {
      id: 'share-music',
      title: 'Share on Social',
      description: 'AI-optimized social media posts',
      icon: <Share2 className="w-6 h-6" />,
      color: 'bg-pink-500',
      href: '/social-media',
    },
    {
      id: 'boost-reach',
      title: 'Boost Your Reach',
      description: 'Zero-cost AI advertising',
      icon: <Target className="w-6 h-6" />,
      color: 'bg-red-500',
      href: '/advertising',
    },
  ];

  const beginnerTasks = [
    {
      id: 'setup-profile',
      title: 'Complete Your Profile',
      description: 'Add your artist information and bio',
      completed: completedTasks.includes('setup-profile'),
      points: 10,
    },
    {
      id: 'upload-first-track',
      title: 'Upload Your First Track',
      description: 'Get your music on streaming platforms',
      completed: completedTasks.includes('upload-first-track'),
      points: 25,
    },
    {
      id: 'connect-social',
      title: 'Connect Social Media',
      description: 'Link your social media accounts',
      completed: completedTasks.includes('connect-social'),
      points: 15,
    },
    {
      id: 'create-first-post',
      title: 'Create Your First Post',
      description: 'Share your music with AI-optimized content',
      completed: completedTasks.includes('create-first-post'),
      points: 20,
    },
  ];

  const totalPoints = beginnerTasks.reduce((sum, task) => sum + task.points, 0);
  const earnedPoints = beginnerTasks
    .filter((task) => task.completed)
    .reduce((sum, task) => sum + task.points, 0);
  const progressPercentage = (earnedPoints / totalPoints) * 100;

  const handleTaskComplete = (taskId: string) => {
    setCompletedTasks((prev) => [...prev, taskId]);
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'beginner':
        return 'bg-green-100 text-green-800';
      case 'intermediate':
        return 'bg-yellow-100 text-yellow-800';
      case 'advanced':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Welcome to Max Booster</h1>
            <p className="text-gray-600 mt-2">Your simplified music career management dashboard</p>
          </div>
          <div className="flex items-center space-x-4">
            <Badge className={getLevelColor(userLevel)}>{userLevel} Mode</Badge>
            <Button onClick={onUpgrade} variant="outline">
              <Crown className="w-4 h-4 mr-2" />
              Upgrade to Full Mode
            </Button>
          </div>
        </div>

        {/* Progress Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-blue-500" />
              <span>Your Progress</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Getting Started</span>
                <span className="text-sm text-gray-600">
                  {earnedPoints}/{totalPoints} points
                </span>
              </div>
              <Progress value={progressPercentage} className="h-3" />
              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 text-yellow-500" />
                <span className="text-sm text-gray-600">
                  {progressPercentage >= 100
                    ? '🎉 All tasks completed!'
                    : `${Math.round(100 - progressPercentage)}% to completion`}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick Actions */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <p className="text-gray-600">Start with these essential tasks</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {quickActions.map((action) => (
                    <Card
                      key={action.id}
                      className="hover:shadow-md transition-shadow cursor-pointer"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start space-x-3">
                          <div className={`p-2 rounded-lg ${action.color} text-white`}>
                            {action.icon}
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold">{action.title}</h3>
                            <p className="text-sm text-gray-600 mt-1">{action.description}</p>
                            <Button
                              size="sm"
                              className="mt-3"
                              variant="outline"
                              onClick={() => setLocation(action.href)}
                            >
                              Get Started
                              <ArrowRight className="w-3 h-3 ml-1" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Getting Started Tasks */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Getting Started</CardTitle>
                <p className="text-gray-600">Complete these tasks to unlock features</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {beginnerTasks.map((task) => (
                    <div
                      key={task.id}
                      className={`p-3 rounded-lg border-2 transition-colors ${
                        task.completed
                          ? 'border-green-200 bg-green-50'
                          : 'border-gray-200 bg-white hover:border-blue-200'
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        <div className="mt-1">
                          {task.completed ? (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                          ) : (
                            <div className="w-5 h-5 border-2 border-gray-300 rounded-full" />
                          )}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-sm">{task.title}</h4>
                          <p className="text-xs text-gray-600 mt-1">{task.description}</p>
                          <div className="flex items-center justify-between mt-2">
                            <Badge variant="secondary" className="text-xs">
                              +{task.points} pts
                            </Badge>
                            {!task.completed && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleTaskComplete(task.id)}
                                className="text-xs"
                              >
                                Mark Complete
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg">
                <div className="p-2 bg-blue-500 rounded-lg text-white">
                  <Play className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-sm">Welcome to Max Booster!</p>
                  <p className="text-xs text-gray-600">
                    Your account has been created successfully
                  </p>
                </div>
                <Badge variant="secondary" className="ml-auto">
                  Just now
                </Badge>
              </div>

              <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <div className="p-2 bg-gray-400 rounded-lg text-white">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-medium text-sm">Complete your profile</p>
                  <p className="text-xs text-gray-600">
                    Add your artist information to get started
                  </p>
                </div>
                <Button size="sm" variant="outline">
                  Complete
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tips and Tricks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-yellow-500" />
              <span>Pro Tips</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                <h4 className="font-semibold text-sm mb-2">🎵 Start with Distribution</h4>
                <p className="text-xs text-gray-600">
                  Upload your music first to get it on all major platforms
                </p>
              </div>
              <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg">
                <h4 className="font-semibold text-sm mb-2">🤖 Use AI Features</h4>
                <p className="text-xs text-gray-600">
                  Let AI optimize your social media posts and advertising
                </p>
              </div>
              <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg">
                <h4 className="font-semibold text-sm mb-2">📈 Track Your Progress</h4>
                <p className="text-xs text-gray-600">
                  Monitor your analytics to see what's working
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
