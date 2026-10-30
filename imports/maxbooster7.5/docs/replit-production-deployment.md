# Max Booster on Replit

The target project is
[`blawzmusic89/Max-Booster`](https://replit.com/@blawzmusic89/Max-Booster).
The files below configure the imported local MaxCore and PDIM implementations
with the existing Neon database. No discontinued hosted MaxCore/PDIM service is
required.

## Configuration files and settings

| Location | Purpose in this project |
| --- | --- |
| `.replit` | TOML project configuration: editor entrypoint, Node/Python modules, Run command, Publishing build/run commands, non-sensitive defaults and one public port mapping. GitHub import requires both configuration files. |
| `replit.nix` | Nix system packages: PostgreSQL tools, compression/archive/process tools, Redis, media/fonts, `espeak-ng` for imported MaxCore narration, and HTTPS/Git build tools. It does not create a database or contain application credentials. |
| `.env.example` | The repository's complete environment-variable reference. This is documentation, not an automatically provisioned Replit secret store. Never copy example credentials into production. |
| Replit **Secrets** | Sensitive values such as the Neon URL, session secret, provider API keys and webhook signing secrets. Published credentials are reviewed under **Publishing → Adjust settings → Production app secrets**. |
| Replit **Configurations** | Non-sensitive values and overrides. Replit supports separate **testing** and **published app** configurations. Use these for the actual published origin and settings that differ by environment. |

Replit's current documentation identifies `.replit` and `replit.nix` as the app
configuration files; there is no additional required secret-bearing project
configuration file to commit. Do not add API keys to either file or print the
environment to diagnose missing values.

The `.replit` file was reconstructed from the repository entrypoints. The earlier
local file contained only a generated port mapping; this is not a byte-for-byte
recovery of a previous tracked configuration. The project retains its current
Nix channel selection rather than inventing an unverified channel pin.

## Editor and Publishing commands

The editor **Run** action executes `npm run dev`. Publishing builds with
`bash build.sh` and starts with `bash start.sh`. The build command packs runtime
capsules and removes build inputs in Replit's disposable Publishing copy.
**Do not run `build.sh` in the editor checkout or a source workspace.** Normal
source builds use `npm run build`.

The Node 22 and Python 3.11 modules supply editor/build tools. `replit.nix` also
declares `nodejs_22` (including npm), a `nodejs` executable alias, and `nix`
(including `nix-shell`). Run `npm run check:tools` to verify all five requested
commands, matching Node aliases, Nix expression evaluation and shell execution.
Publishing carries
the policy-pinned portable Node runtime, whose official archive SHA256 is checked
before installation. `start.sh` explicitly selects production mode; the editor's
`NODE_ENV=development` default does not select production behavior.

Select **Reserved VM** and the **web server** application type in
**Publishing → Adjust settings**. The repository's owner-requested target is
**North America, 16 vCPU / 64 GiB**; select the corresponding available machine
and region in that UI. Machine availability, resource allocation, region and
billing are not established by these files. Replit documents Reserved VM as an
always-on server suited to background work and memory-intensive applications.

Only application port **5000** maps to public port **80**. MaxCore, PDIM,
BoosterState and other child services remain private loopback services managed
by the production supervisor. Do not add public port mappings for them.

## Environment values

| Setting | Where to configure it | Requirement |
| --- | --- | --- |
| `NEON_DATABASE_URL` or `DATABASE_URL` | Secrets / Production app secrets | The existing Neon PostgreSQL connection string. `NEON_DATABASE_URL` takes precedence. Do not replace it with a newly provisioned Replit database. |
| `SESSION_SECRET` | Secrets / Production app secrets | A stable random secret of at least 32 characters. |
| `MAXCORE_LOCAL=1`, `PDIM_FORCE_REMOTE=0` | Committed non-sensitive `.replit` defaults | Use the imported local implementations. |
| `MAXCORE_SERVING_RELEASE=live-awareness` | Committed non-sensitive `.replit` default | Select the public live-awareness lifecycle. This setting does not certify inference quality. |
| `STRIPE_ALLOW_CATALOG_PROVISIONING=0` | Committed non-sensitive `.replit` default | Startup discovers the configured Stripe catalog without creating products or prices. |
| `BASE_URL`, `APP_URL`, `PUBLIC_APP_URL` | Published app Configurations | The actual HTTPS app origin used by the enabled journeys. The Replit project/editor URL is not a published app origin. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Secrets / Production app secrets | Credentials for payments and verification of the deployed Stripe webhook endpoint. An API key does not create an endpoint or enable account capabilities. |
| `STRIPE_PUBLISHABLE_KEY`, `VITE_STRIPE_PUBLIC_KEY` | Configurations | The matching public Stripe key. `VITE_STRIPE_PUBLIC_KEY` must be available when the client is built; it is intentionally public. |
| Email, social/OAuth, distribution and other provider values | Secrets for credentials; Configurations for public URLs/IDs as appropriate | Configure the providers used by the enabled features using `.env.example`. Complete provider-side OAuth callbacks, permissions and webhook registration separately. |

Existing secret bindings must be retained when synchronizing source. Test-mode
credentials and account state do not prove live payment readiness. Supplying a
key alone cannot repair an unsupported handler or prove signed webhook delivery.
Public awareness feeds do not require adding a hosted model API key.

## Verification and health

Before Publishing, run the repository checks and verify a disposable cold startup
with real configured dependencies. A passing build does not establish payment,
provider, full-page business journeys or inference readiness. The generated
configuration does not itself publish, synchronize the project or certify a
verified Replit deployment.

Monitor awareness separately with `GET /api/health/awareness/ready`. A 200 means
MaxCore reports a fresh snapshot backed by successful live sources. This probe
is independent of trained generation weights. Missing/expired snapshots, failed
sources or unavailable awareness transport return 503. The response exposes only
readiness metadata, never source content or credentials. `/api/ready` is the
aggregate application check; awareness health alone is not evidence of usable
generated content or functioning external providers.

## Official references

Reviewed October 20, 2026:

- [App configuration (`.replit` and `replit.nix`)](https://docs.replit.com/features/project-setup/configuration)
- [Dependency management and system dependencies](https://docs.replit.com/features/project-setup/dependency-management)
- [Secrets, Configurations and Production app secrets](https://docs.replit.com/core-concepts/project-editor/app-setup/secrets)
- [Publishing deployment types](https://docs.replit.com/features/publishing/deployment-types)
- [Publishing machine configuration](https://docs.replit.com/features/publishing/machine-configuration)

For the native plugin Linux build, the Nix profile also supplies CMake, GCC,
pkg-config, binutils, ALSA, FreeType, Fontconfig, OpenGL and X11 development
libraries. `npm run vst3:build:linux -- --project /path/to/original.jucer --juce /path/to/JUCE`
uses the original source project. See [native build status](../native/vst3/README.md);
the current `VST3/` directory has no original C++ source and cannot produce a
Linux plugin until that source is restored. The native host remains unavailable.
