{pkgs}: {
  deps = [
    pkgs.postgresql_17
    pkgs.xz
    pkgs.zstd
    pkgs.libarchive
    pkgs.psmisc
    pkgs.redis
    pkgs.nano
    pkgs.dejavu_fonts
    pkgs.ffmpeg
  ];
}
