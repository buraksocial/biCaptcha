# biCaptcha v2

**A self-hostable CAPTCHA platform for teams that need server-side enforcement—not a client-side checkbox.** biCaptcha pairs a browser widget with short-lived, single-use tokens that your own backend verifies before it accepts a protected action.

Version **0.2.0** adds a PostgreSQL + Redis production topology, an administrator-approved Cloud pilot foundation, and optional scoped Trust Pass v2. The project is under active development and is **not yet a production service or generally available paid Cloud product**. Production configuration is deliberately fail-closed (`503`). See [operations and protocol details](docs/SELFHOST-CLOUD-TRUST-V2.md) and [implementation evidence and open release gates](docs/SOL-IMPLEMENTATION.md).

## Built for control and clear security boundaries

- **Verify on your server.** Bind challenges and tokens to the registered site, action, and hostname; consume tokens once with the backend-only `siteverify` API before performing the protected action.
- **Self-host without a Cloud dependency.** Run the supported production stack on PostgreSQL + Redis behind your TLS ingress. Your local installation serves its own browser SDK.
- **Keep tenant credentials private.** Per-site verification credentials stay on your backend; the browser receives only a public site key.
- **Offer a bounded convenience path.** Optional Trust Pass v2 uses user-verified WebAuthn and short-lived, site/action-scoped grants. Its extension is not a universal bypass or proof of humanity.
- **Keep operations operator-controlled.** Signed-image updates are off by default, use a fixed Compose apply path, and require a provisioned trust root and restore-tested backup.

### Cloud pilot terms

The administrator-approved pilot is designed around **$19.99/month**, including **100,000 successful first-time siteverify consumptions per billing period**. Additional usage is specified at **$0.00099 per consumption**, only with explicit opt-in and a spending cap. This is a pilot specification, **not an active checkout or charge**: payment processing, invoicing, and self-service paid activation are not implemented. Cloud access is enabled only by an administrator; it is not required for self-host installations.

> CAPTCHA and telemetry do not prove that a visitor is human. biCaptcha does not currently provide a general WAF/DDoS service, paid Cloud billing, Cloudflare/Akamai scoring, or a 99.9% passive-completion guarantee.

## Security boundary

- Verified site + action + exact source host binding; root domain and its subdomains allowed. Challenges and success JWTs expire after **120 seconds**, enforce HS256/type/issuer/audience/required claims, and use separate internal signing keys.
- Challenges and token JTIs are each atomically consumed exactly once. Failed site/action/host checks do not consume legitimate state. Client PoW binds the complete challenge to its nonce with `SHA256(challenge + ':' + nonce)` (four leading hex zeroes).
- Telemetry is bounded, plain JSON over TLS and **advisory only**. A headless client can solve PoW and imitate telemetry; passing CAPTCHA is not proof of humanity. No VM, AES-derived “proof”, public-key HMAC integrity claims, hardware-attestation claim or Trust Pass bypass remains.
- `Origin`/CORS restrict browser integration, not authentication of non-browser clients. Bots can forge Origin; site credentials authenticate **token consumption**, not widget users. TLS, rate limits, state and application-side abuse controls remain necessary.
- No tenant receives a signing key. Per-site random backend credentials are hashed in DB and revealed only on create/rotation. Old `secretKey` values are never accepted by siteverify or returned in site objects.

## Setup and checks

Requires Node **22.18+** (or a compatible newer Node; this session used 26.4.0) and npm. SQLite is for local development; supported self-host production uses PostgreSQL plus Redis through the documented Compose deployment. Next.js is **16.4.6**; reassess advisories before deployment.

