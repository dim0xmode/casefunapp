import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import type { Prisma, RewardCaseStatus, RewardCaseCurrency, RewardDropKind, RewardCaseLimitMode } from '@prisma/client';

const OPEN_CURRENCIES: RewardCaseCurrency[] = ['CFP', 'USDT', 'TEST_CFP', 'TEST_USDT'];
const DROP_KINDS: RewardDropKind[] = ['USDT', 'CFT', 'NFT', 'TEST_USDT', 'TEST_CFT', 'TEST_NFT'];
const LIMIT_MODES: RewardCaseLimitMode[] = ['NONE', 'BY_OPENS', 'BY_DROP'];
const STATUSES: RewardCaseStatus[] = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED'];

const TEST_CURRENCIES = new Set<RewardCaseCurrency>(['TEST_CFP', 'TEST_USDT']);
const TEST_DROP_KINDS = new Set<RewardDropKind>(['TEST_USDT', 'TEST_CFT', 'TEST_NFT']);
const NFT_KINDS = new Set<RewardDropKind>(['NFT', 'TEST_NFT']);

const logAdmin = async (
  adminId: string,
  action: string,
  entityId?: string,
  metadata?: Record<string, any>
) => {
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminId,
        action,
        entity: 'RewardCase',
        entityId,
        metadata: metadata ?? {},
      },
    });
  } catch (err) {
    console.error('[rewardCase] audit log failed', err);
  }
};

type DropInput = {
  id?: string;
  kind: RewardDropKind;
  name: string;
  amount: number;
  probability: number;
  rarity?: string;
  color?: string;
  image?: string | null;
  sortOrder?: number;
  nftChain?: string | null;
  nftContract?: string | null;
  nftMetadata?: any;
};

type CaseInput = {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  imageMeta?: any;
  openCurrency: RewardCaseCurrency;
  openPrice: number;
  prePrice?: number | null;
  chain?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  limitMode: RewardCaseLimitMode;
  limitTotal?: number | null;
  drops: DropInput[];
};

const parseDate = (value: unknown): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new AppError('Invalid date', 400);
  return d;
};

