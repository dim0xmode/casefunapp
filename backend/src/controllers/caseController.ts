import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { recordRtuEvent } from '../services/rtuService.js';
import { saveImage } from '../utils/upload.js';

const CREATE_CASE_FEE = 1.5;
import { AppError } from '../middleware/errorHandler.js';

const normalizeParam = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
};

export const getAllCases = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const includeStats = normalizeParam(req.query.includeStats as any) === '1';
    const cases = await prisma.case.findMany({
      where: { isActive: true },
      include: {
        drops: true,
        createdBy: { select: { username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const casesWithStats = includeStats
      ? await Promise.all(
          cases.map(async (caseItem) => {
            const openingsAgg = await prisma.caseOpening.aggregate({
              where: { caseId: caseItem.id },
              _count: { _all: true },
              _sum: { wonValue: true },
            });

            const totalOpenings = openingsAgg._count._all;
            const totalTokenFromOpens = openingsAgg._sum.wonValue ?? 0;
            const totalSpentUsdt = totalOpenings * Number(caseItem.price || 0);

            const [upgradeAgg, battleAgg] = await Promise.all([
              prisma.rtuEvent.aggregate({
                where: { caseId: caseItem.id, type: 'UPGRADE' },
                _count: { _all: true },
                _sum: { deltaToken: true },
              }),
              prisma.rtuEvent.aggregate({
                where: { caseId: caseItem.id, type: 'BATTLE' },
                _count: { _all: true },
                _sum: { deltaToken: true },
              }),
            ]);

            const totalTokenFromUpgrades = upgradeAgg._sum.deltaToken ?? 0;
            const totalTokenFromBattles = battleAgg._sum.deltaToken ?? 0;
            const totalTokenIssued =
              totalTokenFromOpens + totalTokenFromBattles + Math.max(0, totalTokenFromUpgrades);

            const actualRtu =
              totalSpentUsdt > 0 && Number(caseItem.tokenPrice || 0) > 0
                ? (totalTokenIssued * Number(caseItem.tokenPrice || 0)) / totalSpentUsdt * 100
                : null;

            const holders = await prisma.inventoryItem.groupBy({
              by: ['userId'],
              where: { caseId: caseItem.id, status: 'ACTIVE' },
              _sum: { value: true },
              orderBy: { _sum: { value: 'desc' } },
              take: 3,
            });

            const holderUsers = holders.length
              ? await prisma.user.findMany({
                  where: { id: { in: holders.map((holder) => holder.userId) } },
                  select: { id: true, username: true },
                })
              : [];

            const topHolders = holders.map((holder) => {
              const user = holderUsers.find((entry) => entry.id === holder.userId);
              return {
                userId: holder.userId,
                username: user?.username || 'Unknown',
                total: Number(holder._sum.value || 0),
              };
            });

            return {
              ...caseItem,
              stats: {
                totalOpenings,
                totalSpentUsdt,
                totalTokenFromOpens,
                totalTokenFromUpgrades,
                totalTokenFromBattles,
                totalTokenIssued,
                upgradesUsed: upgradeAgg._count._all,
                battlesUsed: battleAgg._count._all,
                actualRtu,
                topHolders,
              },
            };
          })
        )
      : cases;

    res.json({
      status: 'success',
      data: { cases: casesWithStats },
    });
  } catch (error) {
    next(error);
  }
};

export const getCaseById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = normalizeParam(req.params.id);
    if (!id) {
      return next(new AppError('Case id is required', 400));
    }

    const caseItem = await prisma.case.findUnique({
      where: { id },
      include: {
        drops: true,
        createdBy: { select: { username: true } },
      },
    });

    if (!caseItem) {
      return next(new AppError('Case not found', 404));
    }

    res.json({
      status: 'success',
      data: { case: caseItem },
    });
  } catch (error) {
    next(error);
  }
};

export const createCase = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).userId;
    const {
      name,
      currency,
      tokenTicker,
      tokenPrice,
      price,
      rtu,
      imageUrl,
      imageMeta,
      openDurationHours,
      drops,
    } = req.body;

    if (!name || !currency || !price || !drops || drops.length === 0) {
      return next(new AppError('Missing required fields', 400));
    }

    const normalizedName = String(name).trim().toUpperCase();
    const normalizedCurrency = String(currency).trim().toUpperCase();
    const normalizedTicker = String(tokenTicker || currency).trim().toUpperCase();

    if (!/^[A-Z][A-Z0-9 ]*$/.test(normalizedName)) {
      return next(new AppError('Invalid case name', 400));
    }
    if (!/^[A-Z]+$/.test(normalizedTicker)) {
      return next(new AppError('Invalid token ticker', 400));
    }

    const priceValue = Number(price);
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      return next(new AppError('Invalid open price', 400));
    }

    const rtuValue = rtu === undefined || rtu === null ? 96 : Number(rtu);
    if (!Number.isFinite(rtuValue) || rtuValue <= 0 || rtuValue > 98) {
      return next(new AppError('Invalid RTU', 400));
    }

    const tokenPriceValue = tokenPrice === undefined || tokenPrice === null ? undefined : Number(tokenPrice);
    if (tokenPriceValue !== undefined && (!Number.isFinite(tokenPriceValue) || tokenPriceValue <= 0)) {
      return next(new AppError('Invalid token price', 400));
    }

    const existing = await prisma.case.findFirst({
      where: {
        OR: [
          { name: normalizedName },
          { name: normalizedTicker },
          { currency: normalizedTicker },
          { tokenTicker: normalizedTicker },
          { currency: normalizedName },
          { tokenTicker: normalizedName },
        ],
      },
    });

    if (existing) {
      return next(new AppError('Case name or token ticker already exists', 400));
    }

    const newCase = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new AppError('User not found', 404);
      }
      if (user.balance < CREATE_CASE_FEE) {
        throw new AppError('Insufficient balance', 400);
      }

      await tx.user.update({
        where: { id: userId },
        data: { balance: { decrement: CREATE_CASE_FEE } },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: 'CASE_CREATE',
          amount: -CREATE_CASE_FEE,
          currency: 'USDT',
          metadata: { name, tokenTicker },
        },
      });

      return tx.case.create({
        data: {
          name: normalizedName,
          currency: normalizedCurrency,
          tokenTicker: normalizedTicker,
          tokenPrice: tokenPriceValue,
          price: priceValue,
          rtu: rtuValue,
          imageUrl,
          imageMeta,
          openDurationHours,
          createdById: userId,
          drops: {
            create: drops.map((drop: any) => ({
              name: drop.name,
              value: drop.value,
              currency: drop.currency,
              rarity: drop.rarity,
              probability: drop.probability,
              color: drop.color,
              image: drop.image || null,
            })),
          },
        },
        include: {
          drops: true,
          createdBy: { select: { username: true } },
        },
      });
    });

    const updatedUser = await prisma.user.findUnique({ where: { id: userId } });

    res.status(201).json({
      status: 'success',
      data: { case: newCase, balance: updatedUser?.balance ?? 0 },
    });
  } catch (error) {
    next(error);
  }
};

