export interface StripeCredentialBindings {
  NODE_ENV?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_TEST_SECRET?: string;
  TESTING_STRIPE_SECRET_KEY?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  VITE_STRIPE_PUBLIC_KEY?: string;
  STRIPE_TEST_CLIENT?: string;
}

function configured(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim() && !/[\r\n]/.test(value);
}

/**
 * Keep sandbox and production credentials isolated. Development must never
 * silently fall through to the production key; tests may use a synthetic
 * STRIPE_SECRET_KEY fixture because no external provider is contacted there.
 */
export function selectStripeSecretKey(
  bindings: StripeCredentialBindings,
  production: boolean,
): string | undefined {
  if (production) {
    return configured(bindings.STRIPE_SECRET_KEY) ? bindings.STRIPE_SECRET_KEY : undefined;
  }

  if (configured(bindings.STRIPE_TEST_SECRET)) return bindings.STRIPE_TEST_SECRET;
  if (configured(bindings.TESTING_STRIPE_SECRET_KEY)) return bindings.TESTING_STRIPE_SECRET_KEY;
  if (bindings.NODE_ENV === "test" && configured(bindings.STRIPE_SECRET_KEY)) {
    return bindings.STRIPE_SECRET_KEY;
  }
  return undefined;
}

export function selectStripePublishableKey(
  bindings: StripeCredentialBindings,
  production: boolean,
): string | undefined {
  if (production) {
    if (configured(bindings.STRIPE_PUBLISHABLE_KEY)) return bindings.STRIPE_PUBLISHABLE_KEY;
    return configured(bindings.VITE_STRIPE_PUBLIC_KEY) ? bindings.VITE_STRIPE_PUBLIC_KEY : undefined;
  }
  return configured(bindings.STRIPE_TEST_CLIENT) ? bindings.STRIPE_TEST_CLIENT : undefined;
}
