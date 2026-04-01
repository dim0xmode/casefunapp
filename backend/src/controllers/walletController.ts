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

const recordConfirmedDeposit = async (params: {
  userId: string;
  txHash: string;
  ethAmount: number;
  confirmations: number;
  blockNumber: number;
}) => {
  const { userId, txHash, ethAmount, confirmations, blockNumber } = params;
  const priceInfo = await getEthUsdPrice();
  if (!priceInfo) {
    throw new AppError('Price feed unavailable', 503);
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
        blockNumber,
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

    if (updatedUser.referredById && !updatedUser.referralConfirmedAt) {
      await txDb.user.update({
        where: { id: userId },
        data: {
          referralConfirmedAt: new Date(),
          ...(String(updatedUser.role || '').toUpperCase() === 'USER' ? { role: 'MODERATOR' as const } : {}),
        },
      });
      await txDb.user.update({
        where: { id: updatedUser.referredById },
        data: { referralConfirmedCount: { increment: 1 } },
      });
    }

    return { updatedUser, deposit };
  });

  return {
    balance: updated.updatedUser.balance,
    deposit: updated.deposit,
  };
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
    if (!user.hasLinkedWallet) {
      return next(new AppError('Link wallet first', 400));
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

    const updated = await recordConfirmedDeposit({
      userId,
      txHash,
      ethAmount,
      confirmations,
      blockNumber: receipt.blockNumber,
    });

    res.json({
      status: 'success',
      data: {
        balance: updated.balance,
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

export const scanDeposit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) return next(new AppError('User not found', 404));
    if (!user.hasLinkedWallet || !user.walletAddress) {
      return next(new AppError('Link wallet first', 400));
    }
    if (!provider) return next(new AppError('Blockchain provider not configured', 500));

    const userAddr = normalizeAddress(user.walletAddress);
    const treasury = normalizeAddress(config.treasuryAddress);
    const currentBlock = await provider.getBlockNumber();
    const startBlock = currentBlock - 40;

    for (let blockNum = currentBlock; blockNum >= startBlock; blockNum--) {
      const block = await provider.getBlock(blockNum, true);
      if (!block?.prefetchedTransactions) continue;

      for (const tx of block.prefetchedTransactions) {
        if (normalizeAddress(tx.from) !== userAddr) continue;
        if (!tx.to || normalizeAddress(tx.to) !== treasury) continue;

        const existing = await prisma.deposit.findUnique({ where: { txHash: tx.hash } });
        if (existing) continue;

        const ethAmount = Number(ethers.formatEther(tx.value || 0n));
        if (!Number.isFinite(ethAmount) || ethAmount <= 0) continue;

        const receipt = await provider.getTransactionReceipt(tx.hash);
        if (!receipt || receipt.status !== 1) {
          return res.json({
            status: 'success',
            data: { found: true, pending: true, txHash: tx.hash, confirmations: 0 },
          });
        }

        const confirmations = currentBlock - receipt.blockNumber + 1;
        if (confirmations < config.confirmations) {
          return res.json({
            status: 'success',
            data: { found: true, pending: true, txHash: tx.hash, confirmations },
          });
        }

        const updated = await recordConfirmedDeposit({
          userId,
          txHash: tx.hash,
          ethAmount,
          confirmations,
          blockNumber: receipt.blockNumber,
        });

        return res.json({
          status: 'success',
          data: { found: true, balance: updated.balance, deposit: updated.deposit },
        });
      }
    }

    res.json({ status: 'success', data: { found: false } });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return res.json({ status: 'success', data: { found: true } });
    }
    next(error);
  }
};
