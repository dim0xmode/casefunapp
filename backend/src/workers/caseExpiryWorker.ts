import cron from 'node-cron';
import prisma from '../config/database.js';
import { config } from '../config/env.js';
import { mintCaseIfNeeded, payoutCaseRevenue } from '../services/tokenService.js';

let isRunning = false;

export const startCaseExpiryWorker = () => {
  if (!config.ethereumRpcUrl || !config.treasuryAddress || !config.tokenFactoryAddress) {
    console.warn('⚠️  Case expiry worker disabled: blockchain config missing.');
    return;
  }

  cron.schedule('*/2 * * * *', async () => {
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
      });

      for (const caseInfo of cases) {
        if (!caseInfo.createdAt || !caseInfo.openDurationHours) continue;
        const endAt = caseInfo.createdAt.getTime() + caseInfo.openDurationHours * 60 * 60 * 1000;
        if (endAt > now) continue;
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
