import { useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Logo } from '@/components/ui/Logo';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  Sparkles,
  BarChart3,
  Share2,
  Megaphone,
  DollarSign,
  Check,
  ArrowRight,
  Play,
  Star,
  Users,
  TrendingUp,
  Music,
  Shield,
  Menu,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const demoSlides = [
  {
    title: 'AI-Powered Studio',
    description: 'Professional DAW with AI mixing, mastering, and 1000+ plugins. Create studio-quality music in your browser.',
    image: '/images/demo/ai_studio_daw_interface.png',
  },
  {
    title: 'Analytics Dashboard',
    description: 'Track streams, revenue, and fan growth across all platforms. AI-powered insights to grow your career.',
    image: '/images/demo/analytics_dashboard_interface.png',
  },
  {
    title: 'Social Media Autopilot',
    description: 'AI schedules and creates content across all platforms. Grow your audience on autopilot 24/7.',
    image: '/images/demo/social_media_management_dashboard.png',
  },
  {
    title: 'Music Distribution',
    description: 'Release to Spotify, Apple Music, and 150+ platforms. Keep 100% of your royalties.',
    image: '/images/demo/music_distribution_interface.png',
  },
  {
    title: 'Beat Marketplace',
    description: 'Sell beats and samples directly to artists. Built-in licensing and secure payments.',
    image: '/images/demo/beat_marketplace_interface.png',
  },
];

