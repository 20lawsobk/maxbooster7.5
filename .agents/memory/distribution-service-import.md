---
name: distributionService baseStorage import alias
description: distributionService.ts declares a local storage typed-cast but imports storage under the wrong name
---

# distributionService.ts import alias fix

## The rule
In `server/services/distributionService.ts`, the module imports `storage` from `"../storage"` but the module-level typed boundary cast uses the name `baseStorage`. Fix: alias the import — `import { storage as baseStorage } from "../storage"`.

**Why:** The cast line `const storage = baseStorage as unknown as DistributionStorage` was written expecting the import to be aliased, but the import used the bare name `storage`. This causes a `ReferenceError: baseStorage is not defined` crash at startup that takes down the entire server.

**How to apply:** Change line 2 of `server/services/distributionService.ts` from:
```ts
import { storage } from "../storage";
```
to:
```ts
import { storage as baseStorage } from "../storage";
```
No other changes needed — `storage` (the typed boundary) is declared on line ~195 and used throughout the rest of the file.