const validateCaseInput = (input: CaseInput) => {
  const name = String(input.name || '').trim();
  if (!name) throw new AppError('Case name is required', 400);
  if (name.length > 64) throw new AppError('Case name too long (max 64)', 400);

  if (!OPEN_CURRENCIES.includes(input.openCurrency)) {
    throw new AppError('Invalid open currency', 400);
  }
  const openPrice = Number(input.openPrice);
  if (!Number.isFinite(openPrice) || openPrice <= 0) {
    throw new AppError('Open price must be > 0', 400);
  }
  const prePrice =
    input.prePrice === null || input.prePrice === undefined ? null : Number(input.prePrice);
  if (prePrice !== null && (!Number.isFinite(prePrice) || prePrice <= 0)) {
    throw new AppError('Pre-purchase price must be > 0', 400);
  }

  if (!LIMIT_MODES.includes(input.limitMode)) {
    throw new AppError('Invalid limit mode', 400);
  }
  const limitTotal =
    input.limitTotal === null || input.limitTotal === undefined ? null : Number(input.limitTotal);
  if (input.limitMode !== 'NONE') {
    if (limitTotal === null || !Number.isFinite(limitTotal) || limitTotal <= 0) {
      throw new AppError('Limit total must be > 0 when limit is enabled', 400);
    }
  }

  const startAt = parseDate(input.startAt);
  const endAt = parseDate(input.endAt);
  if (startAt && endAt && endAt.getTime() <= startAt.getTime()) {
    throw new AppError('endAt must be after startAt', 400);
  }

  if (!Array.isArray(input.drops) || input.drops.length === 0) {
    throw new AppError('At least one drop is required', 400);
  }
  if (input.drops.length > 50) {
    throw new AppError('Too many drops (max 50)', 400);
  }

  let probSum = 0;
  const usedNames = new Set<string>();
  const dropKinds = new Set<RewardDropKind>();
  const kindFamily = (kind: RewardDropKind): string => {
    if (kind === 'USDT' || kind === 'TEST_USDT') return 'USDT';
    if (kind === 'CFT' || kind === 'TEST_CFT') return 'CFT';
    if (kind === 'NFT' || kind === 'TEST_NFT') return 'NFT';
    return String(kind);
  };
  const kindFamilies = new Set<string>();

  input.drops.forEach((drop, idx) => {
    if (!DROP_KINDS.includes(drop.kind)) {
      throw new AppError(`Drop #${idx + 1}: invalid kind`, 400);
    }
    const dropName = String(drop.name || '').trim();
    if (!dropName) throw new AppError(`Drop #${idx + 1}: name required`, 400);
    if (usedNames.has(dropName.toLowerCase())) {
      throw new AppError(`Drop #${idx + 1}: duplicate name "${dropName}"`, 400);
    }
    usedNames.add(dropName.toLowerCase());

    const amount = Number(drop.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError(`Drop #${idx + 1}: amount must be > 0`, 400);
    }
    if (NFT_KINDS.has(drop.kind) && Math.abs(amount - 1) > 1e-9) {
      throw new AppError(`Drop #${idx + 1}: NFT amount must be 1`, 400);
    }

    const probability = Number(drop.probability);
    if (!Number.isFinite(probability) || probability < 0 || probability > 100) {
      throw new AppError(`Drop #${idx + 1}: probability must be between 0 and 100`, 400);
    }
    probSum += probability;

    dropKinds.add(drop.kind);
    kindFamilies.add(kindFamily(drop.kind));
  });

  // Mixing real and test currencies inside one case is a hazard — forbid.
  const anyTest = [...dropKinds].some((k) => TEST_DROP_KINDS.has(k));
  const anyReal = [...dropKinds].some((k) => !TEST_DROP_KINDS.has(k));
  if (anyTest && anyReal) {
    throw new AppError('Cannot mix real and TEST_* drop kinds in the same case', 400);
  }
  if (anyTest && !TEST_CURRENCIES.has(input.openCurrency)) {
    throw new AppError('Case with TEST_* drops must use a TEST_* open currency', 400);
  }
  if (anyReal && TEST_CURRENCIES.has(input.openCurrency)) {
    throw new AppError('Case with real drops cannot use a TEST_* open currency', 400);
  }

  if (Math.abs(probSum - 100) > 0.01) {
    throw new AppError(`Drop probabilities must sum to 100% (got ${probSum.toFixed(4)}%)`, 400);
  }

  if (input.limitMode === 'BY_DROP' && kindFamilies.size > 1) {
    throw new AppError('BY_DROP limit only allowed on monovalent cases (single drop family)', 400);
  }

  return { name, startAt, endAt, prePrice, openPrice, limitTotal };
};

const serializeCase = (
  c: any,
  opts: { includeDrops?: boolean; includeStats?: boolean } = {}
) => {
  const out: any = {
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
    totalPrePurchased: c.totalPrePurchased,
    completedAt: c.completedAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    createdBy: c.createdBy
      ? {
          id: c.createdBy.id,
          username: c.createdBy.username,
        }
      : undefined,
  };
  if (opts.includeDrops && Array.isArray(c.drops)) {
    out.drops = c.drops
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
        sortOrder: d.sortOrder,
        nftChain: d.nftChain,
        nftContract: d.nftContract,
        nftMetadata: d.nftMetadata,
      }));
  }
  if (opts.includeStats) {
    out.stats = {
      totalOpens: c.totalOpens,
      totalPrePurchased: c.totalPrePurchased,
      openPrePurchaseRemaining: c._prePurchaseOpenCount ?? 0,
    };
  }
  return out;
};

