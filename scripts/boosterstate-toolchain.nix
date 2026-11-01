let
  nixpkgs = builtins.fetchTarball {
    url = "https://github.com/NixOS/nixpkgs/archive/650e572363c091045cdbc5b36b0f4c1f614d3058.tar.gz";
    sha256 = "150ip7d1izr4falxvnidgjmisbfja17rp4afigigld2hlhndafm7";
  };
  pkgs = import nixpkgs {};
in
pkgs.mkShell {
  packages = [
    pkgs.cargo
    pkgs.rustc
    pkgs.gcc
  ];
}