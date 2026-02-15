import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Logo } from '@/components/ui/Logo';
import { Code, Key, Zap, Shield, Database } from 'lucide-react';

export default function API() {
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
              <Link href="/documentation">
                <Button variant="ghost">Docs</Button>
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
          <Code className="h-16 w-16 mx-auto mb-6 text-blue-600" />
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            Max Booster API
            <span className="block bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              Build with Our Platform
            </span>
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Powerful REST API for integrating music distribution, AI tools, and analytics into your
            applications
          </p>
        </div>
      </section>

      {/* Quick Start */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-8">Quick Start</h2>
            <Card className="mb-6">
              <CardContent className="p-6">
                <div className="flex items-center mb-4">
                  <Key className="h-6 w-6 text-blue-600 mr-2" />
                  <h3 className="text-lg font-semibold">1. Get Your API Key</h3>
                </div>
                <p className="text-gray-600 mb-4">
                  API keys are available to all paid subscribers. Access your keys from the Settings
                  → Developer section.
                </p>
                <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm">
                  curl https://api.maxbooster.com/v1/me \<br />
                  &nbsp;&nbsp;-H "Authorization: Bearer YOUR_API_KEY"
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center mb-4">
                  <Zap className="h-6 w-6 text-green-600 mr-2" />
                  <h3 className="text-lg font-semibold">2. Make Your First Request</h3>
                </div>
                <p className="text-gray-600 mb-4">
                  All API requests use JSON and return standard HTTP status codes.
                </p>
                <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm">
                  {`// Create a new release
POST /api/v1/releases
{
  "title": "My Album",
  "artist": "Artist Name",
  "releaseDate": "2025-01-01"
}`}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* API Endpoints */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">API Endpoints</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                category: 'Distribution',
                endpoints: [
                  'POST /releases',
                  'GET /releases/:id',
                  'PUT /releases/:id',
                  'POST /releases/:id/submit',
                  'GET /releases/:id/status',
                ],
              },
              {
                category: 'Marketplace',
                endpoints: [
                  'POST /listings',
                  'GET /listings',
                  'GET /listings/:id',
                  'POST /orders',
                  'GET /orders/:id',
                ],
              },
              {
                category: 'AI Studio',
                endpoints: [
                  'POST /projects',
                  'GET /projects/:id',
                  'POST /ai/mix',
                  'POST /ai/master',
                  'POST /upload',
                ],
              },
              {
                category: 'Social Media',
                endpoints: [
                  'POST /campaigns',
                  'GET /campaigns/:id',
                  'POST /social/generate',
                  'POST /social/schedule',
                  'GET /social/metrics',
                ],
              },
              {
                category: 'Analytics',
                endpoints: [
                  'GET /analytics/dashboard',
                  'GET /analytics/streams',
                  'GET /analytics/revenue',
                  'GET /analytics/platforms',
                ],
              },
              {
                category: 'User',
                endpoints: ['GET /me', 'PUT /me', 'GET /notifications', 'POST /notifications/read'],
              },
            ].map((group, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">{group.category}</h3>
                  <ul className="space-y-2">
                    {group.endpoints.map((endpoint, j) => (
                      <li key={j} className="font-mono text-sm text-gray-700">
                        {endpoint}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">API Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Shield,
                title: 'Secure Authentication',
                description: 'Industry-standard OAuth 2.0 and API key authentication',
              },
              {
                icon: Zap,
                title: 'Real-time Webhooks',
                description: 'Get instant notifications for events like releases going live',
              },
              {
                icon: Database,
                title: 'Rate Limiting',
                description: 'Fair usage with generous rate limits for all tiers',
              },
            ].map((feature, i) => (
              <Card key={i} className="text-center">
                <CardContent className="p-6">
                  <feature.icon className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-gray-600 text-sm">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-cyan-600">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to Build?</h2>
          <p className="text-xl text-white/90 mb-8">
            Get started with our API today. All plans include full API access.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/pricing">
              <Button size="lg" variant="secondary">
                Get API Access
              </Button>
            </Link>
            <Link href="/documentation">
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white hover:text-blue-600"
              >
                View Full Docs
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
