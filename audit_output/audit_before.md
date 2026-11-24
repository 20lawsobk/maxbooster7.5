# Production Audit Report

Generated: 2026-11-24T20:36:59.881882+00:00
Repository: `/home/runner/workspace`

**Production Score:** 75/100  
**Production Ready:** False  
**Blockers:** 4  

## Scan Summary

- Files: 8 (text 8, binary 0, skipped 0)
- Lines scanned: 8033
- Source files: 7, test files: 0

## Placeholder Logic (3)

- **[HIGH] Mock/stub/placeholder in non-test code** — `production_audit.py`
  - Details: L51: placeholder; L82: mock; L104: placeholder; L105: dummy; L224: placeholder; L485: placeholder
  - Fix: Replace with production implementation
- **[HIGH] Mock/stub/placeholder in non-test code** — `production_audit_ai.py`
  - Details: L6: placeholder; L49: mock; L61: placeholder; L63: placeholder; L483: placeholder; L649: mock; L776: placeholder; L822: stub; L823: fake; L827: mock; +6 more
  - Fix: Replace with production implementation
- **[HIGH] Mock/stub/placeholder in non-test code** — `production_audit_understand.py`
  - Details: L6: stub; L9: stub; L234: stub; L249: stub; L279: stub; L296: stub; L483: stub; L488: stub; L508: stub; L555: stub; +8 more
  - Fix: Replace with production implementation

## Incomplete Implementation (1)

- **[HIGH] TODO/FIXME markers** — `production_audit.py`
  - Details: L80: TODO
  - Fix: Complete or ticket the unfinished work
