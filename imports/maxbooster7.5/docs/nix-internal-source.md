# Nix internal derivation source

[`derivation-internal.nix`](../derivation-internal.nix) is an unchanged copy of
[Nix 2.32.2's `src/libexpr/primops/derivation.nix`](https://github.com/NixOS/nix/blob/2.32.2/src/libexpr/primops/derivation.nix).
The same bytes were verified in Nix2.28.4. The file is1,954bytes with SHA256
`256db2ab70495ca7824c5f26ea5e37321d1d22f85eba96ccc9d2cb98d46ed4e9`.
The upstream [LGPL2.1 license](licenses/nix-LGPL-2.1.txt) applies to this copied
source; the rest of this project's licensing is unchanged.

Nix compiles this source into its executable and registers it in an in-memory
filesystem. [The upstream evaluator](https://github.com/NixOS/nix/blob/2.32.2/src/libexpr/eval.cc#L264-L287)
shows the synthetic `«nix-internal»/derivation-internal.nix` path. The committed
copy is provided at the owner's request for reference and inspection. It is not
imported by the project's Nix profile and does not repair a Replit loader trying
to stat that synthetic path. The exact failing host's Nix version is unverified.
