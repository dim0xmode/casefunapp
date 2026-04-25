import { Request, Response, NextFunction } from 'express';
import { ethers } from 'ethers';
import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { config } from '../config/env.js';
import { getTreasuryContract, normalizeAddress } from '../services/blockchain.js';
import { isCaseExpired, mintCaseIfNeeded } from '../services/tokenService.js';
import { mintJetton } from '../services/tonService.js';
import { evmQueue } from '../services/chainQueue.js';

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

    const chainType = (caseInfo as any).chainType || 'EVM';
    const isTon = chainType === 'TON';

    if (isTon) {
      if (!user.tonAddress) {
        return next(new AppError('Link TON wallet first', 400));
      }
      const tonTokenAddr = (caseInfo as any).tonTokenAddress;
      if (!tonTokenAddr) {
        return next(new AppError('TON token address is not configured', 400));
      }
    } else {
      if (!user.hasLinkedWallet || !user.walletAddress) {
        return next(new AppError('Link EVM wallet first', 400));
      }
      if (!caseInfo.tokenAddress) {
        return next(new AppError('Token address is not configured', 400));
      }
    }

    if (!isCaseExpired(caseInfo.createdAt, caseInfo.openDurationHours)) {
      return next(new AppError('Case is not expired', 400));
    }

    if (!isTon && !caseInfo.mintedAt) {
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

    let txHash: string;
    let tokenAddress: string;

    if (isTon) {
      tokenAddress = (caseInfo as any).tonTokenAddress!;
      const decimals = caseInfo.tokenDecimals || 9;
      const jettonAmount = BigInt(Math.round(total * 10 ** decimals));
      txHash = await mintJetton(tokenAddress, user.tonAddress!, jettonAmount);
    } else {
      const treasury = getTreasuryContract();
      if (!treasury) {
        return next(new AppError('EVM Treasury is not configured', 500));
      }
      tokenAddress = caseInfo.tokenAddress!;
      const amount = ethers.parseUnits(total.toFixed(6), caseInfo.tokenDecimals || 18);
      const tx = await evmQueue.enqueue(`claimToken:${caseId}:${userId}`, async () => {
        const sent = await treasury.transferToken(tokenAddress, user.walletAddress, amount);
        await sent.wait(config.confirmations);
        return sent;
      });
      txHash = tx.hash;
    }

    const now = new Date();
    await prisma.$transaction(async (txDb) => {
      await txDb.inventoryItem.updateMany({
        where: { id: { in: claimableItems.map((item) => item.id) } },
        data: { claimedAt: now, claimedTxHash: txHash },
      });

      await txDb.claim.create({
        data: {
          userId,
          caseId,
          amount: total,
          txHash,
          chainType,
          status: 'completed',
          metadata: {
            tokenAddress,
            wallet: isTon ? user.tonAddress : normalizeAddress(user.walletAddress),
            chainType,
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
            txHash,
            tokenAddress,
            chainType,
          },
        },
      });
    });

    res.json({
      status: 'success',
      data: {
        amount: total,
        txHash,
        tokenAddress,
        chainType,
      },
    });
  } catch (error) {
    next(error);
  }
};
