export const MARKETPLACE_CART_LIMIT = 20;
const CART_VERSION = 1;
const CART_PREFIX = "maxbooster:marketplace-cart:";

export interface MarketplaceCartItem {
  beatId: string;
  licenseType: string;
}

export interface MarketplaceCartBeat {
  id: string;
  price: number;
  status?: string;
  hasLicenseTiers?: boolean;
  licenseTiers?: Array<{
    licenseType: string;
    price: number;
    discountType?: string;
    discountPrice?: number | null;
    isActive: boolean;
  }>;
}

export type CartStorageResult = {
  items: MarketplaceCartItem[];
  error?: "corrupt" | "unavailable";
};

export function marketplaceCartKey(userId: string): string {
  return `${CART_PREFIX}${encodeURIComponent(userId)}`;
}

export function loadMarketplaceCart(
  storage: Pick<Storage, "getItem" | "removeItem">,
  userId: string,
): CartStorageResult {
  const key = marketplaceCartKey(userId);
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return { items: [], error: "unavailable" };
  }
  if (!raw) return { items: [] };

  try {
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      parsed.version !== CART_VERSION ||
      !Array.isArray(parsed.items)
    ) {
      throw new Error("Invalid cart");
    }

    const seen = new Set<string>();
    const items: MarketplaceCartItem[] = [];
    for (const item of parsed.items) {
      if (
        !item ||
        typeof item.beatId !== "string" ||
        !item.beatId ||
        typeof item.licenseType !== "string" ||
        !item.licenseType
      ) {
        throw new Error("Invalid cart item");
      }
      const identifier = `${item.beatId}\u0000${item.licenseType}`;
      if (!seen.has(identifier)) {
        seen.add(identifier);
        items.push({ beatId: item.beatId, licenseType: item.licenseType });
      }
      if (items.length >= MARKETPLACE_CART_LIMIT) break;
    }
    return { items };
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // The caller still receives a useful error if storage cannot be repaired.
    }
    return { items: [], error: "corrupt" };
  }
}

export function saveMarketplaceCart(
  storage: Pick<Storage, "setItem">,
  userId: string,
  items: MarketplaceCartItem[],
): boolean {
  try {
    const seen = new Set<string>();
    const uniqueItems: MarketplaceCartItem[] = [];
    for (const item of items) {
      if (
        typeof item?.beatId !== "string" ||
        !item.beatId ||
        typeof item.licenseType !== "string" ||
        !item.licenseType
      ) {
        return false;
      }
      const identifier = `${item.beatId}\u0000${item.licenseType}`;
      if (seen.has(identifier)) continue;
      seen.add(identifier);
      uniqueItems.push({ beatId: item.beatId, licenseType: item.licenseType });
      if (uniqueItems.length >= MARKETPLACE_CART_LIMIT) break;
    }
    storage.setItem(
      marketplaceCartKey(userId),
      JSON.stringify({
        version: CART_VERSION,
        items: uniqueItems,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function getMarketplaceLicensePrice(
  beat: MarketplaceCartBeat,
  licenseType: string,
): number | null {
  if (beat.status && beat.status !== "active") return null;
  if (beat.hasLicenseTiers && beat.licenseTiers?.length) {
    const tier = beat.licenseTiers.find(
      (candidate) =>
        candidate.licenseType === licenseType && candidate.isActive,
    );
    if (!tier) return null;
    if (
      tier.discountType === "percent" &&
      typeof tier.discountPrice === "number"
    ) {
      return tier.discountPrice;
    }
    return tier.price;
  }

  const multipliers: Record<string, number> = {
    basic: 1,
    premium: 2,
    unlimited: 5,
    exclusive: 20,
  };
  const multiplier = multipliers[licenseType];
  return multiplier == null ? null : beat.price * multiplier;
}

export function reconcileMarketplaceCart<T extends MarketplaceCartBeat>(
  items: MarketplaceCartItem[],
  catalog: T[],
): Array<MarketplaceCartItem & { beat: T; price: number }> {
  const beats = new Map(catalog.map((beat) => [beat.id, beat]));
  return items.flatMap((item) => {
    const beat = beats.get(item.beatId);
    if (!beat) return [];
    const price = getMarketplaceLicensePrice(beat, item.licenseType);
    return price == null || !Number.isFinite(price) || price < 0
      ? []
      : [{ ...item, beat, price }];
  });
}