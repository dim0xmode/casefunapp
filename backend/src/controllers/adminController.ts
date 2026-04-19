import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { ethers } from 'ethers';
import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { getDynamicOpenRtuPercent } from '../services/rtuPolicyService.js';
import { provider, treasurySigner } from '../services/blockchain.js';
import { resolveBattleDrops } from '../services/battleResolveService.js';
import { getTonTreasuryStatus } from '../services/tonService.js';

const normalizeParam = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
};

const GAS_LOW_THRESHOLD_ETH = 0.03;
const GAS_LOW_THRESHOLD_TON = 0.5;
const FEEDBACK_REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
const IMMUTABLE_BOOTSTRAP_ACCOUNT_ERROR = 'Bootstrap admin account is immutable and cannot be modified';

/** Same wallet as frontend `IMMUTABLE_ADMIN_WALLET`. Always in the set so role/delete rules work if `BOOTSTRAP_ADMIN_WALLET` in .env is missing or outdated. */
const HARDCODED_MAIN_ADMIN_LOWER = '0xc459241d1ac02250de56b8b7165ebedf59236524';

const getBootstrapWalletSet = (): Set<string> => {
  const set = new Set<string>();
  const envRaw = String(process.env.BOOTSTRAP_ADMIN_WALLET || '').trim();
  if (envRaw) {
    for (const part of envRaw.split(/[\s,]+/)) {
      const p = part.trim().toLowerCase();
      if (p) set.add(p);
    }
  }
  set.add(HARDCODED_MAIN_ADMIN_LOWER);
  return set;
};

const bootstrapWalletWhereOr = (set: Set<string>) => {
  const or: { walletAddress: string }[] = [];
  for (const w of set) {
    or.push({ walletAddress: w });
    try {
      or.push({ walletAddress: ethers.getAddress(w) });
    } catch {
      /* skip invalid */
    }
  }
  return or;
};

const isBootstrapWallet = (walletAddress: string | null | undefined, bootstrapSet: Set<string>): boolean => {
  if (!walletAddress) return false;
  const lower = walletAddress.trim().toLowerCase();
  if (bootstrapSet.has(lower)) return true;
  try {
    return bootstrapSet.has(ethers.getAddress(walletAddress).toLowerCase());
  } catch {
    return false;
  }
};

const logAdminAction = async (adminId: string, action: string, metadata?: Record<string, any>, entity?: string, entityId?: string) => {
  await prisma.adminAuditLog.create({
    data: {
      adminId,
      action,
      entity,
      entityId,
      metadata: metadata ?? {},
    },
  });
};

export const listUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            referrals: true,
          },
        },
      },
    });
    const payload = users.map((row) => {
      const { _count, ...user } = row;
      return {
        ...user,
        invitedUserCount: _count.referrals,
      };
    });
    res.json({ status: 'success', data: { users: payload } });
  } catch (error) {
    next(error);
  }
};

