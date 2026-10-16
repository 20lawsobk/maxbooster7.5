---
name: Semgrep coverage and timeout evidence
description: Parser and timeout limitations found during the full security audit
---
Semgrep 1.172.0 can report partial parsing on otherwise valid TypeScript/JSX, especially bare ampersands in JSX text/attributes and inline import type queries. Its script-tag audit rule took about 48 seconds on the large schema file, exceeding a 30-second rule budget.

**Why:** A full source inventory previously had 70 partial-parsing errors and one timeout despite passing application typechecks. Those errors were not proof of broken application syntax, nor could they be counted as a clean security scan.

**How to apply:** Preserve rendered strings and types when making parser-compatible changes. Keep errors visible, retain the exact rule artifact, measure slow rules independently, and use a bounded budget based on evidence. Include newly added, nonignored source files in verification before they are committed; a tracked-only inventory misses new security helpers.

The Nix Semgrep Python environment can inherit incompatible workspace Python
packages, failing before scanning with a missing native pydantic_core module.
The workspace config directory can also hit its quota even when /tmp has space.

**Why:** Both failures occurred while starting a bounded fresh scan; neither was
an application security finding.

**How to apply:** Run the scanner with PYTHONPATH and PYTHONHOME unset and private
HOME/XDG/SEMGREP settings and log paths under /tmp. Keep the installed Nix scanner;
do not alter application Python dependencies to repair its tooling environment.