import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  listPublicRewardCases,
  openRewardCase,
  prePurchaseRewardCase,
  serializePublicCase,
  evaluateAutoStatus,
} from '../services/rewardCaseService.js';

export const listRewardCases = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId as string | undefined;
    const cases = await listPublicRewardCases({ userId });
    res.json({ status: 'success', data: cases });
  } catch (err) {
    next(err);
  }
};

export const getRewardCase = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const userId = (req as any).userId as string | undefined;

    let caseRow = await prisma.rewardCase.findUnique({
      where: { id },
      include: { drops: true },
    });
    if (!caseRow) return next(new AppError('Reward case not found', 404));

    // Hide drafts from non-admin users.
    const userRole = (req as any).userRole as string | undefined;
    if (caseRow.status === 'DRAFT' && userRole !== 'ADMIN') {
      return next(new AppError('Reward case not found', 404));
    }

    // Refresh status if time/limit warrants it
    const desired = evaluateAutoStatus(caseRow);
    if (desired !== caseRow.status) {
      caseRow = await prisma.rewardCase.update({
        where: { id },
        data: { status: desired },
        include: { drops: true },
      });
    }

    const payload: any = serializePublicCase(caseRow);

    if (userId) {
      const pp = await prisma.rewardPrePurchase.findUnique({
        where: { userId_caseId: { userId, caseId: id } },
      });
      payload.userPrePurchase = pp
        ? { remaining: pp.remaining, totalBought: pp.totalBought, pricePaid: pp.pricePaid }
        : { remaining: 0, totalBought: 0, pricePaid: 0 };
    }

    res.json({ status: 'success', data: payload });
  } catch (err) {
    next(err);
  }
};

export const postRewardCasePrePurchase = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).userId as string;
    const id = String(req.params.id);
    const count = Number(req.body?.count ?? 1);
    const result = await prePurchaseRewardCase({ userId, caseId: id, count });
    res.json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const postRewardCaseOpen = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).userId as string;
    const id = String(req.params.id);
    const count = Number(req.body?.count ?? 1);
    const result = await openRewardCase({ userId, caseId: id, count });
    res.json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

// User's own reward inventory (stacks + NFT items + pre-purchases), grouped
// by case. Used by the profile "Reward Cases" tab.
export const getMyRewardInventory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).userId as string;

    const [stacks, nftItems, prePurchases] = await Promise.all([
      prisma.rewardStack.findMany({
        where: { userId },
        include: {
          case: { select: { id: true, name: true, imageUrl: true, status: true, openCurrency: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.rewardNftItem.findMany({
        where: { userId },
        include: {
          case: { select: { id: true, name: true, imageUrl: true, status: true, openCurrency: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.rewardPrePurchase.findMany({
        where: { userId, remaining: { gt: 0 } },
        include: {
          case: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
              status: true,
              openCurrency: true,
              openPrice: true,
              prePrice: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    // Group by case id
    type Group = {
      case: any;
      stacks: any[];
      nftItems: any[];
      prePurchase: any | null;
    };
    const byCase = new Map<string, Group>();
    const ensure = (c: any): Group => {
      if (!byCase.has(c.id)) {
        byCase.set(c.id, { case: c, stacks: [], nftItems: [], prePurchase: null });
      }
      return byCase.get(c.id)!;
    };

    for (const s of stacks) {
      if (!s.case) continue;
      ensure(s.case).stacks.push({
        kind: s.kind,
        amount: s.amount,
        claimedAmount: s.claimedAmount,
        lastDropAt: s.lastDropAt,
      });
    }
    for (const n of nftItems) {
      if (!n.case) continue;
      ensure(n.case).nftItems.push({
        id: n.id,
        dropId: n.dropId,
        kind: n.kind,
        name: n.name,
        image: n.image,
        rarity: n.rarity,
        color: n.color,
        chain: n.chain,
        contractAddress: n.contractAddress,
        tokenId: n.tokenId,
        claimedAt: n.claimedAt,
        createdAt: n.createdAt,
      });
    }
    for (const pp of prePurchases) {
      if (!pp.case) continue;
      ensure(pp.case).prePurchase = {
        remaining: pp.remaining,
        totalBought: pp.totalBought,
        pricePaid: pp.pricePaid,
        currency: pp.currency,
      };
    }

    const groups = [...byCase.values()].sort((a, b) => {
      // Cases with active drops first, pre-purchase-only later.
      const aHas = a.stacks.length + a.nftItems.length;
      const bHas = b.stacks.length + b.nftItems.length;
      if (aHas !== bHas) return bHas - aHas;
      return a.case.name.localeCompare(b.case.name);
    });

    res.json({ status: 'success', data: groups });
  } catch (err) {
    next(err);
  }
};

// Placeholder claim endpoints — MVP returns 501 Not Implemented so the UI can
// show a disabled button with a consistent "Available on mainnet" message.
export const claimRewardStack = async (
  _req: Request,
  _res: Response,
  next: NextFunction
) => {
  next(new AppError('Claim is available after mainnet launch', 501));
};

export const claimRewardNft = async (
  _req: Request,
  _res: Response,
  next: NextFunction
) => {
  next(new AppError('Claim is available after mainnet launch', 501));
};
