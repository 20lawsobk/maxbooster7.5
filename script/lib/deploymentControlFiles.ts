/**
 * Publishing still needs dependency metadata after capsule packing. These
 * small files stay in the image unchanged, rather than being removed and
 * made available only after runtime restoration.
 */
export const DEPLOYMENT_CONTROL_FILES = [
  // Publishing can invoke its entrypoint again after a completed pack.
  "build.sh",
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "pyproject.toml",
  "uv.lock",
  "poetry.lock",
  "requirements.txt",
];
/** Files needed before any runtime/application capsule can be extracted. */
export const DEPLOYMENT_BOOTSTRAP_FILES = [
  "dist/deployment/executive.mjs", "dist/deployment/capacity.mjs",
  "dist/deployment/plans.mjs", "dist/deployment/restore-one.mjs",
  "dist/deployment/port-contract.sh", "dist/deployment/check-port-contract.mjs",
  "dist/deployment/boot-stub-server.mjs", "dist/deployment/ports.replit",
];
