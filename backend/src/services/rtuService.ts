import prisma from '../config/database.js';
import { Prisma } from '@prisma/client';

type PrismaLike = typeof prisma | Prisma.TransactionClient;

interface RtuEventInput {
  caseId: string;
  userId?: string;
  tokenSymbol: string;
  tokenPriceUsdt: number;
  rtuPercent: number;
  type: 'OPEN' | 'UPGRADE' | 'BATTLE' | 'ADJUST';
  deltaSpentUsdt: number;
  deltaToken: number;
  metadata?: Record<string, any>;
}

const getOrCreateLedger = async (db: PrismaLike, input: RtuEventInput) => {
  const existing = await db.rtuLedger.findFirst({
    where: { caseId: input.caseId, tokenSymbol: input.tokenSymbol },
  });

  if (existing) {
    if (
      existing.tokenPriceUsdt !== input.tokenPriceUsdt ||
      existing.rtuPercent !== input.rtuPercent
    ) {
      return db.rtuLedger.update({
        where: { id: existing.id },
        data: {
          tokenPriceUsdt: input.tokenPriceUsdt,
          rtuPercent: input.rtuPercent,
        },
      });
    }
    return existing;
  }

  return db.rtuLedger.create({
    data: {
      caseId: input.caseId,
      tokenSymbol: input.tokenSymbol,
      tokenPriceUsdt: input.tokenPriceUsdt,
      rtuPercent: input.rtuPercent,
    },
  });
};

export const recordRtuEvent = async (input: RtuEventInput, tx?: PrismaLike) => {
  const db = tx ?? prisma;
  if (!input.tokenPriceUsdt || input.tokenPriceUsdt <= 0) return null;

  const ledger = await getOrCreateLedger(db, input);
  const nextSpent = ledger.totalSpentUsdt + input.deltaSpentUsdt;
  const nextIssued = ledger.totalTokenIssued + input.deltaToken;
  const allowedTokens =
    input.tokenPriceUsdt > 0
      ? (nextSpent * (input.rtuPercent / 100)) / input.tokenPriceUsdt
      : 0;
  const bufferDebtToken = allowedTokens - nextIssued;

  await db.rtuLedger.update({
    where: { id: ledger.id },
    data: {
      totalSpentUsdt: nextSpent,
      totalTokenIssued: nextIssued,
      bufferDebtToken,
      tokenPriceUsdt: input.tokenPriceUsdt,
      rtuPercent: input.rtuPercent,
    },
  });

  return db.rtuEvent.create({
    data: {
      ledgerId: ledger.id,
      caseId: input.caseId,
      userId: input.userId,
      tokenSymbol: input.tokenSymbol,
      type: input.type,
      deltaSpentUsdt: input.deltaSpentUsdt,
      deltaToken: input.deltaToken,
      metadata: input.metadata ?? {},
    },
  });
};
