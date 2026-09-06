import { scValToNative } from "@stellar/stellar-sdk";
import type { AssembledTransaction } from "@stellar/stellar-sdk/contract";

export class SubmissionError extends Error {
  constructor(message: string, public readonly hash?: string, public readonly status?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SubmissionError";
  }
}

/** Retry only a confirmed, atomic rollback caused by a stale storage footprint. */
export function isFootprintConflict(response: any): boolean {
  if (response?.status !== "FAILED") return false;
  return (response.diagnosticEventsXdr ?? []).some((event: any) => {
    try {
      const body = event.event().body().value();
      const topics = body.topics().map(scValToNative);
      const data = scValToNative(body.data());
      return topics[0] === "error" && Array.isArray(data) &&
        data[0] === "trying to access contract data key outside of the footprint";
    } catch { return false; }
  });
}

/**
 * Submit a typed write and read only its confirmed on-chain result.
 * Concurrent campaign/code issuance can invalidate simulated storage keys.
 * A FAILED footprint conflict is safe to rebuild because Soroban rolled back
 * the invocation. Pending, network errors and unknown outcomes are never
 * rebuilt: callers must reconcile the returned hash before an application retry.
 */
export async function submitTransaction<T>(
  build: () => Promise<AssembledTransaction<T>>,
  options: { maxAttempts?: number; onTransaction?: (event: { hash: string; status: string; attempt: number }) => void } = {},
) {
  const maxAttempts = options.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) throw new RangeError("maxAttempts must be 1..5");
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const tx = await build();
    const simulation = tx.simulation as any;
    if (simulation?.error) throw new SubmissionError(`Simulation rejected: ${simulation.error}`, undefined, "SIMULATION_FAILED");
    let hash: string | undefined;
    let sent;
    try {
      // TTL operations change ledger state even if the SDK calls them read-only.
      sent = await tx.signAndSend({ force: true, watcher: {
        onSubmitted: (response: any) => { hash = response.hash; },
      },
      });
    } catch (cause) {
      // Hash the signed envelope even when the RPC response was lost.
      hash ??= tx.signed?.hash().toString("hex");
      throw new SubmissionError(`Submission outcome requires reconciliation${hash ? ` (${hash})` : ""}`, hash, "UNKNOWN", { cause });
    }
    hash ??= sent.sendTransactionResponse?.hash;
    const response = sent.getTransactionResponse;
    const status = response?.status ?? "UNKNOWN";
    if (hash) options.onTransaction?.({ hash, status, attempt });
    if (isFootprintConflict(response) && attempt < maxAttempts) continue;
    if (status !== "SUCCESS") throw new SubmissionError(`Transaction ${hash} ended ${status}`, hash, status);
    return { result: sent.result, hash: hash!, transaction: response! };
  }
  throw new SubmissionError("Submission attempts exhausted");
}
