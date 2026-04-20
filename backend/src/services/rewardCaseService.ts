import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import type {
  Prisma,
  RewardCase,
  RewardCaseCurrency,
  RewardCaseStatus,
  RewardDropKind,
} from '@prisma/client';

export const TEST_CURRENCIES = new Set<RewardCaseCurrency>(['TEST_CFP', 'TEST_USDT']);
export const TEST_DROP_KINDS = new Set<RewardDropKind>([
  'TEST_USDT',
  'TEST_CFT',
  'TEST_NFT',
]);
export const NFT_KINDS = new Set<RewardDropKind>(['NFT', 'TEST_NFT']);

export const isTestCurrency = (c: RewardCaseCurrency): boolean => TEST_CURRENCIES.has(c);
export const isTestDrop = (k: RewardDropKind): boolean => TEST_DROP_KINDS.has(k);
export const isNftDrop = (k: RewardDropKind): boolean => NFT_KINDS.has(k);

// Status auto-transition evaluator. Pure: returns the status the case SHOULD
// be in given time/limits. `COMPLETED` is terminal and never changed here.
export const evaluateAutoStatus = (
  current: RewardCase,
  now: Date = new Date()
): RewardCaseStatus => {
  if (current.status === 'COMPLETED' || current.status === 'DRAFT') return current.status;

  const nowMs = now.getTime();
  const limitExhausted =
    current.limitMode !== 'NONE' &&
    current.limitRemaining !== null &&
    Number(current.limitRemaining) <= 0;

  if (limitExhausted) return 'PAUSED';
  if (current.endAt && current.endAt.getTime() <= nowMs) return 'PAUSED';

  if (current.status === 'SCHEDULED') {
    if (current.startAt && current.startAt.getTime() <= nowMs) return 'ACTIVE';
    return 'SCHEDULED';
  }
  // PAUSED stays PAUSED until manual resume. ACTIVE stays ACTIVE.
  return current.status;
};

export const applyAutoStatus = async (caseId: string): Promise<RewardCase | null> => {
  const current = await prisma.rewardCase.findUnique({ where: { id: caseId } });
  if (!current) return null;
  const desired = evaluateAutoStatus(current);
  if (desired === current.status) return current;
  return prisma.rewardCase.update({
    where: { id: caseId },
    data: { status: desired },
  });
};

// Pick a drop index using provided probabilities. Returns array index.
export const pickDropIndex = (probs: number[]): number => {
  const total = probs.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let r = Math.random() * total;
  for (let i = 0; i < probs.length; i += 1) {
    r -= probs[i];
    if (r <= 0) return i;
  }
  return probs.length - 1;
};

// Compute effective unit price when a user opens/buys `count` units, given the
// current case status. During SCHEDULED the pre-price applies (if set), during
// ACTIVE the regular open price applies.
export const unitPriceFor = (
  c: Pick<RewardCase, 'status' | 'openPrice' | 'prePrice'>
): number => {
  if (c.status === 'SCHEDULED' && c.prePrice != null) return Number(c.prePrice);
  return Number(c.openPrice);
};

export const serializePublicCase = (c: any) => {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    imageUrl: c.imageUrl,
    imageMeta: c.imageMeta,
    status: c.status,
    openCurrency: c.openCurrency,
    openPrice: c.openPrice,
    prePrice: c.prePrice,
    chain: c.chain,
    startAt: c.startAt,
    endAt: c.endAt,
    limitMode: c.limitMode,
    limitTotal: c.limitTotal,
    limitRemaining: c.limitRemaining,
    totalOpens: c.totalOpens,
    drops: (c.drops || [])
      .slice()
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((d: any) => ({
        id: d.id,
        kind: d.kind,
        name: d.name,
        amount: d.amount,
        probability: d.probability,
        rarity: d.rarity,
        color: d.color,
        image: d.image,
        nftChain: d.nftChain,
        nftContract: d.nftContract,
      })),
  };
};

type OpenCaseArgs = {
  userId: string;
  caseId: string;
  count: number;
};

