import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { getRarityByValue, RARITY_COLORS } from '../utils/rarity.js';
import { recordRtuEvent } from '../services/rtuService.js';
import { saveImage } from '../utils/upload.js';
import { resolveBattleDrops } from '../services/battleResolveService.js';

const roundToTwo = (value: number) => Number(value.toFixed(2));
const FEEDBACK_TOPICS = ['BUG_REPORT', 'EARLY_ACCESS', 'PARTNERSHIP'] as const;

export const topUpBalance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { amount } = req.body;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      return next(new AppError('Invalid amount', 400));
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { balance: { increment: value } },
    });

    await prisma.transaction.create({
      data: {
        userId,
        type: 'DEPOSIT',
        amount: value,
        currency: 'USDT',
        metadata: { source: 'topup' },
      },
    });

    res.json({ status: 'success', data: { balance: user.balance } });
  } catch (error) {
    next(error);
  }
};

export const upgradeItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const MIN_UPGRADE_CHANCE = 0.1;
    const MAX_UPGRADE_CHANCE = 75;
    const MIN_UPGRADE_MULTIPLIER = 100 / MAX_UPGRADE_CHANCE;
    const userId = (req as any).userId;
    const { itemId, itemIds, multiplier } = req.body;
    const mult = Number(multiplier);
    const requestedIdsRaw = Array.isArray(itemIds)
      ? itemIds
      : itemId
      ? [itemId]
      : [];
    const requestedIds = Array.from(
      new Set(
        requestedIdsRaw
          .map((value: any) => String(value || '').trim())
          .filter(Boolean)
      )
    );
    if (!requestedIds.length || requestedIds.length > 9 || !Number.isFinite(mult) || mult < MIN_UPGRADE_MULTIPLIER) {
      return next(new AppError('Invalid upgrade parameters', 400));
    }

    const items = await prisma.inventoryItem.findMany({
      where: { id: { in: requestedIds }, userId, status: 'ACTIVE' },
    });

    if (items.length !== requestedIds.length) {
      return next(new AppError('Item not found', 404));
    }
    if (!items.length) {
      return next(new AppError('No items selected', 400));
    }
    const baseItem = items[0];
    const sameCurrency = items.every((item) => item.currency === baseItem.currency);
    const sameCase = items.every((item) => item.caseId === baseItem.caseId);
    if (!sameCurrency || !sameCase) {
      return next(new AppError('All selected cards must be from the same token/case', 400));
    }

    if (baseItem.caseId) {
      const caseInfo = await prisma.case.findUnique({
        where: { id: baseItem.caseId },
      });
      if (caseInfo?.openDurationHours && caseInfo.createdAt) {
        const endAt = new Date(caseInfo.createdAt).getTime() + caseInfo.openDurationHours * 60 * 60 * 1000;
        if (Date.now() >= endAt) {
          return next(new AppError('Case expired', 400));
        }
      }
    }

    const rawChance = (1 / mult) * 100;
    if (rawChance > MAX_UPGRADE_CHANCE + 1e-9) {
      return next(new AppError('Upgrade blocked', 400));
    }
    const winChance = Math.min(MAX_UPGRADE_CHANCE, Math.max(MIN_UPGRADE_CHANCE, rawChance));
    const totalBaseValue = items.reduce((sum, item) => sum + Number(item.value || 0), 0);
    const targetValue = roundToTwo(totalBaseValue * mult);

    let reserveToken = 0;
    let neededDelta = Math.max(0, targetValue - totalBaseValue);
    if (baseItem.caseId) {
      const caseInfo = await prisma.case.findUnique({
        where: { id: baseItem.caseId },
      });
      if (caseInfo?.tokenPrice) {
        const tokenSymbol = caseInfo.tokenTicker || caseInfo.currency;
        const ledger = await prisma.rtuLedger.findFirst({
          where: {
            caseId: baseItem.caseId,
            tokenSymbol,
          },
        });
        reserveToken = Math.max(0, Number(ledger?.bufferDebtToken || 0));
      }
    }

    // Surplus-aware chance shaping:
    // - large reserve surplus => noticeably higher chance
    // - low reserve => noticeably lower chance
    const coverage = neededDelta <= 1e-9 ? 1 : reserveToken / neededDelta;
    const surplusBoostFactor = Math.max(0, Math.min(1, (coverage - 1) / 3)); // reserve 1x..4x needed => 0..1
    const deficitPenaltyFactor = Math.max(0, Math.min(1, (1 - coverage) / 1)); // reserve 100%..0% needed => 0..1
    const adjustedWinChance = Math.max(
      MIN_UPGRADE_CHANCE,
      Math.min(
        95,
        winChance + surplusBoostFactor * 24 - deficitPenaltyFactor * 26
      )
    );
    const isSuccess = Math.random() * 100 <= adjustedWinChance;

    const result = await prisma.$transaction(async (tx) => {
      let newItem = null;
      await tx.inventoryItem.updateMany({
        where: { id: { in: requestedIds }, userId, status: 'ACTIVE' },
        data: { status: 'BURNT' },
      });

      if (isSuccess) {
        const rarity = getRarityByValue(targetValue);
        newItem = await tx.inventoryItem.create({
          data: {
            userId,
            caseId: baseItem.caseId,
            name: `${targetValue} ${baseItem.currency}`,
            value: targetValue,
            currency: baseItem.currency,
            rarity,
            color: (RARITY_COLORS as Record<string, string>)[rarity],
            image: baseItem.image || null,
            status: 'ACTIVE',
          },
        });
      }

      await tx.transaction.create({
        data: {
          userId,
          type: 'UPGRADE',
          amount: 0,
          currency: baseItem.currency,
          metadata: {
            itemIds: requestedIds,
            multiplier: mult,
            totalBaseValue,
            targetValue,
            success: isSuccess,
            baseWinChance: winChance,
            adjustedWinChance,
            reserveToken,
            neededDelta,
            reserveCoverage: coverage,
          },
        },
      });

      if (baseItem.caseId) {
        const caseInfo = await tx.case.findUnique({
          where: { id: baseItem.caseId },
        });
        if (caseInfo?.tokenPrice) {
          const deltaToken = isSuccess ? targetValue - totalBaseValue : -totalBaseValue;
          await recordRtuEvent(
            {
              caseId: baseItem.caseId,
              userId,
              tokenSymbol: caseInfo.tokenTicker || caseInfo.currency,
              tokenPriceUsdt: caseInfo.tokenPrice,
              rtuPercent: caseInfo.rtu,
              type: 'UPGRADE',
              deltaSpentUsdt: 0,
              deltaToken,
              metadata: {
                itemIds: requestedIds,
                targetValue,
                totalBaseValue,
                success: isSuccess,
                baseWinChance: winChance,
                adjustedWinChance,
                reserveToken,
                neededDelta,
                reserveCoverage: coverage,
              },
            },
            tx
          );
        }
      }

      return { newItem };
    });

    res.json({
      status: 'success',
      data: {
        success: isSuccess,
        targetValue,
        baseWinChance: winChance,
        adjustedWinChance,
        newItem: result.newItem,
        burntItemIds: requestedIds,
        consumedItemIds: requestedIds,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const rawUsername = String(req.body?.username || '').trim().toUpperCase();
    if (!rawUsername) {
      return next(new AppError('Username is required', 400));
    }
    if (!/^[A-Z0-9_-]{3,20}$/.test(rawUsername)) {
      return next(new AppError('Username must be 3-20 chars (A-Z, 0-9, _ or -)', 400));
    }
    if (rawUsername.startsWith('USER_')) {
      return next(new AppError('Username is reserved', 400));
    }

    const existing = await prisma.user.findFirst({
      where: { username: rawUsername, NOT: { id: userId } },
    });
    if (existing) {
      return next(new AppError('Username is already taken', 400));
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { username: rawUsername },
    });

    res.json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          username: user.username,
          walletAddress: user.walletAddress,
          balance: user.balance,
          role: user.role,
          avatar: user.avatarUrl,
          avatarMeta: user.avatarMeta,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const checkUsernameAvailability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const rawUsername = String(req.query?.username || req.query?.value || '').trim().toUpperCase();
    if (!rawUsername) {
      return res.json({ status: 'success', data: { available: false, reason: 'required' } });
    }
    if (!/^[A-Z0-9_-]{3,20}$/.test(rawUsername)) {
      return res.json({ status: 'success', data: { available: false, reason: 'invalid' } });
    }
    if (rawUsername.startsWith('USER_')) {
      return res.json({ status: 'success', data: { available: false, reason: 'reserved' } });
    }

    const existing = await prisma.user.findFirst({
      where: {
        username: rawUsername,
        NOT: { id: userId },
      },
    });

    res.json({ status: 'success', data: { available: !existing } });
  } catch (error) {
    next(error);
  }
};

