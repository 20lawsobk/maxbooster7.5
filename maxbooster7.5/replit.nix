{ pkgs }: {
  deps = [
    # Node.js 20 LTS
    pkgs.nodejs_20
    
    # Build tools for native dependencies
    pkgs.nodePackages.typescript
    pkgs.nodePackages.typescript-language-server
    pkgs.nodePackages.vite
    
    # PostgreSQL client libraries (for drizzle-orm and pg)
    pkgs.postgresql
    
    # Image processing (sharp dependency)
    pkgs.vips
    pkgs.pkg-config
    
    # Python for node-gyp (native module compilation)
    pkgs.python3
    
    # Build essentials
    pkgs.gcc
    pkgs.gnumake
    
    # Git for version control
    pkgs.git
    
    # Rust (for boosterstate binary)
    pkgs.rustc
    pkgs.cargo
    
    # Audio processing libraries (for music-metadata, tone.js)
    pkgs.libsndfile
    pkgs.ffmpeg
  ];
  
  env = {
    LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [
      pkgs.vips
      pkgs.postgresql.lib
      pkgs.libsndfile
    ];
  };
}
