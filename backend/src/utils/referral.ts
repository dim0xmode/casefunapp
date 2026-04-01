import crypto from 'crypto';
import type { PrismaClient } from '@prisma/client';

const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const normalizeReferralCode = (raw: unknown): string | null => {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length === 8 ? s : null;
};

export const resolveReferrerIdByCode = async (
  prisma: PrismaClient,
  raw: unknown
): Promise<string | undefined> => {
  const code = normalizeReferralCode(raw);
  if (!code) return undefined;
  const referrer = await prisma.user.findFirst({
    where: { referralCode: code },
    select: { id: true },
  });
  return referrer?.id;
};

export const generateUniqueReferralCode = async (prisma: PrismaClient): Promise<string> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let code = '';
    for (let i = 0; i < 8; i += 1) {
      code += REFERRAL_CODE_ALPHABET[crypto.randomInt(0, REFERRAL_CODE_ALPHABET.length)];
    }
    const exists = await prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });
    if (!exists) return code;
  }
  throw new Error('Could not allocate referral code');
};
