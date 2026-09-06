import { Buffer } from "buffer";
import { Keypair } from "@stellar/stellar-sdk";

export interface ReceiptProof {
  payload_base64: string;
  payload?: unknown;
  leaf_hash: string;
  signature: string;
  signer: string;
  proof: { position: "left" | "right"; hash: string }[];
}

export interface TallyIdentity {
  network: string;
  contract_id: string;
  campaign_id: number;
  code: string;
  count: number;
  merkle_root: string;
}

function hashBytes(hex: string): Buffer {
  if (!/^[a-f0-9]{64}$/.test(hex)) throw new Error("Invalid SHA-256 hash");
  return Buffer.from(hex, "hex");
}
async function sha256(bytes: Uint8Array): Promise<Buffer> {
  return Buffer.from(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)));
}

/** Verifies original signed bytes, signer identity and inclusion against a caller-supplied on-chain root. */
export async function verifyReceipt(receipt: ReceiptProof, expected: TallyIdentity) {
  hashBytes(expected.merkle_root);
  if (!receipt.payload_base64 || receipt.payload_base64.length > 16384) throw new Error("Original signed payload bytes are required");
  const bytes = Buffer.from(receipt.payload_base64, "base64");
  if (bytes.toString("base64") !== receipt.payload_base64) throw new Error("Invalid base64 payload");
  const payload = JSON.parse(bytes.toString("utf8"));
  if (payload.version !== 2 || payload.network !== expected.network || payload.contract_id !== expected.contract_id ||
    payload.campaign_id !== expected.campaign_id || payload.code !== expected.code || payload.signer !== receipt.signer ||
    !Number.isSafeInteger(payload.count) || payload.count <= 0) throw new Error("Receipt identity/count mismatch");
  const signature = Buffer.from(receipt.signature, "base64");
  if (signature.length !== 64 || !Keypair.fromPublicKey(receipt.signer).verify(bytes, signature)) throw new Error("Invalid receipt signature");
  let hash = await sha256(bytes);
  if (!hash.equals(hashBytes(receipt.leaf_hash))) throw new Error("Receipt leaf mismatch");
  if (!Array.isArray(receipt.proof) || receipt.proof.length > 32) throw new Error("Invalid inclusion proof");
  for (const step of receipt.proof) {
    const sibling = hashBytes(step.hash);
    if (step.position !== "left" && step.position !== "right") throw new Error("Invalid proof position");
    hash = await sha256(Buffer.concat(step.position === "left" ? [sibling, hash] : [hash, sibling]));
  }
  if (hash.toString("hex") !== expected.merkle_root) throw new Error("Proof does not match on-chain root");
  return payload;
}

/** Complete-set verification also rejects omitted, duplicated or reordered leaves. Odd leaves promote unchanged. */
export async function verifyTally(receipts: ReceiptProof[], expected: TallyIdentity) {
  if (!receipts.length || receipts.length > 10000 || !Number.isSafeInteger(expected.count) || expected.count <= 0) throw new Error("Invalid tally size/count");
  let count = 0;
  const seen = new Set<string>();
  let level: Buffer[] = [];
  for (const receipt of receipts) {
    if (seen.has(receipt.leaf_hash)) throw new Error("Duplicate receipt");
    seen.add(receipt.leaf_hash);
    count += (await verifyReceipt(receipt, expected)).count;
    if (!Number.isSafeInteger(count)) throw new Error("Unsafe tally count");
    level.push(hashBytes(receipt.leaf_hash));
  }
  if (count !== expected.count) throw new Error("Receipt count does not match on-chain count");
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? await sha256(Buffer.concat([level[i], level[i+1]])) : level[i]);
    level = next;
  }
  if (level[0].toString("hex") !== expected.merkle_root) throw new Error("Receipt set does not reconstruct on-chain root");
  return { valid: true, receipt_count: receipts.length, count, merkle_root: expected.merkle_root };
}