export const openCase = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).userId;
    const caseId = normalizeParam(req.params.caseId);
    if (!caseId) {
      return next(new AppError('Case id is required', 400));
    }

    // Get case with drops
    const caseItem = await prisma.case.findUnique({
      where: { id: caseId },
      include: { drops: true },
    });

    if (!caseItem) {
      return next(new AppError('Case not found', 404));
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    // Check balance
    if (user.balance < caseItem.price) {
      return next(new AppError('Insufficient balance', 400));
    }

    // Calculate winning drop based on probabilities
    const random = Math.random() * 100;
    let cumulativeProbability = 0;
    let wonDrop = caseItem.drops[0];

    for (const drop of caseItem.drops) {
      cumulativeProbability += drop.probability;
      if (random <= cumulativeProbability) {
        wonDrop = drop;
        break;
      }
    }

    // Create transaction and update user balance
    let createdItem: any = null;
    await prisma.$transaction(async (tx) => {
      // Deduct case price
      await tx.user.update({
        where: { id: userId },
        data: { balance: { decrement: caseItem.price } },
      });

      // Add won item to inventory
      createdItem = await tx.inventoryItem.create({
        data: {
          userId,
          caseId: caseItem.id,
          name: wonDrop.name,
          value: wonDrop.value,
          currency: wonDrop.currency,
          rarity: wonDrop.rarity,
          color: wonDrop.color,
          image: wonDrop.image || null,
          status: 'ACTIVE',
        },
      });

      // Record case opening
      await tx.caseOpening.create({
        data: {
          userId,
          caseId,
          wonDropId: wonDrop.id,
          wonValue: wonDrop.value,
        },
      });

      // Record transaction
      await tx.transaction.create({
        data: {
          userId,
          type: 'CASE_OPEN',
          amount: -caseItem.price,
          currency: 'USDT',
          metadata: {
            caseId,
            caseName: caseItem.name,
            wonDropId: wonDrop.id,
            wonValue: wonDrop.value,
          },
        },
      });

      const tokenSymbol = caseItem.tokenTicker || caseItem.currency;
      if (caseItem.tokenPrice) {
        await recordRtuEvent(
          {
            caseId,
            userId,
            tokenSymbol,
            tokenPriceUsdt: caseItem.tokenPrice,
            rtuPercent: caseItem.rtu,
            type: 'OPEN',
            deltaSpentUsdt: caseItem.price,
            deltaToken: wonDrop.value,
            metadata: {
              wonDropId: wonDrop.id,
              wonValue: wonDrop.value,
            },
          },
          tx
        );
      }
    });

    const updatedUser = await prisma.user.findUnique({ where: { id: userId } });

    res.json({
      status: 'success',
      data: {
        wonDrop: {
          id: createdItem?.id || wonDrop.id,
          name: createdItem?.name || wonDrop.name,
          value: createdItem?.value || wonDrop.value,
          currency: createdItem?.currency || wonDrop.currency,
          rarity: createdItem?.rarity || wonDrop.rarity,
          color: createdItem?.color || wonDrop.color,
          image: createdItem?.image || wonDrop.image || '',
          caseId: createdItem?.caseId || caseItem.id,
        },
        balance: updatedUser?.balance ?? 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const uploadCaseImage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.file) {
      return next(new AppError('Image file is required', 400));
    }

    const imageUrl = await saveImage(req.file, 'case');

    res.json({
      status: 'success',
      data: { imageUrl },
    });
  } catch (error) {
    next(error);
  }
};
