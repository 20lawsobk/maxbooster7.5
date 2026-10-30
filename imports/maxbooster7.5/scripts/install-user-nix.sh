#!/usr/bin/env bash
# Install command launchers without replacing existing user executables.
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
launcher="$script_dir/nix-user.sh"
user_home="$(getent passwd "$(id -u)" | cut -d: -f6)"
if [[ "$user_home" != /* ]]; then
  echo "Cannot resolve the current user's home directory from the account database." >&2
  exit 1
fi
destination="$user_home/.local/bin"
commands=(nix nix-build nix-shell nix-instantiate nix-store nix-env)

bash "$launcher" --version
for command_name in "${commands[@]}"; do
  target="$destination/$command_name"
  if [[ -e "$target" || -L "$target" ]]; then
    if [[ ! -L "$target" || "$(readlink "$target")" != "$launcher" ]]; then
      echo "Refusing to replace existing command: $target" >&2
      exit 1
    fi
  fi
done
mkdir -p "$destination"
chmod +x "$launcher"
for command_name in "${commands[@]}"; do
  target="$destination/$command_name"
  if [[ ! -L "$target" ]]; then ln -s "$launcher" "$target"; fi
done
echo "Installed user Nix launchers in $destination"
echo "Invoke $destination/nix or $destination/nix-shell directly if your shell has not loaded ~/.local/bin into PATH."
