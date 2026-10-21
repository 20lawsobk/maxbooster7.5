{pkgs}: {
  # Root system dependencies also serve the imported MaxCore and PDIM code.
  # Language runtimes are supplied by the modules in .replit.
  deps = [
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
    pkgs.espeak-ng
  ];
}
