import cron from 'node-cron';
import prisma from '../config/database.js';

let isRunning = false;

// Pattern of imageUrl values used by spam cases. We've seen the gift emoji
// pasted as a "case image" hundreds of times. Extend this list if new
// patterns appear; emoji as image is never a legitimate value.
const SPAM_IMAGE_VALUES = ['🎁'];

// Hides any active case whose imageUrl matches a known spam pattern.
// Soft-hide only (isActive = false), so we don't lose traction metrics.
export const startSpamCaseHiderWorker = () => {
  cron.schedule('*/20 * * * *', async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      const result = await prisma.case.updateMany({
        where: {
          isActive: true,
          imageUrl: { in: SPAM_IMAGE_VALUES },
        },
        data: { isActive: false },
      });
      if (result.count > 0) {
        console.log(`[spamHider] hid ${result.count} spam case(s)`);
      }
    } catch (err) {
      console.warn('[spamHider] worker failed', err);
    } finally {
      isRunning = false;
    }
  });
  console.log('✓ spam case hider worker scheduled (every 20 min)');
};
