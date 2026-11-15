/**
 * Root-only source capsule exclusions for repository-local rehearsal copies.
 *
 * These directories remain in the checkout for inspection and history, but
 * must not be hashed into or copied into a deployable source capsule.
 */
export const SOURCE_CAPSULE_ROOT_EXCLUDES = Object.freeze([
  "data",
  "uploads",
  "deploy-capsule",
  "maxbooster7.5",
  ".pythonlibs",
  "hardware",
  "reports",
  ".pdim-scratch-*",
  ".task123-publishing-candidate",
]);
