import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Logo } from '@/components/ui/Logo';
import { Target, Heart, Zap, Users } from 'lucide-react';

export default function About() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 backdrop-blur-lg bg-white/80 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/">
              <div className="cursor-pointer">
                <Logo size="md" />
              </div>
            </Link>
            <div className="flex items-center space-x-4">
              <Link href="/solo-founder-story">
                <Button variant="ghost">Founder Story</Button>
              </Link>
              <Link href="/pricing">
                <Button>Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative px-4 pt-20 pb-16 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-6">
            About Max Booster
            <span className="block bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              Built by Musicians, for Musicians
            </span>
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            The complete platform for independent artists to create, distribute, promote, and
            monetize their music
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="py-16 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <Target className="h-16 w-16 mx-auto mb-6 text-blue-600" />
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Our Mission</h2>
            <p className="text-xl text-gray-700 dark:text-gray-300 leading-relaxed">
              To democratize the music industry by providing independent artists with
              professional-grade tools that were previously only accessible to major label
              artists—all in one affordable platform.
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-12 text-center">Our Values</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: Heart,
                title: 'Artist-First',
                description:
                  'Every decision is made with independent artists in mind. Your success is our success.',
              },
              {
                icon: Zap,
                title: 'Innovation',
                description:
                  'We leverage cutting-edge AI and automation to give you tools that work as hard as you do.',
              },
              {
                icon: Users,
                title: 'Community',
                description:
                  "We're building a platform for artists, by artists. Your feedback shapes our roadmap.",
              },
            ].map((value, i) => (
              <Card key={i} className="text-center hover-lift dark:bg-gray-900 dark:border-gray-700">
                <CardContent className="p-8">
                  <value.icon className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{value.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400">{value.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* The Platform */}
      <section className="py-16 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">The Platform</h2>
            <div className="space-y-6 text-gray-700 dark:text-gray-300 leading-relaxed">
              <p>
                Max Booster started with a simple question: Why should independent artists pay for
                multiple expensive platforms when everything could work together seamlessly?
              </p>
              <p>We've built the industry's first truly unified platform that combines:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>AI-powered music production and mastering</li>
                <li>Global distribution to 150+ streaming platforms</li>
                <li>Automated social media marketing</li>
                <li>Beat marketplace with integrated licensing</li>
                <li>Real-time analytics and royalty tracking</li>
              </ul>
              <p>
                Instead of juggling subscriptions to DistroKid ($20), BeatStars ($30), Studio One
                ($400), Hootsuite ($100), and various ad platforms ($200+), you get everything in
                Max Booster for just $49/month.
              </p>
              <p className="font-medium text-blue-600">
                Save over $500/month while getting better tools and a unified workflow.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: '10,000+', label: 'Active Artists' },
              { value: '500K+', label: 'Tracks Distributed' },
              { value: '$2M+', label: 'Artist Earnings' },
              { value: '150+', label: 'DSP Partners' },
            ].map((stat, i) => (
              <div key={i}>
                <div className="text-4xl font-bold text-blue-600 mb-2">{stat.value}</div>
                <div className="text-gray-600 dark:text-gray-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-cyan-600">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white mb-6">
            Join Thousands of Independent Artists
          </h2>
          <p className="text-xl text-white/90 mb-8">Start your 90-day risk-free trial today</p>
          <Link href="/pricing">
            <Button size="lg" variant="secondary" className="px-8 py-4 text-lg">
              Get Started Now
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