1. Install dependencies with `npm ci`. Review dependency install-script permissions in your npm environment; do not approve unrelated scripts blindly. `npm run db:generate` generates the SQLite and PostgreSQL clients.
2. For local development, copy `.env.example` to `.env` and configure SQLite `DATABASE_URL` and development settings. For self-host production, follow [Compose/Postgres/Redis deployment](docs/SELFHOST-CLOUD-TRUST-V2.md), using `deploy/production.env.example`, operator secrets, TLS and isolated services. SQLite-to-Postgres is a separately approved, manual data transition; there is no automatic migration.
3. Review the applicable migration procedure **before using the DB**. Production migration uses only `npm run db:deploy:postgres` against `prisma/postgres/schema.prisma`. No migration was applied to an existing local database in this implementation session.
4. For isolated local development only, use `NODE_ENV=development`, `BICAPTCHA_STATE=memory`, `npm run dev`. This does **not** relax the widget/domain HTTPS policy. The dashboard may be developed at an explicitly configured HTTP `APP_ORIGIN`; widget integration needs a verified HTTPS DNS domain/TLS test harness. Localhost is not an eligible site.
5. Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run check:client`. `build` always generates `public/bicaptcha.js` deterministically from its TypeScript source. Never edit the generated artifact. Vendored `cap-main/` is excluded from application lint; its tests do not test biCaptcha.

Most tests create isolated temporary SQLite databases and explicitly enabled local memory state. PostgreSQL/Redis integration tests additionally require disposable `TEST_DATABASE_URL` and `TEST_REDIS_URL`; without them that integration test is skipped, not passed. See [latest exact run results and gates](docs/SOL-IMPLEMENTATION.md). Tests do not prove live TLS/browser WebAuthn, production load or a distributed deployment.

## Self-host updates

Update modes are `off` (default), `notify`, `download-approve`, and `auto-security`. The updater verifies signed Docker image archives and image identity, then applies only the fixed `app` Compose service using fixed arguments—never commands from a manifest. It requires operator-owned Compose paths and a recent restore-tested backup. A real signing root, release registry, and production configuration are not supplied; keep updates disabled until those operator gates are satisfied. See the [updater runbook](docs/SELFHOST-CLOUD-TRUST-V2.md#signed-updater-separate-operator-process).

## Breaking API / SDK migration

Old widgets, encrypted telemetry, Trust Pass enrollment/signature payloads, old unscoped tokens, old default-key sessions and `verifyCaptcha(token)` callers are incompatible. Deploy backend + generated SDK + consumer changes together. Purge CDN caches for `/bicaptcha.js` (or version its URL). A failed/replayed/expired token requires a fresh challenge; do not retry business side effects with an already consumed token.

Browser integration (replace placeholders with public values only):

```html
<script src="https://api.your-service.com/bicaptcha.js"></script>
<script>
  const captcha = window.BiCaptcha.init('bicaptcha_PUBLIC_SITE_KEY', {
    action: 'contact',
    apiBase: 'https://api.your-service.com'
  });
  // Trigger from your form's explicit verification UI.
  captcha.execute((token, error) => {
    if (token) { /* send token to YOUR backend, not a privileged secret */ }
  });
  // Call captcha.destroy() when your component unmounts.
