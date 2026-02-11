import { Request, Response, NextFunction } from 'express';
import { ethers } from 'ethers';
import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { config } from '../config/env.js';
import { getTreasuryContract, normalizeAddress } from '../services/blockchain.js';
import { isCaseExpired, mintCaseIfNeeded } from '../services/tokenService.js';

export const claimToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { caseId } = req.body;
    if (!caseId || typeof caseId !== 'string') {
      return next(new AppError('Case id is required', 400));
    }

    const [user, caseInfo] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.case.findUnique({ where: { id: caseId } }),
    ]);
    if (!user) {
      return next(new AppError('User not found', 404));
    }
    if (!caseInfo) {
      return next(new AppError('Case not found', 404));
    }
    if (!caseInfo.tokenAddress) {
      return next(new AppError('Token address is not configured', 400));
    }
    if (!isCaseExpired(caseInfo.createdAt, caseInfo.openDurationHours)) {
      return next(new AppError('Case is not expired', 400));
    }

    if (!caseInfo.mintedAt) {
      await mintCaseIfNeeded(caseId);
    }

    const claimableItems = await prisma.inventoryItem.findMany({
      where: {
        userId,
        caseId,
        status: 'ACTIVE',
        claimedAt: null,
      },
    });

    const total = claimableItems.reduce((sum, item) => sum + Number(item.value || 0), 0);
    if (!Number.isFinite(total) || total <= 0) {
      return next(new AppError('Nothing to claim', 400));
    }

    if (!user.walletAddress) {
      return next(new AppError('Wallet address not set', 400));
    }

    const treasury = getTreasuryContract();
    if (!treasury) {
      return next(new AppError('Treasury is not configured', 500));
    }

    const amount = ethers.parseUnits(total.toFixed(6), caseInfo.tokenDecimals || 18);
    const tx = await treasury.transferToken(caseInfo.tokenAddress, user.walletAddress, amount);
    const receipt = await tx.wait(config.confirmations);

    const now = new Date();
    await prisma.$transaction(async (txDb) => {
      await txDb.inventoryItem.updateMany({
        where: { id: { in: claimableItems.map((item) => item.id) } },
        data: { claimedAt: now, claimedTxHash: tx.hash },
      });

      await txDb.claim.create({
        data: {
          userId,
          caseId,
          amount: total,
          txHash: tx.hash,
          status: receipt?.status === 1 ? 'completed' : 'pending',
          metadata: {
            tokenAddress: caseInfo.tokenAddress,
            wallet: normalizeAddress(user.walletAddress),
          },
        },
      });

      await txDb.transaction.create({
        data: {
          userId,
          type: 'CLAIM',
          amount: total,
          currency: caseInfo.tokenTicker || caseInfo.currency,
          metadata: {
            caseId,
            txHash: tx.hash,
            tokenAddress: caseInfo.tokenAddress,
          },
        },
      });
    });

    res.json({
      status: 'success',
      data: {
        amount: total,
        txHash: tx.hash,
        tokenAddress: caseInfo.tokenAddress,
      },
    });
  } catch (error) {
    next(error);
  }
};
