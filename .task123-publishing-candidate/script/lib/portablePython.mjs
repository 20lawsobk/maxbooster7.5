import { execFileSync } from "node:child_process";

// -I ignores PYTHONPATH/PYTHONHOME, user site-packages and the working
// directory. Registry/network settings stay intact for the package firewall.
export function runPortablePython(binary, args, options = {}) {
  return execFileSync(binary, ["-I", ...args], options);
}