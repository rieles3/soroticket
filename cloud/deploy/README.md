# Testnet backend deployment

The landing at soroticket.com already deploys from `main` through Cloudflare
Pages. This container hosts the Go API and React console together on a separate
origin, for example `testnet.soroticket.com`. That hostname is a proposed backend
address, not an existing deployment. Provisioning is intentionally deferred until
the operator chooses a server.

Use one Linux VM with Docker/Compose v2, initially 2 vCPU, 2 GB RAM and a persistent
disk. API runtime is capped at 512 MB/1 CPU in Compose. Allow inbound TCP 80/443
and your restricted administrative SSH access; port 8787 binds only to localhost.
Use a DNS-only A/AAAA record pointing the backend hostname to the VM for Caddy's
certificate issuance. Caddy provides HTTPS and renews certificates. No DNS or
Cloudflare Pages configuration needs to change for the landing.

## Build and start

Check out the reviewed commit on the VM. All commands below run at repo root:

```sh
export SOROTICKET_HOST=testnet.soroticket.com
export SOROTICKET_IMAGE=soroticket-cloud:REVIEWED_COMMIT
docker build --pull -f cloud/Dockerfile -t "$SOROTICKET_IMAGE" .
node scripts/check-container.mjs "$SOROTICKET_IMAGE"
docker compose -p soroticket -f cloud/deploy/compose.yaml up -d --no-build
curl --fail https://testnet.soroticket.com/readyz
```

Node is needed only for the local acceptance script, not at runtime. Build with
the image tag matching the commit; record the image ID using `docker image inspect`.
Use `SOROTICKET_CONTRACT_ID` only for a separately reproduced v0.2.0 testnet instance
with its own new database. Both TEST and METERED remain testnet. Never scale this
service beyond one instance: sequence locks, rate limits and SQLite are local.

The image runs as UID/GID 65532, with a read-only root filesystem, dropped
capabilities, temporary `/tmp` and persistent `/data`. The named volume
`soroticket_api_data` contains SQLite, the KEK and the encrypted reference key.
Losing the KEK makes custodial keys unusable; replacing it must fail closed.
Keep `/data` private. The Caddy data/config volumes retain certificate state.

After HTTPS is ready, run the acceptance collection and Cloud walkthrough with
`SOROTICKET_API=https://testnet.soroticket.com`. Confirm secure cookies, signup,
funding, Burn, Tally and Activity through the public endpoint. `/readyz` validates
local readiness; use the live walkthrough to test RPC reachability and writes.

## Backup and restore

This single-instance preview uses a short maintenance window for consistent
backups. Preserve the whole data directory, including SQLite sidecars and keys.

```sh
bash cloud/deploy/backup.sh /secure/backups/soroticket-YYYYMMDD.tar.gz
```

The script stops the API, archives the volume with mode 0600 and restarts it even
if the archive command fails. Transfer the backup to encrypted off-host storage
with access restricted to operators. Do not attach it to CI, GitHub or SCF evidence.
Back up Caddy's certificate volume separately if preserving its state is needed.

Restore into a **new** volume first, preserving the original:

```sh
docker volume create soroticket_recovery_data
docker run --rm -i --mount source=soroticket_recovery_data,target=/data \
  --entrypoint sh "$SOROTICKET_IMAGE" -c 'cd /data && tar -xzf -' < /secure/backups/soroticket-YYYYMMDD.tar.gz
docker run -d --name soroticket-recovery --mount source=soroticket_recovery_data,target=/data \
  -p 127.0.0.1:8788:8787 "$SOROTICKET_IMAGE"
curl --fail http://127.0.0.1:8788/readyz
```

Verify existing-user login and key continuity before promoting the recovery
volume. Only one instance may perform chain writes for the same organization;
stop the primary during that check. Configure Compose to use the reviewed recovery
volume only after validation. Do not run `docker compose down -v` on real data.
`scripts/check-container.mjs` automatically exercises archive/restore into a fresh
volume, key-file hashes and login with synthetic data; it removes only its own
temporary containers/volumes.

## Updating, rollback and operational checks

Build and test the next image before stopping the current service. Take a backup,
record the current image ID, set the new immutable tag and run Compose `up -d`.
The API drains HTTP requests for up to 95 seconds; Compose grants 100 seconds.
Keep both image tags until acceptance passes. For this additive T1 schema change,
rollback by restoring the prior `SOROTICKET_IMAGE` and running `up -d --no-build api`.
Do not assume later schema migrations are backward compatible: review each release
and restore its matching backup if necessary. Reconcile transactions confirmed
after a backup before replaying any operations.

Monitor `/readyz`, container health/restarts, free disk and backup age; inspect
`docker compose -p soroticket -f cloud/deploy/compose.yaml logs --since 15m api` on
failures. If chain submission is ambiguous, preserve the transaction hash and
reconcile it before issuing a new business operation. The durable outbox/reconciler,
KMS/HSM, production auth recovery and multi-instance operation remain later work.

GitHub Actions verifies the image and recovery flow on PRs. Backend deployment
is operator-triggered until a host is selected; no fictional SSH secrets or
unconfigured automatic deployment are claimed. Pages continues its existing
automatic deployment independently.
