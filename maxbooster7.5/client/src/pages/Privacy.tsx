import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield, Lock, Eye, UserX, Download } from 'lucide-react';
import { Link } from 'wouter';

export default function Privacy() {
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
            <div className="flex items-center space-x-3 mb-6">
              <Shield className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              <h1 className="text-4xl font-bold mb-0">Privacy Policy</h1>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mb-8">
              Last updated: {new Date().toLocaleDateString()}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="flex items-start space-x-3 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                <Lock className="w-5 h-5 text-green-600 dark:text-green-400 mt-1" />
                <div>
                  <h3 className="font-semibold text-sm mb-1">Encrypted</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    Your data is encrypted at rest and in transit
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                <Eye className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-1" />
                <div>
                  <h3 className="font-semibold text-sm mb-1">Transparent</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    Full transparency about what's collected and why
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3 p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                <UserX className="w-5 h-5 text-purple-600 dark:text-purple-400 mt-1" />
                <div>
                  <h3 className="font-semibold text-sm mb-1">No Selling</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    Your personal data is never sold
                  </p>
                </div>
              </div>
            </div>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
              <p>
                Max Booster (operated by a solo founder) is committed to protecting your privacy.
                This Privacy Policy explains how I collect, use, disclose, and safeguard your
                information when you use the AI-powered music platform and distribution services.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">2. Information Collected</h2>

              <h3 className="text-xl font-semibold mb-3 mt-6">Personal Information</h3>
              <p className="mb-4">
                When you register and use Max Booster's services, the following is collected:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Name and email address</li>
                <li>Payment information (processed securely through Stripe)</li>
                <li>Profile information you choose to provide</li>
                <li>Social media account connections (when you authorize them)</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3 mt-6">Content and Usage Data</h3>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Music files and metadata you upload</li>
                <li>Project data and analytics</li>
                <li>Distribution and release information</li>
                <li>Streaming and earnings data from platforms</li>
                <li>Usage patterns and feature interactions</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3 mt-6">
                Automatically Collected Information
              </h3>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>IP address and device information</li>
                <li>Browser type and version</li>
                <li>Session information and cookies</li>
                <li>Access times and referring URLs</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">3. How Your Information Is Used</h2>
              <p className="mb-4">Your information is used to:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Provide, operate, and maintain the services</li>
                <li>Process your music distribution to streaming platforms</li>
                <li>Analyze and optimize your music with the proprietary AI</li>
                <li>Track and report your earnings and royalties</li>
                <li>Send you notifications and updates</li>
                <li>Improve the platform and develop new features</li>
                <li>Detect and prevent fraud and abuse</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">4. Data Sharing and Disclosure</h2>
              <p className="mb-4">Your information may be shared with:</p>

              <h3 className="text-xl font-semibold mb-3 mt-6">Service Providers</h3>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>
                  <strong>Stripe:</strong> Payment processing
                </li>
                <li>
                  <strong>SendGrid:</strong> Email delivery
                </li>
                <li>
                  <strong>Neon:</strong> Database hosting
                </li>
                <li>
                  <strong>Streaming Platforms:</strong> When you distribute your music
                </li>
              </ul>

              <h3 className="text-xl font-semibold mb-3 mt-6">Legal Requirements</h3>
              <p>
                Your information may be disclosed if required by law, court order, or governmental
                request, or to protect Max Booster's rights, property, or safety.
              </p>

              <h3 className="text-xl font-semibold mb-3 mt-6">Business Transfers</h3>
              <p>
                In the event of a merger, acquisition, or sale of assets, your information may be
                transferred to the acquiring entity.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">5. Data Security</h2>
              <p className="mb-4">
                Industry-standard security measures are implemented to protect your data:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Encryption in transit (HTTPS/TLS)</li>
                <li>Encryption at rest for sensitive data</li>
                <li>Secure session management</li>
                <li>Regular security audits and updates</li>
                <li>Access controls and authentication</li>
                <li>24/7 system monitoring</li>
              </ul>
              <p className="mt-4">
                While I strive to protect your information, no method of transmission over the
                internet is 100% secure. Absolute security cannot be guaranteed.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">6. Your Rights and Choices</h2>
              <p className="mb-4">You have the following rights regarding your data:</p>

              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <Download className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-1" />
                  <div>
                    <h3 className="font-semibold">Access and Portability</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Request a copy of your personal data in a portable format
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <Lock className="w-5 h-5 text-green-600 dark:text-green-400 mt-1" />
                  <div>
                    <h3 className="font-semibold">Correction</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Update or correct inaccurate information
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <UserX className="w-5 h-5 text-red-600 dark:text-red-400 mt-1" />
                  <div>
                    <h3 className="font-semibold">Deletion</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Request deletion of your account and associated data
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <Eye className="w-5 h-5 text-purple-600 dark:text-purple-400 mt-1" />
                  <div>
                    <h3 className="font-semibold">Marketing Opt-Out</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Unsubscribe from marketing communications
                    </p>
                  </div>
                </div>
              </div>

              <p className="mt-4">
                To exercise these rights, contact us at <strong>privacy@maxbooster.ai</strong>
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">7. Cookies and Tracking</h2>
              <p className="mb-4">Cookies and similar technologies are used to:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Keep you logged in</li>
                <li>Remember your preferences</li>
                <li>Analyze usage patterns</li>
                <li>Improve performance and user experience</li>
              </ul>
              <p className="mt-4">
                You can control cookies through your browser settings, but disabling them may limit
                functionality.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">8. Data Retention</h2>
              <p>
                Your information is retained for as long as your account is active or as needed to
                provide services. After account deletion, certain data may be retained as required
                by law or for legitimate business purposes (e.g., fraud prevention, financial
                records).
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">9. Children's Privacy</h2>
              <p>
                Max Booster services are not intended for users under 13 years of age. Personal
                information from children under 13 is not knowingly collected. If such information
                is discovered, it will be deleted immediately.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">10. International Data Transfers</h2>
              <p>
                Your information may be transferred to and maintained on servers located outside
                your state, province, or country where data protection laws may differ. By using Max
                Booster services, you consent to this transfer.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">11. Changes to This Policy</h2>
              <p>
                This Privacy Policy may be updated from time to time. You will be notified of any
                material changes by posting the new policy on this page and updating the "Last
                updated" date. Continued use of Max Booster services after changes constitutes
                acceptance of the updated policy.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">12. Contact Information</h2>
              <p className="mb-4">
                If you have questions or concerns about this Privacy Policy or our data practices,
                contact us:
              </p>
              <ul className="list-none space-y-2">
                <li>
                  <strong>Email:</strong> privacy@maxbooster.ai
                </li>
                <li>
                  <strong>Support:</strong> support@maxbooster.ai
                </li>
                <li>
                  <strong>Address:</strong> Max Booster Inc., United States
                </li>
              </ul>
            </section>

            <div className="mt-12 p-6 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <h3 className="font-semibold text-lg mb-2">Your Privacy Matters</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                At Max Booster, we're committed to transparency and protecting your rights. We
                believe in giving you control over your data and being clear about how we use it to
                provide you with the best possible music platform experience.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
