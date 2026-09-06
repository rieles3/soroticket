# Tranche 1 candidate — 0.2.1-rc.1

This candidate closes the integration and reproducibility work around the frozen
v0.2.0 testnet contract. It covers a single-use Burn ticket and a count-only Tally
campaign. It does not change the contract ABI or the production release gates.

The public landing is already at **https://soroticket.com**, deployed automatically
by Cloudflare Pages from `main`. The backend and merchant console are a separate
service. A server has not been provisioned; the operator chose to create it after
implementation and local validation. See [the deployment runbook](../cloud/deploy/README.md).

## Start from a clean checkout

Install Node **22.15+**, Go **1.25.12**, Rust through rustup and Docker with Compose
v2. The contract pins Rust 1.94.1 in `rust-toolchain.toml`. Stellar CLI 25.2.0 is
needed only when reproducing deployment. Run all commands below at repository root.

```sh
npm run bootstrap
npm run check
npm run package:sdk
docker build -f cloud/Dockerfile -t soroticket-cloud:t1 .
node scripts/check-container.mjs soroticket-cloud:t1
docker compose -p soroticket -f cloud/deploy/compose.yaml up -d --build api
```

Open `http://localhost:8787` for the console. `/readyz` checks the database and
reports the pinned network/contract; it does not claim RPC availability. API
requests use either the same-origin `/api` prefix or the documented direct paths.

## Acceptance paths

- [Burn walkthrough](quickstarts/BURN.md): create, issue, redeem, replay the same
  idempotency key, reject reuse/supply overflow and verify chain state.
- [Tally walkthrough](quickstarts/TALLY.md): sign three receipts, reject duplicate
  references, commit the Merkle root and verify every signature and proof against
  an independently fetched Soroban root.
- [OpenAPI](api/openapi.json): the 21 baseline paths, auth, errors, units,
  idempotency and pagination. Additional experimental Cloud routes are outside
  this baseline; `docs/CLOUD.md` describes them.
- [Postman collection](api/tranche-1.postman_collection.json): synthetic fixtures,
  automatic signup/funding, both paths and key revocation.

```sh
npm run e2e:api
npm run e2e:cloud
```

The Cloud runner saves `artifacts/t1/manifest-*.json`, signed receipt exports,
transaction XDR and current storage XDR. It records the source commit and whether
tracked sources were dirty. Build/test logs from development are not evidence
for an unmodified release commit. The deployment record remains separate from
the SDK version because this release does not change contract bytecode.

## Reproduce the contract deployment

```sh
node scripts/deploy-testnet.mjs
```

This builds the contract, checks the frozen SHA-256, creates/funds an ephemeral
testnet identity, deploys a new instance and downloads its WASM for comparison.
It writes only public deployment evidence under `artifacts/deployment/`; the
signing configuration remains in an OS temporary directory. The existing default
deployment is not replaced. The script never uses mainnet or funds with value.

To run the walkthrough against that new deployment, use a **fresh** Cloud data
directory/Compose project and set `SOROTICKET_CONTRACT_ID` to the resulting ID in
both Cloud and the runner. Keep the same contract for the lifetime of that data
directory. Run `npm run e2e:cloud` and the verifier with that environment variable.

## What changed and why

Two original TypeScript setup transactions failed because another writer advanced
the contract's global campaign counter after simulation. Soroban returned a
confirmed failed storage footprint; Stellar SDK result decoding then raised an
unhelpful `undefined.switch` error. Two later test failures were cascades.

`submitTransaction` and the Go client now rebuild only after that specific
confirmed atomic rollback. Timeouts, unknown outcomes and application errors do
not authorize a new transaction. Preserve the hash and reconcile ambiguous
outcomes. The deterministic concurrency test deliberately simulates two creates
before submitting either and proves a single resulting campaign for the retried
writer. The TS runner stops at the first failed scenario.

Activity is filtered by campaign before limiting results, with tenant/environment
isolation and cursor pagination. The console exposes loading failures and retry.
Receipt exports include the original signed bytes, avoiding JSON reserialization
ambiguity in external verification. Go's module path now matches the public
monorepo, and TS ships a versioned package with the verifier CLI.

## Quality gates

`npm run check` runs 34 contract tests, Go race tests/vet for all four modules,
TypeScript submission/verifier regressions, frontend builds, landing build and
OpenAPI validation against registered routes. Packaging is separately tested by
installing the tarball into an empty consumer directory.

The PR workflow runs these checks, builds/scans the container and exercises a
backup restored into a fresh volume. The manually triggered testnet workflow
runs the 53-scenario Go and TS suites, deterministic concurrency and the Cloud
acceptance paths. Live tests are serialized within that workflow and fail on
network errors; a compile or skipped network request is never a passing live test.

Privacy acceptance injects synthetic email, phone and order references, then
checks arguments, events/storage changes and current contract entries for those
plaintext bytes. Names and code strings are **public** and must never contain
personal data. The check demonstrates the supported reference path with this
dataset; it cannot stop an integrator from voluntarily writing PII into a public
string. A receipt proves its signer's attestation and inclusion, not physical
delivery or an authentic sale.

## Final operator/reviewer gates

The code and local acceptance evidence are a release candidate. The following
remain explicit before declaring the SCF tranche accepted:

- Provision the backend host and DNS/TLS, then repeat acceptance on that endpoint.
- A second person follows only these instructions and records observed blockers.
- Confirm the acceptance checklist against the submitted SCF form and attach the
  release/evidence to the application. A technical pass is not SCF approval.

The production blockers in [ROADMAP](ROADMAP.md) still apply: single instance
SQLite, local KEK custody, no durable chain/DB reconciliation, no production auth
recovery, no mainnet/billing, and no independent security audit.
