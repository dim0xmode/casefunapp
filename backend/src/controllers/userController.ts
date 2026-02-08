import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { getRarityByValue, RARITY_COLORS } from '../utils/rarity.js';
import { recordRtuEvent } from '../services/rtuService.js';
import { saveImage } from '../utils/upload.js';

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
    const userId = (req as any).userId;
    const { itemId, multiplier } = req.body;
    const mult = Number(multiplier);
    if (!itemId || !Number.isFinite(mult) || mult < 1.2) {
      return next(new AppError('Invalid upgrade parameters', 400));
    }

    const item = await prisma.inventoryItem.findFirst({
      where: { id: itemId, userId, status: 'ACTIVE' },
    });

    if (!item) {
      return next(new AppError('Item not found', 404));
    }

    if (item.caseId) {
      const caseInfo = await prisma.case.findUnique({
        where: { id: item.caseId },
      });
      if (caseInfo?.openDurationHours && caseInfo.createdAt) {
        const endAt = new Date(caseInfo.createdAt).getTime() + caseInfo.openDurationHours * 60 * 60 * 1000;
        if (Date.now() >= endAt) {
          return next(new AppError('Case expired', 400));
        }
      }
    }

    const rawChance = (1 / mult) * 100;
    if (rawChance > 90) {
      return next(new AppError('Upgrade blocked', 400));
    }
    const winChance = Math.min(75, Math.max(1, rawChance));
    const targetValue = Math.floor(item.value * mult);
    const isSuccess = Math.random() * 100 <= winChance;

    const result = await prisma.$transaction(async (tx) => {
      let newItem = null;
      if (isSuccess) {
        const rarity = getRarityByValue(targetValue);
        newItem = await tx.inventoryItem.update({
          where: { id: item.id },
          data: {
            name: `${targetValue} ${item.currency}`,
            value: targetValue,
            rarity,
            color: (RARITY_COLORS as Record<string, string>)[rarity],
            status: 'ACTIVE',
          },
        });
      } else {
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { status: 'BURNT' },
        });
      }

      await tx.transaction.create({
        data: {
          userId,
          type: 'UPGRADE',
          amount: 0,
          currency: item.currency,
          metadata: {
            itemId: item.id,
            multiplier: mult,
            targetValue,
            success: isSuccess,
          },
        },
      });

      if (item.caseId) {
        const caseInfo = await tx.case.findUnique({
          where: { id: item.caseId },
        });
        if (caseInfo?.tokenPrice) {
          const deltaToken = isSuccess ? targetValue - item.value : -item.value;
          await recordRtuEvent(
            {
              caseId: item.caseId,
              userId,
              tokenSymbol: caseInfo.tokenTicker || caseInfo.currency,
              tokenPriceUsdt: caseInfo.tokenPrice,
              rtuPercent: caseInfo.rtu,
              type: 'UPGRADE',
              deltaSpentUsdt: 0,
              deltaToken,
              metadata: { itemId: item.id, targetValue, success: isSuccess },
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
        newItem: result.newItem,
        burntItemId: isSuccess ? null : item.id,
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
    const { result, cost, wonItems } = req.body;
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
    });

    res.json({ status: 'success', data: { items: createdItems } });
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
