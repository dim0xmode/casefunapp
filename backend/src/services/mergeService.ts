import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

export const mergeAccounts = async (primaryUserId: string, secondaryUserId: string) => {
  if (primaryUserId === secondaryUserId) {
    throw new AppError('Cannot merge account with itself', 400);
  }

  const [primary, secondary] = await Promise.all([
    prisma.user.findUnique({ where: { id: primaryUserId } }),
    prisma.user.findUnique({ where: { id: secondaryUserId } }),
  ]);

  if (!primary) throw new AppError('Primary account not found', 404);
  if (!secondary) throw new AppError('Secondary account not found', 404);

  return prisma.$transaction(async (tx) => {
    await tx.inventoryItem.updateMany({
      where: { userId: secondaryUserId },
      data: { userId: primaryUserId },
    });

    await tx.caseOpening.updateMany({
      where: { userId: secondaryUserId },
      data: { userId: primaryUserId },
    });

    await tx.transaction.updateMany({
      where: { userId: secondaryUserId },
      data: { userId: primaryUserId },
    });

    await tx.battle.updateMany({
      where: { userId: secondaryUserId },
      data: { userId: primaryUserId },
    });

    await tx.deposit.updateMany({
      where: { userId: secondaryUserId },
      data: { userId: primaryUserId },
    });

    await tx.claim.updateMany({
      where: { userId: secondaryUserId },
      data: { userId: primaryUserId },
    });

    await tx.rewardClaim.updateMany({
      where: { userId: secondaryUserId },
      data: { userId: primaryUserId },
    });

    await tx.promoActivation.updateMany({
      where: { userId: secondaryUserId },
      data: { userId: primaryUserId },
    });

    await tx.feedbackMessage.updateMany({
      where: { userId: secondaryUserId },
      data: { userId: primaryUserId },
    });

    await tx.case.updateMany({
      where: { createdById: secondaryUserId },
      data: { createdById: primaryUserId },
    });

    await tx.battleLobby.updateMany({
      where: { hostUserId: secondaryUserId },
      data: { hostUserId: primaryUserId },
    });

    await tx.battleLobby.updateMany({
      where: { joinerUserId: secondaryUserId },
      data: { joinerUserId: primaryUserId },
    });

    const mergeData: Record<string, any> = {
      balance: { increment: secondary.balance },
      rewardPoints: { increment: secondary.rewardPoints },
    };

    if (!primary.telegramId && secondary.telegramId) {
      mergeData.telegramId = secondary.telegramId;
      mergeData.telegramUsername = secondary.telegramUsername;
      mergeData.telegramFirstName = secondary.telegramFirstName;
      mergeData.telegramLastName = secondary.telegramLastName;
      mergeData.telegramPhotoUrl = secondary.telegramPhotoUrl;
      mergeData.telegramLinkedAt = secondary.telegramLinkedAt || new Date();
    }

    if ((!primary.hasLinkedWallet || primary.walletAddress?.startsWith('tg_') || primary.walletAddress?.startsWith('ton_')) &&
        secondary.hasLinkedWallet && secondary.walletAddress && !secondary.walletAddress.startsWith('tg_') && !secondary.walletAddress.startsWith('ton_')) {
      mergeData.walletAddress = secondary.walletAddress;
      mergeData.hasLinkedWallet = true;
      mergeData.walletLinkedAt = secondary.walletLinkedAt || new Date();
    }

    if (!primary.tonAddress && secondary.tonAddress) {
      mergeData.tonAddress = secondary.tonAddress;
      mergeData.tonLinkedAt = secondary.tonLinkedAt || new Date();
    }

    if (!primary.twitterId && secondary.twitterId) {
      mergeData.twitterId = secondary.twitterId;
      mergeData.twitterUsername = secondary.twitterUsername;
      mergeData.twitterName = secondary.twitterName;
      mergeData.twitterLinkedAt = secondary.twitterLinkedAt;
      mergeData.twitterAccessToken = secondary.twitterAccessToken;
      mergeData.twitterRefreshToken = secondary.twitterRefreshToken;
    }

    if (secondary.telegramId) {
      await tx.user.update({
        where: { id: secondaryUserId },
        data: { telegramId: null },
      });
    }
    if (secondary.twitterId) {
      await tx.user.update({
        where: { id: secondaryUserId },
        data: { twitterId: null },
      });
    }
    if (secondary.tonAddress) {
      await tx.user.update({
        where: { id: secondaryUserId },
        data: { tonAddress: null },
      });
    }
    if (secondary.walletAddress && mergeData.walletAddress === secondary.walletAddress) {
      const tempPlaceholder = `merged_${secondary.id}_${Date.now()}`;
      await tx.user.update({
        where: { id: secondaryUserId },
        data: { walletAddress: tempPlaceholder },
      });
    }

    const merged = await tx.user.update({
      where: { id: primaryUserId },
      data: mergeData,
    });

    await tx.battle.updateMany({
      where: { opponentId: secondaryUserId },
      data: { opponentId: primaryUserId },
    });

    await tx.user.updateMany({
      where: { referredById: secondaryUserId },
      data: { referredById: primaryUserId },
    });

    await tx.rewardTask.updateMany({
      where: { createdById: secondaryUserId },
      data: { createdById: primaryUserId },
    });

    await tx.promoCode.updateMany({
      where: { fundingUserId: secondaryUserId },
      data: { fundingUserId: primaryUserId },
    });

    await tx.session.deleteMany({ where: { userId: secondaryUserId } });
    await tx.rtuEvent.updateMany({
      where: { userId: secondaryUserId },
      data: { userId: primaryUserId },
    });
    await tx.user.delete({ where: { id: secondaryUserId } });

    return merged;
  });
};
