# Tally: signed receipts and independent verification

Start the API using [the T1 instructions](../TRANCHE_1.md), then run from repo root:

```sh
node tests/e2e/cloud-t1/walkthrough.mjs tally
node sdk/ts/bin/verify.mjs artifacts/t1/tally-RUN_ID.json
```

Replace `RUN_ID` with the file printed by the runner. For an installed SDK, the
same command is `npx soroticket-verify tally-RUN_ID.json`. The CLI reads Soroban
RPC directly; it does not trust Cloud's `verified` field or SQLite root. Set
`SOROTICKET_CONTRACT_ID` in both commands when using a new deployment. Other
networks and mismatched deployments are rejected by this preview CLI.

The runner creates a count-only gift campaign and one shared code, records three
individually signed receipts and rejects a duplicate order reference. It commits
the exact count and Merkle root, downloads paginated public audit proofs, reads
`get_tally` from RPC, verifies Ed25519 signatures over the original payload bytes,
checks every inclusion proof and rebuilds the complete ordered Merkle tree. Odd
leaves are promoted unchanged. Tampering, omissions, duplicate leaves, reordered
leaves, wrong roots and wrong identities are covered by verifier regressions.

The exported `payload_base64` is authoritative for signature verification;
the parsed `payload` is only a convenience view. `signer` identifies the key that
attested to the event; its business trustworthiness is an integration decision.
The immutable on-chain root pins the included data. A proof does not establish
that a physical delivery or sale actually occurred.

Public audit URL shape:

```text
/v1/audit/tallies/{chain_campaign_id}/{code}/{period}?contract={contract_id}&limit=100
```

Follow `next_cursor` until null for complete-set verification. The path uses the
**chain** campaign ID; authenticated campaign/event paths use Cloud's local ID.
The collection demonstrates these distinct IDs and the full REST sequence.
Periods are returned by Cloud (ISO year/week); use the returned value.

Synthetic customer/order references are committed before leaving Cloud. The
acceptance runner checks all successful transaction arguments, events/storage
changes and the current Campaign/Shared/Tally/instance entries for plaintext
canaries. Exported evidence contains no signing seed or API key. Do not export
the Cloud database or KEK as review evidence.
