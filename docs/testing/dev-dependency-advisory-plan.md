# MaxCore development dependency advisory plan

Research recorded October 27, 2026. This document records the affected graph and
the compatible upstream repair path; it is not evidence that the replacement
graph or browser consumer has already passed. Dependency installation, lockfile,
release replay and canonical regression changes belong to the coordinated
dependency-hardening task. No manifests, lockfiles or installed packages were
changed by this research.

## Observed advisories

The saved all-dependency MaxCore audit is
[`audit-maxcore-all.txt`](../../reports/dependency-hardening/2026-10-27-qs/audit-maxcore-all.txt).
These findings are development-tool paths; the separately saved production
audit is clear. That distinction does not dismiss their remediation, and it
does not establish an application HTTP exploit.

| Advisory | Installed path/version | Audit affected range | Fixed floor |
| --- | --- | --- | --- |
| [GHSA-vfgh-jcmw-g37q](https://github.com/advisories/GHSA-vfgh-jcmw-g37q), low: repeated unterminated inline HTML constructs | `lib/api-spec > orval > typedoc > markdown-it@14.3.2` | Current 14.x audit: `<14.3.3` | `14.3.3` |
| [GHSA-gfr2-rv44-r23c](https://github.com/advisories/GHSA-gfr2-rv44-r23c), high: unclosed multi-line link reference | Same Markdown consumer | `>=14.1.0 <14.3.3` | `14.3.3` |
| [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), high: oversized collection validation | `scripts > puppeteer-core@25.11.0 > chromium-bidi@17.0.2 > zod@3.25.76` | `<4.6.6` | `4.6.6`; existing workspace 4.x floor is `4.6.7` |

The inline-HTML issue requires `html: true` or the commonmark preset. The high
reference-definition issue affects default options. Disabling HTML therefore
does not address both findings. Their exact current audit ranges above should
not be generalized to unrelated major lines.

## Compatible Markdown patch

TypeDoc 0.28.20 declares `markdown-it: ^14.3.0`. Published 14.3.3 is within that
range, and its dependency map is identical to 14.3.2: mdurl, argparse, entities,
uc.micro, linkify-it and punycode.js retain their existing ranges. Raise the
MaxCore Markdown override and its security-version check to 14.3.3, regenerate
the workspace lock, and verify the actual installed consumer resolution.

A temporary registry tarball was verified against its published SHA-512
integrity, then loaded with the existing compatible dependencies without
altering the installed workspace. On Node 22.23.3, it rendered valid headings,
links and lists identically to installed 14.3.2. Six bounded adverse cases
passed, each producing output:

| Input | Repetitions | Observed patched elapsed time |
| --- | --- | --- |
| `x ` followed by `<!--`, HTML enabled | 64,000 | 65 ms |
| `x ` followed by `<?x`, HTML enabled | 64,000 | 29 ms |
| `x ` followed by `<!A`, HTML enabled | 64,000 | 29 ms |
| `x ` followed by `<![CDATA[`, HTML enabled | 64,000 | 817 ms |
| Unclosed reference title: `[a]: /u "` plus `x\n` | 100,000 | 123 ms |
| Unclosed reference label: `[` plus `a\n` | 20,000 | 25 ms |

These are bounded checks on this machine, not a general latency guarantee.
Run them again against the final installed consumer and retain their receipt.

## Zod 3 is not a safe direct override to Zod 4

The registry's latest stable Zod 3 is 3.25.76; no released 3.x backport was found.
The [upstream fix](https://github.com/colinhacks/zod/commit/a0ebf970f2d752e5f58527cd2942ff48be4f46bd)
changes v4 array/map/set parsing and compiled size gates. It rejects oversized
containers before walking elements when leading upper-size checks apply.
The separate [abortEarly proposal](https://github.com/colinhacks/zod/pull/6475)
was closed without merge; it must not be treated as an available remediation.

The installed v3 behavior was measured with only 1,000 elements, avoiding an
out-of-memory demonstration:

```js
let visited = 0;
const schema = z.array(z.preprocess(value => {
  visited++;
  return value;
}, z.string())).max(1);
const result = schema.safeParse(Array(1000).fill(1));
```

- Zod 3.25.76: 1,000 element visits and 1,001 issues.
- Zod 4.6.7: zero element visits and one `too_big` issue.

This confirms relevant v3 behavior rather than dismissing the audit as a false
positive. It does not claim that arbitrary unconstrained collections become
bounded merely by upgrading; the verified fix concerns applicable size gates.

Chromium BiDi 17.0.2 explicitly depends on `zod: ^3.24.1`. Its actual parser
reads `parseResult.error.errors`. Zod 4.6.7 exposes `.issues` and has no `.errors`
alias. A blanket major override would break that validation-error path.

## Smallest verified upstream migration path

Registry metadata identifies this first compatible Puppeteer 25.x transition:

| Package | Current | Narrow replacement | Relevant contract |
| --- | --- | --- | --- |
| puppeteer-core | 25.11.0 | **25.13.0** | Node `>=22.12.0`; selects the new BiDi dependency itself |
| chromium-bidi | 17.0.2 | **157.0.8090-0** | Declares Zod `^4.6.5`; Node `>=20.19.0 <22.0.0 \|\| >=22.12.0` |
| zod in this chain | 3.25.76 | **4.6.7** | Existing workspace `zod@4: ^4.6.7` supplies the patched floor |
| @puppeteer/browsers | 3.2.2 | **3.2.4** | Selected by Puppeteer 25.13.0 |
| devtools-protocol | 0.0.1680125 | **0.0.1696802** | Selected by Puppeteer 25.13.0 |
| webdriver-bidi-protocol | 0.4.3 | **1.0.1** | Selected by Puppeteer 25.13.0 |

Puppeteer 25.12.0 still selects old BiDi 17.0.2. Latest 25.16.0 also selects
157.0.8090-0, but adds unrelated browser-manager/protocol updates; 25.13.0 is
the narrower migration. Do not independently force a new BiDi package under
old Puppeteer or force Zod 4 under old BiDi.

The integrity-verified new BiDi tarball changes its parser to
`parseResult.error.issues`. New Puppeteer's `BidiOverCdp` retains its named
`BidiMapper` import and `BidiServer.createAndStart` use. These inspected APIs
support the proposed chain; actual installed integration remains required.

Node 22.23.3 satisfies both engine ranges. The host Chromium is 154, while the
new package's versioning/protocol is newer; engine compatibility alone does not
prove browser compatibility. The actual MaxCore caller is the local patent
PDF generator, using the normal Chrome/CDP launch path. No direct application
Zod/BiDi import or public BiDi endpoint was found in that scripts consumer.

## Required validation after the coordinated graph update

1. Resolve the real scripts consumer's package paths and assert Puppeteer
   25.13.0, BiDi 157.0.8090-0, browser manager 3.2.4 and Zod 4.6.7. Preserve the
   workspace's Zod 4 minimum; reject remaining vulnerable Zod 3 paths in this
   repaired chain. Do not suppress the audit finding.
2. Import the actual new BiDi `protocol-parser/protocol-parser.js` and its own
   resolved Zod. `parseObject({value: "ok"}, z.object({value: z.string()}))`
   must return the valid object. `{value: 1}` must produce the protocol's
   `invalid argument` exception with a useful field path, not a TypeError.
3. Repeat the bounded collection check above. Verify zero visits, one issue and
   `too_big` against the actual consumer's Zod.
4. Update the exact package expectations in
   [patent-pdf-runtime.test.mjs](../../tests/patent-pdf-runtime.test.mjs), then
   execute it using the real configured Chromium 154. It checks the actual
   generator's local HTTP document, valid PDF bytes, Letter dimensions and
   invalid source handling. Also exercise an explicitly selected BiDi session
   if that mode is to be retained as verified capability.
5. Run the scripts TypeScript check, the MaxCore security-version gate and the
   six Markdown regressions through TypeDoc's actual installed dependency.
   Perform code generation only in an owned disposable copy: the existing
   Orval configuration has `clean: true` outputs in tracked source directories.
6. Run both production and all-dependency MaxCore audits, then verify lock
   reproducibility, release replay, and the packaging source hash. A changed
   lock invalidates release evidence prepared from the earlier graph.

The relevant existing consumer command is:

```sh
REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium \
  node --import tsx --test tests/patent-pdf-runtime.test.mjs
```

Package publication dates do not require bypassing the workspace's one-day
minimum release age: Markdown 14.3.3 was published October 16; Puppeteer 25.13.0
was published October 8. Final acceptance results must be recorded separately
from this research plan.

Registry sources: [Puppeteer 25.13.0](https://registry.npmjs.org/puppeteer-core/25.13.0),
[BiDi 157.0.8090-0](https://registry.npmjs.org/chromium-bidi/157.0.8090-0),
[Markdown 14.3.3](https://registry.npmjs.org/markdown-it/14.3.3),
[Zod advisory API](https://api.github.com/advisories/GHSA-mrhx-c7xc-m3w5).