export const getUserDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = normalizeParam(req.params.id);
    if (!id) {
      return next(new AppError('User id is required', 400));
    }
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        inventory: {
          orderBy: { createdAt: 'desc' },
          take: 400,
        },
        openings: {
          orderBy: { timestamp: 'desc' },
          take: 250,
          include: {
            case: {
              select: { id: true, name: true, currency: true, tokenTicker: true, price: true },
            },
          },
        },
        transactions: {
          orderBy: { timestamp: 'desc' },
          take: 400,
        },
        battles: {
          orderBy: { timestamp: 'desc' },
          take: 250,
        },
      },
    });

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    const [
      burntItems,
      deposits,
      claims,
      feedbacks,
      referredByUser,
      invitedCount,
      invitedConfirmedCount,
      createdCases,
    ] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: { userId: id, status: 'BURNT' },
        orderBy: { createdAt: 'desc' },
        take: 400,
      }),
      prisma.deposit.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 150,
      }),
      prisma.claim.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          case: { select: { id: true, name: true, currency: true, tokenTicker: true } },
        },
      }),
      prisma.feedbackMessage.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      user.referredById
        ? prisma.user.findUnique({
            where: { id: user.referredById },
            select: { id: true, username: true, walletAddress: true, referralCode: true },
          })
        : Promise.resolve(null),
      prisma.user.count({ where: { referredById: id } }),
      prisma.user.count({ where: { referredById: id, referralConfirmedAt: { not: null } } }),
      prisma.case.findMany({
        where: { createdById: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          name: true,
          currency: true,
          tokenTicker: true,
          price: true,
          isActive: true,
          createdAt: true,
        },
      }),
    ]);

    const rewardClaims = await prisma.rewardClaim.findMany({
      where: { userId: id },
      orderBy: { claimedAt: 'desc' },
      take: 200,
      include: { task: { select: { id: true, title: true, type: true, category: true } } },
    });

    const totals = user.transactions.reduce(
      (acc, tx) => {
        if (tx.type === 'DEPOSIT') acc.deposits += tx.amount;
        if (['CASE_OPEN', 'CASE_CREATE', 'UPGRADE', 'BATTLE'].includes(tx.type)) {
          acc.spent += Math.abs(tx.amount);
        }
        return acc;
      },
      { deposits: 0, spent: 0 }
    );

    const depositOnChainTotal = deposits.reduce((s, d) => s + Number(d.amountUsdt || 0), 0);

    res.json({
      status: 'success',
      data: {
        user,
        burntItems,
        deposits,
        claims,
        feedbacks,
        createdCases,
        rewardClaims,
        referralInsight: {
          referralCode: user.referralCode,
          referralConfirmedCount: user.referralConfirmedCount,
          referralConfirmedAt: user.referralConfirmedAt,
          referredBy: referredByUser,
          invitedUserCount: invitedCount,
          invitedConfirmedCount: invitedConfirmedCount,
        },
        summary: {
          deposits: totals.deposits,
          spent: totals.spent,
          net: totals.deposits - totals.spent,
          onChainDepositUsdtTotal: depositOnChainTotal,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateUserRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = (req as any).userId;
    const id = normalizeParam(req.params.id);
    if (!id) {
      return next(new AppError('User id is required', 400));
    }
    const { role } = req.body;

    if (!role) {
      return next(new AppError('Role is required', 400));
    }

    const normalizedRole = String(role).trim().toUpperCase();
    if (!['USER', 'MODERATOR', 'ADMIN'].includes(normalizedRole)) {
      return next(new AppError('Invalid role', 400));
    }
    const nextRole = normalizedRole as UserRole;

    const bootstrapSet = getBootstrapWalletSet();
    const adminUser = await prisma.user.findUnique({ where: { id: adminId } });
    if (!adminUser) {
      return next(new AppError('Admin user not found', 404));
    }
    const actorIsBootstrap = isBootstrapWallet(adminUser.walletAddress, bootstrapSet);

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return next(new AppError('User not found', 404));
    }
    if (isBootstrapWallet(target.walletAddress, bootstrapSet)) {
      return next(new AppError(IMMUTABLE_BOOTSTRAP_ACCOUNT_ERROR, 403));
    }

    const targetRoleUpper = String(target.role || '').toUpperCase();
    const requiresBootstrap =
      nextRole === UserRole.ADMIN ||
      targetRoleUpper === 'ADMIN';
    if (requiresBootstrap && !actorIsBootstrap) {
      return next(
        new AppError('Only the main admin wallet can assign or remove the admin role', 403)
      );
    }

    const user = await prisma.user.update({
      where: { id },
      data: { role: nextRole },
    });

    await logAdminAction(adminId, 'USER_ROLE_UPDATE', { role: nextRole }, 'User', id);

    res.json({ status: 'success', data: { user } });
  } catch (error) {
    next(error);
  }
};

export const updateUserBan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = (req as any).userId;
    const id = normalizeParam(req.params.id);
    if (!id) {
      return next(new AppError('User id is required', 400));
    }
    const { isBanned, reason } = req.body;

    const bootstrapSet = getBootstrapWalletSet();
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return next(new AppError('User not found', 404));
    }
    if (isBootstrapWallet(target.walletAddress, bootstrapSet)) {
      return next(new AppError(IMMUTABLE_BOOTSTRAP_ACCOUNT_ERROR, 403));
    }

    const user = await prisma.user.update({
      where: { id },
      data: { isBanned: Boolean(isBanned), banReason: Boolean(isBanned) ? String(reason || '—') : null },
    });

    await logAdminAction(adminId, 'USER_BAN_UPDATE', { isBanned: Boolean(isBanned), reason }, 'User', id);

    res.json({ status: 'success', data: { user } });
  } catch (error) {
    next(error);
  }
};