export const adminListRewardCases = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const statusRaw = req.query.status;
    const searchRaw = req.query.search;
    const status = typeof statusRaw === 'string' ? statusRaw : '';
    const search = typeof searchRaw === 'string' ? searchRaw : '';

    const where: Prisma.RewardCaseWhereInput = {};
    if (status && STATUSES.includes(status as RewardCaseStatus)) {
      where.status = status as RewardCaseStatus;
    }
    if (search && search.trim()) {
      where.name = { contains: search.trim(), mode: 'insensitive' };
    }

    const cases = await prisma.rewardCase.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        createdBy: { select: { id: true, username: true } },
        drops: true,
        _count: { select: { openings: true, prePurchases: true } },
      },
    });

    const data = cases.map((c) =>
      serializeCase({ ...c, _prePurchaseOpenCount: c._count.prePurchases }, {
        includeDrops: true,
        includeStats: true,
      })
    );
    res.json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
};

export const adminGetRewardCase = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params.id);
    const caseItem = await prisma.rewardCase.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, username: true } },
        drops: true,
        _count: { select: { openings: true, prePurchases: true } },
      },
    });
    if (!caseItem) return next(new AppError('Reward case not found', 404));

    const [recentOpenings, prePurchaseStats] = await Promise.all([
      prisma.rewardCaseOpening.findMany({
        where: { caseId: id },
        orderBy: { timestamp: 'desc' },
        take: 25,
        include: {
          user: { select: { id: true, username: true, telegramUsername: true } },
          drop: { select: { id: true, name: true, kind: true } },
        },
      }),
      prisma.rewardPrePurchase.aggregate({
        where: { caseId: id },
        _sum: { remaining: true, totalBought: true },
        _count: true,
      }),
    ]);

    const body = serializeCase(
      { ...caseItem, _prePurchaseOpenCount: prePurchaseStats._sum.remaining ?? 0 },
      { includeDrops: true, includeStats: true }
    );
    body.recentOpenings = recentOpenings.map((o) => ({
      id: o.id,
      timestamp: o.timestamp,
      userId: o.userId,
      userNick: o.user?.telegramUsername
        ? `@${o.user.telegramUsername}`
        : o.user?.username || o.userId.slice(0, 6),
      drop: o.drop,
      dropKind: o.dropKind,
      dropAmount: o.dropAmount,
      usedPrePurchase: o.usedPrePurchase,
      pricePaid: o.pricePaid,
      currency: o.currency,
    }));
    body.prePurchaseSummary = {
      buyers: prePurchaseStats._count,
      totalRemaining: prePurchaseStats._sum.remaining ?? 0,
      totalLifetime: prePurchaseStats._sum.totalBought ?? 0,
    };

    res.json({ status: 'success', data: body });
  } catch (err) {
    next(err);
  }
};

export const adminCreateRewardCase = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const adminId = (req as any).userId as string;
    const input = req.body as CaseInput;
    const validated = validateCaseInput(input);

    const limitRemaining =
      input.limitMode !== 'NONE' && validated.limitTotal !== null ? validated.limitTotal : null;

    const created = await prisma.$transaction(async (tx) => {
      const record = await tx.rewardCase.create({
        data: {
          name: validated.name,
          description: input.description?.trim() || null,
          imageUrl: input.imageUrl || null,
          imageMeta: input.imageMeta ?? undefined,
          status: 'DRAFT',
          openCurrency: input.openCurrency,
          openPrice: validated.openPrice,
          prePrice: validated.prePrice ?? null,
          chain: input.chain?.trim() || null,
          startAt: validated.startAt,
          endAt: validated.endAt,
          limitMode: input.limitMode,
          limitTotal: validated.limitTotal ?? null,
          limitRemaining,
          createdById: adminId,
        },
      });

      await tx.rewardDrop.createMany({
        data: input.drops.map((drop, idx) => ({
          caseId: record.id,
          kind: drop.kind,
          name: String(drop.name).trim(),
          amount: Number(drop.amount),
          probability: Number(drop.probability),
          rarity: (drop.rarity || 'COMMON').toUpperCase(),
          color: drop.color || '#9CA3AF',
          image: drop.image || null,
          sortOrder: Number.isFinite(drop.sortOrder) ? Number(drop.sortOrder) : idx,
          nftChain: drop.nftChain || null,
          nftContract: drop.nftContract || null,
          nftMetadata: drop.nftMetadata ?? undefined,
        })),
      });

      return record;
    });

    await logAdmin(adminId, 'reward_case.create', created.id, {
      name: created.name,
      dropCount: input.drops.length,
      openCurrency: created.openCurrency,
    });

    const full = await prisma.rewardCase.findUnique({
      where: { id: created.id },
      include: {
        createdBy: { select: { id: true, username: true } },
        drops: true,
      },
    });
    res.status(201).json({
      status: 'success',
      data: serializeCase(full, { includeDrops: true, includeStats: true }),
    });
  } catch (err) {
    next(err);
  }
};

