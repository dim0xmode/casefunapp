import type { PrismaClient } from '@prisma/client';

const REFERRAL_CONFIRM_BONUS_CFP = 8;
const REFERRAL_KICKBACK_RATE = 0.1;

/**
 * Called after a user links Twitter or Telegram.
 * Confirms the referral (increments inviter's count, awards 8 CFP)
 * if the user has both Twitter and Telegram linked and was referred.
 */
export const checkAndConfirmReferral = async (
  prisma: PrismaClient,
  userId: string
) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      referredById: true,
      referralConfirmedAt: true,
      twitterId: true,
      telegramId: true,
    },
  });

  if (!user) return;
  if (!user.referredById) return;
  if (user.referralConfirmedAt) return;
  if (!user.twitterId || !user.telegramId) return;

  const referrer = await prisma.user.findUnique({
    where: { id: user.referredById },
    select: { id: true, username: true },
  });
  if (!referrer) return;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { referralConfirmedAt: new Date() },
    });

    await tx.user.update({
      where: { id: referrer.id },
      data: {
        referralConfirmedCount: { increment: 1 },
        rewardPoints: { increment: REFERRAL_CONFIRM_BONUS_CFP },
      },
    });

    await tx.rewardClaim.create({
      data: {
        userId: referrer.id,
        taskId: null,
        reward: REFERRAL_CONFIRM_BONUS_CFP,
        type: 'REFERRAL_BONUS',
        metadata: {
          referralUserId: userId,
          reason: 'Referral confirmed — invited user linked Twitter & Telegram',
        },
      },
    });
  });
};

/**
 * Called after a task-based reward claim.
 * Awards 10% of the task reward to the inviter (single-level only).
 */
export const awardReferralKickback = async (
  prisma: PrismaClient,
  userId: string,
  taskReward: number,
  taskTitle: string
) => {
  if (taskReward <= 0) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      referredById: true,
      referralConfirmedAt: true,
      username: true,
    },
  });

  if (!user?.referredById || !user.referralConfirmedAt) return;

  const kickback = Math.round(taskReward * REFERRAL_KICKBACK_RATE * 10) / 10;
  if (kickback <= 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.referredById! },
      data: { rewardPoints: { increment: kickback } },
    });

    await tx.rewardClaim.create({
      data: {
        userId: user.referredById!,
        taskId: null,
        reward: kickback,
        type: 'REFERRAL_KICKBACK',
        metadata: {
          referralUserId: userId,
          referralUsername: user.username,
          taskTitle,
          taskReward,
          rate: '10%',
        },
      },
    });
  });
};
