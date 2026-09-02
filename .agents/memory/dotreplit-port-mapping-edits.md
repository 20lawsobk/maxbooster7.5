---
name: .replit port-mapping edits and the PortContract check
description: Why the "Start application" workflow can fatally abort at boot over a .replit [[ports]] mismatch, how to diagnose it, and the required edit procedure.
---

This repo's `scripts/check-port-contract.ts` (run from `scripts/start-dev.sh` before
the app boots) fails closed: it requires exactly one `.replit` `[[ports]]` entry
with `externalPort = 80` (Replit's default public port), and that entry's
`localPort` must equal the app's real listen port (`runtimePorts.app`, i.e. the
resolved `PORT` env value from `server/config/ports.ts`, normally 5000). If
`.replit` maps port 80 to any other `localPort` — including a legitimate
internal service — startup aborts immediately with `[PortContract] FATAL`,
producing a full outage (not just a broken preview).

**Why:** `.replit`'s port table and the app's own runtime port config are edited
independently and can drift silently. This project also runs its own DNS
nameserver (`server/nameserver.ts`) on port 5353 for custom-domain/GeoDNS
routing — a legitimate internal-ish service that is easy to mistake for "the
app" when skimming `.replit`, but it is not tracked in `server/config/ports.ts`
at all (that module only lists API sidecars like pdim/diffusion/maxcore).

**How to apply:** When this FATAL appears, read `.replit`'s `[[ports]]` table
and swap so the app's `localPort` owns `externalPort = 80`, moving whatever it
displaces to a different free externalPort — never delete a service's mapping
outright without checking it's still reachable somewhere. Preserve the
"no duplicate localPort/externalPort" invariant across the whole table.
`.replit` cannot be edited with the normal file-edit tool; write the full
corrected TOML to a temp file (copy + targeted `sed` by line number is safer
than retyping, since the file also holds every production secret inline under
`[userenv.shared]`) and call `verifyAndReplaceDotReplit({ tempFilePath })`.
Restart the workflow and confirm the `[PortContract] ✅ .replit public mapping
exposes only the app listener` log line before trusting the fix.