export const updateUserBalance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = (req as any).userId;
    const id = normalizeParam(req.params.id);
    if (!id) {
      return next(new AppError('User id is required', 400));
    }
    const { balance } = req.body;
    const nextBalance = Number(balance);

    if (!Number.isFinite(nextBalance) || nextBalance < 0) {
      return next(new AppError('Invalid balance', 400));
    }

    const bootstrapSet = getBootstrapWalletSet();
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return next(new AppError('User not found', 404));
    }
    if (isBootstrapWallet(target.walletAddress, bootstrapSet)) {
      return next(new AppError(IMMUTABLE_BOOTSTRAP_ACCOUNT_ERROR, 403));
    }

    const user = await prisma.user.update({
      where: { id },
      data: { balance: nextBalance },
    });

    await logAdminAction(adminId, 'USER_BALANCE_UPDATE', { balance: nextBalance }, 'User', id);

    res.json({ status: 'success', data: { user } });
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = (req as any).userId;
    const id = normalizeParam(req.params.id);
    if (!id) {
      return next(new AppError('User id is required', 400));
    }

    const bootstrapSet = getBootstrapWalletSet();

    const adminUser = await prisma.user.findUnique({ where: { id: adminId } });
    if (!adminUser || !isBootstrapWallet(adminUser.walletAddress, bootstrapSet)) {
      return next(new AppError('Only the main admin wallet can delete users', 403));
    }

    if (id === adminId) {
      return next(new AppError('Cannot delete your own account', 400));
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return next(new AppError('User not found', 404));
    }
    if (isBootstrapWallet(target.walletAddress, bootstrapSet)) {
      return next(new AppError(IMMUTABLE_BOOTSTRAP_ACCOUNT_ERROR, 403));
    }

    const bootstrapUser = await prisma.user.findFirst({
      where: { OR: bootstrapWalletWhereOr(bootstrapSet) },
      select: { id: true },
    });
    if (!bootstrapUser) {
      return next(new AppError('Bootstrap admin user record not found', 500));
    }

    await prisma.$transaction(async (tx) => {
      await tx.case.updateMany({
        where: { createdById: id },
        data: { createdById: bootstrapUser.id },
      });
      await tx.user.delete({ where: { id } });
    });

    await logAdminAction(adminId, 'USER_DELETE', { deletedUsername: target.username }, 'User', id);

    res.json({ status: 'success', data: { ok: true } });
  } catch (error) {
    next(error);
  }
};

type UnlinkChannel = 'telegram' | 'evm' | 'ton' | 'twitter';

const isPlaceholderEvmWallet = (addr: string | null | undefined): boolean => {
  if (!addr) return true;
  return addr.startsWith('tg_') || addr.startsWith('ton_') || addr.startsWith('merged_');
};

/** Counts how many "real" identifiers a user has (TG, EVM, TON, Twitter). */
const countIdentifiers = (u: {
  telegramId: string | null;
  walletAddress: string | null;
  hasLinkedWallet: boolean;
  tonAddress: string | null;
  twitterId: string | null;
}): number => {
  let n = 0;
  if (u.telegramId) n++;
  if (u.hasLinkedWallet && !isPlaceholderEvmWallet(u.walletAddress)) n++;
  if (u.tonAddress) n++;
  if (u.twitterId) n++;
  return n;
};

export const unlinkUserConnection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = (req as any).userId;
    const id = normalizeParam(req.params.id);
    const channel = String(normalizeParam(req.params.channel) || '').toLowerCase() as UnlinkChannel;

    if (!id) return next(new AppError('User id is required', 400));
    if (!['telegram', 'evm', 'ton', 'twitter'].includes(channel)) {
      return next(new AppError('Invalid channel', 400));
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return next(new AppError('User not found', 404));

    const bootstrapSet = getBootstrapWalletSet();
    if (channel === 'evm' && isBootstrapWallet(target.walletAddress, bootstrapSet)) {
      return next(new AppError(IMMUTABLE_BOOTSTRAP_ACCOUNT_ERROR, 403));
    }

    const slotIsEmpty =
      (channel === 'telegram' && !target.telegramId) ||
      (channel === 'twitter' && !target.twitterId) ||
      (channel === 'ton' && !target.tonAddress) ||
      (channel === 'evm' && (!target.hasLinkedWallet || isPlaceholderEvmWallet(target.walletAddress)));
    if (slotIsEmpty) {
      return next(new AppError('That channel is not linked', 400));
    }

    const remainingAfter = countIdentifiers(target) - 1;
    if (remainingAfter < 1) {
      return next(
        new AppError(
          'Cannot unlink the last identifier — the user would have no way to log in. Delete the account instead.',
          400
        )
      );
    }

    const data: Record<string, any> = {};
    const meta: Record<string, any> = { previous: {} };

    if (channel === 'telegram') {
      meta.previous = {
        telegramId: target.telegramId,
        telegramUsername: target.telegramUsername,
      };
      Object.assign(data, {
        telegramId: null,
        telegramUsername: null,
        telegramFirstName: null,
        telegramLastName: null,
        telegramPhotoUrl: null,
        telegramLinkedAt: null,
      });
    } else if (channel === 'twitter') {
      meta.previous = {
        twitterId: target.twitterId,
        twitterUsername: target.twitterUsername,
      };
      Object.assign(data, {
        twitterId: null,
        twitterUsername: null,
        twitterName: null,
        twitterLinkedAt: null,
        twitterAccessToken: null,
        twitterRefreshToken: null,
      });
    } else if (channel === 'ton') {
      meta.previous = { tonAddress: target.tonAddress };
      Object.assign(data, { tonAddress: null, tonLinkedAt: null });
    } else if (channel === 'evm') {
      meta.previous = { walletAddress: target.walletAddress };
      // walletAddress has UNIQUE constraint and is non-nullable in our schema —
      // store a placeholder so the slot is freed for future links.
      const placeholder =
        (target.telegramId && `tg_${target.telegramId}`) ||
        (target.tonAddress && `ton_${target.tonAddress}`) ||
        `unlinked_${target.id}_${Date.now()}`;
      Object.assign(data, {
        walletAddress: placeholder,
        hasLinkedWallet: false,
        walletLinkedAt: null,
      });
    }

    const updated = await prisma.user.update({ where: { id }, data });

    await logAdminAction(adminId, `USER_UNLINK_${channel.toUpperCase()}`, meta, 'User', id);

    res.json({ status: 'success', data: { user: updated } });
  } catch (error) {
    next(error);
  }
};

