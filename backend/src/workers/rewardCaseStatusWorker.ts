import cron from 'node-cron';
import prisma from '../config/database.js';
import { evaluateAutoStatus } from '../services/rewardCaseService.js';

let isRunning = false;

// Advances reward cases through their lifecycle:
//   SCHEDULED → ACTIVE when startAt passes
//   ACTIVE / SCHEDULED → PAUSED when endAt passes or limit exhausts
// Never touches DRAFT or COMPLETED. Never resumes PAUSED cases (manual only).
export const startRewardCaseStatusWorker = () => {
  cron.schedule('*/1 * * * *', async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      const cases = await prisma.rewardCase.findMany({
        where: { status: { in: ['SCHEDULED', 'ACTIVE'] } },
      });
      for (const c of cases) {
        const desired = evaluateAutoStatus(c);
        if (desired !== c.status) {
          await prisma.rewardCase.update({
            where: { id: c.id },
            data: { status: desired },
          });
          console.log(`[rewardCase] ${c.id} auto-transition ${c.status} → ${desired}`);
        }
      }
    } catch (err) {
      console.warn('[rewardCase] status worker failed', err);
    } finally {
      isRunning = false;
    }
  });
  console.log('✓ reward case status worker scheduled (every 1 min)');
};
