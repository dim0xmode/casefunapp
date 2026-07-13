import { Request, Response, NextFunction } from 'express';
import { ethers } from 'ethers';
import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { getEvmChain, normalizeAddress } from '../services/blockchain.js';
import { isCaseExpired, mintCaseIfNeeded } from '../services/tokenService.js';
import { mintJetton } from '../services/tonService.js';
import { botQueue, evmQueue } from '../services/chainQueue.js';

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
    const evmChainKey = chainType === 'BOT' ? 'BOT' : 'EVM';

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

    const tokenAddress = isTon ? (caseInfo as any).tonTokenAddress! : caseInfo.tokenAddress!;

    const claimableItems = await prisma.inventoryItem.findMany({
      where: {
        userId,
        caseId,
        status: 'ACTIVE',
        claimedAt: null,
      },
    });

    const total = claimableItems.reduce((sum, item) => sum + Number(item.value || 0), 0);

    // Idempotency / dedupe: if there's already a claim for this case+user, reflect
    // its state instead of kicking off a duplicate on-chain payout.
    const existingClaim = await prisma.claim.findFirst({
      where: { userId, caseId },
      orderBy: { createdAt: 'desc' },
    });
    if (existingClaim && existingClaim.status !== 'failed') {
      return res.json({
        status: 'success',
        data: {
          status: existingClaim.status, // 'pending' | 'completed'
          claimId: existingClaim.id,
          amount: existingClaim.amount,
          txHash: existingClaim.txHash,
          tokenAddress,
          chainType,
        },
      });
    }

    if (!Number.isFinite(total) || total <= 0) {
      return next(new AppError('Nothing to claim', 400));
    }

    // Create a pending claim up front and process the (slow) on-chain work in the
    // background so the HTTP request returns immediately. On-chain mint + transfer
    // on some chains can take longer than the edge/proxy timeout (Cloudflare 504),
    // so the client polls getClaimStatus until this flips to completed/failed.
    const pendingClaim = await prisma.claim.create({
      data: {
        userId,
        caseId,
        amount: total,
        chainType,
        status: 'pending',
        metadata: {
          tokenAddress,
          wallet: isTon ? user.tonAddress : normalizeAddress(user.walletAddress),
          chainType,
        },
      },
    });

    const runClaim = async () => {
      try {
        let txHash: string;

        if (isTon) {
          const decimals = caseInfo.tokenDecimals || 9;
          const jettonAmount = BigInt(Math.round(total * 10 ** decimals));
          txHash = await mintJetton(tokenAddress, user.tonAddress!, jettonAmount);
        } else {
          if (!caseInfo.mintedAt) {
            await mintCaseIfNeeded(caseId);
          }
          const chain = getEvmChain(evmChainKey);
          const treasury = chain.getTreasuryContract();
          if (!treasury) {
            throw new AppError(`${evmChainKey} Treasury is not configured`, 500);
          }
          const amount = ethers.parseUnits(total.toFixed(6), caseInfo.tokenDecimals || 18);
          const queue = evmChainKey === 'BOT' ? botQueue : evmQueue;
          const tx = await queue.enqueue(`claimToken:${evmChainKey}:${caseId}:${userId}`, async () => {
            const sent = await treasury.transferToken(tokenAddress, user.walletAddress, amount);
            await sent.wait(chain.confirmations);
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

          await txDb.claim.update({
            where: { id: pendingClaim.id },
            data: { status: 'completed', txHash },
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
      } catch (error: any) {
        console.error(`[claim] failed for case ${caseId} user ${userId}:`, error);
        await prisma.claim
          .update({
            where: { id: pendingClaim.id },
            data: {
              status: 'failed',
              metadata: {
                tokenAddress,
                chainType,
                error: String(error?.message || error).slice(0, 500),
              },
            },
          })
          .catch(() => {});
      }
    };

    // Fire-and-forget; do not await.
    void runClaim();

    res.json({
      status: 'success',
      data: {
        status: 'pending',
        claimId: pendingClaim.id,
        amount: total,
        tokenAddress,
        chainType,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getClaimStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const caseId = String(req.params.caseId || '');
    if (!caseId) {
      return next(new AppError('Case id is required', 400));
    }
    const claim = await prisma.claim.findFirst({
      where: { userId, caseId },
      orderBy: { createdAt: 'desc' },
    });
    if (!claim) {
      return res.json({ status: 'success', data: { status: 'none' } });
    }
    const meta = (claim.metadata as any) || {};
    res.json({
      status: 'success',
      data: {
        status: claim.status, // 'pending' | 'completed' | 'failed'
        claimId: claim.id,
        amount: claim.amount,
        txHash: claim.txHash,
        tokenAddress: meta.tokenAddress,
        chainType: claim.chainType,
        error: claim.status === 'failed' ? meta.error : undefined,
      },
    });
  } catch (error) {
    next(error);
  }
};