export const adminUpdateRewardCase = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const adminId = (req as any).userId as string;
    const id = String(req.params.id);

    const existing = await prisma.rewardCase.findUnique({
      where: { id },
      include: { drops: true, _count: { select: { openings: true } } },
    });
    if (!existing) return next(new AppError('Reward case not found', 404));
    if (existing.status === 'COMPLETED') {
      return next(new AppError('Completed cases are read-only', 400));
    }

    const input = req.body as CaseInput;
    const validated = validateCaseInput(input);

    // If the case is already active or has openings, we keep limitRemaining in
    // sync: admin may raise/lower the budget, but we don't retroactively
    // "refund" used budget. Simplest: limitRemaining = max(0, newTotal -
    // (oldTotal - oldRemaining)).
    let newLimitRemaining: number | null = null;
    if (input.limitMode !== 'NONE' && validated.limitTotal !== null) {
      const spent =
        existing.limitTotal !== null && existing.limitRemaining !== null
          ? Math.max(0, Number(existing.limitTotal) - Number(existing.limitRemaining))
          : 0;
      newLimitRemaining = Math.max(0, validated.limitTotal - spent);
    }

    await prisma.$transaction(async (tx) => {
      await tx.rewardCase.update({
        where: { id },
        data: {
          name: validated.name,
          description: input.description?.trim() || null,
          imageUrl: input.imageUrl || null,
          imageMeta: input.imageMeta ?? undefined,
          openCurrency: input.openCurrency,
          openPrice: validated.openPrice,
          prePrice: validated.prePrice ?? null,
          chain: input.chain?.trim() || null,
          startAt: validated.startAt,
          endAt: validated.endAt,
          limitMode: input.limitMode,
          limitTotal: validated.limitTotal ?? null,
          limitRemaining: input.limitMode === 'NONE' ? null : newLimitRemaining,
        },
      });

      // Drop replacement strategy: we MUST keep drop IDs stable for rows that
      // already have openings (FK Restrict would block delete). Match by
      // provided `id` first, create new ones, and delete drops that are neither
      // kept nor referenced. Drops with openings that the user tries to remove
      // are rejected loudly.
      const existingDropIds = new Set(existing.drops.map((d) => d.id));
      const keptDropIds = new Set<string>();
      for (let idx = 0; idx < input.drops.length; idx += 1) {
        const d = input.drops[idx];
        if (d.id && existingDropIds.has(d.id)) {
          keptDropIds.add(d.id);
          await tx.rewardDrop.update({
            where: { id: d.id },
            data: {
              kind: d.kind,
              name: String(d.name).trim(),
              amount: Number(d.amount),
              probability: Number(d.probability),
              rarity: (d.rarity || 'COMMON').toUpperCase(),
              color: d.color || '#9CA3AF',
              image: d.image || null,
              sortOrder: Number.isFinite(d.sortOrder) ? Number(d.sortOrder) : idx,
              nftChain: d.nftChain || null,
              nftContract: d.nftContract || null,
              nftMetadata: d.nftMetadata ?? undefined,
            },
          });
        } else {
          await tx.rewardDrop.create({
            data: {
              caseId: id,
              kind: d.kind,
              name: String(d.name).trim(),
              amount: Number(d.amount),
              probability: Number(d.probability),
              rarity: (d.rarity || 'COMMON').toUpperCase(),
              color: d.color || '#9CA3AF',
              image: d.image || null,
              sortOrder: Number.isFinite(d.sortOrder) ? Number(d.sortOrder) : idx,
              nftChain: d.nftChain || null,
              nftContract: d.nftContract || null,
              nftMetadata: d.nftMetadata ?? undefined,
            },
          });
        }
      }
      const toDeleteIds = [...existingDropIds].filter((dropId) => !keptDropIds.has(dropId));
      if (toDeleteIds.length) {
        const referenced = await tx.rewardCaseOpening.count({
          where: { dropId: { in: toDeleteIds } },
        });
        if (referenced > 0) {
          throw new AppError(
            'Cannot remove drops that already have openings. Keep them in the list (edit fields instead) or create a new case.',
            400
          );
        }
        await tx.rewardDrop.deleteMany({ where: { id: { in: toDeleteIds } } });
      }
    });

    await logAdmin(adminId, 'reward_case.update', id, {
      name: validated.name,
      dropCount: input.drops.length,
    });

    const full = await prisma.rewardCase.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, username: true } },
        drops: true,
      },
    });
    res.json({
      status: 'success',
      data: serializeCase(full, { includeDrops: true, includeStats: true }),
    });
  } catch (err) {
    next(err);
  }
};

