import cron from 'node-cron';
import prisma from '../config/database.js';
import { botConfigured, config } from '../config/env.js';
import { mintCaseIfNeeded, payoutCaseRevenue } from '../services/tokenService.js';

let isRunning = false;

/** Whether the main EVM chain is fully configured. */
const evmConfigured = Boolean(
  config.ethereumRpcUrl && config.treasuryAddress && config.tokenFactoryAddress,
);

/** Chains that are ready to mint/payout. BOT cases are skipped if BOT is unset. */
const chainConfigured = (chainType?: string | null) =>
  chainType === 'BOT' ? botConfigured : evmConfigured;

export const startCaseExpiryWorker = () => {
  if (!evmConfigured && !botConfigured) {
    console.warn('⚠️  Case expiry worker disabled: no EVM/BOT chain configured.');
    return;
  }

  // Cap how many cases we schedule per tick. With per-chain serialization,
  // a single mint+payout can take 5-15s on Sepolia — processing the whole
  // backlog in one tick would lock the EVM queue for hours and block
  // user-facing claims behind it. Picking up to 8 expired cases per minute
  // drains a backlog of 500 in ~1h while keeping the queue responsive for
  // interactive flows.
  const BATCH = 8;

  cron.schedule('* * * * *', async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      const now = Date.now();
      const cases = await prisma.case.findMany({
        where: {
          openDurationHours: { not: null },
          tokenAddress: { not: null },
          OR: [
            { mintedAt: null },
            { payoutAt: null },
          ],
        },
        orderBy: { createdAt: 'asc' },
      });

      let processed = 0;
      for (const caseInfo of cases) {
        if (processed >= BATCH) break;
        if (!caseInfo.createdAt || !caseInfo.openDurationHours) continue;
        const endAt = caseInfo.createdAt.getTime() + caseInfo.openDurationHours * 60 * 60 * 1000;
        if (endAt > now) continue;
        // Skip cases on a chain we can't service yet (e.g. BOT not configured).
        if (!chainConfigured((caseInfo as any).chainType)) continue;
        processed++;
        try {
          if (!caseInfo.mintedAt) {
            await mintCaseIfNeeded(caseInfo.id);
          }
          if (!caseInfo.payoutAt) {
            await payoutCaseRevenue(caseInfo.id);
          }
        } catch (error) {
          console.warn(`Mint/payout failed for case ${caseInfo.id}`, error);
        }
      }
    } catch (error) {
      console.warn('Case expiry worker failed', error);
    } finally {
      isRunning = false;
    }
  });
};
