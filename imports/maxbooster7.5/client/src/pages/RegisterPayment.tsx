import { useRef, useState } from "react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Shield, CreditCard } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { apiRequest } from "@/lib/queryClient";
import { ACCOUNT_AGE_REQUIREMENT, getAccountEligibilityError, MINIMUM_ACCOUNT_AGE } from "@shared/agePolicy";
import { getStripeCheckoutUrl, readRegistrationCheckoutPayload } from "@/lib/registrationCheckout";

const plans = {
  monthly: {
    id: "monthly",
    name: "Monthly Plan",
    price: 49,
    period: "month",
    description: "Perfect for getting started",
    features: [
      "Professional AI Music Studio (DAW)",
      "Autonomous Social Media Autopilot (24/7)",
      "AI-Enhanced Organic Advertisement Autopilot",
      "Beat Marketplace & Licensing",
      "Professional Analytics Dashboard",
      "Distribution to 150+ Platforms",
      "AI Mixing & Mastering",
      "Royalty Tracking & Splits",
      "Email Marketing System",
      "Unlimited Active Projects",
      "Premium Content Library",
      "Cloud Storage (50GB)",
      "Email Support",
    ],
  },
  yearly: {
    id: "yearly",
    name: "Yearly Plan",
    price: 468,
    period: "year",
    billedAnnually: true,
    description: "Best value for serious artists",
    popular: true,
    features: [
      "Everything in Monthly",
      "Priority Support (Email & Chat)",
      "Cloud Storage (100GB)",
      "Early Access to New Features",
      "Advanced Analytics",
    ],
  },
  lifetime: {
    id: "lifetime",
    name: "Lifetime Plan",
    price: 699,
    period: "once",
    description: "Complete access forever",
    features: [
      "Everything in Yearly",
      "Lifetime Access - No Recurring Fees",
      "Unlimited Cloud Storage",
      "Premium Support (Phone & Video)",
      "Personal Account Manager",
      "Custom Enterprise Integrations",
      "Early Access to Beta Features",
    ],
  },
} as const;

