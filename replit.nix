{pkgs}: {
  # Root system dependencies also serve the imported MaxCore and PDIM code.
  # Language runtimes are supplied by the modules in .replit.
  deps = [
    pkgs.nodejs_22
    # npm is bundled with nodejs_22; provide the conventional nodejs alias too.
    (pkgs.writeShellScriptBin "nodejs" ''exec ${pkgs.nodejs_22}/bin/node "$@"'')
    # nix-shell and the other Nix commands are supplied by this package.
    pkgs.nix
    pkgs.postgresql_17
    pkgs.curl
    pkgs.git
    pkgs.xz
    pkgs.zstd
    pkgs.libarchive
    pkgs.psmisc
    pkgs.redis
    pkgs.nano
    pkgs.dejavu_fonts
    pkgs.ffmpeg
    # Native JUCE/VST3 Linux build tools and development libraries.
    pkgs.cmake
    pkgs.gcc
    pkgs.pkg-config
    pkgs.binutils
    pkgs.alsa-lib
    pkgs.freetype
    pkgs.fontconfig
    pkgs.libGL
    pkgs.xorg.libX11
    pkgs.xorg.libXcursor
    pkgs.xorg.libXext
    pkgs.xorg.libXinerama
    pkgs.xorg.libXrandr
    pkgs.xorg.libXrender
    pkgs.espeak-ng
  ];
}
