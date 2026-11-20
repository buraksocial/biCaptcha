# Security/performance implementation verification — 2026-11-15

## Approved implementation decisions

Central backend-only siteverify with per-site hashed credentials; third-party SDK with absolute HTTPS API origin and exact-origin CORS; strict DNS/IDN/public-suffix policy with verified root + subdomain support and no localhost exception; no trusted proxy IP assumptions; shared TTL/atomic-consume interface with local test/development adapter only and production fail closed. Trust Pass is retired pending redesign. Next.js + eslint-config-next upgrade to 16.4.6 was separately approved after audit findings.

The saved project plan's five coarse checkboxes track this implementation. This report and README record the more detailed decisions; the existing saved plan was not replaced or stripped of its constraints.

## Initial state and independently verified review claims

- No `.git` directory in the checkout; no git status, branch, PR, uncommitted-work or worktree assumptions/actions were made. No production deployment/customer use was established.
- Installed Next 16.3.3, Node 26.4.0, npm 11.16.0. Relevant Next route-handler/data-security/auth guides were read before implementation; updated 16.4.6 route-handler/cookie references were read after upgrade.
- No project `.env` or relevant auth/CAPTCHA/Redis runtime configuration was found. Only configuration **presence**, not secret values, was reported.
- Original SQLite database read-only inventory: one user, one verified site, zero validation rows. Only `api/contact` consumed `verifyCaptcha` in application source. External backends/customer deployments remained unknown.
- `npm run build` and `tsc --noEmit --incremental false` independently reproduced TS2552 for the out-of-scope `encoder` references in old `verify/route.ts` lines 354/359.
- Before replacing that route, its unmodified source was transpiled/executed in an isolated in-memory harness with a mocked Prisma repository: Node-generated, public-derived AES/HMAC telemetry and PoW received 403 (`Integrity verification error`). Correcting **only encoder references in the memory copy**, not the file, issued a token (200), including with challenge site different from request site. No browser telemetry or real DB writes/network exploit were involved. This confirms the reported core forged-flow risk in isolation, not a live-production exploit or an assertion that all bots can now be blocked.
- Static inspection independently confirmed that the old challenge JWT lacked `vm`, while verify conditionally expected it. New protocol removes that misleading/dead machinery entirely rather than fixing it as an authentication boundary.

## Implemented boundaries

| Area | Result |
| --- | --- |
| Challenge / success token | Verified site, action, exact host, strict v2 issuer/audience/type/HS256/claims and 120-second lifetime; server random ID and atomic TTL state |
| Replay | Atomic challenge consume and atomic JTI consume; site/action/host mismatch and invalid proof do not consume legitimate state; no nonce-only global Set/blanket clearing |
| Telemetry / SDK | Bounded optional advisory JSON; no fingerprint canvas/WebGL collection, VM, AES/HMAC security claims or extension oracle; explicit action and absolute HTTPS API base; bounded PoW loop/cancellation/listener cleanup |
| Token consumers | Backend-only credential-authenticated siteverify; no signing secret distributed to tenants; same-deployment helper requires expected site/action/host |
| Trust Pass | Enrollment 410; server bypass branch removed; generated SDK and extension enrollment/signing/injection paths disabled; host permissions removed |
| Auth / sites | Strong mandatory independent configuration; bounded inputs, bcrypt byte bound/cost, account/global throttles, strict sessions, exact-Origin CSRF, consistent cookie path/flags; owner-scoped public projections, one-time hashed credential + rotation, canonical DNS and exact TXT |
| Performance / privacy | Prisma singleton; owner/date-bounded SQL aggregation and paged events; indexes; measured nullable latency; no new IP/raw telemetry logging; metrics opt-in with explicit retention and bounded administrative pruning |
| Build / migration | Deterministic SDK generation wired into build + drift check; additive reviewed SQL migrations; explicit DB URL and migration/key/consumer/extension/rollback notes |

## Checks actually run

- **23 tests** using Node test runner + tsx. Includes local races (20 parallel service calls and 10 parallel endpoint calls), expiry/mismatch/forgery/default-key rejection, production-state and missing-config rejection, body/schema limits, Trust Pass 410, auth throttling/CSRF/cookie scope, site ownership/credential rotation/secret projection, DNS substring rejection, exact CORS/port policy, SDK action/absolute base/credentials omission/listener cleanup, memory-capacity failure without replay-state reset, explicit retention policy, 10,000-event analytics fixture and index plan assertion.
- **`npm run lint`, `npm run typecheck`, `npm run build`, `npm run check:client`** passed. Build uses Next **16.4.6** and regenerates the SDK.
- **Prisma**: `generate` passed; migrations deployed/status checked on a new temporary database. The existing-schema baselining workflow (`migrate resolve` for baseline, then `migrate deploy`) and `prisma validate` also passed on a separate temporary old-schema fixture. The actual existing `prisma/dev.db` was not migrated; its old schema and original row counts were rechecked.
- **Dependency audit** after approved framework update, removal of unused obsolete signing/obfuscation/Upstash dependencies and compatible transitive security fixes: `npm audit --omit=dev` reports **zero vulnerabilities**. Full audit still reports **7 moderate development-tooling findings**, all in the typescript-eslint → minimatch chain; zero high/critical findings. No forced incompatible transitive-major override was introduced.
- **Local production-build HTTP smoke**, not deployed production: started this checkout's built Next server at `127.0.0.1:4178` without sensitive config. Challenge, verify, siteverify, login, registration and contact returned 503 with no permissive CORS; register-pass returned 410; generated SDK returned 200 with no retired Trust Pass path.
- **Browser smoke** of that local built app: unconfigured demo visibly disabled, submit disabled, no CAPTCHA issued or false success; no page-console errors were reported by the snapshot. This is not a real customer HTTPS cross-origin browser acceptance test.

## Explicitly not verified / release gates

1. **Production is intentionally not enabled.** No distributed state backend, multi-instance race/outage/restart test, trusted proxy/client-IP contract, production DB topology or calibrated rate limits exists. Add a reviewed adapter and trusted edge before deploying; do not bypass the fail-closed guard. Local memory race tests are not distributed-store evidence.
2. Customer HTTPS/browser CORS, actual DNS ownership changes, independent consumer deployments and authorized staging/production load tests were not performed. Tests used synthetic HTTP Origin headers and isolated fixtures, not a live tenant/production exploit. No deployment secrets were provisioned or rotated.
3. Existing data needs operator backup/baselining, canonical-domain/email collision review, credential rotation and coordinated old SDK/token/session invalidation. No existing account/site/log was deleted or migrated. Short legacy passwords need an operator-managed reset. Stateless session JWTs are not individually revocable at logout; theft recovery currently requires expiry/key rotation. If immediate revocation is required, extend the state/session contract before release.
4. Privacy/retention duration remains an operator decision. New metrics are disabled by default. Pruning is manual dry-run unless explicitly executed; scheduling/deployment retention guarantees and historical-data cleanup are not established. Optional logging is still one awaited insert; a durable asynchronous pipeline is deferred, not falsely claimed as implemented.
5. Full dependency audit has 7 moderate dev-only findings. Resolve with compatible upstream tooling or a separately reviewed upgrade, keep PSL/framework dependencies maintained and repeat audits before release. CAPTCHA is still an abuse-mitigation component, not an unforgeable humanity proof.
