import { useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Logo } from '@/components/ui/Logo';
import { Check, ArrowLeft, Sparkles, Shield, Clock, CheckCircle, Menu } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

export default function Pricing() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const plans = [
    {
      id: 'monthly',
      name: 'Monthly',
      price: 49,
      period: 'month',
      description: 'Perfect for getting started',
      popular: false,
      features: [
        'Professional AI Music Studio (DAW)',
        'Autonomous Social Media Autopilot (24/7)',
        'AI-Enhanced Organic Advertisement Autopilot',
        'Beat Marketplace & Licensing',
        'Professional Analytics Dashboard',
        'Distribution to 150+ Platforms',
        'AI Mixing & Mastering',
        'Royalty Tracking & Splits',
        'Email Marketing System',
        'Unlimited Active Projects',
        'Premium Content Library',
        'Cloud Storage',
        'Comprehensive Help Center',
      ],
    },
    {
      id: 'yearly',
      name: 'Yearly',
      price: 39,
      originalPrice: 49,
      period: 'month',
      billedAnnually: true,
      description: 'Save $120/year with annual billing',
      popular: true,
      features: [
        'Professional AI Music Studio (DAW)',
        'Autonomous Social Media Autopilot (24/7)',
        'AI-Enhanced Organic Advertisement Autopilot',
        'Beat Marketplace & Licensing',
        'Professional Analytics Dashboard',
        'Distribution to 150+ Platforms',
        'AI Mixing & Mastering',
        'Royalty Tracking & Splits',
        'Email Marketing System',
        'Unlimited Active Projects',
        'Premium Content Library',
        'Cloud Storage',
        'Comprehensive Help Center',
      ],
    },
    {
      id: 'lifetime',
      name: 'Lifetime',
      price: 699,
      period: 'once',
      description: 'Pay once, access forever',
      popular: false,
      features: [
        'Professional AI Music Studio (DAW)',
        'Autonomous Social Media Autopilot (24/7)',
        'AI-Enhanced Organic Advertisement Autopilot',
        'Beat Marketplace & Licensing',
        'Professional Analytics Dashboard',
        'Distribution to 150+ Platforms',
        'AI Mixing & Mastering',
        'Royalty Tracking & Splits',
        'Email Marketing System',
        'Unlimited Active Projects',
        'Premium Content Library',
        'Cloud Storage',
        'Comprehensive Help Center',
      ],
    },
  ];

  const faqItems = [
    {
      question: 'What payment methods do you accept?',
      answer:
        'Max Booster accepts all major credit cards (Visa, MasterCard, American Express) and PayPal through secure Stripe payment processing.',
    },
    {
      question: 'Can I change my plan later?',
      answer:
        'Yes! You can upgrade or downgrade your plan at any time. Changes will be prorated and reflected in your next billing cycle.',
    },
    {
      question: 'Do you offer a money-back guarantee?',
      answer:
        "Absolutely! Max Booster offers a full 90-day 100% money-back guarantee. If you're not completely satisfied, you'll receive a full refund of your entire payment, no questions asked.",
    },
    {
      question: 'What happens to my projects if I cancel?',
      answer:
        'Your projects and data remain accessible for 30 days after cancellation. You can download all your content during this period.',
    },
    {
      question: 'Do you offer student discounts?',
      answer:
        'Yes! Students receive 50% off all plans with valid student verification through the partner program.',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 backdrop-blur-lg bg-white/80 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/">
              <Button variant="ghost" className="flex items-center space-x-2">
                <ArrowLeft className="h-4 w-4" />
                <Logo size="sm" />
              </Button>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-4">
              <Link href="/features">
                <Button variant="ghost">Features</Button>
              </Link>
              <Link href="/login">
                <Button variant="ghost">Sign In</Button>
              </Link>
              <Link href="/pricing">
                <Button>Get Started</Button>
              </Link>
            </div>

            {/* Mobile Hamburger Menu */}
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild className="md:hidden">
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
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        {/* 90-Day Guarantee Banner */}
        <div className="mb-12 mx-auto max-w-4xl">
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-2 border-green-200 dark:border-green-700 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-center space-x-4">
              <Shield className="h-12 w-12 text-green-600 dark:text-green-400 flex-shrink-0" />
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  90-Day Money Back Guarantee
                </h2>
                <p className="text-gray-600 dark:text-gray-300">
                  Purchase Max Booster with confidence. If you're not completely satisfied within 90
                  days, you'll receive a 100% refund of your payment—no questions asked.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="text-center mb-16">
          <Badge className="mb-6 bg-primary/10 text-primary border-primary/20">
            <Sparkles className="h-4 w-4 mr-2" />
            Choose Your Plan
          </Badge>
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-8">
            Replace $45,000+/year in tools and labor. Get professional AI studio, autonomous
            autopilots for social media & advertising, marketplace, analytics, and distribution.
          </p>
          <div className="flex items-center justify-center space-x-4 flex-wrap gap-2">
            <div className="flex items-center text-sm text-gray-600 dark:text-gray-300 font-medium">
              <Shield className="h-4 w-4 mr-2 text-green-500" />
              90-Day Money-Back Guarantee
            </div>
            <span className="text-gray-400 dark:text-gray-500">•</span>
            <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
              <Check className="h-4 w-4 mr-2 text-green-500" />
              No setup fees
            </div>
            <span className="text-gray-400 dark:text-gray-500">•</span>
            <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
              <Check className="h-4 w-4 mr-2 text-green-500" />
              Cancel anytime
            </div>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          {plans.map((plan) => (
            <Card
              key={plan.id}
              className={`relative dark:bg-gray-900 dark:border-gray-700 ${
                plan.popular
                  ? 'border-primary shadow-2xl scale-105 z-10'
                  : 'shadow-lg hover:shadow-xl'
              } transition-all duration-300`}
            >
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-primary px-6 py-1">
                  Most Popular
                </Badge>
              )}

              <CardHeader className="text-center pb-4">
                {/* Guarantee Badge */}
                <div className="flex justify-center mb-4">
                  <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-700 px-3 py-1">
                    <Shield className="h-4 w-4 mr-2" />
                    90-Day Guarantee
                  </Badge>
                </div>

                <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{plan.name}</CardTitle>
                <div className="mb-4">
                  <div className="flex items-baseline justify-center">
                    <span className="text-5xl font-bold text-gray-900 dark:text-white">${plan.price}</span>
                    <span className="text-gray-500 dark:text-gray-400 ml-2">/{plan.period}</span>
                  </div>
                  {plan.originalPrice && (
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      <span className="line-through">${plan.originalPrice}/month</span>
                      <span className="text-green-600 dark:text-green-400 ml-2 font-medium">
                        Save ${(plan.originalPrice - plan.price) * 12}/year
                      </span>
                    </div>
                  )}
                  {plan.billedAnnually && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                      Billed annually (${plan.price * 12})
                    </p>
                  )}
                </div>
                <p className="text-gray-600 dark:text-gray-400">{plan.description}</p>
              </CardHeader>

              <CardContent className="pt-0">
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start space-x-3">
                      <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link href={`/register/payment/${plan.id}`}>
                  <Button
                    className={`w-full py-3 ${
                      plan.popular
                        ? 'bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90'
                        : ''
                    }`}
                    variant={plan.popular ? 'default' : 'outline'}
                    size="lg"
                    data-testid={`button-select-${plan.id}`}
                  >
                    {plan.period === 'once' ? 'Get Lifetime Access' : 'Get Started Now'}
                  </Button>
                </Link>

                <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-3">
                  {plan.period === 'once'
                    ? 'One-time payment, lifetime access • 90-day guarantee'
                    : '90-day money-back guarantee • Cancel anytime'}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Features Comparison */}
        <div className="mb-20">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">Compare Plans</h2>

          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg overflow-hidden dark:border dark:border-gray-700">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="text-left p-6 font-semibold text-gray-900 dark:text-white">Features</th>
                    <th className="text-center p-6 font-semibold text-gray-900 dark:text-white">Monthly</th>
                    <th className="text-center p-6 font-semibold text-gray-900 dark:text-white bg-primary/5">
                      Yearly
                      <Badge className="ml-2 bg-primary text-xs">Popular</Badge>
                    </th>
                    <th className="text-center p-6 font-semibold text-gray-900 dark:text-white">Lifetime</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {[
                    {
                      feature: 'AI Music Studio (DAW)',
                      monthly: true,
                      yearly: true,
                      lifetime: true,
                    },
                    {
                      feature: 'Social Media Autopilot (24/7)',
                      monthly: true,
                      yearly: true,
                      lifetime: true,
                    },
                    {
                      feature: 'Advertisement Autopilot (Zero Cost)',
                      monthly: true,
                      yearly: true,
                      lifetime: true,
                    },
                    {
                      feature: 'Beat Marketplace & Licensing',
                      monthly: true,
                      yearly: true,
                      lifetime: true,
                    },
                    {
                      feature: 'Professional Analytics',
                      monthly: true,
                      yearly: true,
                      lifetime: true,
                    },
                    {
                      feature: 'Distribution to 150+ Platforms',
                      monthly: true,
                      yearly: true,
                      lifetime: true,
                    },
                    {
                      feature: 'AI Mixing & Mastering',
                      monthly: true,
                      yearly: true,
                      lifetime: true,
                    },
                    { feature: 'Email Marketing', monthly: true, yearly: true, lifetime: true },
                    {
                      feature: 'Active Projects',
                      monthly: 'Unlimited',
                      yearly: 'Unlimited',
                      lifetime: 'Unlimited',
                    },
                    {
                      feature: 'Cloud Storage',
                      monthly: 'Included',
                      yearly: 'Included',
                      lifetime: 'Included',
                    },
                    {
                      feature: 'Support Level',
                      monthly: 'Email & Chat',
                      yearly: 'Email & Chat',
                      lifetime: 'Email & Chat',
                    },
                  ].map((row, index) => (
                    <tr key={index}>
                      <td className="p-6 font-medium text-gray-900 dark:text-white">{row.feature}</td>
                      <td className="p-6 text-center">
                        {typeof row.monthly === 'boolean' ? (
                          row.monthly ? (
                            <Check className="h-5 w-5 text-green-500 mx-auto" />
                          ) : (
                            '—'
                          )
                        ) : (
                          row.monthly
                        )}
                      </td>
                      <td className="p-6 text-center bg-primary/5">
                        {typeof row.yearly === 'boolean' ? (
                          row.yearly ? (
                            <Check className="h-5 w-5 text-green-500 mx-auto" />
                          ) : (
                            '—'
                          )
                        ) : (
                          row.yearly
                        )}
                      </td>
                      <td className="p-6 text-center">
                        {typeof row.lifetime === 'boolean' ? (
                          row.lifetime ? (
                            <Check className="h-5 w-5 text-green-500 mx-auto" />
                          ) : (
                            '—'
                          )
                        ) : (
                          row.lifetime
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div>
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
            Frequently Asked Questions
          </h2>

          <div className="max-w-3xl mx-auto">
            <div className="space-y-6">
              {faqItems.map((faq, index) => (
                <Card key={index} className="dark:bg-gray-900 dark:border-gray-700">
                  <CardContent className="p-6">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{faq.question}</h3>
                    <p className="text-gray-600 dark:text-gray-400">{faq.answer}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center mt-20 p-12 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl text-white">
          <h2 className="text-3xl font-bold mb-4">Ready to Boost Your Music Career?</h2>
          <p className="text-xl mb-8 opacity-90">
            Join thousands of artists who are already using Max Booster to grow their careers.
          </p>
          <div className="flex justify-center">
            <Link href="/register/payment/yearly">
              <Button
                size="lg"
                variant="secondary"
                className="px-8 py-4"
                data-testid="button-get-started-cta"
              >
                Get Started Now
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
