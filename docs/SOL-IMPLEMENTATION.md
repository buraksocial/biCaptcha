# biCaptcha 0.2.0 executor implementation evidence

**Status: implementation and disposable local integration checks completed; not a production release.** This report replaces neither the historical `docs/PILOT-IMPLEMENTATION-STATUS.md` nor the required production/operator release gates. SQLite user data was not opened, changed or migrated. No live deployment or payment was performed.

## Follow-up: fixed Compose updater implementation

The helper uses fixed argv (`shell:false`), loads only the staged archive, verifies the exact local image ref/version/platform, and runs app Compose updates with `--no-build --pull never`; the app service also has `pull_policy: never`. It validates exact backup-receipt fields, age and actual protected file digest, polls health with a bounded deadline, and restores ingress only after a healthy prior app. Updater sequence state and the operator-owned `.env.updater` image selection use synced atomic replacement. Fixture tests cover normal apply, first-run env bootstrap, missing/mismatched prior image, readiness failure, rollback, commit-callback failure, and unsafe env/receipt cases. A throwaway Docker Compose deployment verified apply, persistence across an independent Compose config invocation, and rollback from an unhealthy candidate to the healthy prior app; it did not test the production project, a real signed release archive/root, or inability-to-recover/rollback failure. No automatic DB migration occurs; compatible schema is required. Release root/registry and production backup receipt remain operator gates.

## Implemented

- Separate Postgres Prisma client/schema and additive baseline under `prisma/postgres/`; existing SQLite provider/migrations remain untouched. Production runtime selects PostgreSQL only for a PostgreSQL URL. Redis Lua operations are deployment-namespaced, no-offline-queue and bounded; Postgres receipts are the authoritative siteverify replay/billing record. Production configuration fails closed without authenticated stores, HTTPS app origin, distinct keys, deployment ID, mode and documented isolated ingress topology.
- Compose/Docker/nginx production scaffold, health/readiness routes and operator SQLite export/import procedure. Only TLS ingress publishes a port; app/database/Redis are not externally published. App deliberately does not treat forwarded IP headers or an env flag as authenticated client-IP identity.
- Cloud organization/membership/site ownership, server-allowlisted administrators, timed pilot request/approval/revoke, audit events, UTC periods, atomic receipt/metering/cap enforcement and integer-microUSD estimate. Overage requires owner consent and positive cap. No payment processor or successful charge is represented.
- Separate updater CLI with off-by-default `off`, `notify`, `download-approve` and `auto-security` modes, signed expiring stable manifest verification, exact HTTPS origin/DNS checks, bounded manifest/artifact downloads, digest/size validation, schema/version/pin/maintenance checks, protected atomic sequence state, and artifact staging/application through the fixed Compose helper. No release root or artifact registry is supplied.
- Trust Pass v2 uses SimpleWebAuthn UV verification, password-confirmed new passkey enrollment, account/site/deployment/scope challenge binding, ECDSA device possession proof, one-use nonce, durable 15-minute/20-use/per-site limits, revocation, audit and normal backend verification/metering. Legacy `/api/bi-captcha/register-pass` remains 410. Separate MV3 extension has optional host access, sender/frame/origin checks, no arbitrary signing API and SDK opt-in/fallback.
- Dashboard pilot and Trust controls, operational/product docs and isolated negative/integration fixtures.

## Verification performed in this continuation

Exact test command: `npm test` (its pretest hook ran both Prisma generators) with disposable PostgreSQL 16 and Redis 7 containers and temporary loopback-only ports: **39 passed, 0 failed, 0 skipped**. The real Postgres integration test ran. No customer data migration/deploy evidence is implied. SQLite `prisma/dev.db` was not intentionally accessed or changed.

Environment probe: Docker 29.6.1 / Compose 5.1.4; Docker daemon available. A throwaway project and local node:22-alpine-derived images were loaded and exercised through the updater helper. The healthy candidate was applied; a deliberately unhealthy candidate failed readiness and rolled back to the prior healthy app, restoring ingress. A separate Compose config invocation resolved the persisted image tag. All fixture containers, images, archives and files were removed. This verifies disposable local paths only, not the production topology or inability-to-recover rollback behavior.

Passed in this continuation: `npm test`; `npm run lint`; `npm run typecheck` (including `next typegen` on a clean checkout); `npm run check:client`; `npm run build`; throwaway Docker Compose apply, persistence and unhealthy-candidate rollback; and root `docker compose config --quiet` with temporary fixture secrets. The temporary `.env.production` was removed afterwards.

These results supersede any stronger previous-run claims in this file for this continuation. No real browser WebAuthn, TLS/domain deployment, backup restore drill, release signing root, payment or live deployment is established.

## Open release/operator gates

1. No real TLS/domain/firewall/secret-manager deployment, restore drill, load calibration, operator network review or live migration/cutover. Compose fixtures do not prove the operator's ingress or data transition.
2. **Updater remains release-gated.** No real signed release/root, provisioned production config/receipt, production Compose deployment, or real release artifact is available. If rollback itself fails, the helper keeps ingress stopped; that inability-to-recover case has fixture-level guard coverage but no disposable Docker fault-injection run.
3. No physical authenticator or real browser extension install/permission/WebAuthn ceremony test; no external customer HTTPS CORS test. Generated crypto protocol fixtures and VM message tests are not browser E2E.
4. No payments/tax/invoices/crypto, live release publishing or Cloud administrator provisioning. `BICAPTCHA_ADMIN_IDS` must be deliberately provisioned by the operator. The product remains a pilot and does not imply paid entitlement.
5. `npm ci` reported 7 moderate dependency audit findings; review before deployment.

Plan progress: no approved plan/brief file was present in this checkout, so no plan checkbox was changed. Production/release gates remain open.
# Rollback safety note

The helper writes the selected `BICAPTCHA_APP_IMAGE` to `.env.updater` using a synced temporary file and atomic rename, then commits the updater sequence/current version **before** restoring ingress. If the state commit fails, rollback restores the prior env tag while ingress remains stopped. A failed apply still reserves its signed sequence; do not rewind it or retry the same manifest. Keep the service in maintenance and have an operator verify the running image/state, then publish/use a higher-sequence release after review. Ingress is restarted only after the prior tagged image identity/platform and app health are verified. If starting ingress itself fails after a healthy new app and state commit, the new version remains selected and ingress stays stopped for operator recovery.
