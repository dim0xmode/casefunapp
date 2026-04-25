/**
 * Per-chain FIFO queue for blockchain operations.
 *
 * Why this exists:
 *   The Sepolia RPC we use rejects bursts with
 *   `in-flight transaction limit reached for delegated accounts`,
 *   and we hit that whenever multiple writes happen at once — e.g. the case
 *   expiry worker fans out mint + payout for dozens of cases in parallel,
 *   or a wave of users claim tokens at the same time. Each failure ties up
 *   a Prisma transaction, which then trips the 5s interactive_transaction
 *   timeout (P2028) and breaks unrelated requests like wallet login.
 *
 * What it does:
 *   - Serializes calls per chain (EVM, TON) — concurrency = 1.
 *   - Inserts a small pacing delay between tasks so a long burst can't
 *     overwhelm the RPC even if individual tx finish fast.
 *   - Keeps the chain rolling on errors so a single bad tx doesn't stall
 *     everything behind it.
 *
 * How to use:
 *   await evmQueue.enqueue('deployCaseToken', () => factory.createToken(...))
 *   await tonQueue.enqueue('mintJetton',     () => mintJettonImpl(...))
 *
 * The label is only used for logging / future metrics — pick something
 * descriptive enough to find in `docker logs` if the queue gets stuck.
 */
class ChainQueue {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly name: string,
    private readonly pacingMs: number = 250,
  ) {}

  enqueue<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const startedAt = Date.now();
      try {
        const value = await fn();
        return value;
      } finally {
        const elapsed = Date.now() - startedAt;
        if (elapsed > 8_000) {
          console.warn(
            `[chainQueue:${this.name}] ${label} took ${elapsed}ms`,
          );
        }
        if (this.pacingMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, this.pacingMs));
        }
      }
    };

    const result = this.chain.then(run, run);
    // Swallow the rejection on the chain reference so a failed task doesn't
    // poison subsequent ones; callers still receive the original error from
    // the returned promise.
    this.chain = result.catch(() => undefined);
    return result;
  }
}

export const evmQueue = new ChainQueue('evm', 300);
export const tonQueue = new ChainQueue('ton', 300);
