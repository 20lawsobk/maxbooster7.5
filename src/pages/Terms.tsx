import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';

export default function Terms() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <div className="container max-w-4xl mx-auto px-4 py-8">
        <Link href="/">
          <Button variant="ghost" className="mb-6" data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>

        <Card className="dark:bg-gray-900 dark:border-gray-700">
          <CardContent className="p-8 prose dark:prose-invert max-w-none">
            <h1 className="text-4xl font-bold mb-6">Terms and Conditions</h1>
            <p className="text-gray-600 dark:text-gray-300 mb-8">
              Last updated: {new Date().toLocaleDateString()}
            </p>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">1. Agreement to Terms</h2>
              <p>
                By accessing and using Max Booster ("the Service"), you agree to be bound by these
                Terms and Conditions. If you disagree with any part of these terms, you may not
                access the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">2. Use License</h2>
              <p className="mb-4">
                Max Booster grants you a personal, non-transferable, non-exclusive license to use
                the Service subject to these Terms. This license includes:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Access to the AI-powered music creation and distribution platform</li>
                <li>Use of the proprietary AI tools for music analysis and enhancement</li>
                <li>Distribution services to major streaming platforms</li>
                <li>Analytics and royalty tracking features</li>
                <li>Social media automation tools</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">3. User Accounts</h2>
              <p className="mb-4">
                When you create an account with Max Booster, you must provide accurate, complete,
                and current information. Failure to do so constitutes a breach of the Terms.
              </p>
              <p className="mb-4">You are responsible for:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Maintaining the confidentiality of your account and password</li>
                <li>All activities that occur under your account</li>
                <li>Notifying Max Booster immediately of any unauthorized use</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">4. Intellectual Property Rights</h2>
              <p className="mb-4">
                The Service and its original content (excluding user-generated content), features,
                and functionality are owned by Max Booster and are protected by international
                copyright, trademark, patent, trade secret, and other intellectual property laws.
              </p>
              <p>
                Your music and content remain yours. By using Max Booster's distribution services,
                you grant Max Booster a limited license to distribute your content to the platforms
                you select.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">5. Payment and Subscription</h2>
              <p className="mb-4">
                Max Booster operates on a subscription model with the following plans:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Monthly Plan: $49/month - Billed monthly, cancel anytime</li>
                <li>Annual Plan: $468/year - Billed annually, save $120/year</li>
                <li>Lifetime Plan: $699 one-time - Permanent access, all features</li>
              </ul>
              <p className="mt-4 mb-4">
                All payments are processed securely through Stripe. By subscribing, you agree to:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Provide accurate payment information</li>
                <li>Automatic renewal for monthly and annual plans unless cancelled</li>
                <li>Refunds available within 7 days of purchase (see Section 6)</li>
                <li>Price changes with 30 days notice for existing subscribers</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">6. Cancellation and Refunds</h2>
              <p className="mb-4">
                <strong>Cancellation Policy:</strong> You may cancel your subscription at any time
                through Settings → Billing in your account.
              </p>
              <p className="mb-4">
                <strong>Refund Policy:</strong>
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>
                  <strong>7-Day Window:</strong> Full refund available within 7 days of initial
                  purchase
                </li>
                <li>
                  <strong>After 7 Days:</strong> No refunds, but you may cancel to prevent future
                  charges
                </li>
                <li>
                  <strong>Access After Cancellation:</strong> You keep access until the end of your
                  current billing period
                </li>
                <li>
                  <strong>Data Retention:</strong> Your account data is retained for 30 days after
                  cancellation
                </li>
              </ul>
              <p className="mt-4">
                To request a refund within the 7-day window, email support@maxbooster.com with your
                account email and purchase date.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">7. User Content and Copyright</h2>
              <p className="mb-4">
                You retain all rights to your music and content. By using our services, you
                represent and warrant that:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>You own or have the rights to all content you upload</li>
                <li>Your content does not infringe any third-party rights</li>
                <li>
                  You grant Max Booster a license to distribute your content to selected platforms
                </li>
                <li>You will not upload illegal, offensive, or copyrighted material</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">8. Prohibited Activities</h2>
              <p className="mb-4">You agree not to:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Violate any laws or regulations</li>
                <li>Infringe on intellectual property rights</li>
                <li>Upload malicious code or viruses</li>
                <li>Attempt to gain unauthorized access to our systems</li>
                <li>Use automated systems to scrape or collect data</li>
                <li>Resell or redistribute the Service</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">9. Limitation of Liability</h2>
              <p className="mb-4">
                Max Booster shall not be liable for any indirect, incidental, special,
                consequential, or punitive damages resulting from your use or inability to use the
                Service.
              </p>
              <p className="mb-4">
                Our maximum liability shall not exceed the amount paid by you in the 12 months
                preceding the claim.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">10. Changes to Terms</h2>
              <p className="mb-4">
                We reserve the right to modify these terms at any time. We will notify you of any
                material changes via email or through the Service. Your continued use after changes
                constitutes acceptance of the new terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">11. Contact Information</h2>
              <p>For questions about these Terms, please refer to the Help Center at /help</p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
