---
name: PDIM Lua JSON values
description: A runtime-specific constraint for validating JSON values inside PDIM EVAL scripts.
---

When using the embedded PDIM Redis Lua bridge, do not assume `cjson.decode` returns a Lua value whose `type()` is `table`. The bridge may expose decoded JSON objects as userdata while still permitting field access. Check decoding success and read/validate fields inside `pcall` instead.

**Why:** A strict Lua table type check rejected valid source-review records even though their decoded fields were correct; the local PDIM RedisStore reproduced the rejection, and field validation fixed it.

**How to apply:** For scripts run through the in-house PDIM/Wasmoon implementation, test JSON decoding against that implementation and validate the required values rather than relying on stock Redis Lua type behavior.
