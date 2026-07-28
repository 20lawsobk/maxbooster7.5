// Stub: tar is only needed by native module build scripts.
// With --ignore-scripts, build scripts never run, so this stub is sufficient.
module.exports = {
  create: () => Promise.resolve(),
  extract: () => Promise.resolve(),
  list: () => Promise.resolve(),
  update: () => Promise.resolve(),
  replace: () => Promise.resolve(),
  c: () => Promise.resolve(),
  x: () => Promise.resolve(),
  t: () => Promise.resolve(),
  u: () => Promise.resolve(),
  r: () => Promise.resolve(),
};
