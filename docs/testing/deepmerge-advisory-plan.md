# Deepmerge and SendGrid advisory review

Research observed October 27, 2026 (America/Detroit; registry checks ran
October 28 UTC). This is read-only analysis and bounded local reproduction,
not a completed dependency repair or deployed mail-delivery verification.

## Authoritative affected graph

[GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)
names `deepmerge >=4.2.0 <=4.3.1`, with **no first patched version**. Its
[API record](https://api.github.com/advisories/GHSA-gcqx-w48m-w2h4) was
updated `2026-10-27T21:34:58Z`. The local audit reports low severity;
the upstream reporter labels the impact higher. Preserve both descriptions
without treating either label as proof of a reachable application exploit.

At inspection, registry latest versions were:

| Package | Version | Relevant dependency |
| --- | --- | --- |
| [deepmerge](https://registry.npmjs.org/deepmerge/latest) | 4.3.1 | No fixed release available |
| [@sendgrid/helpers](https://registry.npmjs.org/@sendgrid%2fhelpers/latest) | 8.0.0 | `deepmerge: ^4.2.2` |
| [@sendgrid/mail](https://registry.npmjs.org/@sendgrid%2fmail/latest) | 8.1.6 | helpers `^8.0.0`, client `^8.1.5` |

The installed root graph matches those versions. The audit's suggested
SendGrid 6.5.2 downgrade is a dependency solver recommendation, not a
validated compatible security repair. Do not automatically downgrade it.

The actual SDK use is
`node_modules/@sendgrid/helpers/classes/personalization.js:300`:

```js
this.dynamicTemplateData = deepMerge(dynamicTemplateData, this.dynamicTemplateData);
```

`classes/mail.js:296` invokes that method when applying global dynamic
template data. This call uses only the ordinary two-argument merge API.

## Bounded reproduction

Two local calls against the actual installed `deepmerge@4.3.1` reproduced
the returned-object prototype change, using a harmless research-only marker:

```js
const source = JSON.parse(
  '{"__proto__":{"__maxbooster_research_marker__":"inherited"},"visible":"ok"}'
);
const first = merge(Object.create(null), source);
const second = merge(source, {});
```

Both returned objects inherited the marker, did not own it, and had a
prototype different from `Object.prototype`. In both cases a fresh `{}`
remained free of the marker and global `Object.prototype` stayed unchanged.
The first vector exercises the source loop with a null-prototype target;
the second exercises the unguarded target-copy loop with an own JSON
`__proto__` key. No provider request, database write or large payload was
used. This confirms dependency behavior, not exploitation of a Max Booster
request handler.

The [upstream report](https://github.com/TehShrike/deepmerge/issues/273)
recommends rejecting forbidden key names in **both** copy loops and using
safe own-property writes. Checking only global pollution or only the source
loop would miss these returned-object failures.

## Actual application scope and an independent delivery defect

Current application imports are limited to:

- [server/workers/index.ts](../../server/workers/index.ts): imports SendGrid
  and calls `setApiKey`, but its actual email worker uses Resend through
  `sendEmailOnce`. The SendGrid initialization and warning are unused for
  that worker's delivery path.
- [server/monitoring/alertingService.ts](../../server/monitoring/alertingService.ts):
  uses configured SendGrid alert recipients and constructs only `to`, `from`,
  `subject`, `text` and `html`. No dynamic-template payload is passed here.

The alert service currently calls `(sgMail as any)?.default.send(msg)`.
An actual Node 22 ESM import of the installed package yields
`typeof sgMail.send === "function"` and
`typeof sgMail.default === "undefined"`. Thus that expression cannot invoke
the real SDK send method. The catch logs the failure. This is separate from
the deepmerge advisory; it merits a functional delivery regression, not just
a package change.

## Narrow repair options and required proof

Prefer removing the unused SDK initialization and replacing the sole alert
consumer with a small, bounded SendGrid REST transport preserving its
configured key, sender, recipient behavior and plain/HTML content. If that
path is chosen, remove the now-unused SDK graph and regenerate only affected
locks/replay entries. Preserve Resend worker behavior.

Alternatively use an explicit, maintained merge adapter or a reviewed
consumer fork, with full compatibility tests. A direct alias is unsafe:
[@fastify/deepmerge 3.2.4](https://registry.npmjs.org/@fastify%2fdeepmerge/latest)
exports a factory, while
[deepmerge-ts 8.0.2](https://registry.npmjs.org/deepmerge-ts/latest) exports named
functions; neither is the callable CommonJS two-argument API expected by
SendGrid. Renaming vulnerable 4.3.1 or suppressing its audit is not a repair.

Required acceptance includes actual consumer success, invalid recipients,
missing settings, provider 4xx/5xx, network failure, timeout, secret-free
errors, correct recipient/content serialization and healthy subsequent
requests. Use owned loopback fixtures with injected transport; do not send
real email during local tests. Verify the real alert service reaches that
transport and does not report success when the provider rejects it. For a
merge adapter, additionally verify both prototype vectors above, nested
values, array semantics, own properties and unchanged inputs through the
actual SDK. Run all five full and production audits, frozen installs,
dependency admission tests and guarded legacy replay. Rebuild release
capsules from the final graph before claiming packaging acceptance.

## Separate Node and PDF compatibility review

Registry metadata and the updated MaxCore lock agree:
Puppeteer 25.13.0 and browser manager 3.2.4 require Node `>=22.12.0`;
BiDi 157.0.8090-0 requires `>=20.19.0 <22.0.0 || >=22.12.0` and declares
Zod `^4.6.5`. The workspace's 4.x override supplies patched 4.6.7.

Root `package.json` requires `>=22.12.0` and the portable policy pins 22.23.3,
which satisfy both. All setup-node workflows read `.nvmrc` (`22`).
`.node-version`, `.replit` and `replit.nix` also select the Node 22 line;
those broad selectors do not independently establish the actual remote
patch version. No new engine-floor conflict was found. Actual browser/PDF
tests and cold startup remain necessary.

Tracked current source identifies the Puppeteer import in
[external/maxcore/scripts/src/generate-patent.ts](../../external/maxcore/scripts/src/generate-patent.ts),
launched by the scripts package's `generate-patent` command. It uses normal
Chrome/CDP and an owned loopback document server. No current main-server
Puppeteer resolver or call to `generatePatentPdf` was found. Main contract,
invoice and tax PDF services import `jsPDF`. A historical tracked
`.pdim-scratch-external_maxcore-*` copy contains the old patent generator;
it is recovery inventory, not proof of a second current application caller.
This source review does not prove every deployment payload or runtime is
unreachable; audit dependency labels alone would not prove that either.
