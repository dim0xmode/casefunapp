import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

const FUNDING_WALLET_LOWER = '0xc459241d1ac02250de56b8b7165ebedf59236524';

export const activatePromo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { code } = req.body;

    if (!code || typeof code !== 'string' || !code.trim()) {
      return next(new AppError('Promo code is required', 400));
    }

    const promo = await prisma.promoCode.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!promo || !promo.isActive) {
      return next(new AppError('Invalid or expired promo code', 404));
    }

    if (promo.currentUses >= promo.maxUses) {
      return next(new AppError('This promo code has reached its usage limit', 400));
    }

    const userActivations = await prisma.promoActivation.count({
      where: { userId, promoId: promo.id },
    });
    if (userActivations >= promo.usesPerUser) {
      return next(new AppError('You have already used this promo code', 400));
    }

    const funder = await prisma.user.findUnique({ where: { id: promo.fundingUserId } });
    if (!funder || funder.balance < promo.amount) {
      return next(new AppError('Promo code is temporarily unavailable', 400));
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: promo.fundingUserId },
        data: { balance: { decrement: promo.amount } },
      });

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { balance: { increment: promo.amount } },
      });

      await tx.promoCode.update({
        where: { id: promo.id },
        data: { currentUses: { increment: 1 } },
      });

      await tx.promoActivation.create({
        data: {
          userId,
          promoId: promo.id,
          amount: promo.amount,
        },
      });

      await tx.transaction.create({
        data: {
          userId: promo.fundingUserId,
          type: 'PROMO_OUT',
          amount: -promo.amount,
          currency: 'USDT',
          status: 'completed',
          metadata: { promoCode: promo.code, toUserId: userId },
        },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: 'PROMO_IN',
          amount: promo.amount,
          currency: 'USDT',
          status: 'completed',
          metadata: { promoCode: promo.code, fromUserId: promo.fundingUserId },
        },
      });

      return updatedUser;
    });

    res.json({
      status: 'success',
      data: { balance: result.balance, amount: promo.amount },
    });
  } catch (error) {
    next(error);
  }
};

export const adminListPromoCodes = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const promos = await prisma.promoCode.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        fundingUser: { select: { id: true, username: true, walletAddress: true } },
        _count: { select: { activations: true } },
      },
    });
    res.json({ status: 'success', data: { promos } });
  } catch (error) {
    next(error);
  }
};

export const adminCreatePromoCode = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, amount, maxUses, usesPerUser } = req.body;

    if (!code || typeof code !== 'string' || !code.trim()) {
      return next(new AppError('Code is required', 400));
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return next(new AppError('Amount must be a positive number', 400));
    }

    const funder = await prisma.user.findFirst({
      where: { walletAddress: { equals: FUNDING_WALLET_LOWER, mode: 'insensitive' } },
    });
    if (!funder) {
      return next(new AppError('Funding wallet not found', 500));
    }

    const existing = await prisma.promoCode.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (existing) {
      return next(new AppError('Promo code already exists', 409));
    }

    const promo = await prisma.promoCode.create({
      data: {
        code: code.trim().toUpperCase(),
        amount: amountNum,
        maxUses: Math.max(1, Number(maxUses) || 1),
        usesPerUser: Math.max(1, Number(usesPerUser) || 1),
        fundingUserId: funder.id,
      },
    });

    res.json({ status: 'success', data: { promo } });
  } catch (error) {
    next(error);
  }
};

export const adminUpdatePromoCode = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const { isActive, maxUses, usesPerUser } = req.body;

    const data: any = {};
    if (typeof isActive === 'boolean') data.isActive = isActive;
    if (maxUses != null) data.maxUses = Math.max(1, Number(maxUses) || 1);
    if (usesPerUser != null) data.usesPerUser = Math.max(1, Number(usesPerUser) || 1);

    const promo = await prisma.promoCode.update({ where: { id }, data });
    res.json({ status: 'success', data: { promo } });
  } catch (error) {
    next(error);
  }
};

export const adminDeletePromoCode = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    await prisma.promoCode.update({ where: { id }, data: { isActive: false } });
    res.json({ status: 'success' });
  } catch (error) {
    next(error);
  }
};

export const adminListPromoActivations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activations = await prisma.promoActivation.findMany({
      orderBy: { activatedAt: 'desc' },
      take: 200,
      include: {
        user: { select: { id: true, username: true, walletAddress: true } },
        promo: { select: { id: true, code: true, amount: true } },
      },
    });
    res.json({ status: 'success', data: { activations } });
  } catch (error) {
    next(error);
  }
};
