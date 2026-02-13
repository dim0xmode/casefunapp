import { Request, Response, NextFunction } from 'express';
import { ethers } from 'ethers';
import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { getDynamicOpenRtuPercent } from '../services/rtuPolicyService.js';
import { provider, treasurySigner } from '../services/blockchain.js';
import { resolveBattleDrops } from '../services/battleResolveService.js';

const normalizeParam = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
};

const GAS_LOW_THRESHOLD_ETH = 0.03;

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
    });
    res.json({ status: 'success', data: { users } });
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
          take: 200,
        },
        openings: {
          orderBy: { timestamp: 'desc' },
          take: 200,
        },
        transactions: {
          orderBy: { timestamp: 'desc' },
          take: 200,
        },
        battles: {
          orderBy: { timestamp: 'desc' },
          take: 200,
        },
      },
    });

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    const burntItems = await prisma.inventoryItem.findMany({
      where: { userId: id, status: 'BURNT' },
      orderBy: { createdAt: 'desc' },
      take: 200,
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

    res.json({
      status: 'success',
      data: {
        user,
        burntItems,
        summary: {
          deposits: totals.deposits,
          spent: totals.spent,
          net: totals.deposits - totals.spent,
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

    const adminUser = await prisma.user.findUnique({ where: { id: adminId } });
    if (!adminUser) {
      return next(new AppError('Admin user not found', 404));
    }
    const immutableWallet = process.env.BOOTSTRAP_ADMIN_WALLET || '';
    if (immutableWallet && adminUser.walletAddress.toLowerCase() !== immutableWallet.toLowerCase()) {
      return next(new AppError('Only bootstrap admin can change roles', 403));
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return next(new AppError('User not found', 404));
    }
    if (immutableWallet && target.walletAddress.toLowerCase() === immutableWallet.toLowerCase()) {
      return next(new AppError('Cannot change role for bootstrap admin', 403));
    }

    const user = await prisma.user.update({
      where: { id },
      data: { role },
    });

    await logAdminAction(adminId, 'USER_ROLE_UPDATE', { role }, 'User', id);

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

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return next(new AppError('User not found', 404));
    }
    const immutableWallet = process.env.BOOTSTRAP_ADMIN_WALLET || '';
    if (immutableWallet && target.walletAddress.toLowerCase() === immutableWallet.toLowerCase()) {
      return next(new AppError('Cannot ban bootstrap admin', 403));
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

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return next(new AppError('User not found', 404));
    }
    const immutableWallet = process.env.BOOTSTRAP_ADMIN_WALLET || '';
    if (immutableWallet && target.walletAddress.toLowerCase() === immutableWallet.toLowerCase()) {
      return next(new AppError('Cannot change balance for bootstrap admin', 403));
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
      },
    });
  } catch (error) {
    next(error);
  }
};