export const listCases = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await prisma.case.findMany({
      include: {
        drops: true,
        createdBy: true,
        rtuLedgers: true,
        _count: { select: { openings: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const cases = rows.map((caseItem) => {
      const openings = Number(caseItem._count?.openings || 0);
      const spentUsdt = openings * Number(caseItem.price || 0);
      const ledger = caseItem.rtuLedgers[0] || null;
      const declaredRtu = Number(caseItem.rtu || 0);
      const openRtuTarget = getDynamicOpenRtuPercent(declaredRtu);
      const tokenPrice = Number(caseItem.tokenPrice || ledger?.tokenPriceUsdt || 0);
      const actualRtuPercent =
        ledger && Number(ledger.totalSpentUsdt || 0) > 0 && tokenPrice > 0
          ? (Number(ledger.totalTokenIssued || 0) * tokenPrice) / Number(ledger.totalSpentUsdt || 0) * 100
          : null;
      const payoutStatus = caseItem.payoutAt
        ? 'PAID'
        : caseItem.mintedAt
        ? 'PENDING'
        : 'NOT_MINTED';

      return {
        ...caseItem,
        adminStats: {
          openings,
          spentUsdt,
          declaredRtu,
          openRtuTarget,
          actualRtuPercent,
          tokenIssued: Number(ledger?.totalTokenIssued || 0),
          reserveToken: Number(ledger?.bufferDebtToken || 0),
          payoutStatus,
          payoutTxHash: caseItem.payoutTxHash || null,
        },
      };
    });

    res.json({ status: 'success', data: { cases } });
  } catch (error) {
    next(error);
  }
};

export const getCaseDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = normalizeParam(req.params.id);
    if (!id) {
      return next(new AppError('Case id is required', 400));
    }
    const caseItem = await prisma.case.findUnique({
      where: { id },
      include: {
        drops: true,
        createdBy: true,
        openings: {
          orderBy: { timestamp: 'desc' },
          take: 200,
        },
        rtuLedgers: true,
        rtuEvents: {
          orderBy: { createdAt: 'desc' },
          take: 200,
        },
      },
    });

    if (!caseItem) {
      return next(new AppError('Case not found', 404));
    }

    const openings = caseItem.openings || [];
    const totalOpenings = openings.length;
    const totalWonValue = openings.reduce((sum, opening) => sum + opening.wonValue, 0);
    const avgWonValue = totalOpenings ? totalWonValue / totalOpenings : 0;
    const lastOpenedAt = totalOpenings ? openings[0]?.timestamp : null;
    const ledger = caseItem.rtuLedgers[0] || null;
    const declaredRtu = Number(caseItem.rtu || 0);
    const openRtuTarget = getDynamicOpenRtuPercent(declaredRtu);
    const tokenPrice = Number(caseItem.tokenPrice || ledger?.tokenPriceUsdt || 0);
    const actualRtuPercent =
      ledger && Number(ledger.totalSpentUsdt || 0) > 0 && tokenPrice > 0
        ? (Number(ledger.totalTokenIssued || 0) * tokenPrice) / Number(ledger.totalSpentUsdt || 0) * 100
        : null;
    const minDropAllowed = Number(caseItem.price || 0) * 0.5;
    const maxDropAllowed = Number(caseItem.price || 0) * 15;
    const minDropActual = caseItem.drops.length
      ? Math.min(...caseItem.drops.map((drop) => Number(drop.value || 0)))
      : 0;
    const maxDropActual = caseItem.drops.length
      ? Math.max(...caseItem.drops.map((drop) => Number(drop.value || 0)))
      : 0;

    res.json({
      status: 'success',
      data: {
        case: caseItem,
        stats: {
          totalOpenings,
          totalWonValue,
          avgWonValue,
          lastOpenedAt,
          declaredRtu,
          openRtuTarget,
          actualRtuPercent,
          totalSpentUsdt: Number(ledger?.totalSpentUsdt || 0),
          totalIssuedToken: Number(ledger?.totalTokenIssued || 0),
          reserveToken: Number(ledger?.bufferDebtToken || 0),
          minDropAllowed,
          maxDropAllowed,
          minDropActual,
          maxDropActual,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateCase = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = (req as any).userId;
    const id = normalizeParam(req.params.id);
    if (!id) {
      return next(new AppError('Case id is required', 400));
    }
    const {
      name,
      price,
      rtu,
      tokenPrice,
      tokenTicker,
      openDurationHours,
      imageUrl,
      isActive,
    } = req.body;

    const updated = await prisma.case.update({
      where: { id },
      data: {
        name,
        price,
        rtu,
        tokenPrice,
        tokenTicker,
        openDurationHours,
        imageUrl,
        isActive,
      },
    });

    await logAdminAction(adminId, 'CASE_UPDATE', { fields: Object.keys(req.body) }, 'Case', id);

    res.json({ status: 'success', data: { case: updated } });
  } catch (error) {
    next(error);
  }
};

export const listBattles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const battles = await prisma.battle.findMany({
      orderBy: { timestamp: 'desc' },
    });
    res.json({ status: 'success', data: { battles } });
  } catch (error) {
    next(error);
  }
};

export const listInventory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.inventoryItem.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ status: 'success', data: { items } });
  } catch (error) {
    next(error);
  }
};

