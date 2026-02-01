import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { getRarityByValue, RARITY_COLORS } from '../utils/rarity.js';
import { recordRtuEvent } from '../services/rtuService.js';

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
        newItem = await tx.inventoryItem.create({
          data: {
            userId,
            caseId: item.caseId,
            name: `${targetValue} ${item.currency}`,
            value: targetValue,
            currency: item.currency,
            rarity,
            color: (RARITY_COLORS as Record<string, string>)[rarity],
            image: item.image || null,
            status: 'ACTIVE',
          },
        });
      }

      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { status: 'BURNT' },
      });

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
        burntItemId: item.id,
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
          await tx.inventoryItem.create({
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

    res.json({ status: 'success' });
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
