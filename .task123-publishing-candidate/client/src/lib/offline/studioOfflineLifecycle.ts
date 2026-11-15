import { useStudioStore } from "@/stores/studioStore";
import { useStudioLayoutStore } from "@/lib/studioLayoutStore";
import { offlineIdentity, assertOfflineIdentity } from "./identity";
import { resetWithoutPersistence } from "./accountLocalStorage";

export async function resetStudioOfflineState() {
  const identity = offlineIdentity();
  resetWithoutPersistence(() => {
    useStudioStore.setState(useStudioStore.getInitialState(), true);
    useStudioLayoutStore.setState(useStudioLayoutStore.getInitialState(), true);
  });
  if (identity.owner) {
    await Promise.all([useStudioStore.persist.rehydrate(), useStudioLayoutStore.persist.rehydrate()]);
    assertOfflineIdentity(identity);
  }
}