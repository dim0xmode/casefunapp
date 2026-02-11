import { Request, Response, NextFunction } from 'express';
import { ethers } from 'ethers';
import prisma from '../config/database.js';
import { config } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { getEthUsdPrice } from '../services/priceService.js';
import { normalizeAddress, provider } from '../services/blockchain.js';

export const getEthPrice = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const price = await getEthUsdPrice();
    if (!price) {
      return next(new AppError('Price feed unavailable', 503));
    }
    res.json({ status: 'success', data: price });
  } catch (error) {
    next(error);
  }
};

export const confirmDeposit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { txHash } = req.body;
    if (!txHash || typeof txHash !== 'string') {
      return next(new AppError('Transaction hash is required', 400));
    }

    const existing = await prisma.deposit.findUnique({ where: { txHash } });
    if (existing) {
      if (existing.userId !== userId) {
        return next(new AppError('Deposit already claimed', 409));
      }
      const user = await prisma.user.findUnique({ where: { id: userId } });
      return res.json({
        status: 'success',
        data: {
          balance: user?.balance ?? 0,
          deposit: existing,
        },
      });
    }

    if (!provider) {
      return next(new AppError('Blockchain provider not configured', 500));
    }

    const [user, tx, network] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      provider.getTransaction(txHash),
      provider.getNetwork(),
    ]);

    if (!user) {
      return next(new AppError('User not found', 404));
    }
    if (!tx) {
      return next(new AppError('Transaction not found', 404));
    }
    if (Number(network.chainId) !== Number(config.chainId)) {
      return next(new AppError('Wrong network', 400));
    }

    if (!tx.to || normalizeAddress(tx.to) !== normalizeAddress(config.treasuryAddress)) {
      return next(new AppError('Invalid deposit target', 400));
    }
    if (normalizeAddress(tx.from) !== normalizeAddress(user.walletAddress)) {
      return next(new AppError('Deposit sender mismatch', 400));
    }

    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt || receipt.status !== 1 || !receipt.blockNumber) {
      return next(new AppError('Transaction is not confirmed yet', 409));
    }

    const currentBlock = await provider.getBlockNumber();
    const confirmations = currentBlock - receipt.blockNumber + 1;
    if (confirmations < config.confirmations) {
      return res.status(202).json({
        status: 'success',
        data: {
          pending: true,
          confirmations,
        },
      });
    }

    const ethAmount = Number(ethers.formatEther(tx.value || 0n));
    if (!Number.isFinite(ethAmount) || ethAmount <= 0) {
      return next(new AppError('Invalid deposit amount', 400));
    }

    const priceInfo = await getEthUsdPrice();
    if (!priceInfo) {
      return next(new AppError('Price feed unavailable', 503));
    }
    const usdtAmount = ethAmount * priceInfo.price;

    const updated = await prisma.$transaction(async (txDb) => {
      const updatedUser = await txDb.user.update({
        where: { id: userId },
        data: { balance: { increment: usdtAmount } },
      });

      const deposit = await txDb.deposit.create({
        data: {
          userId,
          txHash,
          chainId: Number(config.chainId),
          amountEth: ethAmount,
          amountUsdt: usdtAmount,
          confirmations,
          blockNumber: receipt.blockNumber,
          status: 'confirmed',
          metadata: {
            price: priceInfo.price,
            updatedAt: priceInfo.updatedAt,
          },
        },
      });

      await txDb.transaction.create({
        data: {
          userId,
          type: 'DEPOSIT',
          amount: usdtAmount,
          currency: 'USDT',
          metadata: {
            txHash,
            amountEth: ethAmount,
            price: priceInfo.price,
          },
        },
      });

      return { updatedUser, deposit };
    });

    res.json({
      status: 'success',
      data: {
        balance: updated.updatedUser.balance,
        deposit: updated.deposit,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return next(new AppError('Deposit already processed', 409));
    }
    next(error);
  }
};
