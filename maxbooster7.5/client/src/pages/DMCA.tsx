import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Logo } from '@/components/ui/Logo';
import { Shield, AlertTriangle, FileText } from 'lucide-react';

export default function DMCA() {
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
              <Link href="/terms">
                <Button variant="ghost">Terms</Button>
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
            DMCA Policy
            <span className="block bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              Protecting Intellectual Property
            </span>
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Max Booster respects the intellectual property rights of others and expects our users to
            do the same
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="mb-8 dark:bg-gray-900 dark:border-gray-700">
            <CardContent className="p-8">
              <div className="flex items-center mb-6">
                <FileText className="h-8 w-8 text-blue-600 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Copyright Infringement Policy</h2>
              </div>
              <div className="space-y-4 text-gray-700 dark:text-gray-300">
                <p>
                  Max Booster complies with the Digital Millennium Copyright Act (DMCA) and will
                  respond to valid notices of copyright infringement. If you believe that your
                  copyrighted work has been copied in a way that constitutes copyright infringement
                  and is accessible on our platform, please notify us.
                </p>
                <p>
                  We take copyright infringement seriously and will promptly remove or disable
                  access to content that is claimed to be infringing upon the copyright of any
                  person.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-8 dark:bg-gray-900 dark:border-gray-700">
            <CardContent className="p-8">
              <div className="flex items-center mb-6">
                <AlertTriangle className="h-8 w-8 text-orange-600 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Filing a DMCA Notice</h2>
              </div>
              <div className="space-y-4 text-gray-700 dark:text-gray-300">
                <p>
                  If you are a copyright owner (or authorized to act on behalf of one) and believe
                  that content on Max Booster infringes your copyright, you may submit a DMCA
                  takedown notice containing:
                </p>
                <ol className="list-decimal list-inside space-y-2 ml-4">
                  <li>Identification of the copyrighted work claimed to have been infringed</li>
                  <li>
                    Identification of the material claimed to be infringing and its location on our
                    platform
                  </li>
                  <li>Your contact information (address, telephone number, email address)</li>
                  <li>
                    A statement that you have a good faith belief that the use is not authorized by
                    the copyright owner
                  </li>
                  <li>A statement that the information in the notification is accurate</li>
                  <li>Your physical or electronic signature</li>
                </ol>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-8 dark:bg-gray-900 dark:border-gray-700">
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Contact for DMCA Notices</h2>
              <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg">
                <p className="text-gray-700 dark:text-gray-300 mb-2">Send all DMCA notices to:</p>
                <p className="font-medium text-gray-900 dark:text-white mb-4">
                  DMCA Agent
                  <br />
                  Max Booster
                  <br />
                  Email:{' '}
                  <a href="mailto:dmca@maxbooster.com" className="text-blue-600 hover:underline">
                    dmca@maxbooster.com
                  </a>
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Please allow 1-2 business days for processing. We will notify the affected user
                  and may request additional information if needed.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-8 dark:bg-gray-900 dark:border-gray-700">
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Counter-Notification</h2>
              <div className="space-y-4 text-gray-700 dark:text-gray-300">
                <p>
                  If you believe that your content was removed by mistake or misidentification, you
                  may file a counter-notification containing:
                </p>
                <ol className="list-decimal list-inside space-y-2 ml-4">
                  <li>Identification of the material that was removed and its former location</li>
                  <li>
                    A statement under penalty of perjury that you have a good faith belief the
                    material was removed by mistake
                  </li>
                  <li>Your name, address, phone number, and email</li>
                  <li>
                    A statement consenting to jurisdiction of the federal court in your district
                  </li>
                  <li>Your physical or electronic signature</li>
                </ol>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
                  Upon receipt of a valid counter-notification, we will forward it to the original
                  complainant. If they do not file a court action within 10-14 business days, we may
                  restore the content.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-900 dark:border-gray-700">
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Repeat Infringer Policy</h2>
              <div className="space-y-4 text-gray-700 dark:text-gray-300">
                <p>
                  Max Booster maintains a policy of terminating accounts of users who are repeat
                  infringers. We may suspend or terminate accounts that receive multiple valid DMCA
                  notices.
                </p>
                <p className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4 text-sm">
                  <strong>Note:</strong> Submitting a false DMCA notice may result in legal
                  liability. Please ensure your claim is legitimate before filing.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