export const uploadAvatar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    if (!req.file) {
      return next(new AppError('Avatar file is required', 400));
    }

    let avatarMeta: any = undefined;
    if (req.body?.meta) {
      try {
        avatarMeta = JSON.parse(req.body.meta);
      } catch (error) {
        return next(new AppError('Invalid avatar meta format', 400));
      }
    }

    const avatarUrl = await saveImage(req.file, 'avatar');

    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl, ...(avatarMeta ? { avatarMeta } : {}) },
    });

    res.json({
      status: 'success',
      data: {
        avatarUrl,
        user: {
          id: user.id,
          username: user.username,
          walletAddress: user.walletAddress,
          balance: user.balance,
          role: user.role,
          avatar: user.avatarUrl,
          avatarMeta: user.avatarMeta,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateAvatarMeta = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { meta } = req.body;
    if (!meta || typeof meta !== 'object') {
      return next(new AppError('Avatar meta is required', 400));
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatarMeta: meta },
    });

    res.json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          username: user.username,
          walletAddress: user.walletAddress,
          balance: user.balance,
          role: user.role,
          avatar: user.avatarUrl,
          avatarMeta: user.avatarMeta,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const recordBattle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { result, cost, wonItems, reserveItems, mode, lobbyId } = req.body;
    if (!result || !Number.isFinite(Number(cost))) {
      return next(new AppError('Invalid battle data', 400));
    }

    const wonValue = Array.isArray(wonItems)
      ? wonItems.reduce((sum: number, item: any) => sum + Number(item.value || 0), 0)
      : 0;

    const createdItems: any[] = [];
    await prisma.$transaction(async (tx) => {
      await tx.battle.create({
        data: {
          userId,
          result,
          cost: Number(cost),
          wonValue,
          wonItems: wonItems ?? [],
        },
      });

      if (Array.isArray(wonItems)) {
        for (const item of wonItems) {
          const rarity = item.rarity || getRarityByValue(Number(item.value || 0));
          const created = await tx.inventoryItem.create({
            data: {
              userId,
              caseId: item.caseId ?? null,
              name: item.name || `${item.value} ${item.currency}`,
              value: Number(item.value || 0),
              currency: item.currency,
              rarity,
              color: item.color || (RARITY_COLORS as Record<string, string>)[rarity],
              image: item.image || null,
              status: 'ACTIVE',
            },
          });
          createdItems.push(created);

          if (item.caseId) {
            const caseInfo = await tx.case.findUnique({
              where: { id: item.caseId },
            });
            if (caseInfo?.tokenPrice) {
              await recordRtuEvent(
                {
                  caseId: item.caseId,
                  userId,
                  tokenSymbol: caseInfo.tokenTicker || caseInfo.currency,
                  tokenPriceUsdt: caseInfo.tokenPrice,
                  rtuPercent: caseInfo.rtu,
                  type: 'BATTLE',
                  deltaSpentUsdt: 0,
                  deltaToken: Number(item.value || 0),
                  metadata: { source: 'battle' },
                },
                tx
              );
            }
          }
        }
      }

      // For bot losses we add only user drops to reserve.
      if (Array.isArray(reserveItems) && reserveItems.length > 0) {
        for (const item of reserveItems) {
          if (!item?.caseId) continue;
          const caseInfo = await tx.case.findUnique({
            where: { id: item.caseId },
          });
          if (!caseInfo?.tokenPrice) continue;
          await recordRtuEvent(
            {
              caseId: item.caseId,
              userId,
              tokenSymbol: caseInfo.tokenTicker || caseInfo.currency,
              tokenPriceUsdt: caseInfo.tokenPrice,
              rtuPercent: caseInfo.rtu,
              type: 'BATTLE',
              deltaSpentUsdt: 0,
              deltaToken: -Number(item.value || 0),
              metadata: { source: 'battle_reserve', mode: mode || 'BOT' },
            },
            tx
          );
        }
      }

      if (lobbyId) {
        await tx.battleLobby.updateMany({
          where: { id: String(lobbyId), status: 'OPEN' },
          data: {
            status: 'FINISHED',
            finishedAt: new Date(),
          },
        });
      }
    });

    res.json({ status: 'success', data: { items: createdItems } });
  } catch (error) {
    next(error);
  }
};

