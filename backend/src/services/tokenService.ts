import { ethers } from 'ethers';
import prisma from '../config/database.js';
import { config } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { getTokenFactoryContract, getTreasuryContract } from './blockchain.js';
import { getEthUsdPrice } from './priceService.js';

export const deployCaseToken = async (name: string, symbol: string) => {
  const factory = getTokenFactoryContract();
  if (!factory) {
    throw new AppError('Token factory is not configured', 500);
  }
  const tx = await factory.createToken(name, symbol);
  const receipt = await tx.wait(config.confirmations);
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

  const totalAgg = await prisma.inventoryItem.aggregate({
    where: { caseId, status: 'ACTIVE' },
    _sum: { value: true },
  });
  const totalValue = Number(totalAgg._sum.value || 0);

  if (totalValue > 0) {
    const treasury = getTreasuryContract();
    if (!treasury) {
      throw new AppError('Treasury is not configured', 500);
    }
    const amount = ethers.parseUnits(totalValue.toFixed(6), caseInfo.tokenDecimals || 18);
    const tx = await treasury.mintToken(caseInfo.tokenAddress, config.treasuryAddress, amount);
    await tx.wait(config.confirmations);
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

  const payoutAddress = config.treasuryPayoutAddress || config.bootstrapAdminWallet;
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

  const priceInfo = await getEthUsdPrice();
  if (!priceInfo) {
    throw new AppError('Price feed unavailable', 503);
  }

  const payoutEth = totalSpentUsdt / priceInfo.price;
  if (!Number.isFinite(payoutEth) || payoutEth <= 0) {
    return caseInfo;
  }

  const treasury = getTreasuryContract();
  if (!treasury) {
    throw new AppError('Treasury is not configured', 500);
  }

  const amountWei = ethers.parseEther(payoutEth.toFixed(6));
  const tx = await treasury.withdraw(payoutAddress, amountWei);
  await tx.wait(config.confirmations);

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