export default function RegisterPayment() {
  const { tier } = useParams<{ tier: string }>();
  const submitting = useRef(false);
  const [formData, setFormData] = useState({
    username: "",
    artistName: "",
    email: "",
    birthdate: "",
  });
  const [tosAccepted, setTosAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const { toast } = useToast();
  const today = new Date();
  const latestEligibleBirthdate = `${today.getUTCFullYear() - MINIMUM_ACCOUNT_AGE}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;

  const plan = Object.prototype.hasOwnProperty.call(plans, tier)
    ? plans[tier as keyof typeof plans] : undefined;

  if (!plan) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Plan Not Found
            </h1>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              The subscription plan you selected doesn't exist.
            </p>
            <Link href="/pricing">
              <Button data-testid="button-back-to-pricing">
                View Available Plans
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setIsLoading(true);
    setFormError("");

    try {
      // Validate form data
      if (
        !formData.username.trim() ||
        !formData.email.trim() ||
        !formData.birthdate.trim()
      ) {
        throw new Error("Please fill in all fields");
      }

      if (!/^[a-zA-Z0-9_]{3,30}$/.test(formData.username.trim())) {
        throw new Error("Username must be 3–30 letters, numbers, or underscores");
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
        throw new Error("Please enter a valid email address");
      }

      const eligibilityError = getAccountEligibilityError(formData.birthdate);
      if (eligibilityError) throw new Error(eligibilityError);

      const response = await apiRequest(
        "POST",
        "/api/create-checkout-session",
        {
          tier: plan.id,
          userEmail: formData.email.trim(),
          username: formData.username.trim(),
          artistName: formData.artistName.trim().slice(0, 100),
          birthdate: formData.birthdate,
        },
      );
      const payload = await readRegistrationCheckoutPayload(response);
      const checkoutUrl = getStripeCheckoutUrl(payload);

      window.location.href = checkoutUrl;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.";
      toast({
        title: "Unable to Continue",
        description: errorMessage,
        variant: "destructive",
      });
      setFormError(errorMessage);
      submitting.current = false;
      setIsLoading(false);
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData((previous) => ({ ...previous, [name]: value }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <nav className="sticky top-0 z-50 backdrop-blur-lg bg-white/80 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/pricing">
              <Button
                variant="ghost"
                className="flex items-center space-x-2"
                data-testid="button-back-navigation"
              >
                <ArrowLeft className="h-4 w-4" />
                <Logo size="sm" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="ghost" data-testid="button-sign-in">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <div className="order-2 lg:order-1">
            <Card
              className={`${"popular" in plan && plan.popular ? "border-primary shadow-lg" : "shadow-md"}`}
            >
              <CardHeader className="text-center">
                {"popular" in plan && plan.popular && (
                  <div className="mb-4">
                    <span className="bg-primary text-white text-sm px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}
                <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">
                  {plan.name}
                </CardTitle>
                <div className="mt-4">
                  <div className="flex items-baseline justify-center">
                    <span
                      className="text-4xl font-bold text-gray-900 dark:text-white"
                      data-testid={`text-price-${plan.id}`}
                    >
                      ${plan.price}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400 ml-2">
                      /{plan.period}
                    </span>
                  </div>
                  {plan.id === "yearly" && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                      Billed $468 annually ($39/month equivalent). Save $120/year.
                    </p>
                  )}
                </div>
                <CardDescription className="mt-4">
                  {plan.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start space-x-3">
                      <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center mt-0.5 flex-shrink-0">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                      </div>
                      <span className="text-gray-700 dark:text-gray-200 text-sm">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center space-x-2 text-blue-800 dark:text-blue-300">
                    <Shield className="h-5 w-5" />
                    <span className="font-medium">
                      90-Day Money-Back Guarantee
                    </span>
                  </div>
                  <p className="text-blue-700 dark:text-blue-400 text-sm mt-1">
                    If you're not completely satisfied, we'll refund your entire
                    payment within 90 days of the initial purchase.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="order-1 lg:order-2">
            <Card>
              <CardHeader className="text-center">
                <div className="mx-auto w-12 h-12 gradient-bg rounded-xl flex items-center justify-center mb-4">
                  <CreditCard className="h-7 w-7 text-white" />
                </div>
                <CardTitle className="text-2xl font-bold">
                  Complete Your Purchase
                </CardTitle>
                <CardDescription>
                  Enter your details to continue to secure payment
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <form onSubmit={handleSubmit} className="space-y-4" aria-busy={isLoading}>
                  {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      name="username"
                      type="text"
                      placeholder="Choose a username"
                      value={formData.username}
                      onChange={handleInputChange}
                      required
                      minLength={3}
                      maxLength={30}
                      pattern="[a-zA-Z0-9_]{3,30}"
                      autoComplete="username"
                      data-testid="input-username"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      3-30 letters, numbers, or underscores.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="artistName">
                      Artist / Producer Name (optional)
                    </Label>
                    <Input
                      id="artistName"
                      name="artistName"
                      type="text"
                      placeholder="Your stage name or producer alias"
                      value={formData.artistName}
                      onChange={handleInputChange}
                      maxLength={100}
                      autoComplete="nickname"
                      data-testid="input-artist-name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="Enter your email"
                      value={formData.email}
                      onChange={handleInputChange}
                      maxLength={254}
                      required
                      autoComplete="email"
                      data-testid="input-email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="birthdate">Date of Birth</Label>
                    <Input
                      id="birthdate"
                      name="birthdate"
                      type="date"
                      value={formData.birthdate}
                      onChange={handleInputChange}
                      max={latestEligibleBirthdate}
                      required
                      autoComplete="bday"
                      data-testid="input-birthdate"
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500">
                      {ACCOUNT_AGE_REQUIREMENT}
                    </p>
                  </div>

                  <div className="space-y-3 rounded-lg border p-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="checkout-terms"
                        checked={tosAccepted}
                        onCheckedChange={(checked) =>
                          setTosAccepted(checked === true)
                        }
                        data-testid="checkbox-checkout-terms"
                      />
                      <Label
                        htmlFor="checkout-terms"
                        className="text-sm leading-relaxed font-normal"
                      >
                        I agree to the{" "}
                        <a
                          href="/terms"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          Terms of Service
                        </a>
                        .
                      </Label>
                    </div>
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="checkout-privacy"
                        checked={privacyAccepted}
                        onCheckedChange={(checked) =>
                          setPrivacyAccepted(checked === true)
                        }
                        data-testid="checkbox-checkout-privacy"
                      />
                      <Label
                        htmlFor="checkout-privacy"
                        className="text-sm leading-relaxed font-normal"
                      >
                        I acknowledge the{" "}
                        <a
                          href="/privacy"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          Privacy Policy
                        </a>
                        .
                      </Label>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full py-3 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
                    size="lg"
                    disabled={isLoading}
                    data-testid="button-continue-to-payment"
                  >
                    {isLoading ? (
                      <span className="flex items-center space-x-2">
                        <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                        <span>Preparing Secure Payment...</span>
                      </span>
                    ) : (
                      <span className="flex items-center space-x-2">
                        <CreditCard className="h-5 w-5" />
                        <span>Continue to Secure Payment</span>
                      </span>
                    )}
                  </Button>
                </form>

                <div className="text-center text-xs text-gray-500 dark:text-gray-400 space-y-2">
                  <p>Secure payment powered by Stripe</p>
                  <p>
                    By continuing, you agree to our <Link href="/terms" className="underline">Terms of Service</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
