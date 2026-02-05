import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  FileQuestion,
  Home,
  ArrowLeft,
  Search,
  Music,
  BarChart3,
  Store,
  MessageSquare,
  HelpCircle,
  Zap,
  Users,
  Settings,
  ExternalLink,
} from 'lucide-react';

const popularPages = [
  { name: 'Dashboard', href: '/dashboard', icon: Home, description: 'Your main workspace' },
  { name: 'Studio', href: '/studio', icon: Music, description: 'Create and edit music' },
  { name: 'Analytics', href: '/analytics', icon: BarChart3, description: 'Track your performance' },
  { name: 'Marketplace', href: '/marketplace', icon: Store, description: 'Browse beats and sounds' },
  { name: 'Collaborations', href: '/collaborations', icon: Users, description: 'Work with others' },
  { name: 'Settings', href: '/settings', icon: Settings, description: 'Manage your account' },
];

const helpResources = [
  { name: 'Help Center', href: '/help', icon: HelpCircle },
  { name: 'Contact Support', href: '/help#contact', icon: MessageSquare },
  { name: 'Documentation', href: '/documentation', icon: ExternalLink },
];

export default function NotFound() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setLocation(`/marketplace?search=${encodeURIComponent(searchQuery)}`);
    }
  };

  const handleGoBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation('/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 via-purple-50/30 to-gray-100 dark:from-gray-900 dark:via-purple-900/10 dark:to-gray-800 p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-28 h-28 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/40 dark:to-pink-900/40 mb-6 animate-pulse">
            <FileQuestion className="h-14 w-14 text-purple-600 dark:text-purple-400" />
          </div>
          
          <h1 className="text-7xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-3">
            404
          </h1>
          
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-3">
            Page Not Found
          </h2>
          
          <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto mb-6">
            Looks like this page took a vacation! The page you're looking for doesn't exist or has been moved.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
            <Button 
              onClick={handleGoBack} 
              variant="outline" 
              size="lg"
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </Button>
            <Button 
              onClick={() => setLocation('/dashboard')} 
              size="lg"
              className="gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            >
              <Home className="h-4 w-4" />
              Go to Dashboard
            </Button>
          </div>
        </div>

        <Card className="mb-6 overflow-hidden border-0 shadow-lg">
          <CardContent className="p-6">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search for beats, samples, or artists..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button type="submit" variant="secondary">
                Search
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Zap className="h-5 w-5 text-purple-500" />
                Popular Pages
              </h3>
              <div className="space-y-2">
                {popularPages.map((page) => (
                  <a
                    key={page.href}
                    href={page.href}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center group-hover:bg-purple-200 dark:group-hover:bg-purple-900/50 transition-colors">
                      <page.icon className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {page.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {page.description}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-blue-500" />
                Need Help?
              </h3>
              
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                If you believe this is an error or need assistance, our support team is here to help.
              </p>
              
              <div className="space-y-2 mb-4">
                {helpResources.map((resource) => (
                  <a
                    key={resource.href}
                    href={resource.href}
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <resource.icon className="h-4 w-4" />
                    {resource.name}
                  </a>
                ))}
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Error Code: 404 • Page Not Found
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  URL: {typeof window !== 'undefined' ? window.location.pathname : ''}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="text-center mt-8">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Still stuck?{' '}
            <a href="mailto:support@maxbooster.com" className="text-primary hover:underline">
              Contact our support team
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