export const createBattleLobby = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const caseIdsRaw = Array.isArray(req.body?.caseIds) ? req.body.caseIds : [];
    const caseIds = caseIdsRaw
      .map((value: any) => String(value || '').trim())
      .filter(Boolean)
      .slice(0, 25);

    if (!caseIds.length) {
      return next(new AppError('Select at least one case', 400));
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    const uniqueCaseIds: string[] = Array.from(new Set<string>(caseIds));
    const caseRows = await prisma.case.findMany({
      where: { id: { in: uniqueCaseIds }, isActive: true },
      select: { id: true, price: true, openDurationHours: true, createdAt: true },
    });
    if (caseRows.length !== uniqueCaseIds.length) {
      return next(new AppError('Some cases are not available', 400));
    }
    const caseById = new Map(caseRows.map((row) => [row.id, row]));

    const now = Date.now();
    for (const caseId of caseIds) {
      const row = caseById.get(caseId);
      if (!row) {
        return next(new AppError('Some cases are not available', 400));
      }
      if (row.openDurationHours && row.createdAt) {
        const endAt = new Date(row.createdAt).getTime() + row.openDurationHours * 60 * 60 * 1000;
        if (now >= endAt) {
          return next(new AppError('One or more selected cases are expired', 400));
        }
      }
    }

    const totalCost = caseIds.reduce((sum, caseId) => {
      const row = caseById.get(caseId);
      return sum + Number(row?.price || 0);
    }, 0);
    const lobby = await prisma.battleLobby.create({
      data: {
        hostUserId: userId,
        hostName: user.username,
        caseIds,
        totalCost,
      },
    });

    res.json({ status: 'success', data: { lobby } });
  } catch (error) {
    next(error);
  }
};