export const listTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: { timestamp: 'desc' },
    });
    res.json({ status: 'success', data: { transactions } });
  } catch (error) {
    next(error);
  }
};

export const listRtuLedgers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ledgers = await prisma.rtuLedger.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ status: 'success', data: { ledgers } });
  } catch (error) {
    next(error);
  }
};

export const listRtuEvents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const events = await prisma.rtuEvent.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ status: 'success', data: { events } });
  } catch (error) {
    next(error);
  }
};

export const adjustRtu = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = (req as any).userId;
    const { caseId, tokenSymbol, deltaToken, deltaSpentUsdt = 0, reason } = req.body;

    if (!caseId || !tokenSymbol || !Number.isFinite(Number(deltaToken))) {
      return next(new AppError('Invalid RTU adjustment', 400));
    }

    const caseItem = await prisma.case.findUnique({ where: { id: caseId } });
    if (!caseItem || !caseItem.tokenPrice) {
      return next(new AppError('Case or token price not found', 404));
    }

    const ledger = await prisma.rtuLedger.findFirst({
      where: { caseId, tokenSymbol },
    });

    const nextSpent = (ledger?.totalSpentUsdt || 0) + Number(deltaSpentUsdt || 0);
    const nextIssued = (ledger?.totalTokenIssued || 0) + Number(deltaToken);
    const allowedTokens = (nextSpent * (caseItem.rtu / 100)) / caseItem.tokenPrice;
    const bufferDebtToken = allowedTokens - nextIssued;

    const updatedLedger = ledger
      ? await prisma.rtuLedger.update({
          where: { id: ledger.id },
          data: {
            totalSpentUsdt: nextSpent,
            totalTokenIssued: nextIssued,
            bufferDebtToken,
            tokenPriceUsdt: caseItem.tokenPrice,
            rtuPercent: caseItem.rtu,
          },
        })
      : await prisma.rtuLedger.create({
          data: {
            caseId,
            tokenSymbol,
            tokenPriceUsdt: caseItem.tokenPrice,
            rtuPercent: caseItem.rtu,
            totalSpentUsdt: nextSpent,
            totalTokenIssued: nextIssued,
            bufferDebtToken,
          },
        });

    await prisma.rtuEvent.create({
      data: {
        ledgerId: updatedLedger.id,
        caseId,
        userId: adminId,
        tokenSymbol,
        type: 'ADJUST',
        deltaSpentUsdt: Number(deltaSpentUsdt || 0),
        deltaToken: Number(deltaToken),
        metadata: { reason: reason || 'admin_adjust' },
      },
    });

    await logAdminAction(adminId, 'RTU_ADJUST', { caseId, tokenSymbol, deltaToken, deltaSpentUsdt, reason }, 'RtuLedger', updatedLedger.id);

    res.json({ status: 'success' });
  } catch (error) {
    next(error);
  }
};

export const listSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await prisma.siteSetting.findMany({
      orderBy: { key: 'asc' },
    });
    res.json({ status: 'success', data: { settings } });
  } catch (error) {
    next(error);
  }
};

