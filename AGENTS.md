# Moli — working instructions

## Objective

Maintain one functional Moli platform for passengers, drivers, professionals and operators. Preserve compatibility with the Google Play application before any production release.

## Source of truth

- GitHub repository: `figueroacarlos1725-tech/MOLI-V3-ESTABLE`
- Read `docs/MEMORIA-MOLI.md` before making changes.
- Update the memory and `docs/CHANGELOG-OPERATIVO.md` whenever architecture, infrastructure, roles, credentials procedure, Play signing, deployment or a validated flow changes.
- Never commit passwords, private keys, service-account JSON, keystores, signing secrets, access tokens or production `.env` files.

## Environments

- Treat existing `moli-*` containers in `/root/moli-bot` as an unrelated legacy WhatsApp bot until proven otherwise.
- Moli application QA lives under `/srv/apps/moli-qa` with its own Compose project, database and volume.
- Comprax lives under `/srv/apps/comprix`; do not edit, restart or reuse its database for Moli work.
- Test destructive workflows only in QA. Production changes require an explicit release decision and a rollback path.

## Required validation

For backend changes, run Python compilation/tests and exercise the relevant API flow. For frontend changes, run TypeScript/lint/build checks as available and validate the affected role on a real device or browser. A release candidate must cover:

1. admin/operator and manual dispatch;
2. passenger ride lifecycle;
3. driver availability, offers and ride lifecycle;
4. client professional/tramite request lifecycle;
5. professional accept/start/complete lifecycle;
6. combined driver-professional navigation in one session;
7. cancellations, ratings, permissions and negative cases.
8. commerce approval, catalog, cart, pickup and delivery order lifecycles;
9. cash, transfer and Mercado Pago payment states plus commission idempotency;
10. advertising targeting, countdown/close behavior, frequency limits and safe internal destinations.

## Git workflow

- Work on a focused branch and keep commits small and descriptive.
- Push validated checkpoints so work can resume from GitHub.
- Do not force-push shared branches or overwrite unrelated user changes.
- Update the operational changelog in the same checkpoint commit.

## Google Play continuity

- The Play listing currently uses package `com.digigo.app`.
- Do not upload an artifact until package/application ID, versionCode continuity and signing/upload key are verified against Play Console.
- Prefer AAB for Play releases; APKs are QA artifacts unless Play specifically requires otherwise.
