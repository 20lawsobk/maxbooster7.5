import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingDown, Sparkles, Check } from 'lucide-react';
import { useRequireSubscription } from '@/hooks/useRequireAuth';

interface ServiceComparison {
  service: string;
  monthlyPrice: number;
  yearlyPrice: number;
  included: boolean;
}

const COMPETITOR_SERVICES: ServiceComparison[] = [
  { service: 'Music Distribution (DistroKid/TuneCore)', monthlyPrice: 20, yearlyPrice: 240, included: true },
  { service: 'Social Media Management (Hootsuite/Buffer)', monthlyPrice: 49, yearlyPrice: 588, included: true },
  { service: 'Paid Advertising (Facebook/Instagram Ads)', monthlyPrice: 500, yearlyPrice: 6000, included: true },
  { service: 'DAW Software (Ableton/FL Studio)', monthlyPrice: 20, yearlyPrice: 240, included: true },
  { service: 'Analytics Platform (Chartmetric)', monthlyPrice: 50, yearlyPrice: 600, included: true },
  { service: 'Marketplace Platform (Fiverr/SoundBetter)', monthlyPrice: 30, yearlyPrice: 360, included: true },
  { service: 'Desktop Apps (Additional License)', monthlyPrice: 15, yearlyPrice: 180, included: true },
];

const SUBSCRIPTION_PRICES = {
  monthly: 29.99,
  yearly: 299.99,
  lifetime: 999.99,
};

export function ValueCalculator() {
  const { user } = useRequireSubscription();
  
  const subscriptionTier = user?.subscriptionPlan || 'monthly';
  const isLifetime = subscriptionTier === 'lifetime';
  const isYearly = subscriptionTier === 'yearly';
  const isMonthly = subscriptionTier === 'monthly';

  const userMonthlyPrice = isLifetime 
    ? 0 
    : isYearly 
    ? SUBSCRIPTION_PRICES.yearly / 12 
    : SUBSCRIPTION_PRICES.monthly;

  const competitorMonthlyTotal = COMPETITOR_SERVICES.reduce(
    (sum, service) => sum + service.monthlyPrice,
    0
  );

  const competitorYearlyTotal = COMPETITOR_SERVICES.reduce(
    (sum, service) => sum + service.yearlyPrice,
    0
  );

  const monthlySavings = competitorMonthlyTotal - userMonthlyPrice;
  const yearlySavings = competitorYearlyTotal - (isLifetime ? 0 : isYearly ? SUBSCRIPTION_PRICES.yearly : SUBSCRIPTION_PRICES.monthly * 12);

  const lifetimeSavings = {
    year1: competitorYearlyTotal - (isLifetime ? SUBSCRIPTION_PRICES.lifetime : isYearly ? SUBSCRIPTION_PRICES.yearly : SUBSCRIPTION_PRICES.monthly * 12),
    year3: competitorYearlyTotal * 3 - (isLifetime ? SUBSCRIPTION_PRICES.lifetime : isYearly ? SUBSCRIPTION_PRICES.yearly * 3 : SUBSCRIPTION_PRICES.monthly * 36),
    year5: competitorYearlyTotal * 5 - (isLifetime ? SUBSCRIPTION_PRICES.lifetime : isYearly ? SUBSCRIPTION_PRICES.yearly * 5 : SUBSCRIPTION_PRICES.monthly * 60),
  };

  const savingsPercentage = ((monthlySavings / competitorMonthlyTotal) * 100).toFixed(0);

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle>Your Subscription Value</CardTitle>
        </div>
        <CardDescription>
          See how much you're saving with Max Booster vs. buying equivalent services separately
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Separate Services Cost</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-destructive line-through">
                ${competitorMonthlyTotal}
              </span>
              <span className="text-muted-foreground">/month</span>
            </div>
            <p className="text-xs text-muted-foreground">
              ${competitorYearlyTotal.toLocaleString()}/year buying separately
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Your Max Booster Price</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-primary">
                ${userMonthlyPrice.toFixed(2)}
              </span>
              <span className="text-muted-foreground">/month</span>
            </div>
            <p className="text-xs text-muted-foreground capitalize">
              {isLifetime ? 'Lifetime access (paid once)' : `${subscriptionTier} subscription`}
            </p>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
          <div className="flex items-center gap-3 mb-2">
            <TrendingDown className="h-5 w-5 text-primary" />
            <p className="font-semibold">You're Saving {savingsPercentage}% 🎉</p>
          </div>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Monthly Savings:</span>
              <span className="font-semibold text-primary">
                ${monthlySavings.toFixed(2)}/month
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Yearly Savings:</span>
              <span className="font-semibold text-primary">
                ${yearlySavings.toFixed(2)}/year
              </span>
            </div>
            {isLifetime && (
              <>
                <div className="flex justify-between border-t pt-2 mt-2">
                  <span className="text-muted-foreground">3-Year Savings:</span>
                  <span className="font-bold text-primary">
                    ${lifetimeSavings.year3.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">5-Year Savings:</span>
                  <span className="font-bold text-primary">
                    ${lifetimeSavings.year5.toLocaleString()}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            What's Included in Your Subscription:
          </p>
          <div className="grid gap-2">
            {COMPETITOR_SERVICES.map((service, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 text-sm p-2 rounded-md hover:bg-muted/50 transition-colors"
              >
                <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <span className="font-medium">{service.service}</span>
                  <span className="text-muted-foreground ml-2">
                    (normally ${service.monthlyPrice}/mo)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {!isLifetime && (
          <div className="p-4 rounded-lg bg-muted/30 border border-dashed">
            <p className="text-sm text-muted-foreground text-center">
              💡 <strong>Pro Tip:</strong> Upgrade to{' '}
              <span className="text-primary font-semibold">Lifetime</span> and save{' '}
              <strong>${lifetimeSavings.year5.toLocaleString()}</strong> over 5 years
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