export const listBattleLobbies = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lobbies = await prisma.battleLobby.findMany({
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        hostUser: {
          select: {
            avatarUrl: true,
            avatarMeta: true,
          },
        },
        joinerUser: {
          select: {
            avatarUrl: true,
            avatarMeta: true,
          },
        },
      },
    });
    const serialized = lobbies.map((lobby) => ({
      ...lobby,
      hostAvatar: lobby.hostUser?.avatarUrl || null,
      hostAvatarMeta: lobby.hostUser?.avatarMeta || null,
      joinerAvatar: lobby.joinerUser?.avatarUrl || null,
      joinerAvatarMeta: lobby.joinerUser?.avatarMeta || null,
    }));
    res.json({ status: 'success', data: { lobbies: serialized } });
  } catch (error) {
    next(error);
  }
};

export const startBattleLobby = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const lobbyId = String(req.params?.lobbyId || '').trim();
    const mode = String(req.body?.mode || 'PVP').toUpperCase() === 'BOT' ? 'BOT' : 'PVP';
    if (!lobbyId) {
      return next(new AppError('Lobby id is required', 400));
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    const lobby = await prisma.battleLobby.findUnique({ where: { id: lobbyId } });
    if (!lobby) {
      return next(new AppError('Lobby not found', 404));
    }

    if (lobby.status === 'IN_PROGRESS' || lobby.status === 'FINISHED') {
      return res.json({ status: 'success', data: { lobby } });
    }

    let joinerUserId = lobby.joinerUserId || null;
    let joinerName = lobby.joinerName || null;
    if (mode === 'PVP') {
      if (lobby.hostUserId === userId) {
        return next(new AppError('Host cannot start PVP without opponent', 400));
      }
      joinerUserId = userId;
      joinerName = user.username;
    }

    const caseIds = Array.isArray(lobby.caseIds) ? lobby.caseIds.map((v) => String(v || '')) : [];
    if (!caseIds.length) {
      return next(new AppError('Lobby has no cases', 400));
    }
    const resolved = await resolveBattleDrops(caseIds, mode);
    const roundsCanonical = resolved.rounds.map((round) => {
      if (mode === 'PVP') {
        const starterIsHost = lobby.hostUserId === userId;
        return starterIsHost
          ? { ...round, hostDrop: round.userDrop, joinerDrop: round.opponentDrop }
          : { ...round, hostDrop: round.opponentDrop, joinerDrop: round.userDrop };
      }
      // BOT mode: host is always the real player.
      return { ...round, hostDrop: round.userDrop, joinerDrop: round.opponentDrop };
    });

    const updated = await prisma.battleLobby.update({
      where: { id: lobbyId },
      data: {
        joinerUserId,
        joinerName,
        mode,
        roundsJson: roundsCanonical as any,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    });

    res.json({ status: 'success', data: { lobby: updated } });
  } catch (error) {
    next(error);
  }
};

