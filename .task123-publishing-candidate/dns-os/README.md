# DNS OS API integration

The Max Booster app supervises the DNS management API on private loopback port
8080. Its app-integrated database schema is `dns_os`, separate from the
existing Max Booster DNS tables. The API's `/health` route reports liveness;
`/ready` verifies PostgreSQL connectivity and the four required DNS OS tables.
All management routes require an internal bearer token. The app derives that
token from its session secret and does not expose it to the browser.

To apply the additive app schema explicitly, run `npm run dns-api:migrate`.
This command takes an advisory lock, records applied migrations, and runs only
`001_init.sql` and `002_audit.sql` inside `dns_os`. It refuses to shadow existing
public DNS OS tables or untracked tables in the new schema. It never runs
`003_max_booster_zone.sql`, which seeds or updates existing Max Booster DNS
data. Application startup does not run database DDL.

For standalone Docker or Kubernetes use, supply a private `DNS_API_TOKEN` of at
least 32 characters through the deployment's secret mechanism. Do not commit or
place the token in a client-visible environment.
