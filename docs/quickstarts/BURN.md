# Burn: one ticket, one redemption

Start the API using [the T1 instructions](../TRANCHE_1.md), then run from repo root:

```sh
node tests/e2e/cloud-t1/walkthrough.mjs burn
```

Set `SOROTICKET_API=https://your-preview-host` for a remote API. For a fresh
deployment, also set `SOROTICKET_CONTRACT_ID` to the same contract configured in
Cloud. All funding is provided by Stellar testnet Friendbot.

The runner creates two separate organizations, funds their testnet accounts and
creates a ticket campaign with supply two. It issues two unique codes, redeems
one with synthetic private references and reads the result directly from Soroban.
The other organization must receive 404 for this campaign. Replaying the same
idempotency key must return the same transaction. A second redemption under a
new key must return 409/code 3; issuance beyond supply must return 409/code 5.
Expiry and other contract permissions are covered by the 53-scenario SDK suites.

`artifacts/t1/manifest-*.json` lists the chain campaign ID, public code, full
transaction hash, passed assertions and privacy counts. Inspect the referenced
transaction in Stellar Expert or use the saved XDR. Never include customer
identities in campaign names/codes; these are public on-chain strings.

For a manual API walkthrough, import [the collection](../api/tranche-1.postman_collection.json)
and run from `Ready` through `Campaign activity`. Use a 1500 ms request delay and
a 100000 ms request timeout. Variables and test credentials are generated locally.
Keep its session cookie for onboarding; subsequent operations use the generated
Bearer key and `X-Env: test`. Each logical POST has its own idempotency key.

For console acceptance: create an account/organization, create an Event tickets
campaign, issue two codes, redeem one in Redemptions and inspect campaign Activity.
Record the transaction link and confirm the code's burned state. Test only with
synthetic values. The console and API share one origin in the container.