export const joinBattleLobby = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const lobbyId = String(req.params?.lobbyId || '').trim();
    if (!lobbyId) {
      return next(new AppError('Lobby id is required', 400));
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    const lobby = await prisma.battleLobby.findUnique({ where: { id: lobbyId } });
    if (!lobby || lobby.status !== 'OPEN') {
      return next(new AppError('Lobby not found', 404));
    }

    if (lobby.hostUserId === userId) {
      return res.json({ status: 'success', data: { lobby } });
    }

    const updated = await prisma.battleLobby.update({
      where: { id: lobbyId },
      data: {
        joinerUserId: userId,
        joinerName: user.username,
      },
    });

    res.json({ status: 'success', data: { lobby: updated } });
  } catch (error) {
    next(error);
  }
};

export const resolveBattle = async (req: Request, res: Response, next: NextFunction) => {
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
    const resolved = await resolveBattleDrops(caseIds, mode);

    res.json({
      status: 'success',
      data: {
        mode: resolved.mode,
        userDrops: resolved.rounds.map((round) => round.userDrop),
        opponentDrops: resolved.rounds.map((round) => round.opponentDrop),
      },
    });
  } catch (error) {
    next(new AppError((error as Error)?.message || 'Failed to resolve battle', 400));
  }
};

export const finishBattleLobby = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const lobbyId = String(req.params?.lobbyId || '').trim();
    if (!lobbyId) {
      return next(new AppError('Lobby id is required', 400));
    }

    const lobby = await prisma.battleLobby.findUnique({ where: { id: lobbyId } });
    if (!lobby || (lobby.status !== 'OPEN' && lobby.status !== 'IN_PROGRESS')) {
      return next(new AppError('Lobby not found', 404));
    }
    if (lobby.hostUserId !== userId && lobby.joinerUserId !== userId) {
      return next(new AppError('Forbidden', 403));
    }

    const updated = await prisma.battleLobby.update({
      where: { id: lobbyId },
      data: {
        status: 'FINISHED',
        winnerName: req.body?.winnerName ? String(req.body.winnerName) : lobby.winnerName,
        finishedAt: new Date(),
      },
    });
    res.json({ status: 'success', data: { lobby: updated } });
  } catch (error) {
    next(error);
  }
};

export const chargeBattle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { amount } = req.body;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      return next(new AppError('Invalid amount', 400));
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return next(new AppError('User not found', 404));
    }
    if (user.balance < value) {
      return next(new AppError('Insufficient balance', 400));
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { balance: { decrement: value } },
    });

    await prisma.transaction.create({
      data: {
        userId,
        type: 'BATTLE',
        amount: -value,
        currency: 'USDT',
        metadata: { source: 'battle_start' },
      },
    });

    res.json({ status: 'success', data: { balance: updated.balance } });
  } catch (error) {
    next(error);
  }
};

export const createFeedbackMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const topic = String(req.body?.topic || '').trim().toUpperCase();
    const contact = String(req.body?.contact || '').trim();
    const message = String(req.body?.message || '').trim();

    if (!FEEDBACK_TOPICS.includes(topic as any)) {
      return next(new AppError('Invalid feedback topic', 400));
    }
    if (!contact || contact.length < 2 || contact.length > 100) {
      return next(new AppError('Contact is required (2-100 chars)', 400));
    }
    if (!message || message.length > 500) {
      return next(new AppError('Message is required (max 500 chars)', 400));
    }

    const feedback = await prisma.feedbackMessage.create({
      data: {
        userId,
        topic: topic as any,
        contact,
        message,
      },
    });

    res.json({ status: 'success', data: { id: feedback.id } });
  } catch (error) {
    next(error);
  }
};