const transitionStatus = async (
  adminId: string,
  id: string,
  target: RewardCaseStatus,
  allowedFrom: RewardCaseStatus[],
  extraValidation?: (current: any) => void
) => {
  const current = await prisma.rewardCase.findUnique({ where: { id } });
  if (!current) throw new AppError('Reward case not found', 404);
  if (!allowedFrom.includes(current.status)) {
    throw new AppError(
      `Cannot move from ${current.status} to ${target}. Allowed: ${allowedFrom.join(', ')}`,
      400
    );
  }
  if (extraValidation) extraValidation(current);

  const updated = await prisma.rewardCase.update({
    where: { id },
    data: {
      status: target,
      completedAt: target === 'COMPLETED' ? new Date() : current.completedAt,
    },
  });

  await logAdmin(adminId, `reward_case.${target.toLowerCase()}`, id, {
    from: current.status,
    to: target,
  });

  return updated;
};

export const adminPublishRewardCase = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const adminId = (req as any).userId;
    const id = String(req.params.id);

    const now = new Date();
    const updated = await transitionStatus(
      adminId,
      id,
      // Target computed inside from startAt
      'SCHEDULED',
      ['DRAFT'],
      (current) => {
        if (!current.startAt) {
          throw new AppError(
            'Set startAt before publishing (leave null to keep DRAFT hidden).',
            400
          );
        }
      }
    );
    // If startAt is already in the past, auto-jump to ACTIVE.
    if (updated.startAt && updated.startAt.getTime() <= now.getTime()) {
      const nextStatus: RewardCaseStatus =
        updated.endAt && updated.endAt.getTime() <= now.getTime() ? 'PAUSED' : 'ACTIVE';
      const jumped = await prisma.rewardCase.update({
        where: { id },
        data: { status: nextStatus },
      });
      await logAdmin(adminId, `reward_case.${nextStatus.toLowerCase()}`, id, {
        from: 'SCHEDULED',
        to: nextStatus,
        reason: 'auto-on-publish',
      });
      return res.json({ status: 'success', data: { status: jumped.status } });
    }
    res.json({ status: 'success', data: { status: updated.status } });
  } catch (err) {
    next(err);
  }
};

export const adminPauseRewardCase = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const adminId = (req as any).userId;
    const id = String(req.params.id);
    const updated = await transitionStatus(adminId, id, 'PAUSED', ['ACTIVE', 'SCHEDULED']);
    res.json({ status: 'success', data: { status: updated.status } });
  } catch (err) {
    next(err);
  }
};

