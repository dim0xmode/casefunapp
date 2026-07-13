import { ethers } from 'ethers';
import prisma from '../config/database.js';
import { config } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { getEvmChain, EvmChainKey } from './blockchain.js';
import { getBotUsdPrice, getEthUsdPrice } from './priceService.js';
import { botQueue, evmQueue } from './chainQueue.js';

/** Resolve the EVM chain key for a case (defaults to the main EVM chain). */
const chainKeyForCase = (chainType?: string | null): EvmChainKey =>
  chainType === 'BOT' ? 'BOT' : 'EVM';

/** Per-chain FIFO queue so BOT and EVM don't block one another. */
const queueForChain = (key: EvmChainKey) => (key === 'BOT' ? botQueue : evmQueue);

/** Native price feed used to value case-revenue payouts on a given chain. */
const nativePriceForChain = (key: EvmChainKey) =>
  key === 'BOT' ? getBotUsdPrice() : getEthUsdPrice();

export const deployCaseToken = async (
  name: string,
  symbol: string,
  chainKey: EvmChainKey = 'EVM',
) => {
  const chain = getEvmChain(chainKey);
  const factory = chain.getTokenFactoryContract();
  if (!factory) {
    throw new AppError('Token factory is not configured', 500);
  }
  const receipt = await queueForChain(chainKey).enqueue(`deployCaseToken:${chainKey}:${symbol}`, async () => {
    const tx = await factory.createToken(name, symbol);
    return tx.wait(chain.confirmations);
  });
  const parsed = receipt?.logs
    .map((log: any) => {
      try {
        return factory.interface.parseLog(log);
      } catch (error) {
        return null;
      }
    })
    .find((event: any) => event?.name === 'TokenDeployed');

  const tokenAddress = parsed?.args?.token as string | undefined;
  if (!tokenAddress) {
    throw new AppError('Token deployment failed', 500);
  }
  return tokenAddress;
};

export const isCaseExpired = (createdAt?: Date, openDurationHours?: number | null) => {
  if (!createdAt || !openDurationHours) return false;
  const endAt = createdAt.getTime() + openDurationHours * 60 * 60 * 1000;
  return Date.now() >= endAt;
};

export const mintCaseIfNeeded = async (caseId: string) => {
  const caseInfo = await prisma.case.findUnique({
    where: { id: caseId },
  });
  if (!caseInfo) {
    throw new AppError('Case not found', 404);
  }
  if (!caseInfo.tokenAddress) {
    throw new AppError('Token not configured for case', 400);
  }
  if (caseInfo.mintedAt) {
    return caseInfo;
  }
  if (!isCaseExpired(caseInfo.createdAt, caseInfo.openDurationHours)) {
    throw new AppError('Case is not expired', 400);
  }

  const chainKey = chainKeyForCase((caseInfo as any).chainType);
  const chain = getEvmChain(chainKey);

  const totalAgg = await prisma.inventoryItem.aggregate({
    where: { caseId, status: 'ACTIVE' },
    _sum: { value: true },
  });
  const totalValue = Number(totalAgg._sum.value || 0);

  if (totalValue > 0) {
    const treasury = chain.getTreasuryContract();
    if (!treasury) {
      throw new AppError('Treasury is not configured', 500);
    }
    const amount = ethers.parseUnits(totalValue.toFixed(6), caseInfo.tokenDecimals || 18);
    await queueForChain(chainKey).enqueue(`mintCase:${chainKey}:${caseId}`, async () => {
      const tx = await treasury.mintToken(caseInfo.tokenAddress, chain.treasuryAddress, amount);
      return tx.wait(chain.confirmations);
    });
  }

  return prisma.case.update({
    where: { id: caseId },
    data: {
      mintedAt: new Date(),
      totalSupply: totalValue,
    },
  });
};

export const payoutCaseRevenue = async (caseId: string) => {
  const caseInfo = await prisma.case.findUnique({
    where: { id: caseId },
  });
  if (!caseInfo) {
    throw new AppError('Case not found', 404);
  }
  if (!caseInfo.mintedAt || !caseInfo.tokenAddress) {
    return caseInfo;
  }
  if (caseInfo.payoutAt) {
    return caseInfo;
  }

  const chainKey = chainKeyForCase((caseInfo as any).chainType);
  const chain = getEvmChain(chainKey);

  const payoutAddress = chain.payoutAddress;
  if (!payoutAddress) {
    throw new AppError('Payout address not configured', 500);
  }

  const openingsCount = await prisma.caseOpening.count({
    where: { caseId },
  });
  const totalSpentUsdt = Number(openingsCount) * Number(caseInfo.price || 0);
  if (!Number.isFinite(totalSpentUsdt) || totalSpentUsdt <= 0) {
    return caseInfo;
  }

  const priceInfo = await nativePriceForChain(chainKey);
  if (!priceInfo) {
    throw new AppError('Price feed unavailable', 503);
  }

  const payoutEth = totalSpentUsdt / priceInfo.price;
  if (!Number.isFinite(payoutEth) || payoutEth <= 0) {
    return caseInfo;
  }

  const treasury = chain.getTreasuryContract();
  if (!treasury) {
    throw new AppError('Treasury is not configured', 500);
  }

  const amountWei = ethers.parseEther(payoutEth.toFixed(6));
  const tx = await queueForChain(chainKey).enqueue(`payoutCase:${chainKey}:${caseId}`, async () => {
    const sent = await treasury.withdraw(payoutAddress, amountWei);
    await sent.wait(chain.confirmations);
    return sent;
  });

  return prisma.case.update({
    where: { id: caseId },
    data: {
      payoutAt: new Date(),
      payoutTxHash: tx.hash,
      payoutEth,
      payoutUsdt: totalSpentUsdt,
      payoutPriceUsdt: priceInfo.price,
    },
  });
};
