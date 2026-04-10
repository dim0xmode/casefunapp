import { Request, Response, NextFunction } from 'express';
import { CaseDrop, RtuLedger } from '@prisma/client';
import prisma from '../config/database.js';
import { recordRtuEvent } from '../services/rtuService.js';
import { deployCaseToken } from '../services/tokenService.js';
import { getDynamicOpenRtuPercent } from '../services/rtuPolicyService.js';
import { saveImage } from '../utils/upload.js';
import { AppError } from '../middleware/errorHandler.js';

const CREATE_CASE_FEE = 1.5;

const normalizeParam = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
};

const getCookieValue = (cookieHeader: string, key: string) => {
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${key}=`))
    ?.split('=')[1];
};

const PUBLIC_CASES_CACHE_TTL_MS = 15_000;
let publicCasesCache:
  | {
      expiresAt: number;
      cases: any[];
    }
  | null = null;

const invalidatePublicCasesCache = () => {
  publicCasesCache = null;
};

const canRequestCaseStats = async (req: Request) => {
  const cookieHeader = String(req.headers.cookie || '');
  const sessionToken = getCookieValue(cookieHeader, 'session');
  if (!sessionToken) return false;

  const session = await prisma.session.findUnique({
    where: { token: sessionToken },
    select: {
      expiresAt: true,
      user: {
        select: { role: true, isBanned: true },
      },
    },
  });

  if (!session || session.expiresAt <= new Date()) return false;
  if (session.user.isBanned) return false;
  return session.user.role === 'ADMIN';
};

const pickByStoredProbabilities = (drops: CaseDrop[]) => {
  const totalProbability = drops.reduce((sum, drop) => sum + Number(drop.probability || 0), 0);
  if (!Number.isFinite(totalProbability) || totalProbability <= 0) {
    return drops[Math.floor(Math.random() * drops.length)];
  }

  const random = Math.random() * totalProbability;
  let cumulativeProbability = 0;
  let selected = drops[drops.length - 1];
  for (const drop of drops) {
    cumulativeProbability += Number(drop.probability || 0);
    if (random <= cumulativeProbability) {
      selected = drop;
      break;
    }
  }
  return selected;
};

const pickDynamicDrop = (
  drops: CaseDrop[],
  params: {
    casePriceUsdt: number;
    declaredRtuPercent: number;
    tokenPriceUsdt: number;
    ledger: RtuLedger | null;
  }
) => {
  if (!drops.length) return null;

  const sortedDrops = [...drops].sort((a, b) => Number(a.value) - Number(b.value));
  const currentSpent = Number(params.ledger?.totalSpentUsdt || 0);
  const currentIssued = Number(params.ledger?.totalTokenIssued || 0);
  const nextSpent = currentSpent + Number(params.casePriceUsdt || 0);
  const openTargetRtu = getDynamicOpenRtuPercent(params.declaredRtuPercent);

  const targetIssuedAfterOpen =
    params.tokenPriceUsdt > 0 ? (nextSpent * (openTargetRtu / 100)) / params.tokenPriceUsdt : 0;
  const declaredAllowedAfterOpen =
    params.tokenPriceUsdt > 0 ? (nextSpent * (params.declaredRtuPercent / 100)) / params.tokenPriceUsdt : 0;

  const idealDrop = Math.max(0, targetIssuedAfterOpen - currentIssued);
  const maxSafeDrop = Math.max(0, declaredAllowedAfterOpen - currentIssued);

  const safeDrops =
    maxSafeDrop > 0
      ? sortedDrops.filter((drop) => Number(drop.value || 0) <= maxSafeDrop + 1e-9)
      : [];
  const candidates =
    safeDrops.length > 0 ? safeDrops : [sortedDrops[0]];

  const shouldBiasLower = currentIssued >= targetIssuedAfterOpen;
  const n = Math.max(1, candidates.length);
  const weights = candidates.map((drop, index) => {
    const value = Number(drop.value || 0);
    const distance = Math.abs(value - idealDrop);
    const base = 1 / (1 + distance);
    const rank = shouldBiasLower ? (n - index) / n : (index + 1) / n;
    return Math.max(1e-6, base * (1 + rank * 1.5));
  });

  const totalWeight = weights.reduce((acc, weight) => acc + weight, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  let random = Math.random() * totalWeight;
  for (let i = 0; i < candidates.length; i += 1) {
    random -= weights[i];
    if (random <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
};

export const getAllCases = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const includeStatsRequested = normalizeParam(req.query.includeStats as any) === '1';
    const includeStats = includeStatsRequested ? await canRequestCaseStats(req) : false;

    if (!includeStats && publicCasesCache && publicCasesCache.expiresAt > Date.now()) {
      return res.json({
        status: 'success',
        data: { cases: publicCasesCache.cases },
      });
    }

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

    if (!includeStats) {
      publicCasesCache = {
        expiresAt: Date.now() + PUBLIC_CASES_CACHE_TTL_MS,
        cases: casesWithStats,
      };
    }

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
      return next(new AppError('Invalid RTU. Must be between 0.01 and 98.', 400));
    }

    const tokenPriceValue = tokenPrice === undefined || tokenPrice === null ? undefined : Number(tokenPrice);
    if (tokenPriceValue !== undefined && (!Number.isFinite(tokenPriceValue) || tokenPriceValue <= 0)) {
      return next(new AppError('Invalid token price', 400));
    }
    if (tokenPriceValue === undefined) {
      return next(new AppError('Token price is required for RTU calculation', 400));
    }
    if (!Array.isArray(drops) || drops.length === 0) {
      return next(new AppError('At least one drop is required', 400));
    }

    const preparedDrops = drops.map((drop: any) => ({
      name: String(drop.name || '').trim() || 'Reward',
      value: Number(drop.value || 0),
      currency: String(drop.currency || normalizedTicker).trim().toUpperCase(),
      rarity: String(drop.rarity || 'COMMON').trim().toUpperCase(),
      color: String(drop.color || '#9CA3AF').trim(),
      image: drop.image || null,
    }));

    const minAllowed = priceValue * 0.5;
    const maxAllowed = priceValue * 15;
    const minDrop = Math.min(...preparedDrops.map((drop) => Number(drop.value || 0)));
    const maxDrop = Math.max(...preparedDrops.map((drop) => Number(drop.value || 0)));

    if (minDrop > minAllowed) {
      return next(
        new AppError(
          `Minimum drop is too high. Min drop must be <= ${minAllowed.toFixed(4)} tokens.`,
          400
        )
      );
    }
    if (maxDrop < maxAllowed) {
      return next(
        new AppError(
          `Maximum drop is too low. Max drop should be >= ${maxAllowed.toFixed(4)} tokens.`,
          400
        )
      );
    }

    const equalProbability = 100 / preparedDrops.length;

    const existing = await prisma.case.findFirst({
      where: {
        name: normalizedName,
      },
    });

    if (existing) {
      return next(new AppError('Case name already exists', 400));
    }

    const existingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!existingUser) {
      return next(new AppError('User not found', 404));
    }
    if (existingUser.balance < CREATE_CASE_FEE) {
      return next(new AppError('Insufficient balance', 400));
    }

    const tokenAddress = await deployCaseToken(normalizedName, normalizedTicker);

    const newCase = await prisma.$transaction(async (tx) => {
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
          tokenAddress,
          createdById: userId,
          drops: {
            create: preparedDrops.map((drop) => ({
              name: drop.name,
              value: drop.value,
              currency: drop.currency,
              rarity: drop.rarity,
              probability: equalProbability,
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
    invalidatePublicCasesCache();

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

    if (!caseItem.drops.length) {
      return next(new AppError('Case has no drops', 400));
    }

    // Create transaction and update user balance
    let createdItem: any = null;
    let wonDrop: CaseDrop = caseItem.drops[caseItem.drops.length - 1];
    await prisma.$transaction(async (tx) => {
      const tokenSymbol = caseItem.tokenTicker || caseItem.currency;
      const ledger = caseItem.tokenPrice
        ? await tx.rtuLedger.findFirst({
            where: { caseId: caseId, tokenSymbol },
          })
        : null;

      const dynamicDrop =
        caseItem.tokenPrice && caseItem.tokenPrice > 0
          ? pickDynamicDrop(caseItem.drops, {
              casePriceUsdt: Number(caseItem.price || 0),
              declaredRtuPercent: Number(caseItem.rtu || 0),
              tokenPriceUsdt: Number(caseItem.tokenPrice || 0),
              ledger,
            })
          : null;

      wonDrop = dynamicDrop || pickByStoredProbabilities(caseItem.drops);

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

export const getActivityFeed = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const sinceParam = req.query.since as string | undefined;
    const defaultWindow = 2 * 60 * 1000;
    const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - defaultWindow);
    if (isNaN(since.getTime())) {
      return res.json({ status: 'success', data: { events: [] } });
    }

    const limit = 8;

    const [openings, battles, newCases, upgrades] = await Promise.all([
      prisma.caseOpening.findMany({
        where: { timestamp: { gt: since } },
        orderBy: { timestamp: 'desc' },
        take: limit,
        select: {
          id: true,
          wonValue: true,
          timestamp: true,
          user: { select: { username: true, avatarUrl: true, avatarMeta: true } },
          case: {
            select: {
              name: true,
              currency: true,
              tokenTicker: true,
              tokenPrice: true,
              imageUrl: true,
              imageMeta: true,
            },
          },
        },
      }),
      prisma.battle.findMany({
        where: { timestamp: { gt: since } },
        orderBy: { timestamp: 'desc' },
        take: limit,
        select: {
          id: true,
          result: true,
          wonValue: true,
          cost: true,
          timestamp: true,
          user: { select: { username: true, avatarUrl: true, avatarMeta: true } },
        },
      }),
      prisma.case.findMany({
        where: { createdAt: { gt: since } },
        orderBy: { createdAt: 'desc' },
        take: 4,
        select: {
          id: true,
          name: true,
          currency: true,
          tokenTicker: true,
          price: true,
          imageUrl: true,
          imageMeta: true,
          createdAt: true,
          createdBy: { select: { username: true, avatarUrl: true, avatarMeta: true } },
        },
      }),
      prisma.rtuEvent.findMany({
        where: { createdAt: { gt: since }, type: 'UPGRADE' },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          deltaToken: true,
          createdAt: true,
          metadata: true,
          user: { select: { username: true, avatarUrl: true, avatarMeta: true } },
          case: {
            select: {
              name: true,
              currency: true,
              tokenTicker: true,
              imageUrl: true,
              imageMeta: true,
            },
          },
        },
      }),
    ]);

    const events: any[] = [];

    for (const o of openings) {
      events.push({
        id: `open-${o.id}`,
        type: 'CASE_OPEN',
        user: o.user.username || 'Anon',
        avatar: o.user.avatarUrl || null,
        avatarMeta: o.user.avatarMeta || null,
        caseName: o.case.name,
        value: o.wonValue,
        currency: o.case.tokenTicker || o.case.currency,
        image: o.case.imageUrl,
        imageMeta: o.case.imageMeta,
        timestamp: o.timestamp,
      });
    }

    for (const b of battles) {
      events.push({
        id: `battle-${b.id}`,
        type: b.result === 'WIN' ? 'BATTLE_WIN' : 'BATTLE_LOSS',
        user: b.user.username || 'Anon',
        avatar: b.user.avatarUrl || null,
        avatarMeta: b.user.avatarMeta || null,
        value: b.wonValue,
        cost: b.cost,
        timestamp: b.timestamp,
      });
    }

    for (const c of newCases) {
      events.push({
        id: `case-${c.id}`,
        type: 'CASE_CREATE',
        user: c.createdBy.username || 'Anon',
        avatar: c.createdBy.avatarUrl || null,
        avatarMeta: c.createdBy.avatarMeta || null,
        caseName: c.name,
        currency: c.tokenTicker || c.currency,
        value: c.price,
        image: c.imageUrl,
        imageMeta: c.imageMeta,
        timestamp: c.createdAt,
      });
    }

    for (const u of upgrades) {
      if (!u.user) continue;
      const meta = u.metadata as any;
      const won = u.deltaToken > 0;
      events.push({
        id: `upgrade-${u.id}`,
        type: won ? 'UPGRADE_SUCCESS' : 'UPGRADE_FAIL',
        user: u.user.username || 'Anon',
        avatar: u.user.avatarUrl || null,
        avatarMeta: u.user.avatarMeta || null,
        caseName: u.case?.name || meta?.caseName || '',
        currency: u.case?.tokenTicker || u.case?.currency || meta?.currency || '',
        value: Math.abs(u.deltaToken),
        image: u.case?.imageUrl || null,
        imageMeta: u.case?.imageMeta || null,
        timestamp: u.createdAt,
      });
    }

    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({ status: 'success', data: { events: events.slice(0, 15) } });
  } catch (error) {
    next(error);
  }
};
