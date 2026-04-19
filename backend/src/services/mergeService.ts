import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import type { User } from '@prisma/client';

const isPlaceholderEvm = (addr: string | null | undefined): boolean => {
  if (!addr) return true;
  return (
    addr.startsWith('tg_') ||
    addr.startsWith('ton_') ||
    addr.startsWith('merged_')
  );
};

export interface MergeConflict {
  field: 'telegramId' | 'walletAddress' | 'tonAddress' | 'twitterId';
  label: string;
}

/**
 * Two accounts can merge only if no identity slot conflicts.
 * A slot "conflicts" when both accounts have a non-empty value AND those values differ.
 * If the same value is on both sides — that's the same identity, not a conflict
 * (in practice this never happens because each slot has a UNIQUE constraint in DB).
 */
export const findMergeConflicts = (
  primary: Pick<User, 'telegramId' | 'walletAddress' | 'hasLinkedWallet' | 'tonAddress' | 'twitterId'>,
  secondary: Pick<User, 'telegramId' | 'walletAddress' | 'hasLinkedWallet' | 'tonAddress' | 'twitterId'>
): MergeConflict[] => {
  const conflicts: MergeConflict[] = [];

  if (primary.telegramId && secondary.telegramId && primary.telegramId !== secondary.telegramId) {
    conflicts.push({ field: 'telegramId', label: 'Telegram account' });
  }

  const primaryHasRealEvm = primary.hasLinkedWallet && !isPlaceholderEvm(primary.walletAddress);
  const secondaryHasRealEvm = secondary.hasLinkedWallet && !isPlaceholderEvm(secondary.walletAddress);
  if (
    primaryHasRealEvm &&
    secondaryHasRealEvm &&
    String(primary.walletAddress).toLowerCase() !== String(secondary.walletAddress).toLowerCase()
  ) {
    conflicts.push({ field: 'walletAddress', label: 'EVM wallet' });
  }

  if (primary.tonAddress && secondary.tonAddress && primary.tonAddress !== secondary.tonAddress) {
    conflicts.push({ field: 'tonAddress', label: 'TON wallet' });
  }

  if (primary.twitterId && secondary.twitterId && primary.twitterId !== secondary.twitterId) {
    conflicts.push({ field: 'twitterId', label: 'Twitter account' });
  }

  return conflicts;
};

export const buildMergeConflictMessage = (conflicts: MergeConflict[]): string => {
  if (conflicts.length === 0) return '';
  const labels = conflicts.map((c) => c.label).join(', ');
  return `Cannot merge accounts: ${labels} differs between the two profiles. Contact support to unlink one before merging.`;
};

export interface MergePreview {
  balance: number;
  rewardPoints: number;
  inventoryCount: number;
  openingsCount: number;
  battlesCount: number;
  casesCreated: number;
  hasAvatar: boolean;
  avatarUrl: string | null;
  username: string;
  identifiers: {
    telegram?: { id: string; username: string | null };
    evm?: string;
    ton?: string;
    twitter?: { id: string; username: string | null };
  };
}

/** Lightweight summary of what the secondary account brings into a merge. */
export const getMergePreview = async (secondaryUserId: string): Promise<MergePreview | null> => {
  const u = await prisma.user.findUnique({ where: { id: secondaryUserId } });
  if (!u) return null;
  const [inventoryCount, openingsCount, battlesCount, casesCreated] = await Promise.all([
    prisma.inventoryItem.count({ where: { userId: secondaryUserId } }),
    prisma.caseOpening.count({ where: { userId: secondaryUserId } }),
    prisma.battle.count({ where: { userId: secondaryUserId } }),
    prisma.case.count({ where: { createdById: secondaryUserId } }),
  ]);
  const identifiers: MergePreview['identifiers'] = {};
  if (u.telegramId) identifiers.telegram = { id: u.telegramId, username: u.telegramUsername };
  if (u.hasLinkedWallet && !isPlaceholderEvm(u.walletAddress)) identifiers.evm = u.walletAddress;
  if (u.tonAddress) identifiers.ton = u.tonAddress;
  if (u.twitterId) identifiers.twitter = { id: u.twitterId, username: u.twitterUsername };
  return {
    balance: Number(u.balance || 0),
    rewardPoints: Number(u.rewardPoints || 0),
    inventoryCount,
    openingsCount,
    battlesCount,
    casesCreated,
    hasAvatar: !!u.avatarUrl,
    avatarUrl: u.avatarUrl ?? null,
    username: u.username,
    identifiers,
  };
};

export interface MergeOptions {
  /** When set, force-pick avatar from this side (default: keep primary's, fall back to secondary's). */
  preferAvatarFrom?: 'primary' | 'secondary';
  /** When set, force-pick username from this side (default: keep primary's). */
  preferUsernameFrom?: 'primary' | 'secondary';
}

export const mergeAccounts = async (
  primaryUserId: string,
  secondaryUserId: string,
  options: MergeOptions = {}
) => {
  if (primaryUserId === secondaryUserId) {
    throw new AppError('Cannot merge account with itself', 400);
  }

  const [primary, secondary] = await Promise.all([
    prisma.user.findUnique({ where: { id: primaryUserId } }),
    prisma.user.findUnique({ where: { id: secondaryUserId } }),
  ]);

  if (!primary) throw new AppError('Primary account not found', 404);
  if (!secondary) throw new AppError('Secondary account not found', 404);

  const conflicts = findMergeConflicts(primary, secondary);
  if (conflicts.length > 0) {
    throw new AppError(buildMergeConflictMessage(conflicts), 409);
  }

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

    // Avatar resolution:
    // - explicit choice via options wins
    // - otherwise: prefer primary, fall back to secondary
    if (options.preferAvatarFrom === 'secondary' && secondary.avatarUrl) {
      mergeData.avatarUrl = secondary.avatarUrl;
      mergeData.avatarMeta = secondary.avatarMeta as any;
    } else if (options.preferAvatarFrom !== 'primary' && !primary.avatarUrl && secondary.avatarUrl) {
      mergeData.avatarUrl = secondary.avatarUrl;
      mergeData.avatarMeta = secondary.avatarMeta as any;
    }

    // Username resolution:
    // - if either side has Telegram, the merged user's display name will follow
    //   their telegramUsername (handled in toPublicUser); username field follows
    //   primary unless explicitly overridden.
    // Username resolution: by default keep primary's. Only swap if explicitly asked.
    if (options.preferUsernameFrom === 'secondary') {
      const tempPrimary = `swap_p_${primary.id}_${Date.now()}`;
      const tempSecondary = `swap_s_${secondary.id}_${Date.now()}`;
      await tx.user.update({ where: { id: primary.id }, data: { username: tempPrimary } });
      await tx.user.update({ where: { id: secondary.id }, data: { username: tempSecondary } });
      mergeData.username = secondary.username;
    }

    if (!primary.referredById && secondary.referredById && secondary.referredById !== primary.id) {
      mergeData.referredById = secondary.referredById;
      mergeData.referralConfirmedAt = secondary.referralConfirmedAt;
    }
    if (Number(secondary.referralConfirmedCount || 0) > 0) {
      mergeData.referralConfirmedCount = {
        increment: Number(secondary.referralConfirmedCount || 0),
      };
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