export type OpenResult = {
  drops: Array<{
    dropId: string;
    kind: RewardDropKind;
    name: string;
    amount: number;
    rarity: string;
    color: string;
    image: string | null;
    isTest: boolean;
  }>;
  usedPrePurchase: number;
  paidUnits: number;
  pricePaid: number;
  currency: RewardCaseCurrency;
};

// Core: open N units of a reward case for a user. Handles:
//  - pre-purchase credit consumption first, then balance debit
//  - per-drop limit accounting (BY_DROP / BY_OPENS)
//  - auto-pause when limit budget is exhausted mid-batch (in which case we
//    partially fulfill and return what was actually opened)
//  - creation of RewardCaseOpening rows + stack/nft updates + transactions
export const openRewardCase = async ({
  userId,
  caseId,
  count,
}: OpenCaseArgs): Promise<OpenResult> => {
  if (!Number.isFinite(count) || count <= 0) {
    throw new AppError('count must be a positive integer', 400);
  }
  if (count > 25) throw new AppError('Max 25 opens per request', 400);

  return prisma.$transaction(async (tx) => {
    const caseRow = await tx.rewardCase.findUnique({
      where: { id: caseId },
      include: { drops: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!caseRow) throw new AppError('Reward case not found', 404);

    // Auto-advance status when necessary before acting on the case.
    const desired = evaluateAutoStatus(caseRow);
    if (desired !== caseRow.status) {
      await tx.rewardCase.update({ where: { id: caseId }, data: { status: desired } });
      caseRow.status = desired;
    }

    if (caseRow.status !== 'ACTIVE') {
      throw new AppError(`Case is ${caseRow.status}, cannot open right now`, 400);
    }
    if (!caseRow.drops.length) throw new AppError('Case has no drops configured', 400);

    const isTestCase = isTestCurrency(caseRow.openCurrency);
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);

    // Consume pre-purchase first
    const prePurchase = await tx.rewardPrePurchase.findUnique({
      where: { userId_caseId: { userId, caseId } },
    });
    let usedPre = Math.min(prePurchase?.remaining ?? 0, count);
    const toPay = count - usedPre;

    const unitPrice = unitPriceFor(caseRow);
    const paidTotal = toPay * unitPrice;

    if (!isTestCase && paidTotal > 0 && user.balance < paidTotal) {
      throw new AppError(
        `Insufficient balance. Need ${paidTotal.toFixed(4)} ${caseRow.openCurrency}, have ${user.balance.toFixed(4)}.`,
        400
      );
    }

    // Debit balance upfront (only for real currencies); refund handled below if partial.
    if (!isTestCase && paidTotal > 0) {
      await tx.user.update({
        where: { id: userId },
        data: { balance: { decrement: paidTotal } },
      });
    }
    if (usedPre > 0 && prePurchase) {
      await tx.rewardPrePurchase.update({
        where: { id: prePurchase.id },
        data: { remaining: { decrement: usedPre } },
      });
    }

    const probs = caseRow.drops.map((d) => Number(d.probability));
    const drops: OpenResult['drops'] = [];
    let completedUnits = 0;
    let limitRemaining =
      caseRow.limitMode === 'NONE' || caseRow.limitRemaining == null
        ? null
        : Number(caseRow.limitRemaining);
    let paidUnits = toPay;

    for (let u = 0; u < count; u += 1) {
      if (caseRow.limitMode === 'BY_OPENS' && limitRemaining !== null && limitRemaining <= 0) break;
      // Pre-check for BY_DROP: any affordable drop left?
      if (caseRow.limitMode === 'BY_DROP' && limitRemaining !== null) {
        // If the minimum-cost drop exceeds remaining, nothing more can drop.
        const minCost = Math.min(...caseRow.drops.map((d) => Number(d.amount)));
        if (limitRemaining < minCost) break;
      }

      const idx = pickDropIndex(probs);
      const drop = caseRow.drops[idx];
      const dropAmount = Number(drop.amount);
      const isTestDropNow = isTestDrop(drop.kind);

      // Deduct from limit budget
      if (limitRemaining !== null) {
        if (caseRow.limitMode === 'BY_OPENS') {
          limitRemaining -= 1;
        } else if (caseRow.limitMode === 'BY_DROP') {
          limitRemaining -= dropAmount;
        }
      }

      // Record opening
      const isPreUnit = u < usedPre;
      await tx.rewardCaseOpening.create({
        data: {
          userId,
          caseId,
          dropId: drop.id,
          usedPrePurchase: isPreUnit,
          pricePaid: isPreUnit ? 0 : unitPrice,
          currency: caseRow.openCurrency,
          dropKind: drop.kind,
          dropAmount,
        },
      });

      // Persist drop for user: stack (fungible) or NFT item (1:1)
      if (isNftDrop(drop.kind)) {
        await tx.rewardNftItem.create({
          data: {
            userId,
            caseId,
            dropId: drop.id,
            kind: drop.kind,
            name: drop.name,
            image: drop.image,
            rarity: drop.rarity,
            color: drop.color,
            chain: drop.nftChain || caseRow.chain,
            contractAddress: drop.nftContract,
            metadata: drop.nftMetadata ?? undefined,
          },
        });
      } else {
        await tx.rewardStack.upsert({
          where: { userId_caseId_kind: { userId, caseId, kind: drop.kind } },
          create: {
            userId,
            caseId,
            kind: drop.kind,
            amount: dropAmount,
            lastDropAt: new Date(),
          },
          update: {
            amount: { increment: dropAmount },
            lastDropAt: new Date(),
          },
        });
      }

      drops.push({
        dropId: drop.id,
        kind: drop.kind,
        name: drop.name,
        amount: dropAmount,
        rarity: drop.rarity,
        color: drop.color,
        image: drop.image,
        isTest: isTestDropNow,
      });
      completedUnits += 1;
    }

    // If we fell short due to limit exhaustion, refund the unused portion.
    if (completedUnits < count) {
      const shortfall = count - completedUnits;
      // Split shortfall between pre-purchase vs paid — refund pre first.
      const preShortfall = Math.max(0, Math.min(shortfall, usedPre - drops.filter((_, i) => i < usedPre).length));
      const paidShortfall = shortfall - preShortfall;
      if (preShortfall > 0 && prePurchase) {
        await tx.rewardPrePurchase.update({
          where: { id: prePurchase.id },
          data: { remaining: { increment: preShortfall } },
        });
        usedPre -= preShortfall;
      }
      if (paidShortfall > 0 && !isTestCase) {
        await tx.user.update({
          where: { id: userId },
          data: { balance: { increment: paidShortfall * unitPrice } },
        });
        paidUnits -= paidShortfall;
      } else if (paidShortfall > 0 && isTestCase) {
        paidUnits -= paidShortfall;
      }
    }

    // Persist counters + limit update + possible auto-pause
    const autoPauseNow =
      limitRemaining !== null && limitRemaining <= 0 && caseRow.status === 'ACTIVE';
    await tx.rewardCase.update({
      where: { id: caseId },
      data: {
        totalOpens: { increment: completedUnits },
        limitRemaining: limitRemaining === null ? null : limitRemaining,
        status: autoPauseNow ? 'PAUSED' : caseRow.status,
      },
    });

    if (!isTestCase && paidUnits > 0) {
      await tx.transaction.create({
        data: {
          userId,
          type: 'REWARD_CASE_OPEN',
          amount: -(paidUnits * unitPrice),
          currency: caseRow.openCurrency === 'USDT' ? 'USDT' : 'CFP',
          status: 'completed',
          metadata: {
            caseId,
            caseName: caseRow.name,
            units: paidUnits,
            unitPrice,
            usedPrePurchase: usedPre,
          },
        },
      });
    }

    return {
      drops,
      usedPrePurchase: usedPre,
      paidUnits,
      pricePaid: paidUnits * unitPrice,
      currency: caseRow.openCurrency,
    };
  });
};

type PrePurchaseArgs = {
  userId: string;
  caseId: string;
  count: number;
};

export const prePurchaseRewardCase = async ({
  userId,
  caseId,
  count,
}: PrePurchaseArgs) => {
  if (!Number.isFinite(count) || count <= 0 || !Number.isInteger(count)) {
    throw new AppError('count must be a positive integer', 400);
  }
  if (count > 100) throw new AppError('Max 100 pre-purchase units per request', 400);

  return prisma.$transaction(async (tx) => {
    const caseRow = await tx.rewardCase.findUnique({ where: { id: caseId } });
    if (!caseRow) throw new AppError('Reward case not found', 404);
    if (caseRow.status !== 'SCHEDULED' && caseRow.status !== 'ACTIVE') {
      throw new AppError(
        `Pre-purchase only allowed in SCHEDULED or ACTIVE status (current: ${caseRow.status})`,
        400
      );
    }

    const isTestCase = isTestCurrency(caseRow.openCurrency);
    const unitPrice = unitPriceFor(caseRow);
    const totalCost = unitPrice * count;

    if (!isTestCase) {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError('User not found', 404);
      if (user.balance < totalCost) {
        throw new AppError(
          `Insufficient balance. Need ${totalCost.toFixed(4)} ${caseRow.openCurrency}, have ${user.balance.toFixed(4)}.`,
          400
        );
      }
      await tx.user.update({
        where: { id: userId },
        data: { balance: { decrement: totalCost } },
      });
      await tx.transaction.create({
        data: {
          userId,
          type: 'REWARD_CASE_PRE',
          amount: -totalCost,
          currency: caseRow.openCurrency === 'USDT' ? 'USDT' : 'CFP',
          status: 'completed',
          metadata: { caseId, caseName: caseRow.name, units: count, unitPrice },
        },
      });
    }

    const pp = await tx.rewardPrePurchase.upsert({
      where: { userId_caseId: { userId, caseId } },
      create: {
        userId,
        caseId,
        remaining: count,
        totalBought: count,
        pricePaid: unitPrice,
        currency: caseRow.openCurrency,
      },
      update: {
        remaining: { increment: count },
        totalBought: { increment: count },
        // Keep the price from the MOST RECENT purchase for display purposes.
        pricePaid: unitPrice,
      },
    });

    await tx.rewardCase.update({
      where: { id: caseId },
      data: { totalPrePurchased: { increment: count } },
    });

    return {
      remaining: pp.remaining,
      totalBought: pp.totalBought,
      unitPrice,
      totalCost: isTestCase ? 0 : totalCost,
      isTest: isTestCase,
    };
  });
};

type PublicListOpts = {
  userId?: string | null;
};

export const listPublicRewardCases = async (opts: PublicListOpts = {}) => {
  // Quick maintenance pass: auto-transition cases whose time-window or limits
  // have moved them out of ACTIVE/SCHEDULED. Best-effort, not blocking.
  try {
    const candidates = await prisma.rewardCase.findMany({
      where: {
        status: { in: ['SCHEDULED', 'ACTIVE'] },
      },
      select: {
        id: true,
        status: true,
        startAt: true,
        endAt: true,
        limitMode: true,
        limitRemaining: true,
      },
    });
    for (const c of candidates) {
      const desired = evaluateAutoStatus(c as any);
      if (desired !== c.status) {
        await prisma.rewardCase.update({ where: { id: c.id }, data: { status: desired } });
      }
    }
  } catch (err) {
    console.error('[rewardCase] auto-transition sweep failed', err);
  }

  const where: Prisma.RewardCaseWhereInput = {
    status: { in: ['SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED'] },
  };
  const cases = await prisma.rewardCase.findMany({
    where,
    include: {
      drops: true,
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });

  const result = cases.map((c) => serializePublicCase(c));

  if (opts.userId) {
    const prePurchases = await prisma.rewardPrePurchase.findMany({
      where: { userId: opts.userId, caseId: { in: cases.map((c) => c.id) } },
    });
    const ppMap = new Map(prePurchases.map((p) => [p.caseId, p]));
    for (const item of result) {
      const pp = ppMap.get(item.id);
      (item as any).userPrePurchase = pp
        ? { remaining: pp.remaining, totalBought: pp.totalBought }
        : { remaining: 0, totalBought: 0 };
    }
  }

  return result;
};
