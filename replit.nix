{ pkgs }: {
  # System dependencies shared by the app, MaxCore, and PDIM.
  # Use plain package attributes for Replit's dependency parser.
  deps = [
    pkgs.espeak-ng
    pkgs.xorg.libXrender
    pkgs.xorg.libXrandr
    pkgs.xorg.libXinerama
    pkgs.xorg.libXext
    pkgs.xorg.libXcursor
    pkgs.xorg.libX11
    pkgs.libGL
    pkgs.fontconfig
    pkgs.freetype
    pkgs.alsa-lib
    pkgs.binutils
    pkgs.pkg-config
    pkgs.gcc
    pkgs.cmake
    pkgs.ffmpeg
    pkgs.dejavu_fonts
    pkgs.nano
    pkgs.redis
    pkgs.psmisc
    pkgs.libarchive
    pkgs.zstd
    pkgs.xz
    pkgs.git
    pkgs.curl
    pkgs.postgresql_17
    pkgs.nix
    pkgs.nodejs_22
    pkgs.python311

    # Native JUCE/VST3 Linux build tools and libraries.
  ];
}