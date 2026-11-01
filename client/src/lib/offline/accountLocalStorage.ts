import type { StateStorage } from "zustand/middleware";
import { offlineIdentity } from "./identity";

let resetting = false;
export function resetWithoutPersistence(reset: () => void) {
  resetting = true;
  try { reset(); } finally { resetting = false; }
}

// Zustand's eager hydration must never read the old shared-origin studio key.
// Legacy ownerless state remains quarantined at that key for verified recovery.
export const accountLocalStorage: StateStorage = {
  getItem(name) {
    const { owner } = offlineIdentity();
    return owner ? localStorage.getItem(`${name}:account:${encodeURIComponent(owner)}`) : null;
  },
  setItem(name, value) {
    const { owner } = offlineIdentity();
    if (owner && !resetting) localStorage.setItem(`${name}:account:${encodeURIComponent(owner)}`, value);
  },
  removeItem(name) {
    const { owner } = offlineIdentity();
    if (owner) localStorage.removeItem(`${name}:account:${encodeURIComponent(owner)}`);
  },
};