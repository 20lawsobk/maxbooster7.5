import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Logo } from '@/components/ui/Logo';
import { Shield, Lock, Eye, Server, Key, FileCheck } from 'lucide-react';

export default function SecurityPage() {
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
              <Link href="/privacy">
                <Button variant="ghost">Privacy</Button>
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
          <Shield className="h-16 w-16 mx-auto mb-6 text-blue-600" />
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Security & Trust
            <span className="block bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              Your Data is Safe with Us
            </span>
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Enterprise-grade security measures to protect your music, data, and financial
            information
          </p>
        </div>
      </section>

      {/* Security Features */}
      <section className="py-16 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Lock,
                title: 'End-to-End Encryption',
                description:
                  'All data transmitted to and from Max Booster is encrypted using TLS 1.3, the latest industry standard.',
              },
              {
                icon: Server,
                title: 'Secure Infrastructure',
                description:
                  'Our servers are hosted on enterprise-grade infrastructure with 24/7 monitoring and automatic failover.',
              },
              {
                icon: Key,
                title: 'Two-Factor Authentication',
                description:
                  'Optional 2FA adds an extra layer of security to protect your account from unauthorized access.',
              },
              {
                icon: Eye,
                title: 'Privacy by Design',
                description:
                  "We collect only what's necessary and never sell your data. You own your music and information.",
              },
              {
                icon: FileCheck,
                title: 'Regular Security Audits',
                description:
                  'Independent security audits and penetration testing ensure our systems stay secure.',
              },
              {
                icon: Shield,
                title: 'GDPR Compliant',
                description:
                  'We comply with GDPR, CCPA, and other privacy regulations to protect your rights.',
              },
            ].map((feature, i) => (
              <Card key={i} className="hover-lift dark:bg-gray-800 dark:border-gray-700">
                <CardContent className="p-6">
                  <feature.icon className="h-10 w-10 text-blue-600 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{feature.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Payment Security */}
      <section className="py-16 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">Payment Security</h2>
            <Card className="dark:bg-gray-900 dark:border-gray-700">
              <CardContent className="p-8">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Stripe Integration</h3>
                    <p className="text-gray-700 dark:text-gray-300">
                      All payments are processed through Stripe, a PCI DSS Level 1 certified payment
                      processor. We never store your credit card information on our servers.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                      Secure Royalty Payouts
                    </h3>
                    <p className="text-gray-700 dark:text-gray-300">
                      Your earnings are protected with bank-level security. Stripe Connect ensures
                      your financial information is encrypted and never exposed.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Fraud Protection</h3>
                    <p className="text-gray-700 dark:text-gray-300">
                      Advanced fraud detection algorithms monitor all transactions in real-time to
                      protect both buyers and sellers in our marketplace.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Data Protection */}
      <section className="py-16 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">Data Protection</h2>
            <div className="space-y-6 text-gray-700 dark:text-gray-300">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  Your Music, Your Rights
                </h3>
                <p>
                  You retain 100% ownership of all music you upload. We act only as a distributor
                  and platform provider.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Data Backups</h3>
                <p>
                  All projects and music files are backed up daily with geo-redundant storage across
                  multiple regions.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Right to Delete</h3>
                <p>
                  You can permanently delete your account and all associated data at any time from
                  your settings.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Transparent Practices</h3>
                <p>
                  We provide clear information about what data we collect, how we use it, and who we
                  share it with (spoiler: only DSPs you choose).
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Responsible Disclosure */}
      <section className="py-16 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Responsible Disclosure</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              Found a security vulnerability? We appreciate responsible disclosure. Please report
              security issues to our security team at:
            </p>
            <a
              href="mailto:security@maxbooster.com"
              className="text-blue-600 hover:underline font-medium text-lg"
            >
              security@maxbooster.com
            </a>
            <p className="text-gray-600 dark:text-gray-400 text-sm mt-4">
              We'll respond within 24 hours and work with you to resolve the issue.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-cyan-600">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white mb-4">Start Securely Today</h2>
          <p className="text-xl text-white/90 mb-8">
            Join Max Booster with confidence. Your data and music are protected.
          </p>
          <Link href="/pricing">
            <Button size="lg" variant="secondary">
              Get Started - 90-Day Guarantee
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
