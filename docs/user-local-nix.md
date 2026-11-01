# User-local Nix

Run `bash scripts/install-user-nix.sh` to install launchers in
`~/.local/bin`. For a shell that has not loaded that directory into PATH,
use `/home/runner/.local/bin/nix` or `/home/runner/.local/bin/nix-shell`
directly in this workspace. The launcher resolves the current account's home
directory even when the calling environment omits HOME.

The launchers use the verified Nix 2.28.4 executable already installed in
the system store. They fail explicitly if that release is no longer present.
They do not install or replace a Nix daemon or alter Replit's configuration.
Interactive Nix shells explicitly use `/bin/bash` rather than attempting
to download Bash from an unconfigured nixpkgs channel.

Store files, metadata, and logs are owned by the current user under
`~/.local/share/nix-user`, outside the repository. Both the logical and
physical store use this path, so builds do not require a chroot or access
to the platform's inaccessible shared store.

## Limits

- Standard binary caches targeting `/nix/store` cannot supply packages for
  this custom store path. Many packages require source builds.
- Builds run as the current user without Nix's privileged sandbox. Only
  run trusted build definitions.
- This does not fix Replit's separate environment-loader/checkpoint error
  involving `derivation-internal.nix`, or make the application ready to run.
- Launchers point to this checkout; rerun the installer if the checkout moves.
- Arbitrary Nix packages may require capabilities unavailable in this container.
  Successful CLI smoke checks do not guarantee every package will build.