export default function Landing() {
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % demoSlides.length);
  const prevSlide = () => setCurrentSlide((prev) => (prev - 1 + demoSlides.length) % demoSlides.length);

  const startDemo = async () => {
    setIsDemoLoading(true);
    try {
      const response = await fetch('/api/auth/demo', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (response.ok) {
        window.location.href = '/dashboard';
      } else if (response.status === 429) {
        alert('Too many demo requests. Please try again later.');
      } else {
        setIsVideoOpen(true);
      }
    } catch {
      setIsVideoOpen(true);
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 backdrop-blur-lg bg-white/80 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Logo size="md" />

            {/* Desktop Navigation - visible on sm screens and up */}
            <div className="hidden sm:flex items-center space-x-2 md:space-x-4">
              <Link href="/features">
                <Button variant="ghost" size="sm" className="text-sm md:text-base px-3 md:px-4">
                  Features
                </Button>
              </Link>
              <Link href="/pricing">
                <Button variant="ghost" size="sm" className="text-sm md:text-base px-3 md:px-4">
                  Pricing
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="ghost" size="sm" className="text-sm md:text-base px-3 md:px-4">
                  Sign In
                </Button>
              </Link>
              <Link href="/pricing">
                <Button size="sm" className="text-sm md:text-base px-3 md:px-4">
                  Get Started
                </Button>
              </Link>
            </div>

            {/* Mobile Hamburger Menu - visible only on xs screens */}
            <div className="flex sm:hidden items-center gap-2">
              <Link href="/pricing">
                <Button size="sm" className="text-xs px-3">
                  Get Started
                </Button>
              </Link>
              <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Menu className="h-6 w-6" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-64">
                  <SheetHeader>
                    <SheetTitle>Menu</SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col space-y-4 mt-8">
                    <Link href="/features">
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        Features
                      </Button>
                    </Link>
                    <Link href="/pricing">
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        Pricing
                      </Button>
                    </Link>
                    <Link href="/login">
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        Sign In
                      </Button>
                    </Link>
                    <Link href="/pricing">
                      <Button className="w-full" onClick={() => setIsMobileMenuOpen(false)}>
                        Get Started
                      </Button>
                    </Link>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative px-4 pt-20 pb-32 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <Badge className="mb-6 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-700">
            <Shield className="h-4 w-4 mr-2" />
            90-Day Money Back Guarantee
          </Badge>
          <h1 className="text-4xl sm:text-6xl font-bold text-gray-900 dark:text-white mb-8">
            All-In-One Music Career Platform
            <span className="block bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              Powered by AI
            </span>
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-6 max-w-3xl mx-auto">
            Professional AI Studio • AI-Assisted Social Media • Organic Marketing Tools • Beat
            Marketplace • Analytics • Distribution
          </p>
          <p className="text-lg font-medium text-green-600 mb-8">
            Purchase with confidence • 90-day money-back guarantee
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/pricing">
              <Button size="lg" className="px-8 py-4 text-lg">
                Get Started - 90-Day Guarantee
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Button
              size="lg"
              variant="outline"
              className="px-8 py-4 text-lg"
              onClick={startDemo}
              disabled={isDemoLoading}
              data-testid="button-watch-demo"
            >
              {isDemoLoading ? (
                <>
                  <div className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Loading...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-5 w-5" />
                  Try Demo
                </>
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* Value Props Section */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { label: 'Integrated Tools', value: '7+', icon: Sparkles },
              { label: 'Platforms Supported', value: '8+', icon: Share2 },
              { label: 'Money Back Guarantee', value: '90 Days', icon: Shield },
              { label: 'AI-Powered Features', value: '15+', icon: DollarSign },
            ].map((stat, index) => (
              <div key={index} className="text-center">
                <div className="w-16 h-16 gradient-bg rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <stat.icon className="h-8 w-8 text-white" />
                </div>
                <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{stat.value}</div>
                <div className="text-gray-600 dark:text-gray-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Everything You Need to Succeed
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              From creation to monetization, Max Booster provides all the tools you need to build a
              successful music career.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Sparkles,
                title: 'AI Studio & Mastering',
                description:
                  'Create, mix, and master your tracks with AI assistance. Professional quality results in minutes.',
                color: 'from-blue-500 to-cyan-500',
              },
              {
                icon: BarChart3,
                title: 'Advanced Analytics',
                description:
                  'Track your performance across all platforms with detailed insights and revenue forecasts.',
                color: 'from-purple-500 to-pink-500',
              },
              {
                icon: Share2,
                title: 'AI Social Media Manager',
                description:
                  'AI-powered content creation and scheduling for Facebook, Instagram, X, TikTok, LinkedIn, and Threads with approval workflows.',
                color: 'from-green-500 to-teal-500',
              },
              {
                icon: Megaphone,
                title: 'Organic Marketing Tools',
                description:
                  'AI-assisted campaign creation and optimization through your connected social accounts — no paid advertising required.',
                color: 'from-orange-500 to-red-500',
              },
              {
                icon: DollarSign,
                title: 'Royalty Management',
                description:
                  'Automated royalty collection and distribution with Stripe integration for instant payouts.',
                color: 'from-indigo-500 to-blue-500',
              },
              {
                icon: Music,
                title: 'Beat Marketplace',
                description:
                  'Buy and sell beats with integrated peer-to-peer transactions and licensing management.',
                color: 'from-pink-500 to-purple-500',
              },
            ].map((feature, index) => (
              <Card
                key={index}
                className="relative overflow-hidden group hover-lift transition-all duration-300 dark:bg-gray-900 dark:border-gray-700"
              >
                <CardContent className="p-6">
                  <div
                    className={`w-12 h-12 bg-gradient-to-r ${feature.color} rounded-lg flex items-center justify-center mb-4`}
                  >
                    <feature.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{feature.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-20 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-12 max-w-2xl mx-auto">
            Choose the plan that fits your needs. All plans include our core AI features.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                name: 'Monthly',
                price: '$49',
                period: '/month',
                description: 'Perfect for getting started',
                features: [
                  'All AI Tools',
                  'Unlimited Projects',
                  'Advanced Analytics',
                  'Cloud Storage',
                ],
                popular: false,
              },
              {
                name: 'Yearly',
                price: '$468',
                period: '/year',
                originalPrice: '$588',
                description: 'Billed annually ($39/month)',
                features: [
                  'All AI Tools',
                  'Unlimited Projects',
                  'Advanced Analytics',
                  'Cloud Storage',
                ],
                popular: true,
              },
              {
                name: 'Lifetime',
                price: '$699',
                period: 'once',
                description: 'Pay once, access forever',
                features: [
                  'All AI Tools',
                  'Unlimited Projects',
                  'Advanced Analytics',
                  'Cloud Storage',
                ],
                popular: false,
              },
            ].map((plan, index) => (
              <Card
                key={index}
                className={`relative dark:bg-gray-900 dark:border-gray-700 ${plan.popular ? 'border-primary shadow-xl scale-105' : ''}`}
              >
                {plan.popular && (
                  <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-primary">
                    Most Popular
                  </Badge>
                )}
                <CardContent className="p-6 text-center">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{plan.name}</h3>
                  <div className="mb-4">
                    <span className="text-4xl font-bold text-gray-900 dark:text-white">{plan.price}</span>
                    <span className="text-gray-500 dark:text-gray-400">{plan.period}</span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">{plan.description}</p>
                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center justify-center space-x-2">
                        <Check className="h-4 w-4 text-green-500" />
                        <span className="text-gray-600 dark:text-gray-400">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href={`/subscribe/${plan.name.toLowerCase()}`}>
                    <Button
                      className={`w-full ${plan.popular ? 'gradient-bg' : ''}`}
                      variant={plan.popular ? 'default' : 'outline'}
                    >
                      Get Started
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-12">
            <Link href="/pricing">
              <Button variant="ghost" size="lg">
                View Detailed Pricing
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* What You Get */}
      <section className="py-20 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">What's Included</h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Everything you need to create, promote, and monetize your music
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: Sparkles,
                title: 'AI-Powered Studio',
                content:
                  'Professional DAW with AI mixing and mastering tools, multi-track editing, effects, and cloud storage for all your projects.',
              },
              {
                icon: Share2,
                title: 'Social Media Manager',
                content:
                  'Connect Facebook, Instagram, X, TikTok, LinkedIn, Threads, and YouTube. AI-assisted content creation with approval workflows.',
              },
              {
                icon: BarChart3,
                title: 'Advanced Analytics',
                content:
                  'Track performance across all platforms with AI-powered predictions, churn detection, revenue forecasts, and detailed insights.',
              },
            ].map((feature, index) => (
              <Card key={index} className="dark:bg-gray-900 dark:border-gray-700">
                <CardContent className="p-6">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2 text-lg">{feature.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400">{feature.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-cyan-600 text-white">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center mb-6">
            <Badge className="bg-white/20 text-white border-white/30 px-4 py-2">
              <Shield className="h-5 w-5 mr-2" />
              90-Day Money Back Guarantee
            </Badge>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to Boost Your Music Career?</h2>
          <p className="text-xl mb-8 opacity-90">
            Start growing your music career today with our comprehensive platform. Protected by our
            90-day money-back guarantee!
          </p>
          <div className="flex justify-center">
            <Link href="/register">
              <Button size="lg" variant="secondary" className="px-8 py-4 text-lg">
                Get Started - 90-Day Guarantee
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
          <p className="text-sm mt-4 opacity-80">
            Secure payment • Cancel anytime • 100% money back within 90 days
          </p>
        </div>
      </section>

      {/* Demo Feature Showcase Modal */}
      <Dialog open={isVideoOpen} onOpenChange={setIsVideoOpen}>
        <DialogContent className="max-w-5xl p-0">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle>{demoSlides[currentSlide].title}</DialogTitle>
            <DialogDescription>{demoSlides[currentSlide].description}</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <div className="aspect-video w-full bg-gray-900 overflow-hidden">
              <img
                src={demoSlides[currentSlide].image}
                alt={demoSlides[currentSlide].title}
                className="w-full h-full object-cover"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full h-10 w-10"
              onClick={prevSlide}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full h-10 w-10"
              onClick={nextSlide}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>
          <div className="flex justify-center gap-2 p-4">
            {demoSlides.map((_, index) => (
              <button
                key={index}
                className={`w-3 h-3 rounded-full transition-colors ${
                  index === currentSlide ? 'bg-blue-600' : 'bg-gray-300 hover:bg-gray-400'
                }`}
                onClick={() => setCurrentSlide(index)}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="bg-gray-900 dark:bg-gray-950 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="mb-4 flex items-center space-x-2">
                <Logo size="small" />
              </div>
              <p className="text-gray-400 dark:text-gray-500">
                Built by a musician for musicians. Independently operated with personal attention to
                every artist's success.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Platform</h3>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <Link href="/features">
                    <span className="hover:text-white cursor-pointer">Features</span>
                  </Link>
                </li>
                <li>
                  <Link href="/pricing">
                    <span className="hover:text-white cursor-pointer">Pricing</span>
                  </Link>
                </li>
                <li>
                  <Link href="/api-docs">
                    <span className="hover:text-white cursor-pointer">API</span>
                  </Link>
                </li>
                <li>
                  <Link href="/documentation">
                    <span className="hover:text-white cursor-pointer">Documentation</span>
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">About</h3>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <Link href="/about">
                    <span className="hover:text-white cursor-pointer">The Platform</span>
                  </Link>
                </li>
                <li>
                  <Link href="/blog">
                    <span className="hover:text-white cursor-pointer">Blog</span>
                  </Link>
                </li>
                <li>
                  <Link href="/solo-founder-story">
                    <span className="hover:text-white cursor-pointer">Solo Founder Story</span>
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Legal</h3>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <Link href="/privacy">
                    <span className="hover:text-white cursor-pointer">Privacy</span>
                  </Link>
                </li>
                <li>
                  <Link href="/terms">
                    <span className="hover:text-white cursor-pointer">Terms</span>
                  </Link>
                </li>
                <li>
                  <Link href="/security">
                    <span className="hover:text-white cursor-pointer">Security</span>
                  </Link>
                </li>
                <li>
                  <Link href="/dmca">
                    <span className="hover:text-white cursor-pointer">DMCA</span>
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 mt-8 text-center text-gray-400">
            <p>
              &copy; 2025 Max Booster. All rights reserved. • Solo founded & operated with ❤️ for
              artists
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
