import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Logo } from '@/components/ui/Logo';
import { BookOpen, Code, Zap, Database, Cloud, Lock } from 'lucide-react';

export default function Documentation() {
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
              <Link href="/api-docs">
                <Button variant="ghost">API</Button>
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
          <BookOpen className="h-16 w-16 mx-auto mb-6 text-blue-600" />
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            Documentation
            <span className="block bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              Everything You Need to Know
            </span>
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Comprehensive guides, tutorials, and API documentation for Max Booster
          </p>
        </div>
      </section>

      {/* Quick Start */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">Quick Start Guides</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Zap,
                title: 'Getting Started',
                description: 'Set up your account and start creating music in 5 minutes',
                topics: [
                  'Account Setup',
                  'First Project',
                  'Profile Configuration',
                  'Payment Setup',
                ],
              },
              {
                icon: Code,
                title: 'Studio Basics',
                description: 'Learn the DAW workspace and production tools',
                topics: ['Track Creation', 'Audio Recording', 'AI Mixing', 'Plugin Usage'],
              },
              {
                icon: Cloud,
                title: 'Distribution',
                description: 'Release your music to streaming platforms worldwide',
                topics: ['Release Setup', 'DSP Selection', 'Royalty Tracking', 'Analytics'],
              },
            ].map((guide, i) => (
              <Card key={i} className="hover-lift">
                <CardContent className="p-6">
                  <guide.icon className="h-10 w-10 text-blue-600 mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">{guide.title}</h3>
                  <p className="text-gray-600 mb-4">{guide.description}</p>
                  <ul className="space-y-1">
                    {guide.topics.map((topic, j) => (
                      <li key={j} className="text-sm text-gray-500">
                        • {topic}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Documentation */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            Feature Documentation
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                title: 'AI Studio & Production',
                topics: [
                  'DAW Interface Overview',
                  'AI Mixing Guide',
                  'AI Mastering Guide',
                  'Plugin Management',
                  'Collaboration Features',
                  'Cloud Storage & Autosave',
                ],
              },
              {
                title: 'Distribution & Royalties',
                topics: [
                  'Creating Releases',
                  'DSP Submission',
                  'ISRC/UPC Codes',
                  'Royalty Analytics',
                  'Payment Processing',
                  'Split Payments',
                ],
              },
              {
                title: 'Social Media Automation',
                topics: [
                  'Platform Connections',
                  'AI Content Generation',
                  'Post Scheduling',
                  'A/B Testing',
                  'Analytics Dashboard',
                  'Campaign Management',
                ],
              },
              {
                title: 'Beat Marketplace',
                topics: [
                  'Creating Listings',
                  'Pricing Strategy',
                  'License Types',
                  'Stripe Integration',
                  'Sales Analytics',
                  'Buyer Protection',
                ],
              },
            ].map((section, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <h3 className="text-xl font-semibold text-gray-900 mb-4">{section.title}</h3>
                  <ul className="space-y-2">
                    {section.topics.map((topic, j) => (
                      <li key={j} className="flex items-center text-gray-700">
                        <span className="w-2 h-2 bg-blue-600 rounded-full mr-3"></span>
                        {topic}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Technical Resources */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">Technical Resources</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Code,
                title: 'API Reference',
                description: 'Complete REST API documentation with examples',
                link: '/api-docs',
              },
              {
                icon: Database,
                title: 'Webhooks',
                description: 'Real-time event notifications for integrations',
                link: '/api-docs#webhooks',
              },
              {
                icon: Lock,
                title: 'Security',
                description: 'Authentication, encryption, and best practices',
                link: '/security',
              },
            ].map((resource, i) => (
              <Link key={i} href={resource.link}>
                <Card className="hover-lift cursor-pointer">
                  <CardContent className="p-6 text-center">
                    <resource.icon className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{resource.title}</h3>
                    <p className="text-gray-600 text-sm">{resource.description}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Help Section */}
      <section className="py-16 bg-gradient-to-r from-blue-600 to-cyan-600">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white mb-4">Need Help?</h2>
          <p className="text-xl text-white/90 mb-8">
            Can't find what you're looking for? Check out the Help Center for comprehensive guides.
          </p>
          <div className="flex justify-center">
            <Link href="/help">
              <Button
                size="lg"
                variant="secondary"
              >
                Visit Help Center
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
