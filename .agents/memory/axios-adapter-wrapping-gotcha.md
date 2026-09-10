---
name: axios defaults.adapter wrapping gotcha
description: Why hijacking axios's low-level transport adapter to add cross-cutting behavior (circuit breakers, instrumentation) breaks in axios 1.x, and the two distinct failure modes it produces
---

## The rule
Never treat `axiosInstance.defaults.adapter` as a callable function. In axios 1.x it is a
resolution HINT — by default the array `["xhr","http","fetch"]`, or a single adapter
name/function if explicitly configured — not the actual transport function. Calling it
directly throws `"<var> is not a function"`.

**Why:** axios resolves the real adapter lazily, per-request, via its own internal
`adapters.getAdapter(nameOrList, config)` (exported publicly as `axios.getAdapter`).
Capturing `defaults.adapter` and invoking it as `originalAdapter(config)` skips that
resolution step entirely.

## Two distinct failure modes, in the order they'll bite you

1. **"originalAdapter is not a function"** — the naive fix attempt. Happens on every
   single call; if wrapped in a try/catch or a circuit-breaker fallback, this can be
   silently swallowed and misreported as a generic upstream failure (e.g. "circuit
   breaker is open") for the entire lifetime of the service, hiding that NO request
   ever actually reached the network.

2. **Infinite recursion / "Maximum call stack size exceeded"** — the naive "fix" for
   failure #1: resolve the real adapter yourself via `axios.getAdapter(spec, config)`,
   but read `spec` from `config.adapter` at call time. This recurses forever, because
   axios's own request pipeline merges `defaults.adapter` into `config.adapter` BEFORE
   invoking it — so by the time your wrapper runs, `config.adapter` already equals
   your own wrapper function (since you reassigned `defaults.adapter` to it), and
   resolving from `config.adapter` just hands you back yourself.

## How to apply
Capture the ORIGINAL pre-assignment adapter spec in a closure variable once, before
reassigning `defaults.adapter`. Inside the wrapper, always resolve from that captured
closure variable — never from `config.adapter`:

```ts
const originalAdapterSpec = client.defaults.adapter; // capture BEFORE overwriting
client.defaults.adapter = async (config) => {
  const realAdapter = axios.getAdapter(originalAdapterSpec, config); // never config.adapter
  return realAdapter(config);
};
```

If you need per-call protection (circuit breaker, retry, timing) without touching the
adapter layer at all, prefer axios interceptors (`client.interceptors.request/response.use`)
or wrapping individual call sites — both sidestep this whole class of bug. Adapter
hijacking is only justified when you need to guarantee coverage of every call through a
shared client with zero risk of a new call site forgetting to wrap itself.

## Where seen
`server/services/labelgrid-service.ts` constructor — the fix that surfaced this had been
silently breaking every LabelGrid API call, masked by a circuit-breaker fallback (see
circuit-breaker-fallback-masks-errors.md) that made it look like normal degraded-service
behavior instead of "zero requests have ever reached the network."
