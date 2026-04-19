import crypto from 'crypto';

const MERGE_TOKEN_TTL_MS = 5 * 60 * 1000;

interface PendingMerge {
  primaryUserId: string;
  secondaryUserId: string;
  expiresAt: number;
}

const pendingMergeTokens = new Map<string, PendingMerge>();

const cleanupMergeTokens = () => {
  const now = Date.now();
  for (const [token, data] of pendingMergeTokens.entries()) {
    if (data.expiresAt <= now) pendingMergeTokens.delete(token);
  }
};

export const createMergeToken = (primaryUserId: string, secondaryUserId: string): string => {
  cleanupMergeTokens();
  const token = crypto.randomBytes(24).toString('hex');
  pendingMergeTokens.set(token, {
    primaryUserId,
    secondaryUserId,
    expiresAt: Date.now() + MERGE_TOKEN_TTL_MS,
  });
  return token;
};

export const consumeMergeToken = (
  token: string,
  expectedPrimaryUserId: string,
  expectedSecondaryUserId: string
): boolean => {
  cleanupMergeTokens();
  const pending = pendingMergeTokens.get(token);
  if (!pending) return false;
  if (pending.primaryUserId !== expectedPrimaryUserId) return false;
  if (pending.secondaryUserId !== expectedSecondaryUserId) return false;
  pendingMergeTokens.delete(token);
  return true;
};

export const peekMergeToken = (token: string): PendingMerge | null => {
  cleanupMergeTokens();
  return pendingMergeTokens.get(token) ?? null;
};
