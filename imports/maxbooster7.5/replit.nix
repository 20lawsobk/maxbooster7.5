{ pkgs }: {
  # System dependencies shared by the app, MaxCore, and PDIM.
  # Use plain package attributes for Replit's dependency parser.
  deps = [
    # Runtimes and package tools; npm is included with Node.js.
    pkgs.nodejs_22
    pkgs.python311
    pkgs.nix

    # Database, archive, process, and build/download tools.
    pkgs.postgresql_17
    pkgs.redis
    pkgs.curl
    pkgs.git
    pkgs.xz
    pkgs.zstd
    pkgs.libarchive
    pkgs.psmisc
    pkgs.nano

    # Media rendering, fonts, and local narration.
    pkgs.ffmpeg
    pkgs.dejavu_fonts
    pkgs.espeak-ng

    # Native JUCE/VST3 Linux build tools and libraries.
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
  ];
}
