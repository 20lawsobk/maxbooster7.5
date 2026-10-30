module.exports = {
  // Keep electron-builder's update/publish feed aligned with the repository
  // that actually creates tagged desktop/mobile releases. This higher-priority
  // config overrides the stale package.json#build.publish destination while
  // preserving the rest of package.json#build through electron-builder's
  // normal merged configuration.
  publish: [
    {
      provider: "github",
      owner: "20lawsobk",
      repo: "maxbooster7.5",
      releaseType: "release",
    },
  ],
};
