import { describe, expect, it } from "vitest";
import {
  MARKETPLACE_CART_LIMIT,
  getMarketplaceLicensePrice,
  loadMarketplaceCart,
  marketplaceCartKey,
  reconcileMarketplaceCart,
  saveMarketplaceCart,
} from "../../client/src/lib/marketplaceCart";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    values,
  };
}

describe("marketplace cart persistence", () => {
  it("survives reload and stores identifiers, not prices", () => {
    const storage = memoryStorage();
    saveMarketplaceCart(storage, "buyer-1", [
      { beatId: "beat-1", licenseType: "premium" },
    ]);
    expect(loadMarketplaceCart(storage, "buyer-1").items).toEqual([
      { beatId: "beat-1", licenseType: "premium" },
    ]);
    expect(storage.values.get(marketplaceCartKey("buyer-1"))).not.toContain(
      "price",
    );
  });

  it("isolates carts by authenticated account", () => {
    const storage = memoryStorage();
    saveMarketplaceCart(storage, "alice", [
      { beatId: "a", licenseType: "basic" },
    ]);
    saveMarketplaceCart(storage, "bob", [
      { beatId: "b", licenseType: "exclusive" },
    ]);
    expect(loadMarketplaceCart(storage, "alice").items[0].beatId).toBe("a");
    expect(loadMarketplaceCart(storage, "bob").items[0].beatId).toBe("b");
  });

  it("resets corrupt storage and reports the error", () => {
    const storage = memoryStorage();
    storage.setItem(marketplaceCartKey("buyer"), "{broken");
    expect(loadMarketplaceCart(storage, "buyer")).toEqual({
      items: [],
      error: "corrupt",
    });
    expect(storage.getItem(marketplaceCartKey("buyer"))).toBeNull();
  });

  it("bounds and de-duplicates saved items", () => {
    const storage = memoryStorage();
    const items = Array.from({ length: MARKETPLACE_CART_LIMIT + 5 }, (_, i) => ({
      beatId: `beat-${i}`,
      licenseType: "basic",
    }));
    saveMarketplaceCart(storage, "buyer", [items[0], ...items]);
    expect(loadMarketplaceCart(storage, "buyer").items).toHaveLength(
      MARKETPLACE_CART_LIMIT,
    );
  });

  it("persists removal", () => {
    const storage = memoryStorage();
    saveMarketplaceCart(storage, "buyer", [
      { beatId: "one", licenseType: "basic" },
      { beatId: "two", licenseType: "premium" },
    ]);
    const remaining = loadMarketplaceCart(storage, "buyer").items.filter(
      (item) => item.beatId !== "one",
    );
    saveMarketplaceCart(storage, "buyer", remaining);
    expect(loadMarketplaceCart(storage, "buyer").items).toEqual([
      { beatId: "two", licenseType: "premium" },
    ]);
  });
});

describe("marketplace cart reconciliation", () => {
  const beat = { id: "beat-1", price: 10, status: "active" };

  it("drops missing beats and invalid licenses", () => {
    expect(
      reconcileMarketplaceCart(
        [
          { beatId: "missing", licenseType: "basic" },
          { beatId: "beat-1", licenseType: "not-a-license" },
        ],
        [beat],
      ),
    ).toEqual([]);
  });

  it("uses current catalog prices instead of stored data", () => {
    expect(
      reconcileMarketplaceCart(
        [{ beatId: "beat-1", licenseType: "premium" }],
        [{ ...beat, price: 25 }],
      )[0].price,
    ).toBe(50);
  });

  it("validates active custom tiers and current discounts", () => {
    const tiered = {
      ...beat,
      hasLicenseTiers: true,
      licenseTiers: [
        {
          licenseType: "premium",
          price: 80,
          discountType: "percent",
          discountPrice: 60,
          isActive: true,
        },
        { licenseType: "basic", price: 20, isActive: false },
      ],
    };
    expect(getMarketplaceLicensePrice(tiered, "premium")).toBe(60);
    expect(getMarketplaceLicensePrice(tiered, "basic")).toBeNull();
  });

  it("reports inaccessible storage for actionable UI feedback", () => {
    expect(
      loadMarketplaceCart(
        {
          getItem: () => {
            throw new Error("blocked");
          },
          removeItem: () => {},
        },
        "buyer",
      ).error,
    ).toBe("unavailable");
  });
});