export const adminResumeRewardCase = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const adminId = (req as any).userId;
    const id = String(req.params.id);
    // Resume target depends on startAt (future = SCHEDULED, else ACTIVE).
    const current = await prisma.rewardCase.findUnique({ where: { id } });
    if (!current) return next(new AppError('Reward case not found', 404));
    if (current.status !== 'PAUSED') {
      return next(new AppError('Only PAUSED cases can be resumed', 400));
    }
    const now = Date.now();
    const target: RewardCaseStatus =
      current.startAt && current.startAt.getTime() > now ? 'SCHEDULED' : 'ACTIVE';
    const updated = await prisma.rewardCase.update({
      where: { id },
      data: { status: target },
    });
    await logAdmin(adminId, `reward_case.${target.toLowerCase()}`, id, {
      from: 'PAUSED',
      to: target,
      reason: 'resume',
    });
    res.json({ status: 'success', data: { status: updated.status } });
  } catch (err) {
    next(err);
  }
};

export const adminCompleteRewardCase = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const adminId = (req as any).userId;
    const id = String(req.params.id);
    const confirm = String(req.body?.confirm || '').toLowerCase();
    if (confirm !== 'complete') {
      return next(
        new AppError(
          'Completion is irreversible. Send body { "confirm": "complete" } to proceed.',
          400
        )
      );
    }
    const updated = await transitionStatus(
      adminId,
      id,
      'COMPLETED',
      ['ACTIVE', 'PAUSED', 'SCHEDULED']
    );
    res.json({ status: 'success', data: { status: updated.status, completedAt: updated.completedAt } });
  } catch (err) {
    next(err);
  }
};

const refundPrePurchases = async (
  adminId: string,
  caseId: string,
  reason: 'delete' | 'manual'
) => {
  const prePurchases = await prisma.rewardPrePurchase.findMany({
    where: { caseId, remaining: { gt: 0 } },
  });

  let refundedUsers = 0;
  let refundedAmount = 0;

  for (const pp of prePurchases) {
    const refundTotal = pp.pricePaid * pp.remaining;
    const isTest = TEST_CURRENCIES.has(pp.currency);

    await prisma.$transaction(async (tx) => {
      if (!isTest && refundTotal > 0) {
        await tx.user.update({
          where: { id: pp.userId },
          data: { balance: { increment: refundTotal } },
        });
        await tx.transaction.create({
          data: {
            userId: pp.userId,
            type: 'REWARD_CASE_REFUND',
            amount: refundTotal,
            currency: pp.currency === 'USDT' ? 'USDT' : 'CFP',
            status: 'completed',
            metadata: {
              caseId,
              reason,
              units: pp.remaining,
              pricePaid: pp.pricePaid,
            },
          },
        });
      }
      await tx.rewardPrePurchase.update({
        where: { id: pp.id },
        data: { remaining: 0, updatedAt: new Date() },
      });
    });

    refundedUsers += 1;
    if (!isTest) refundedAmount += refundTotal;
  }

  await logAdmin(adminId, 'reward_case.refund_pre_purchases', caseId, {
    reason,
    refundedUsers,
    refundedAmount,
  });

  return { refundedUsers, refundedAmount };
};

export const adminRefundRewardCasePrePurchases = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const adminId = (req as any).userId;
    const id = String(req.params.id);
    const confirm = String(req.body?.confirm || '').toLowerCase();
    if (confirm !== 'refund') {
      return next(
        new AppError(
          'Refund requires explicit confirmation. Send { "confirm": "refund" }.',
          400
        )
      );
    }
    const exists = await prisma.rewardCase.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!exists) return next(new AppError('Reward case not found', 404));
    if (exists.status === 'COMPLETED') {
      return next(new AppError('Cannot refund on a COMPLETED case', 400));
    }
    const result = await refundPrePurchases(adminId, id, 'manual');
    res.json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const adminDeleteRewardCase = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const adminId = (req as any).userId;
    const id = String(req.params.id);

    const caseItem = await prisma.rewardCase.findUnique({
      where: { id },
      include: { _count: { select: { openings: true, prePurchases: true } } },
    });
    if (!caseItem) return next(new AppError('Reward case not found', 404));

    // Deletion is only permitted when nobody opened it. Pre-purchases must be
    // refunded first (separate explicit action) to keep the destructive step
    // reversible in terms of user funds.
    const openingsCount = (caseItem as any)._count?.openings ?? 0;
    if (openingsCount > 0) {
      return next(
        new AppError(
          'Cannot delete: case already has openings. Pause or complete it instead.',
          400
        )
      );
    }
    const outstandingPre = await prisma.rewardPrePurchase.aggregate({
      where: { caseId: id, remaining: { gt: 0 } },
      _sum: { remaining: true },
    });
    if ((outstandingPre._sum.remaining ?? 0) > 0) {
      return next(
        new AppError(
          'Cannot delete: outstanding pre-purchases exist. Refund them first (POST /refund-pre-purchases).',
          400
        )
      );
    }

    await prisma.rewardCase.delete({ where: { id } });
    await logAdmin(adminId, 'reward_case.delete', id, { name: caseItem.name });
    res.json({ status: 'success', data: { deleted: id } });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Stats endpoint — admin-only separate metrics tab (independent from RTU).
