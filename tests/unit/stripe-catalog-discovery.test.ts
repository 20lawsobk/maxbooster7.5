import { beforeEach, afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ client: {} as any }));
vi.mock("../../server/lib/stripeClient", () => ({
  hasStripeCredential: (key: unknown) => typeof key === "string" && key.length > 0,
  createStripeClient: () => state.client,
}));
vi.mock("../../server/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("STRIPE_SECRET_KEY", "opaque-binding-fixture");
  vi.stubEnv("STRIPE_ALLOW_CATALOG_PROVISIONING", "0");
  state.client = {
    products: { list: vi.fn(async () => ({ data: [] })), create: vi.fn(async () => ({ id: "prod_fixture" })) },
    prices: { list: vi.fn(async () => ({ data: [] })), create: vi.fn(async (input: any) => ({ id: `price_${input.metadata.type}` })) },
  };
});
afterEach(() => vi.unstubAllEnvs());

it("startup discovery never creates a missing catalog", async () => {
  const { ensureStripeProductsAndPrices } = await import("../../server/services/stripeSetup");
  await expect(ensureStripeProductsAndPrices()).rejects.toThrow(/explicitly provision/);
  expect(state.client.products.create).not.toHaveBeenCalled();
  expect(state.client.prices.create).not.toHaveBeenCalled();
});

it("missing prices also stop read-only discovery before any mutation", async () => {
  state.client.products.list.mockResolvedValue({ data: [{ id: "prod_fixture", metadata: { app: "max-booster" } }] });
  const { ensureStripeProductsAndPrices } = await import("../../server/services/stripeSetup");
  await expect(ensureStripeProductsAndPrices()).rejects.toThrow(/price is missing/);
  expect(state.client.products.create).not.toHaveBeenCalled();
  expect(state.client.prices.create).not.toHaveBeenCalled();
});

it("explicit provisioning creates the catalog and complete price set", async () => {
  const { ensureStripeProductsAndPrices } = await import("../../server/services/stripeSetup");
  await expect(ensureStripeProductsAndPrices({ allowCreate: true })).resolves.toEqual({
    monthly: "price_monthly", yearly: "price_yearly", lifetime: "price_lifetime",
  });
  expect(state.client.products.create).toHaveBeenCalledOnce();
  expect(state.client.prices.create).toHaveBeenCalledTimes(3);
});

it("discovers a complete existing catalog without provisioning", async () => {
  state.client.products.list.mockResolvedValue({ data: [{ id: "prod_fixture", metadata: { app: "max-booster" } }] });
  state.client.prices.list.mockResolvedValue({ data: [
    { id: "price_monthly", active: true, currency: "usd", unit_amount: 4900, type: "recurring", recurring: { interval: "month" }, metadata: { type: "monthly", app: "max-booster" } },
    { id: "price_yearly", active: true, currency: "usd", unit_amount: 46800, type: "recurring", recurring: { interval: "year" }, metadata: { type: "yearly", app: "max-booster" } },
    { id: "price_lifetime", active: true, currency: "usd", unit_amount: 69900, type: "one_time", recurring: null, metadata: { type: "lifetime", app: "max-booster" } },
  ] });
  const { ensureStripeProductsAndPrices } = await import("../../server/services/stripeSetup");
  await expect(ensureStripeProductsAndPrices()).resolves.toEqual({ monthly: "price_monthly", yearly: "price_yearly", lifetime: "price_lifetime" });
  expect(state.client.products.create).not.toHaveBeenCalled();
  expect(state.client.prices.create).not.toHaveBeenCalled();
});