export const listFeedbackMessages = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const messages = await prisma.feedbackMessage.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            walletAddress: true,
            role: true,
          },
        },
      },
    });
    const unreadCount = messages.filter((item) => !item.isRead).length;
    res.json({ status: 'success', data: { messages, unreadCount } });
  } catch (error) {
    next(error);
  }
};

export const getFeedbackUnreadCount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const unreadCount = await prisma.feedbackMessage.count({
      where: { isRead: false },
    });
    res.json({ status: 'success', data: { unreadCount } });
  } catch (error) {
    next(error);
  }
};

export const previewBattleResolve = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const caseIdsRaw = Array.isArray(req.body?.caseIds) ? req.body.caseIds : [];
    const caseIds = caseIdsRaw
      .map((value: any) => String(value || '').trim())
      .filter(Boolean)
      .slice(0, 25);
    const mode = String(req.body?.mode || 'PVP').toUpperCase() === 'BOT' ? 'BOT' : 'PVP';

    if (!caseIds.length) {
      return next(new AppError('Select at least one case', 400));
    }

    const preview = await resolveBattleDrops(caseIds, mode);
    res.json({ status: 'success', data: preview });
  } catch (error) {
    next(new AppError((error as Error)?.message || 'Failed to preview battle resolve', 400));
  }
};

export const updateFeedbackReadStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = normalizeParam(req.params.id);
    if (!id) {
      return next(new AppError('Feedback id is required', 400));
    }

    const isRead = req.body?.isRead !== undefined ? Boolean(req.body.isRead) : true;
    const updated = await prisma.feedbackMessage.update({
      where: { id },
      data: {
        isRead,
        readAt: isRead ? new Date() : null,
      },
    });

    res.json({ status: 'success', data: { message: updated } });
  } catch (error) {
    next(error);
  }
};

export const updateFeedbackStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = (req as any).userId;
    const id = normalizeParam(req.params.id);
    if (!id) {
      return next(new AppError('Feedback id is required', 400));
    }

    const status = String(req.body?.status || '').trim().toUpperCase();
    if (!FEEDBACK_REVIEW_STATUSES.includes(status as any)) {
      return next(new AppError('Invalid feedback status', 400));
    }

    const resolvedAt = status === 'PENDING' ? null : new Date();
    const updateData: Record<string, any> = {
      status,
      reviewedAt: resolvedAt,
    };
    if (status !== 'PENDING') {
      updateData.isRead = true;
      updateData.readAt = new Date();
    }

    const { updatedMessage, roleUpdatedTo } = await prisma.$transaction(async (tx) => {
      const feedback = await tx.feedbackMessage.findUnique({
        where: { id },
        select: {
          id: true,
          topic: true,
          userId: true,
        },
      });
      if (!feedback) {
        throw new AppError('Feedback message not found', 404);
      }

      const updatedMessage = await tx.feedbackMessage.update({
        where: { id },
        data: updateData,
      });

      let roleUpdatedTo: string | null = null;
      return { updatedMessage, roleUpdatedTo };
    });

    await logAdminAction(
      adminId,
      'FEEDBACK_STATUS_UPDATE',
      { status, roleUpdatedTo },
      'FeedbackMessage',
      id
    );

    res.json({
      status: 'success',
      data: {
        message: updatedMessage,
        roleUpdatedTo,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const upsertSetting = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = (req as any).userId;
    const key = normalizeParam(req.params.key);
    const { value } = req.body;

    if (!key) {
      return next(new AppError('Key is required', 400));
    }

    const setting = await prisma.siteSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });

    await logAdminAction(adminId, 'SETTING_UPSERT', { key }, 'SiteSetting', setting.id);

    res.json({ status: 'success', data: { setting } });
  } catch (error) {
    next(error);
  }
};

export const listAuditLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const logs = await prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ status: 'success', data: { logs } });
  } catch (error) {
    next(error);
  }
};