</script>
```

React component: `<BiCaptcha siteKey="..." action="contact" apiBase="https://api.your-service.com" onVerify={setToken} />`. Public API base is an **absolute HTTPS origin**. No cookies are sent by the widget. Re-verify after 120 seconds; the React wrapper invalidates its cached token early at 115 seconds. Recreate/reset the widget after form submission.

- `POST /api/bi-captcha/challenge?siteKey=...`: JSON `{siteKey, action}`; requires verified site and allowed HTTPS Origin. Returns `{challenge, difficulty, expiresIn}`. `GET` supports equivalent query params.
- `POST /api/bi-captcha/verify?siteKey=...`: JSON `{siteKey, action, challenge, nonce, telemetry}`. Telemetry keys: optional `webdriver:boolean`, `duration:number`, `interactions:number`, `language:string` (32 chars). No arrays or unknown keys. Returns `{success, token, expiresIn}`. The server derives exact host from Origin, not client body.
- Both endpoints implement explicit OPTIONS and echo **only the exact permitted origin**, never wildcard or credentials. JSON preflight URL must include the public siteKey. Request body maximum is 8 KiB; nonce is a decimal string of at most 10 digits. No proxy IP headers are trusted.
- `/api/bi-captcha/register-pass` still returns **410**. Legacy `extension/manifest.json` protocol is disabled; the separately generated `extension/v2` package uses new `/api/trust/v2/*` endpoints and explicit deployment/customer origins. Optional SDK `trustPassV2: true` requests only a scoped pass, never arbitrary signing; failures fall back to normal CAPTCHA. Browser WebAuthn/MV3 release validation remains required.

### Central siteverify (customer backend only)

```js
// Values here are trusted backend configuration, not request/token claims.
const response = await fetch('https://api.your-service.com/api/bi-captcha/siteverify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SITEVERIFY_CREDENTIAL}` },
  body: JSON.stringify({
    token: untrustedBrowserToken,
    siteKey: 'bicaptcha_PUBLIC_SITE_KEY',
    action: 'contact',
    hostname: 'shop.your-domain.com'
  })
});
if (!response.ok || (await response.json()).success !== true) throw new Error('Captcha rejected');
// Only now perform the protected side effect; use your own business idempotency key.
```

Exact expected hostname is mandatory in addition to site/action; validate your allowed host from trusted backend configuration, never blindly forward a client-provided host. Siteverify is backend-only (no CORS) and atomically consumes one token. On network uncertainty, fail closed; consumption might already have succeeded. Per-site credentials are issued once by site creation or owner-only `POST /api/sites/:id/rotate-secret`; rotation invalidates the old credential immediately. Keep credentials only on tenant servers, never in widgets/source control/logs. There is no JWKS/offline acceptance path because offline signature verification alone cannot enforce global single use.

Same-deployment server code may call `verifyCaptcha(token, expectedSite, expectedAction, expectedHost)`; it uses the same central state and is **not a customer-distributed HMAC helper**. `/api/contact` uses configured `DEMO_SITE_KEY`/`DEMO_HOSTNAME` and fixed action `contact`; it only verifies a demo submission and sends no message. Its browser demo additionally needs matching `NEXT_PUBLIC_DEMO_SITE_KEY`, `NEXT_PUBLIC_BICAPTCHA_API_BASE` and real verified HTTPS origin; missing config is visibly disabled, not an invented `DEMO_SITE_KEY` bypass.

## Domains, auth and tenant data

Domain input is a bare DNS name: lowercase/IDNA ASCII canonicalization and one trailing dot removal; URL, port, whitespace, IP, localhost, unlisted TLD, and public/private suffix itself (e.g. `com`, `co.uk`, `github.io`) are rejected using the public suffix list. Registered names under a private suffix are allowed, but the suffix itself is never a tenant root. DNS ownership uses exact joined TXT-record equality: `bicaptcha-verification=<siteKey>`, not substring matching. Ownership authorizes that exact domain and dot-delimited subdomains, never sibling/suffix lookalikes. Widget origins require HTTPS and default port; arbitrary nondefault ports are unsupported. Public suffix updates must remain maintained.

Auth input is bounded (email ≤254 chars, password 12..72 chars AND ≤72 UTF-8 bytes; new passwords use bcrypt cost 12). Existing accounts with short/oversized passwords need an operator-managed password reset before login; no unauthenticated reset/admin migration was invented. Login failure messages are generic; registration does not disclose whether the email exists. Sessions are strict, independently signed v2 JWTs expiring in one hour. Cookies are HttpOnly, SameSite=Lax, Path=/ and Secure in production; logout clears using the same scope. Logout clears the browser cookie; a previously stolen stateless session JWT remains usable until expiry/key rotation. Immediate per-session server revocation is not implemented and requires extending the shared-state/session contract before production if needed. All cookie mutations require exact configured Origin and reject cross-site fetch metadata. Origin-less machine calls to cookie endpoints are rejected.

Sites are owner-scoped. Responses use explicit public projections and site lists are paged (`page`, 50/page, max 1000 pages). Duplicate canonical domains are unique per owner; different owners must each establish DNS control. Existing domains must be audited/canonicalized before rollout, especially duplicates/case/IDN/trailing-dot entries and delegated multi-tenant subdomains. Do not mark old sites newly verified by migration.

## State / deployment release gate

`src/lib/security/state.ts` selects Redis only with an explicit Postgres URL and deployment namespace. Production also requires deployment mode, isolated-ingress contract, HTTPS dashboard origin and independent keys. Lua implements atomic challenge consumption and fixed-window counters; connection and operation deadlines fail with 503, with offline queuing disabled and no memory fallback. **Postgres, not Redis, is authoritative for production success-token consumption and Cloud usage.** A unique receipt and quota/cap increment share one transaction. Redis loss cannot restore an already consumed success token. Test prerequisites and remaining deployment gates are in `docs/SOL-IMPLEMENTATION.md`; the earlier `docs/PILOT-IMPLEMENTATION-STATUS.md` is historical.

Current application rate limits are global/site/account rather than trusted-IP: CAPTCHA global 300/min and site 100/min across challenge+verify, siteverify global 300/min + site 100/min, login 60/min global + 5/5min account, register 10/min global + 3/hour account, contact 30/min, plus owner mutation/DNS/analytics limits. These conservative local defaults are not calibrated production traffic limits. An attacker can exhaust public quotas; availability requires upstream abuse controls and deployment tuning. X-Forwarded-For/Forwarded/CDN headers are ignored; no fake IP is substituted or persisted. Before production choose a trusted edge/CDN, prevent origin bypass, specify client-IP header/chain semantics, add trusted-IP limits, TLS, request/header/body/time limits and upstream limits. Do not merely enable trust in arbitrary XFF.

Prisma selects a separately generated Postgres client for a Postgres URL; SQLite remains local development storage. Production migrations live only in `prisma/postgres/`. Compose exposes only the TLS ingress; application code never trusts forwarded IP headers because Next does not provide an authoritative peer identity here. The nginx edge applies its own peer-IP throttling, strips client forwarding headers and limits bodies/timeouts. Do not expose the app/DB/Redis ports. Configure backups and resource limits; avoid logging bodies, credentials, tokens and IPs.

## Metrics / privacy / retention

Logging defaults **off** (`BICAPTCHA_LOGGING=disabled`). Opt-in requires an explicitly selected `BICAPTCHA_LOG_RETENTION_DAYS` (1..3650 guardrail, no policy default) and a scheduled retention job. New validation rows store no IP/country fingerprint, UA, raw telemetry, token or secret. They label acceptance as `Verified`, never prove `Human` or block solely on risk. Existing historical Bot/TrustPass rows are shown as legacy labels. Server verification latency is measured; no mock 84 ms value remains. Optional logging currently performs one awaited DB insert: no unreliable serverless fire-and-forget and no unbounded in-process queue. A durable async pipeline is deferred until storage/deployment semantics are known; logging failure does not bypass enforcement.

Analytics are owner-scoped, SQL-aggregated into at most 30 daily rows plus 10 paged recent events (`days=1..30`, `page=1..1000`). No whole-month event load into JS memory and no historical IP output. A `(siteId, createdAt)` index supports the queries. Metrics are observational (not guaranteed audit logs or proof of humanity); latency is null if no measured records exist.

After approving a privacy policy, inspect `npm run prune:logs` (dry-run count only), then schedule `npm run prune:logs -- --execute` against the intended DB. Execution deletes in bounded batches (up to 100,000 events/run); repeat as needed. It is never run automatically by app startup/build/migration. Review old logs/credentials separately; **no existing user data was purged during implementation**.

## Database migration, rotation and rollback

1. Back up the intended DB, inventory integrations/customers and test the backup in isolation. Set explicit `DATABASE_URL`. Audit duplicate `(userId, domain)` values and canonicalization collisions before adding the unique index; resolve with an owner-approved migration, not automatic deletion. Plan maintenance for SQLite locks. `prisma/migrations/202611150000_baseline` represents the **old** schema; the following migration adds hash/latency columns and indexes, preserving existing data.
2. For an existing database created without migration history, first validate that it matches the old schema, then run `npx prisma migrate resolve --applied 202611150000_baseline`. This records migration history; it is an operator-authorized DB write. Then `npx prisma migrate deploy`. For an empty DB use `npx prisma migrate deploy` directly. Run `npx prisma generate`. Never run `db push --accept-data-loss` or `migrate reset` on existing data.
3. Provision fresh independent signing keys; old default-key sessions/challenges/tokens must be rejected. V2 issuer/audience/claims and server-side challenge state also reject legacy tokens. Rotate each site's backend credential (old `secretKey` stays unused until owner rotation clears it); do not expose/reuse old credentials. Keep private keys server-side. Coordinate global key rotation with short token TTL, login invalidation and all serving instances; no mixed-key/mixed-protocol rollout.
4. Follow the separate Postgres baseline/Compose and optional v2 extension procedures in `docs/SELFHOST-CLOUD-TRUST-V2.md`. Complete independent review, real HTTPS/browser CORS/WebAuthn/MV3 and calibrated load tests. Deploy backend and matching local SDK coherently; purge/version cached SDK. Never bypass a 503 configuration/state failure.
5. Rollback must preserve security: disable issuance/consumption or return maintenance 503. Do not restore legacy bypass code/default secrets/Trust Pass, reverse columns destructively, accept old tokens, or roll back to vulnerable Next 16.3.3. Keep backups and additive schema; coordinate consumers and key rotation. Resume only with reviewed compatible v2 code/state.

`docs/IMPLEMENTATION.md` and `docs/PILOT-IMPLEMENTATION-STATUS.md` are historical records. See `docs/SOL-IMPLEMENTATION.md` for the current execution's checks and gates.
