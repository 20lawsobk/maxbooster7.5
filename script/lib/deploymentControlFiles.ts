/**
 * Publishing still needs dependency metadata after capsule packing. These
 * small files stay in the image unchanged, rather than being removed and
 * made available only after runtime restoration.
 */
export const DEPLOYMENT_CONTROL_FILES = [
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