export const getOverview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [
      users,
      cases,
      battles,
      inventory,
      transactions,
      rtuLedgers,
      feedbackMessages,
      feedbackUnread,
      recentTransactions,
      recentOpenings,
      topUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.case.count(),
      prisma.battle.count(),
      prisma.inventoryItem.count({ where: { status: 'ACTIVE' } }),
      prisma.transaction.count(),
      prisma.rtuLedger.count(),
      prisma.feedbackMessage.count(),
      prisma.feedbackMessage.count({ where: { isRead: false } }),
      prisma.transaction.findMany({
        orderBy: { timestamp: 'desc' },
        take: 10,
        include: {
          user: { select: { id: true, username: true, walletAddress: true } },
        },
      }),
      prisma.caseOpening.findMany({
        orderBy: { timestamp: 'desc' },
        take: 10,
        include: {
          user: { select: { id: true, username: true, walletAddress: true } },
          case: { select: { id: true, name: true, currency: true, tokenTicker: true } },
        },
      }),
      prisma.transaction.findMany({
        where: { type: { in: ['CASE_OPEN', 'BATTLE', 'UPGRADE'] } },
        orderBy: { timestamp: 'desc' },
        take: 500,
      }),
    ]);

    const userSpend = new Map<string, number>();
    for (const tx of topUsers) {
      const amount = Number(tx.amount) || 0;
      if (amount >= 0) continue;
      userSpend.set(tx.userId, (userSpend.get(tx.userId) || 0) + Math.abs(amount));
    }
    const topUsersBySpend = Array.from(userSpend.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([userId, spent]) => ({ userId, spent }));

    const topUserIds = topUsersBySpend.map((entry) => entry.userId);
    const topUsersInfo = topUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: topUserIds } },
          select: { id: true, username: true, walletAddress: true },
        })
      : [];
    const topUsersWithInfo = topUsersBySpend.map((entry) => {
      const info = topUsersInfo.find((user) => user.id === entry.userId);
      return {
        ...entry,
        username: info?.username || 'Unknown',
        walletAddress: info?.walletAddress || '',
      };
    });

    let gasWallet: {
      address: string | null;
      ethBalance: number | null;
      treasuryEthBalance: number | null;
      lowThresholdEth: number;
      isLow: boolean | null;
      rpcConnected: boolean;
    } = {
      address: treasurySigner?.address || null,
      ethBalance: null,
      treasuryEthBalance: null,
      lowThresholdEth: GAS_LOW_THRESHOLD_ETH,
      isLow: null,
      rpcConnected: false,
    };

    if (provider && treasurySigner?.address) {
      try {
        const [signerBalanceRaw, treasuryBalanceRaw] = await Promise.all([
          provider.getBalance(treasurySigner.address),
          provider.getBalance(process.env.TREASURY_ADDRESS || treasurySigner.address),
        ]);

        const ethBalance = Number(ethers.formatEther(signerBalanceRaw));
        const treasuryEthBalance = Number(ethers.formatEther(treasuryBalanceRaw));

        gasWallet = {
          address: treasurySigner.address,
          ethBalance,
          treasuryEthBalance,
          lowThresholdEth: GAS_LOW_THRESHOLD_ETH,
          isLow: ethBalance < GAS_LOW_THRESHOLD_ETH,
          rpcConnected: true,
        };
      } catch {
        gasWallet = {
          ...gasWallet,
          rpcConnected: false,
        };
      }
    }

    let tonTreasury: {
      configured: boolean;
      address: string | null;
      addressFriendly: string | null;
      tonBalance: number | null;
      lowThresholdTon: number;
      isLow: boolean | null;
      network: string | null;
      rpcConnected: boolean;
    } = {
      configured: false,
      address: null,
      addressFriendly: null,
      tonBalance: null,
      lowThresholdTon: GAS_LOW_THRESHOLD_TON,
      isLow: null,
      network: null,
      rpcConnected: false,
    };
    try {
      const tonStatus = await getTonTreasuryStatus();
      tonTreasury = {
        configured: tonStatus.configured,
        address: tonStatus.configured ? tonStatus.address : null,
        addressFriendly: tonStatus.configured ? tonStatus.addressFriendly : null,
        tonBalance: tonStatus.configured ? tonStatus.balanceTon : null,
        lowThresholdTon: GAS_LOW_THRESHOLD_TON,
        isLow: tonStatus.configured ? tonStatus.balanceTon < GAS_LOW_THRESHOLD_TON : null,
        network: tonStatus.network,
        rpcConnected: tonStatus.configured,
      };
    } catch {
      tonTreasury = { ...tonTreasury, rpcConnected: false };
    }

    res.json({
      status: 'success',
      data: {
        stats: {
          users,
          cases,
          battles,
          inventory,
          transactions,
          rtuLedgers,
          feedbackMessages,
          feedbackUnread,
        },
        recentTransactions,
        recentOpenings,
        topUsersBySpend: topUsersWithInfo,
        gasWallet,
        tonTreasury,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAnalytics = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalCases,
      totalBattles,
      totalDeposits,
      totalOpenings,
      totalClaims,
      activeCases,
      newUsersToday,
      newUsers7d,
      newUsers30d,
      deposits30d,
      openings30d,
      battles30d,
      rewardClaims30d,
      allDepositsAgg,
      activeUsers30d,
      dailyActiveUsers,
      dailyOpenings,
      dailyBattles,
      dailyDeposits,
      dailyNewUsers,
      inventoryActive,
      inventoryClaimed,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.case.count(),
      prisma.battle.count(),
      prisma.deposit.count(),
      prisma.caseOpening.count(),
      prisma.claim.count(),
      prisma.case.findMany({
        where: { isActive: true },
        select: { id: true, createdAt: true, openDurationHours: true },
      }),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.deposit.findMany({ where: { createdAt: { gte: thirtyDaysAgo } }, select: { amountUsdt: true, createdAt: true } }),
      prisma.caseOpening.count({ where: { timestamp: { gte: thirtyDaysAgo } } }),
      prisma.battle.count({ where: { timestamp: { gte: thirtyDaysAgo } } }),
      prisma.rewardClaim.count({ where: { claimedAt: { gte: thirtyDaysAgo } } }),
      prisma.deposit.aggregate({ _sum: { amountUsdt: true }, _count: true }),
      prisma.user.count({
        where: { openings: { some: { timestamp: { gte: thirtyDaysAgo } } } },
      }),
      prisma.$queryRawUnsafe<{ day: string; count: bigint }[]>(
        `SELECT DATE("timestamp") as day, COUNT(DISTINCT "userId") as count FROM case_openings WHERE "timestamp" >= $1 GROUP BY DATE("timestamp") ORDER BY day`,
        thirtyDaysAgo,
      ).catch(() => []),
      prisma.$queryRawUnsafe<{ day: string; count: bigint }[]>(
        `SELECT DATE("timestamp") as day, COUNT(*) as count FROM case_openings WHERE "timestamp" >= $1 GROUP BY DATE("timestamp") ORDER BY day`,
        thirtyDaysAgo,
      ).catch(() => []),
      prisma.$queryRawUnsafe<{ day: string; count: bigint }[]>(
        `SELECT DATE("timestamp") as day, COUNT(*) as count FROM battles WHERE "timestamp" >= $1 GROUP BY DATE("timestamp") ORDER BY day`,
        thirtyDaysAgo,
      ).catch(() => []),
      prisma.$queryRawUnsafe<{ day: string; total: number }[]>(
        `SELECT DATE("createdAt") as day, SUM("amountUsdt") as total FROM deposits WHERE "createdAt" >= $1 GROUP BY DATE("createdAt") ORDER BY day`,
        thirtyDaysAgo,
      ).catch(() => []),
      prisma.$queryRawUnsafe<{ day: string; count: bigint }[]>(
        `SELECT DATE("createdAt") as day, COUNT(*) as count FROM users WHERE "createdAt" >= $1 GROUP BY DATE("createdAt") ORDER BY day`,
        thirtyDaysAgo,
      ).catch(() => []),
      prisma.inventoryItem.aggregate({ where: { status: 'ACTIVE' }, _sum: { value: true }, _count: true }),
      prisma.inventoryItem.aggregate({ where: { claimedAt: { not: null } }, _sum: { value: true }, _count: true }),
    ]);

    const totalDepositVolume = allDepositsAgg._sum?.amountUsdt || 0;
    const deposit30dVolume = deposits30d.reduce((s, d) => s + (d.amountUsdt || 0), 0);

    const nowMs = now.getTime();
    const openCasesCount = activeCases.filter((c) => {
      if (!c.openDurationHours) return true;
      const endAt = new Date(c.createdAt).getTime() + c.openDurationHours * 3600_000;
      return endAt > nowMs;
    }).length;
    const expiredCasesCount = activeCases.length - openCasesCount;

    const formatDaily = (rows: { day: string | Date; count?: bigint; total?: number }[]) =>
      rows.map((r) => ({
        date: typeof r.day === 'string' ? r.day : new Date(r.day).toISOString().slice(0, 10),
        value: r.count != null ? Number(r.count) : parseFloat(Number(r.total || 0).toFixed(2)),
      }));

    res.json({
      status: 'success',
      data: {
        summary: {
          totalUsers,
          totalCases,
          openCases: openCasesCount,
          expiredCases: expiredCasesCount,
          totalBattles,
          totalDeposits: allDepositsAgg._count,
          totalDepositVolume,
          totalOpenings,
          totalClaims,
          inventoryActiveCount: inventoryActive._count,
          inventoryActiveValue: inventoryActive._sum?.value || 0,
          inventoryClaimedCount: inventoryClaimed._count,
          inventoryClaimedValue: inventoryClaimed._sum?.value || 0,
        },
        growth: {
          newUsersToday,
          newUsers7d,
          newUsers30d,
          activeUsers30d,
          openings30d,
          battles30d,
          deposit30dVolume,
          rewardClaims30d,
        },
        charts: {
          dailyActiveUsers: formatDaily(dailyActiveUsers),
          dailyOpenings: formatDaily(dailyOpenings),
          dailyBattles: formatDaily(dailyBattles),
          dailyDeposits: formatDaily(dailyDeposits),
          dailyNewUsers: formatDaily(dailyNewUsers),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

