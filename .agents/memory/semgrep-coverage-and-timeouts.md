---
name: Semgrep coverage and timeout evidence
description: Parser and timeout limitations found during the full security audit
---
Semgrep 1.172.0 can report partial parsing on otherwise valid TypeScript/JSX, especially bare ampersands in JSX text/attributes and inline import type queries. Its script-tag audit rule took about 48 seconds on the large schema file, exceeding a 30-second rule budget.

**Why:** A full source inventory previously had 70 partial-parsing errors and one timeout despite passing application typechecks. Those errors were not proof of broken application syntax, nor could they be counted as a clean security scan.

**How to apply:** Preserve rendered strings and types when making parser-compatible changes. Keep errors visible, retain the exact rule artifact, measure slow rules independently, and use a bounded budget based on evidence. Include newly added, nonignored source files in verification before they are committed; a tracked-only inventory misses new security helpers.