// Breakdown per-case and global totals over a time range.
// ---------------------------------------------------------------------------
export const adminRewardCaseStats = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const fromStr = typeof req.query.from === 'string' ? req.query.from : undefined;
    const toStr = typeof req.query.to === 'string' ? req.query.to : undefined;
    const from = fromStr ? new Date(fromStr) : null;
    const to = toStr ? new Date(toStr) : null;

    const openingsWhere: Prisma.RewardCaseOpeningWhereInput = {};
    if (from || to) {
      openingsWhere.timestamp = {};
      if (from) openingsWhere.timestamp.gte = from;
      if (to) openingsWhere.timestamp.lte = to;
    }

    const cases = await prisma.rewardCase.findMany({
      include: {
        _count: { select: { openings: true, prePurchases: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const perCaseOpenings = await prisma.rewardCaseOpening.groupBy({
      by: ['caseId', 'dropKind'],
      where: openingsWhere,
      _count: { _all: true },
      _sum: { dropAmount: true, pricePaid: true },
    });

    const prePurchaseAgg = await prisma.rewardPrePurchase.groupBy({
      by: ['caseId'],
      _sum: { remaining: true, totalBought: true },
    });

    const perCaseMap = new Map<string, any>();
    for (const row of perCaseOpenings) {
      const item = perCaseMap.get(row.caseId) || { byKind: {}, totalOpens: 0, totalPaid: 0 };
      item.byKind[row.dropKind] = {
        count: row._count._all,
        totalAmount: row._sum.dropAmount || 0,
      };
      item.totalOpens += row._count._all;
      item.totalPaid += row._sum.pricePaid || 0;
      perCaseMap.set(row.caseId, item);
    }
    const prePurchaseMap = new Map<string, any>();
    for (const row of prePurchaseAgg) {
      prePurchaseMap.set(row.caseId, {
        outstanding: row._sum.remaining ?? 0,
        lifetime: row._sum.totalBought ?? 0,
      });
    }

    const data = cases.map((c) => {
      const agg = perCaseMap.get(c.id) || { byKind: {}, totalOpens: 0, totalPaid: 0 };
      const pre = prePurchaseMap.get(c.id) || { outstanding: 0, lifetime: 0 };
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        openCurrency: c.openCurrency,
        openPrice: c.openPrice,
        chain: c.chain,
        createdAt: c.createdAt,
        totalOpens: c.totalOpens,
        rangeOpens: agg.totalOpens,
        rangePaid: agg.totalPaid,
        byKind: agg.byKind,
        prePurchase: pre,
        limitTotal: c.limitTotal,
        limitRemaining: c.limitRemaining,
        limitMode: c.limitMode,
      };
    });

    const totals = {
      casesCount: cases.length,
      rangeOpens: data.reduce((acc, x) => acc + x.rangeOpens, 0),
      rangePaid: data.reduce((acc, x) => acc + x.rangePaid, 0),
      outstandingPrePurchase: data.reduce((acc, x) => acc + x.prePurchase.outstanding, 0),
    };

    res.json({ status: 'success', data: { cases: data, totals, range: { from, to } } });
  } catch (err) {
    next(err);
  }
};
