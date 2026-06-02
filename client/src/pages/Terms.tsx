import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

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
              <h2 className="text-2xl font-semibold mb-4">
                1. Agreement to Terms
              </h2>
              <p>
                By accessing and using Max Booster ("the Service"), you agree to
                be bound by these Terms and Conditions. If you disagree with any
                part of these terms, you may not access the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">2. Use License</h2>
              <p className="mb-4">
                Max Booster grants you a personal, non-transferable,
                non-exclusive license to use the Service subject to these Terms.
                This license includes:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>
                  Access to the AI-powered music creation and distribution
                  platform
                </li>
                <li>
                  Use of the proprietary AI tools for music analysis and
                  enhancement
                </li>
                <li>Distribution services to major streaming platforms</li>
                <li>Analytics and royalty tracking features</li>
                <li>Social media automation tools</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">3. User Accounts</h2>
              <p className="mb-4">
                When you create an account with Max Booster, you must provide
                accurate, complete, and current information. Failure to do so
                constitutes a breach of the Terms.
              </p>
              <p className="mb-4">You are responsible for:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>
                  Maintaining the confidentiality of your account and password
                </li>
                <li>All activities that occur under your account</li>
                <li>
                  Notifying Max Booster immediately of any unauthorized use
                </li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">
                4. Intellectual Property Rights
              </h2>
              <p className="mb-4">
                The Service and its original content (excluding user-generated
                content), features, and functionality are owned by Max Booster
                and are protected by international copyright, trademark, patent,
                trade secret, and other intellectual property laws.
              </p>
              <p>
                Your music and content remain yours. By using Max Booster's
                distribution services, you grant Max Booster a limited license
                to distribute your content to the platforms you select.
              </p>
            </section>

            <section className="mb-8 p-6 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <h2 className="text-2xl font-semibold mb-4">
                5. AI-Assisted Content Ownership
              </h2>
              <p className="mb-4">
                Max Booster provides AI-powered tools including melody
                generation, drum pattern creation, and audio enhancement. The
                following terms govern your use of these features:
              </p>

              <h3 className="text-lg font-semibold mb-2 mt-6">
                5.1 AI as a Creative Tool
              </h3>
              <p className="mb-4">
                Our AI features are tools that assist your creative process. You
                remain the creator of works produced using these tools when you
                provide substantial creative input.
              </p>

              <h3 className="text-lg font-semibold mb-2 mt-6">
                5.2 Human Authorship Requirement
              </h3>
              <p className="mb-4">
                To maintain copyright protection for your work under U.S. and
                international law, you must provide substantial human creative
                input beyond AI-generated elements. This includes but is not
                limited to: arrangement decisions, lyric writing,
                instrumentation choices, mixing, production, and creative
                direction.
              </p>

              <h3 className="text-lg font-semibold mb-2 mt-6">
                5.3 No Copyright Guarantee
              </h3>
              <p className="mb-4">
                Max Booster makes no representation or warranty that AI-assisted
                outputs alone constitute copyrightable works under U.S. or
                international law. Copyright protection requires demonstrable
                human authorship. Purely AI-generated content without
                substantial human creative contribution may not be eligible for
                copyright protection.
              </p>

              <h3 className="text-lg font-semibold mb-2 mt-6">
                5.4 AI Training Data
              </h3>
              <p className="mb-4">
                We do NOT use your uploaded content to train our AI models. Our
                AI systems are developed and trained exclusively using licensed
                datasets, royalty-free content, and internally-created
                materials.
              </p>

              <h3 className="text-lg font-semibold mb-2 mt-6">
                5.5 Documentation Recommendation
              </h3>
              <p>
                We strongly recommend maintaining records of your creative
                process (drafts, revisions, production notes, project files) to
                demonstrate human authorship if required for copyright
                registration or in the event of a dispute.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">
                6. Payment and Subscription
              </h2>
              <p className="mb-4">
                Max Booster operates on a subscription model with the following
                plans:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>
                  Monthly Plan: $49/month - Billed monthly, cancel anytime
                </li>
                <li>
                  Annual Plan: $468/year - Billed annually, save $120/year
                </li>
                <li>
                  Lifetime Plan: $699 one-time - Permanent access, all features
                </li>
              </ul>
              <p className="mt-4 mb-4">
                All payments are processed securely through Stripe. By
                subscribing, you agree to:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Provide accurate payment information</li>
                <li>
                  Automatic renewal for monthly and annual plans unless
                  cancelled
                </li>
                <li>
                  Refunds available within 7 days of purchase (see Section 7)
                </li>
                <li>
                  Price changes with 30 days notice for existing subscribers
                </li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">
                7. Cancellation and Refunds
              </h2>
              <p className="mb-4">
                <strong>Cancellation Policy:</strong> You may cancel your
                subscription at any time through Settings → Billing in your
                account.
              </p>
              <p className="mb-4">
                <strong>Refund Policy:</strong>
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>
                  <strong>7-Day Window:</strong> Full refund available within 7
                  days of initial purchase
                </li>
                <li>
                  <strong>After 7 Days:</strong> No refunds, but you may cancel
                  to prevent future charges
                </li>
                <li>
                  <strong>Access After Cancellation:</strong> You keep access
                  until the end of your current billing period
                </li>
                <li>
                  <strong>Data Retention:</strong> Your account data is retained
                  for 30 days after cancellation
                </li>
              </ul>
              <p className="mt-4">
                To request a refund within the 7-day window, email
                support@maxbooster.com with your account email and purchase
                date.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">
                8. User Content, Copyright, and Rights Warranty
              </h2>
              <p className="mb-4">
                You retain all rights to your music and content. By uploading
                content for distribution through Max Booster, you represent and
                warrant that:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>
                  You are the sole owner of all rights in the content, OR you
                  have obtained all necessary licenses, consents, and
                  permissions to use and distribute the content
                </li>
                <li>
                  The content does not infringe any copyright, trademark, right
                  of publicity, or other proprietary right of any third party
                </li>
                <li>
                  You have cleared all samples, interpolations, and third-party
                  elements contained in your content
                </li>
                <li>
                  You have obtained mechanical licenses for any cover songs or
                  compositions you do not own
                </li>
                <li>
                  You have the right to grant the licenses described in these
                  Terms
                </li>
                <li>
                  The content does not violate any applicable law or regulation
                </li>
                <li>
                  You grant Max Booster a license to distribute your content to
                  selected platforms
                </li>
              </ul>
              <p className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 text-sm">
                <strong>Warning:</strong> False representations regarding
                content ownership or rights may result in immediate account
                termination, removal of content from all platforms, and
                potential legal liability.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">
                9. Prohibited Activities
              </h2>
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

            <section className="mb-8 p-6 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800">
              <h2 className="text-2xl font-semibold mb-4">
                10. Indemnification
              </h2>
              <p className="mb-4">
                You agree to defend, indemnify, and hold harmless Max Booster,
                its parent company, subsidiaries, affiliates, officers,
                directors, employees, agents, licensors, and suppliers from and
                against any claims, damages, losses, liabilities, costs, and
                expenses (including reasonable attorneys' fees) arising from or
                related to:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Your use of the Service</li>
                <li>
                  Content you upload, distribute, or share through the platform
                </li>
                <li>Your violation of these Terms</li>
                <li>
                  Your violation of any third-party rights, including
                  intellectual property rights
                </li>
                <li>
                  Any claim that content you uploaded infringes or
                  misappropriates the copyright, trademark, or other rights of
                  any third party
                </li>
                <li>Your violation of any applicable law or regulation</li>
              </ul>
              <p className="mt-4">
                This indemnification obligation survives termination of your
                account and these Terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">
                11. Limitation of Liability
              </h2>
              <p className="mb-4">
                Max Booster shall not be liable for any indirect, incidental,
                special, consequential, or punitive damages resulting from your
                use or inability to use the Service.
              </p>
              <p className="mb-4">
                Our maximum liability shall not exceed the amount paid by you in
                the 12 months preceding the claim.
              </p>
            </section>

            <section className="mb-8 p-6 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <h2 className="text-2xl font-semibold mb-4">
                12. Dispute Resolution
              </h2>

              <h3 className="text-lg font-semibold mb-2 mt-4">
                12.1 Informal Resolution
              </h3>
              <p className="mb-4">
                Before filing any formal claim or legal action, you agree to
                contact us at legal@maxbooster.com to attempt to resolve the
                dispute informally. We will attempt to resolve the dispute
                within 30 days of receiving your notice.
              </p>

              <h3 className="text-lg font-semibold mb-2 mt-6">
                12.2 Binding Arbitration
              </h3>
              <p className="mb-4">
                If informal resolution fails, you agree that all disputes,
                claims, or controversies arising out of or relating to these
                Terms or the Service shall be resolved through final and binding
                arbitration, rather than in court. Arbitration shall be
                administered by JAMS under its Streamlined Arbitration Rules and
                Procedures, or by another mutually agreed arbitration provider.
              </p>

              <h3 className="text-lg font-semibold mb-2 mt-6">
                12.3 Arbitration Procedures
              </h3>
              <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                <li>
                  Arbitration may be conducted virtually or in the state of
                  Delaware at your option
                </li>
                <li>The arbitrator's decision shall be final and binding</li>
                <li>
                  Judgment on the arbitration award may be entered in any court
                  of competent jurisdiction
                </li>
                <li>
                  Each party shall bear its own costs, with arbitration fees
                  split equally unless the arbitrator determines otherwise
                </li>
              </ul>

              <h3 className="text-lg font-semibold mb-2 mt-6">
                12.4 Class Action Waiver
              </h3>
              <p className="mb-4">
                <strong>
                  You agree to resolve disputes with Max Booster on an
                  individual basis only.
                </strong>{" "}
                You waive any right to participate in a class action lawsuit,
                class-wide arbitration, or any other representative proceeding.
                The arbitrator may not consolidate more than one person's claims
                without the written consent of all affected parties.
              </p>

              <h3 className="text-lg font-semibold mb-2 mt-6">
                12.5 Small Claims Exception
              </h3>
              <p className="mb-4">
                Notwithstanding the above, either party may bring an individual
                action in small claims court if the claim qualifies for small
                claims court jurisdiction in your state of residence.
              </p>

              <h3 className="text-lg font-semibold mb-2 mt-6">
                12.6 Governing Law
              </h3>
              <p>
                These Terms and any dispute arising from them shall be governed
                by and construed in accordance with the laws of the State of
                Delaware, United States, without regard to its conflict of law
                principles.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">
                13. Changes to Terms
              </h2>
              <p className="mb-4">
                We reserve the right to modify these terms at any time. We will
                notify you of any material changes via email or through the
                Service. Your continued use after changes constitutes acceptance
                of the new terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">14. Severability</h2>
              <p>
                If any provision of these Terms is found to be unenforceable or
                invalid by a court of competent jurisdiction, that provision
                shall be limited or eliminated to the minimum extent necessary,
                and the remaining provisions shall remain in full force and
                effect.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">
                15. Entire Agreement
              </h2>
              <p>
                These Terms, together with our Privacy Policy and DMCA Policy,
                constitute the entire agreement between you and Max Booster
                regarding the use of the Service and supersede all prior
                agreements and understandings.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">
                16. Contact Information
              </h2>
              <p className="mb-4">
                For questions about these Terms, please contact us:
              </p>
              <ul className="list-none space-y-2">
                <li>
                  <strong>General Inquiries:</strong> support@maxbooster.com
                </li>
                <li>
                  <strong>Legal Matters:</strong> legal@maxbooster.com
                </li>
                <li>
                  <strong>DMCA Notices:</strong> dmca@maxbooster.com
                </li>
                <li>
                  <strong>Privacy Concerns:</strong> privacy@maxbooster.com
                </li>
              </ul>
            </section>

            <div className="mt-12 p-6 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <h3 className="font-semibold text-lg mb-2">
                Questions About These Terms?
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                We're committed to transparency. If anything in these Terms is
                unclear or you have questions about how they apply to your
                specific situation, please don't hesitate to reach out to our
                team at legal@maxbooster.com.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
