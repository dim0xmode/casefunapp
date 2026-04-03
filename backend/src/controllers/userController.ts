import { Request, Response, NextFunction } from 'express';
import { createHash, createHmac, randomBytes } from 'crypto';
import prisma from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { config } from '../config/env.js';
import { getRarityByValue, RARITY_COLORS } from '../utils/rarity.js';
import { recordRtuEvent } from '../services/rtuService.js';
import { saveImage } from '../utils/upload.js';
import { resolveBattleDrops } from '../services/battleResolveService.js';
import {
  verifyTelegramWebAppInitData,
  verifyTelegramLoginPayload,
  verifyTelegramOidcIdToken,
} from '../utils/telegramAuth.js';
import {
  createTelegramBotLink,
  getTelegramBotLinkTokenPayload,
  getTelegramBotPublicInfo,
} from '../services/telegramLinkBotService.js';

const roundToTwo = (value: number) => Number(value.toFixed(2));
const FEEDBACK_TOPICS = ['BUG_REPORT', 'EARLY_ACCESS', 'PARTNERSHIP'] as const;
const EARLY_ACCESS_MESSAGE_MAX_LENGTH = 200;
const EARLY_ACCESS_BLOCK_REASONS = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  ALREADY_APPROVED: 'ALREADY_APPROVED',
  ALREADY_EARLY_ACCESS: 'ALREADY_EARLY_ACCESS',
  ADMIN_ACCOUNT: 'ADMIN_ACCOUNT',
  SUPPORT_ACCOUNT: 'SUPPORT_ACCOUNT',
  /** Signed up via a referral link; early access is granted after qualifying deposit, not via application. */
  REFERRAL_SIGNUP: 'REFERRAL_SIGNUP',
} as const;
const TWITTER_AUTHORIZE_URL = 'https://twitter.com/i/oauth2/authorize';
const TWITTER_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const TWITTER_ME_URL = 'https://api.twitter.com/2/users/me?user.fields=id,name,username';
const TWITTER_STATE_TTL_MS = 10 * 60 * 1000;
const TWITTER_SCOPE = 'users.read tweet.read offline.access';

const encodeBase64Url = (value: Buffer | string) => {
  const raw = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
  return raw
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
};

interface TwitterStatePayload {
  userId: string;
  ts: number;
  nonce: string;
  verifier: string;
}

const signTwitterState = (payload: TwitterStatePayload) => {
  const serialized = JSON.stringify(payload);
  return createHmac('sha256', config.jwtSecret).update(serialized).digest('hex');
};

const createTwitterCodeVerifier = () => encodeBase64Url(randomBytes(48));

const createTwitterCodeChallenge = (verifier: string) => {
  return encodeBase64Url(createHash('sha256').update(verifier).digest());
};

const createTwitterState = (userId: string) => {
  const payload: TwitterStatePayload = {
    userId,
    ts: Date.now(),
    nonce: encodeBase64Url(randomBytes(12)),
    verifier: createTwitterCodeVerifier(),
  };
  const signature = signTwitterState(payload);
  return encodeBase64Url(JSON.stringify({ payload, signature }));
};

const parseTwitterState = (rawState: string) => {
  try {
    const decoded = decodeBase64Url(rawState);
    const parsed = JSON.parse(decoded) as { payload?: TwitterStatePayload; signature?: string };
    if (!parsed?.payload || !parsed?.signature) {
      return null;
    }
    const expectedSignature = signTwitterState(parsed.payload);
    if (expectedSignature !== parsed.signature) {
      return null;
    }
    const ageMs = Date.now() - Number(parsed.payload.ts || 0);
    if (ageMs < 0 || ageMs > TWITTER_STATE_TTL_MS) {
      return null;
    }
    if (!parsed.payload.userId || !parsed.payload.verifier) {
      return null;
    }
    return parsed.payload;
  } catch {
    return null;
  }
};

type BattleMode = 'BOT' | 'PVP';
type BattleTieWinner = 'USER' | 'OPPONENT';

type BattleProofDrop = {
  id: string;
  caseId: string;
  name: string;
  value: number;
  currency: string;
  rarity: string;
  color: string;
  image: string | null;
};

type BattleProofPayload = {
  userId: string;
  mode: BattleMode;
  caseIds: string[];
  userDrops: BattleProofDrop[];
  opponentDrops: BattleProofDrop[];
  tieWinner: BattleTieWinner;
  expiresAt: number;
};

const BATTLE_PROOF_TTL_MS = 15 * 60 * 1000;
const BATTLE_CHARGE_WINDOW_MS = 30 * 60 * 1000;

const normalizeCaseIds = (raw: any): string[] =>
  (Array.isArray(raw) ? raw : [])
    .map((value: any) => String(value || '').trim())
    .filter(Boolean)
    .slice(0, 25);

const toBattleProofDrop = (drop: any): BattleProofDrop => ({
  id: String(drop?.id || ''),
  caseId: String(drop?.caseId || ''),
  name: String(drop?.name || 'Reward'),
  value: roundToTwo(Number(drop?.value || 0)),
  currency: String(drop?.currency || ''),
  rarity: String(drop?.rarity || 'COMMON'),
  color: String(drop?.color || '#9CA3AF'),
  image: drop?.image ? String(drop.image) : null,
});

type BattleProofCorePayload = {
  userId: string;
  mode: BattleMode;
  caseIds: string[];
  userDrops: BattleProofDrop[];
  opponentDrops: BattleProofDrop[];
};

const normalizeProofDrops = (drops: BattleProofDrop[]) =>
  (Array.isArray(drops) ? drops : []).map((drop) => ({
    id: String(drop?.id || ''),
    caseId: String(drop?.caseId || '').trim(),
    name: String(drop?.name || 'Reward'),
    value: roundToTwo(Number(drop?.value || 0)),
    currency: String(drop?.currency || ''),
    rarity: String(drop?.rarity || 'COMMON').toUpperCase(),
    color: String(drop?.color || '#9CA3AF'),
    image: drop?.image ? String(drop.image) : null,
  }));

const toProofCorePayload = (payload: BattleProofCorePayload): BattleProofCorePayload => ({
  userId: String(payload.userId || '').trim(),
  mode: payload.mode === 'BOT' ? 'BOT' : 'PVP',
  caseIds: normalizeCaseIds(payload.caseIds),
  userDrops: normalizeProofDrops(payload.userDrops),
  opponentDrops: normalizeProofDrops(payload.opponentDrops),
});

const hasSameCaseSequence = (left: string[], right: string[]) =>
  left.length === right.length && left.every((caseId, index) => caseId === right[index]);

const deriveBattleTieWinner = (payload: BattleProofCorePayload): BattleTieWinner => {
  const core = toProofCorePayload(payload);
  const digest = createHmac('sha256', config.jwtSecret)
    .update(JSON.stringify(core))
    .digest();
  return digest[0] % 2 === 0 ? 'USER' : 'OPPONENT';
};

/** Same battle → same coin flip for both players (host vs joiner). Do not hash userId or per-player drop order. */
const derivePvpLobbyTieWinnerForRequester = (
  lobbyId: string,
  caseIds: string[],
  rounds: any[],
  requesterIsHost: boolean,
): BattleTieWinner => {
  const hostDrops = rounds.map((round: any) => toBattleProofDrop(round.hostDrop || round.userDrop));
  const joinerDrops = rounds.map((round: any) => toBattleProofDrop(round.joinerDrop || round.opponentDrop));
  const digest = createHmac('sha256', config.jwtSecret)
    .update(
      JSON.stringify({
        v: 1,
        lobbyId: String(lobbyId || ''),
        caseIds: normalizeCaseIds(caseIds),
        hostDrops,
        joinerDrops,
      }),
    )
    .digest();
  const hostWinsTie = digest[0] % 2 === 0;
  if (requesterIsHost) return hostWinsTie ? 'USER' : 'OPPONENT';
  return hostWinsTie ? 'OPPONENT' : 'USER';
};

const createBattleProofBundleWithTieWinner = (payload: BattleProofCorePayload, tieWinner: BattleTieWinner) => {
  const core = toProofCorePayload(payload);
  const battleProofPayload: BattleProofPayload = {
    ...core,
    tieWinner,
    expiresAt: Date.now() + BATTLE_PROOF_TTL_MS,
  };
  return {
    tieWinner,
    battleProof: createBattleProof(battleProofPayload),
    proofKey: createBattleProofKey(battleProofPayload),
  };
};

const createBattleProofKey = (payload: Pick<BattleProofPayload, 'userId' | 'mode' | 'caseIds' | 'userDrops' | 'opponentDrops' | 'tieWinner'>) => {
  const core = toProofCorePayload(payload);
  const tieWinner: BattleTieWinner = payload.tieWinner === 'OPPONENT' ? 'OPPONENT' : 'USER';
  return createHmac('sha256', config.jwtSecret)
    .update(JSON.stringify({ ...core, tieWinner }))
    .digest('hex');
};

const createBattleProofBundle = (payload: BattleProofCorePayload) => {
  const tieWinner = deriveBattleTieWinner(payload);
  return createBattleProofBundleWithTieWinner(payload, tieWinner);
};

const createBattleProof = (payload: BattleProofPayload) => {
  const signature = createHmac('sha256', config.jwtSecret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return encodeBase64Url(JSON.stringify({ payload, signature }));
};

const parseBattleProof = (rawProof: string, userId: string): { payload: BattleProofPayload; signature: string } | null => {
  try {
    const decoded = decodeBase64Url(String(rawProof || ''));
    const parsed = JSON.parse(decoded) as { payload?: BattleProofPayload; signature?: string };
    if (!parsed?.payload || !parsed?.signature) return null;

    const expected = createHmac('sha256', config.jwtSecret)
      .update(JSON.stringify(parsed.payload))
      .digest('hex');
    if (expected !== parsed.signature) return null;

    const payload = parsed.payload;
    if (String(payload.userId || '') !== userId) return null;
    if (!['BOT', 'PVP'].includes(String(payload.mode || ''))) return null;
    if (!['USER', 'OPPONENT'].includes(String(payload.tieWinner || ''))) return null;
    if (!Array.isArray(payload.caseIds) || payload.caseIds.length === 0 || payload.caseIds.length > 25) return null;
    if (!Array.isArray(payload.userDrops) || payload.userDrops.length !== payload.caseIds.length) return null;
    if (!Array.isArray(payload.opponentDrops) || payload.opponentDrops.length !== payload.caseIds.length) return null;
    if (!Number.isFinite(Number(payload.expiresAt || 0)) || Number(payload.expiresAt) <= Date.now()) return null;

    const dropsValid = [...payload.userDrops, ...payload.opponentDrops].every((drop) => {
      const value = Number(drop?.value || 0);
      return Boolean(String(drop?.caseId || '').trim()) && Number.isFinite(value) && value >= 0;
    });
    if (!dropsValid) return null;

    return { payload, signature: String(parsed.signature) };
  } catch {
    return null;
  }
};

const getBattleCostByCaseIds = async (
  db: any,
  caseIds: string[],
  options?: { requireActive?: boolean }
) => {
  const normalizedCaseIds = normalizeCaseIds(caseIds);
  if (!normalizedCaseIds.length) {
    throw new AppError('Select at least one case', 400);
  }
  const uniqueCaseIds = Array.from(new Set(normalizedCaseIds));
  const rows = await db.case.findMany({
    where: {
      id: { in: uniqueCaseIds },
      ...(options?.requireActive === false ? {} : { isActive: true }),
    },
    select: { id: true, price: true },
  });
  if (rows.length !== uniqueCaseIds.length) {
    throw new AppError('Some cases are not available', 400);
  }
  const byId = new Map(rows.map((row: any) => [String(row.id), Number(row.price || 0)]));
  const totalCost = normalizedCaseIds.reduce((sum, caseId) => sum + Number(byId.get(caseId) || 0), 0);
  return roundToTwo(totalCost);
};

const getChargeMetadata = (metadata: any) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  return metadata as Record<string, any>;
};

const ensureTwitterConfigured = () => {
  if (!config.twitterClientId || !config.twitterClientSecret || !config.twitterRedirectUri) {
    throw new AppError('Twitter integration is not configured', 503);
  }
};

const buildPublicUser = (user: any) => ({
  id: user.id,
  username: user.username,
  walletAddress: user.walletAddress,
  hasLinkedWallet: Boolean(user.hasLinkedWallet),
  walletLinkedAt: user.walletLinkedAt,
  balance: user.balance,
  role: user.role,
  avatar: user.avatarUrl,
  avatarMeta: user.avatarMeta,
  telegramId: user.telegramId,
  telegramUsername: user.telegramUsername,
  telegramFirstName: user.telegramFirstName,
  telegramLastName: user.telegramLastName,
  telegramPhotoUrl: user.telegramPhotoUrl,
  telegramLinkedAt: user.telegramLinkedAt,
  twitterId: user.twitterId,
  twitterUsername: user.twitterUsername,
  twitterName: user.twitterName,
  twitterLinkedAt: user.twitterLinkedAt,
});

const exchangeTwitterCode = async (code: string, verifier: string) => {
  ensureTwitterConfigured();

  const body = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    client_id: config.twitterClientId,
    redirect_uri: config.twitterRedirectUri,
    code_verifier: verifier,
  });
  const basicAuth = Buffer.from(`${config.twitterClientId}:${config.twitterClientSecret}`).toString('base64');
  const response = await fetch(TWITTER_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: body.toString(),
  });
  const payload: any = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    const reason = payload?.error_description || payload?.error || 'Twitter token exchange failed';
    throw new AppError(String(reason), 400);
  }
  return String(payload.access_token);
};

const fetchTwitterProfile = async (accessToken: string) => {
  const response = await fetch(TWITTER_ME_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const payload: any = await response.json().catch(() => null);
  const profile = payload?.data;
  if (!response.ok || !profile?.id || !profile?.username) {
    const reason = payload?.title || payload?.detail || 'Failed to fetch Twitter profile';
    throw new AppError(String(reason), 400);
  }
  return {
    id: String(profile.id),
    username: String(profile.username),
    name: profile.name ? String(profile.name) : null,
  };
};

export const topUpBalance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { amount } = req.body;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      return next(new AppError('Invalid amount', 400));
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { balance: { increment: value } },
    });

    await prisma.transaction.create({
      data: {
        userId,
        type: 'DEPOSIT',
        amount: value,
        currency: 'USDT',
        metadata: { source: 'topup' },
      },
    });

    res.json({ status: 'success', data: { balance: user.balance } });
  } catch (error) {
    next(error);
  }
};

export const upgradeItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const MIN_UPGRADE_CHANCE = 0.1;
    const MAX_UPGRADE_CHANCE = 75;
    const MIN_UPGRADE_MULTIPLIER = 100 / MAX_UPGRADE_CHANCE;
    const userId = (req as any).userId;
    const { itemId, itemIds, multiplier } = req.body;
    const mult = Number(multiplier);
    const requestedIdsRaw = Array.isArray(itemIds)
      ? itemIds
      : itemId
      ? [itemId]
      : [];
    const requestedIds = Array.from(
      new Set(
        requestedIdsRaw
          .map((value: any) => String(value || '').trim())
          .filter(Boolean)
      )
    );
    if (!requestedIds.length || requestedIds.length > 9 || !Number.isFinite(mult) || mult < MIN_UPGRADE_MULTIPLIER) {
      return next(new AppError('Invalid upgrade parameters', 400));
    }

    const items = await prisma.inventoryItem.findMany({
      where: { id: { in: requestedIds }, userId, status: 'ACTIVE' },
    });

    if (items.length !== requestedIds.length) {
      return next(new AppError('Item not found', 404));
    }
    if (!items.length) {
      return next(new AppError('No items selected', 400));
    }
    const baseItem = items[0];
    const sameCurrency = items.every((item) => item.currency === baseItem.currency);
    const sameCase = items.every((item) => item.caseId === baseItem.caseId);
    if (!sameCurrency || !sameCase) {
      return next(new AppError('All selected cards must be from the same token/case', 400));
    }

    if (baseItem.caseId) {
      const caseInfo = await prisma.case.findUnique({
        where: { id: baseItem.caseId },
      });
      if (caseInfo?.openDurationHours && caseInfo.createdAt) {
        const endAt = new Date(caseInfo.createdAt).getTime() + caseInfo.openDurationHours * 60 * 60 * 1000;
        if (Date.now() >= endAt) {
          return next(new AppError('Case expired', 400));
        }
      }
    }

    const rawChance = (1 / mult) * 100;
    if (rawChance > MAX_UPGRADE_CHANCE + 1e-9) {
      return next(new AppError('Upgrade blocked', 400));
    }
    const winChance = Math.min(MAX_UPGRADE_CHANCE, Math.max(MIN_UPGRADE_CHANCE, rawChance));
    const totalBaseValue = items.reduce((sum, item) => sum + Number(item.value || 0), 0);
    const targetValue = roundToTwo(totalBaseValue * mult);

    let reserveToken = 0;
    let neededDelta = Math.max(0, targetValue - totalBaseValue);
    if (baseItem.caseId) {
      const caseInfo = await prisma.case.findUnique({
        where: { id: baseItem.caseId },
      });
      if (caseInfo?.tokenPrice) {
        const tokenSymbol = caseInfo.tokenTicker || caseInfo.currency;
        const ledger = await prisma.rtuLedger.findFirst({
          where: {
            caseId: baseItem.caseId,
            tokenSymbol,
          },
        });
        reserveToken = Math.max(0, Number(ledger?.bufferDebtToken || 0));
      }
    }

    // Surplus-aware chance shaping:
    // - large reserve surplus => noticeably higher chance
    // - low reserve => noticeably lower chance
    const coverage = neededDelta <= 1e-9 ? 1 : reserveToken / neededDelta;
    const surplusBoostFactor = Math.max(0, Math.min(1, (coverage - 1) / 3)); // reserve 1x..4x needed => 0..1
    const deficitPenaltyFactor = Math.max(0, Math.min(1, (1 - coverage) / 1)); // reserve 100%..0% needed => 0..1
    const adjustedWinChance = Math.max(
      MIN_UPGRADE_CHANCE,
      Math.min(
        95,
        winChance + surplusBoostFactor * 24 - deficitPenaltyFactor * 26
      )
    );
    const isSuccess = Math.random() * 100 <= adjustedWinChance;

    const result = await prisma.$transaction(async (tx) => {
      let newItem = null;
      await tx.inventoryItem.updateMany({
        where: { id: { in: requestedIds }, userId, status: 'ACTIVE' },
        data: { status: 'BURNT' },
      });

      if (isSuccess) {
        const rarity = getRarityByValue(targetValue);
        newItem = await tx.inventoryItem.create({
          data: {
            userId,
            caseId: baseItem.caseId,
            name: `${targetValue} ${baseItem.currency}`,
            value: targetValue,
            currency: baseItem.currency,
            rarity,
            color: (RARITY_COLORS as Record<string, string>)[rarity],
            image: baseItem.image || null,
            status: 'ACTIVE',
          },
        });
      }

      await tx.transaction.create({
        data: {
          userId,
          type: 'UPGRADE',
          amount: 0,
          currency: baseItem.currency,
          metadata: {
            itemIds: requestedIds,
            multiplier: mult,
            totalBaseValue,
            targetValue,
            success: isSuccess,
            baseWinChance: winChance,
            adjustedWinChance,
            reserveToken,
            neededDelta,
            reserveCoverage: coverage,
          },
        },
      });

      if (baseItem.caseId) {
        const caseInfo = await tx.case.findUnique({
          where: { id: baseItem.caseId },
        });
        if (caseInfo?.tokenPrice) {
          const deltaToken = isSuccess ? targetValue - totalBaseValue : -totalBaseValue;
          await recordRtuEvent(
            {
              caseId: baseItem.caseId,
              userId,
              tokenSymbol: caseInfo.tokenTicker || caseInfo.currency,
              tokenPriceUsdt: caseInfo.tokenPrice,
              rtuPercent: caseInfo.rtu,
              type: 'UPGRADE',
              deltaSpentUsdt: 0,
              deltaToken,
              metadata: {
                itemIds: requestedIds,
                targetValue,
                totalBaseValue,
                success: isSuccess,
                baseWinChance: winChance,
                adjustedWinChance,
                reserveToken,
                neededDelta,
                reserveCoverage: coverage,
              },
            },
            tx
          );
        }
      }

      return { newItem };
    });

    res.json({
      status: 'success',
      data: {
        success: isSuccess,
        targetValue,
        baseWinChance: winChance,
        adjustedWinChance,
        newItem: result.newItem,
        burntItemIds: requestedIds,
        consumedItemIds: requestedIds,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const rawUsername = String(req.body?.username || '').trim().toUpperCase();
    if (!rawUsername) {
      return next(new AppError('Username is required', 400));
    }
    if (!/^[A-Z0-9_-]{3,20}$/.test(rawUsername)) {
      return next(new AppError('Username must be 3-20 chars (A-Z, 0-9, _ or -)', 400));
    }
    if (rawUsername.startsWith('USER_')) {
      return next(new AppError('Username is reserved', 400));
    }

    const existing = await prisma.user.findFirst({
      where: { username: rawUsername, NOT: { id: userId } },
    });
    if (existing) {
      return next(new AppError('Username is already taken', 400));
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { username: rawUsername },
    });

    res.json({
      status: 'success',
      data: {
        user: buildPublicUser(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const checkUsernameAvailability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const rawUsername = String(req.query?.username || req.query?.value || '').trim().toUpperCase();
    if (!rawUsername) {
      return res.json({ status: 'success', data: { available: false, reason: 'required' } });
    }
    if (!/^[A-Z0-9_-]{3,20}$/.test(rawUsername)) {
      return res.json({ status: 'success', data: { available: false, reason: 'invalid' } });
    }
    if (rawUsername.startsWith('USER_')) {
      return res.json({ status: 'success', data: { available: false, reason: 'reserved' } });
    }

    const existing = await prisma.user.findFirst({
      where: {
        username: rawUsername,
        NOT: { id: userId },
      },
    });

    res.json({ status: 'success', data: { available: !existing } });
  } catch (error) {
    next(error);
  }
};

export const uploadAvatar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    if (!req.file) {
      return next(new AppError('Avatar file is required', 400));
    }

    let avatarMeta: any = undefined;
    if (req.body?.meta) {
      try {
        avatarMeta = JSON.parse(req.body.meta);
      } catch (error) {
        return next(new AppError('Invalid avatar meta format', 400));
      }
    }

    const avatarUrl = await saveImage(req.file, 'avatar');

    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl, ...(avatarMeta ? { avatarMeta } : {}) },
    });

    res.json({
      status: 'success',
      data: {
        avatarUrl,
        user: buildPublicUser(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateAvatarMeta = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { meta } = req.body;
    if (!meta || typeof meta !== 'object') {
      return next(new AppError('Avatar meta is required', 400));
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatarMeta: meta },
    });

    res.json({
      status: 'success',
      data: {
        user: buildPublicUser(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

const ensureTelegramMiniAppConfigured = () => {
  if (!config.telegramBotToken) {
    throw new AppError('Telegram integration is not configured', 503);
  }
};

const getTelegramWebLoginClientId = () => {
  const clientId = String(config.telegramAuthClientId || '').trim();
  if (!clientId) {
    throw new AppError('Telegram web login is not configured', 503);
  }
  return clientId;
};

export const linkTelegramAccount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String((req as any).userId || '').trim();
    const initData = String(req.body?.initData || '').trim();
    if (!userId) {
      return next(new AppError('Authentication required', 401));
    }
    ensureTelegramMiniAppConfigured();

    const telegram = verifyTelegramWebAppInitData({
      initData,
      botToken: config.telegramBotToken,
      maxAgeSeconds: config.telegramAuthMaxAgeSeconds,
    });

    const existing = await prisma.user.findFirst({
      where: {
        telegramId: telegram.telegramId,
        NOT: { id: userId },
      },
      select: { id: true },
    });
    if (existing) {
      return next(new AppError('This Telegram account is already linked to another user', 409));
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        telegramId: telegram.telegramId,
        telegramUsername: telegram.telegramUsername,
        telegramFirstName: telegram.telegramFirstName,
        telegramLastName: telegram.telegramLastName,
        telegramPhotoUrl: telegram.telegramPhotoUrl,
        telegramLinkedAt: new Date(),
      },
    });

    res.json({
      status: 'success',
      data: {
        user: buildPublicUser(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const linkTelegramWebAccount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String((req as any).userId || '').trim();
    if (!userId) {
      return next(new AppError('Authentication required', 401));
    }
    const payload = (req.body || {}) as Record<string, unknown>;
    const idToken = String(payload.id_token || '').trim();
    const telegram = idToken
      ? await verifyTelegramOidcIdToken({
          idToken,
          clientId: getTelegramWebLoginClientId(),
          maxAgeSeconds: config.telegramAuthMaxAgeSeconds,
        })
      : verifyTelegramLoginPayload({
          payload,
          botToken: config.telegramBotToken,
          maxAgeSeconds: config.telegramAuthMaxAgeSeconds,
        });

    const existing = await prisma.user.findFirst({
      where: {
        telegramId: telegram.telegramId,
        NOT: { id: userId },
      },
      select: { id: true },
    });
    if (existing) {
      return next(new AppError('This Telegram account is already linked to another user', 409));
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        telegramId: telegram.telegramId,
        telegramUsername: telegram.telegramUsername,
        telegramFirstName: telegram.telegramFirstName,
        telegramLastName: telegram.telegramLastName,
        telegramPhotoUrl: telegram.telegramPhotoUrl,
        telegramLinkedAt: new Date(),
      },
    });

    res.json({
      status: 'success',
      data: {
        user: buildPublicUser(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const startTelegramBotLink = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String((req as any).userId || '').trim();
    if (!userId) {
      return next(new AppError('Authentication required', 401));
    }

    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, telegramId: true },
    });
    if (!current) {
      return next(new AppError('User not found', 404));
    }
    if (current.telegramId) {
      return next(new AppError('Telegram is already linked', 409));
    }

    const link = await createTelegramBotLink(userId);
    res.json({
      status: 'success',
      data: {
        url: link.url,
        token: link.token,
        botUsername: link.botUsername,
        expiresAt: link.expiresAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getTelegramBotLinkStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String((req as any).userId || '').trim();
    if (!userId) {
      return next(new AppError('Authentication required', 401));
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return next(new AppError('User not found', 404));
    }
    if (user.telegramId) {
      return res.json({
        status: 'success',
        data: {
          linked: true,
          user: buildPublicUser(user),
        },
      });
    }

    const token = String(req.query?.token || '').trim();
    if (!token) {
      return next(new AppError('Telegram link token is required', 400));
    }
    const session = getTelegramBotLinkTokenPayload(token, userId);

    if (session.state === 'FAILED') {
      return res.json({
        status: 'success',
        data: {
          linked: false,
          failed: true,
          reason:
            session.failureMessage ||
            'Telegram link failed. Start a new link from profile and try again.',
          user: buildPublicUser(user),
        },
      });
    }

    res.json({
      status: 'success',
      data: {
        linked: false,
        failed: false,
        user: buildPublicUser(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getTelegramBotInfo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String((req as any).userId || '').trim();
    if (!userId) {
      return next(new AppError('Authentication required', 401));
    }
    const info = await getTelegramBotPublicInfo();
    res.json({
      status: 'success',
      data: info,
    });
  } catch (error) {
    next(error);
  }
};

export const unlinkTelegramAccount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String((req as any).userId || '').trim();
    if (!userId) {
      return next(new AppError('Authentication required', 401));
    }

    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, hasLinkedWallet: true, telegramId: true },
    });
    if (!current) {
      return next(new AppError('User not found', 404));
    }
    if (!current.telegramId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      return res.json({ status: 'success', data: { user: user ? buildPublicUser(user) : null } });
    }
    if (!current.hasLinkedWallet) {
      return next(new AppError('Link wallet first, then you can unlink Telegram', 409));
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        telegramId: null,
        telegramUsername: null,
        telegramFirstName: null,
        telegramLastName: null,
        telegramPhotoUrl: null,
        telegramLinkedAt: null,
      },
    });

    res.json({
      status: 'success',
      data: {
        user: buildPublicUser(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getTwitterConnectUrl = async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureTwitterConfigured();
    const userId = String((req as any).userId || '').trim();
    if (!userId) {
      return next(new AppError('Authentication required', 401));
    }

    const state = createTwitterState(userId);
    const payload = parseTwitterState(state);
    if (!payload) {
      return next(new AppError('Failed to prepare Twitter auth state', 500));
    }
    const authUrl = new URL(TWITTER_AUTHORIZE_URL);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', config.twitterClientId);
    authUrl.searchParams.set('redirect_uri', config.twitterRedirectUri);
    authUrl.searchParams.set('scope', TWITTER_SCOPE);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', createTwitterCodeChallenge(payload.verifier));
    authUrl.searchParams.set('code_challenge_method', 'S256');

    res.json({
      status: 'success',
      data: {
        url: authUrl.toString(),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const linkTwitterAccount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String((req as any).userId || '').trim();
    const code = String(req.body?.code || '').trim();
    const state = String(req.body?.state || '').trim();
    if (!userId) {
      return next(new AppError('Authentication required', 401));
    }
    if (!code || !state) {
      return next(new AppError('Twitter code/state are required', 400));
    }

    const parsedState = parseTwitterState(state);
    if (!parsedState || parsedState.userId !== userId) {
      return next(new AppError('Invalid or expired Twitter state', 400));
    }

    const accessToken = await exchangeTwitterCode(code, parsedState.verifier);
    const twitterProfile = await fetchTwitterProfile(accessToken);

    const existing = await prisma.user.findFirst({
      where: {
        twitterId: twitterProfile.id,
        NOT: { id: userId },
      },
      select: { id: true },
    });
    if (existing) {
      return next(new AppError('This Twitter account is already linked to another user', 409));
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        twitterId: twitterProfile.id,
        twitterUsername: twitterProfile.username,
        twitterName: twitterProfile.name,
        twitterLinkedAt: new Date(),
      },
    });

    res.json({
      status: 'success',
      data: {
        user: buildPublicUser(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const unlinkTwitterAccount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String((req as any).userId || '').trim();
    if (!userId) {
      return next(new AppError('Authentication required', 401));
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        twitterId: null,
        twitterUsername: null,
        twitterName: null,
        twitterLinkedAt: null,
      },
    });

    res.json({
      status: 'success',
      data: {
        user: buildPublicUser(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const recordBattle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String((req as any).userId || '').trim();
    const lobbyId = req.body?.lobbyId ? String(req.body.lobbyId) : '';
    const opponentName = req.body?.opponentName ? String(req.body.opponentName).trim() : null;
    const battleProofRaw = String(req.body?.battleProof || '').trim();
    if (!userId) {
      return next(new AppError('Authentication required', 401));
    }

    const parsedProof = parseBattleProof(battleProofRaw, userId);
    if (!parsedProof) {
      return next(new AppError('Battle proof is invalid or expired', 400));
    }
    const parsedProofKey = createBattleProofKey(parsedProof.payload);

    const totalCost = await getBattleCostByCaseIds(prisma, parsedProof.payload.caseIds, { requireActive: false });
    const normalizeDrop = (drop: BattleProofDrop) => {
      const rarity = String(drop.rarity || 'COMMON').toUpperCase();
      return {
        id: String(drop.id || ''),
        caseId: String(drop.caseId || ''),
        name: String(drop.name || 'Reward'),
        value: roundToTwo(Number(drop.value || 0)),
        currency: String(drop.currency || ''),
        rarity,
        color: String(drop.color || (RARITY_COLORS as Record<string, string>)[rarity] || '#9CA3AF'),
        image: drop.image ? String(drop.image) : null,
      };
    };

    const userDrops = parsedProof.payload.userDrops.map(normalizeDrop);
    const opponentDrops = parsedProof.payload.opponentDrops.map(normalizeDrop);
    const finalUserTotal = userDrops.reduce((sum, item) => sum + Number(item.value || 0), 0);
    const finalOpponentTotal = opponentDrops.reduce((sum, item) => sum + Number(item.value || 0), 0);
    const userWon =
      finalUserTotal > finalOpponentTotal ||
      (finalUserTotal === finalOpponentTotal && parsedProof.payload.tieWinner === 'USER');

    const wonItems = userWon ? [...userDrops, ...opponentDrops] : [];
    const reserveItems = !userWon && parsedProof.payload.mode === 'BOT' ? userDrops : [];
    const wonValue = wonItems.reduce((sum, item) => sum + Number(item.value || 0), 0);

    const createdItems: any[] = [];
    const chargeWindowStart = new Date(Date.now() - BATTLE_CHARGE_WINDOW_MS);

    await prisma.$transaction(async (tx) => {
      const recentCharges = await tx.transaction.findMany({
        where: {
          userId,
          type: 'BATTLE',
          timestamp: { gte: chargeWindowStart },
        },
        orderBy: { timestamp: 'desc' },
        take: 160,
      });

      const chargeTx = recentCharges.find((entry) => {
        const metadata = getChargeMetadata(entry.metadata);
        if (!metadata || metadata.source !== 'battle_start' || metadata.battleConsumedAt) return false;
        const matchesAmount = Math.abs(Number(entry.amount || 0) + totalCost) <= 1e-6;
        if (!matchesAmount) return false;
        const metadataCaseIds = normalizeCaseIds(metadata.caseIds);
        const matchesCaseIds = hasSameCaseSequence(metadataCaseIds, parsedProof.payload.caseIds);
        const metadataProofSig = String(metadata.battleProofSig || '');
        const metadataProofKey = String(metadata.battleProofKey || '');
        if (metadataProofSig || metadataProofKey) {
          const signatureOrKeyMatch = (
            (metadataProofSig && metadataProofSig === parsedProof.signature) ||
            (metadataProofKey && metadataProofKey === parsedProofKey)
          );
          if (signatureOrKeyMatch) return true;
          // Legacy fallback: before battleProofKey existed, proof signatures could rotate by expiresAt.
          if (!metadataProofKey) return matchesCaseIds;
          return false;
        }
        return matchesCaseIds;
      });

      if (!chargeTx) {
        throw new AppError('Battle charge not found or already used', 409);
      }

      const chargeMetadata = getChargeMetadata(chargeTx.metadata) || {};
      await tx.transaction.update({
        where: { id: chargeTx.id },
        data: {
          metadata: {
            ...chargeMetadata,
            battleProofSig: parsedProof.signature,
            battleProofKey: parsedProofKey,
            battleConsumedAt: new Date().toISOString(),
            battleResult: userWon ? 'WIN' : 'LOSS',
          },
        },
      });

      await tx.battle.create({
        data: {
          userId,
          opponentId: opponentName || null,
          result: userWon ? 'WIN' : 'LOSS',
          cost: totalCost,
          wonValue,
          wonItems,
          roundCount: parsedProof.payload.caseIds.length,
        },
      });

      for (const item of wonItems) {
        const created = await tx.inventoryItem.create({
          data: {
            userId,
            caseId: item.caseId || null,
            name: item.name || `${item.value} ${item.currency}`,
            value: Number(item.value || 0),
            currency: item.currency,
            rarity: item.rarity,
            color: item.color || (RARITY_COLORS as Record<string, string>)[item.rarity],
            image: item.image || null,
            status: 'ACTIVE',
          },
        });
        createdItems.push(created);

        if (item.caseId) {
          const caseInfo = await tx.case.findUnique({ where: { id: item.caseId } });
          if (caseInfo?.tokenPrice) {
            await recordRtuEvent(
              {
                caseId: item.caseId,
                userId,
                tokenSymbol: caseInfo.tokenTicker || caseInfo.currency,
                tokenPriceUsdt: caseInfo.tokenPrice,
                rtuPercent: caseInfo.rtu,
                type: 'BATTLE',
                deltaSpentUsdt: 0,
                deltaToken: Number(item.value || 0),
                metadata: { source: 'battle' },
              },
              tx
            );
          }
        }
      }

      if (reserveItems.length > 0) {
        for (const item of reserveItems) {
          if (!item.caseId) continue;
          const caseInfo = await tx.case.findUnique({ where: { id: item.caseId } });
          if (!caseInfo?.tokenPrice) continue;
          await recordRtuEvent(
            {
              caseId: item.caseId,
              userId,
              tokenSymbol: caseInfo.tokenTicker || caseInfo.currency,
              tokenPriceUsdt: caseInfo.tokenPrice,
              rtuPercent: caseInfo.rtu,
              type: 'BATTLE',
              deltaSpentUsdt: 0,
              deltaToken: -Number(item.value || 0),
              metadata: { source: 'battle_reserve', mode: parsedProof.payload.mode },
            },
            tx
          );
        }
      }

      if (lobbyId) {
        await tx.battleLobby.updateMany({
          where: { id: String(lobbyId) },
          data: {
            status: 'FINISHED',
            finishedAt: new Date(),
          },
        });
      }
    });

    res.json({
      status: 'success',
      data: {
        items: createdItems,
        result: userWon ? 'WIN' : 'LOSS',
        cost: totalCost,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createBattleLobby = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const caseIdsRaw = Array.isArray(req.body?.caseIds) ? req.body.caseIds : [];
    const caseIds = caseIdsRaw
      .map((value: any) => String(value || '').trim())
      .filter(Boolean)
      .slice(0, 25);

    if (!caseIds.length) {
      return next(new AppError('Select at least one case', 400));
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    const uniqueCaseIds: string[] = Array.from(new Set<string>(caseIds));
    const caseRows = await prisma.case.findMany({
      where: { id: { in: uniqueCaseIds }, isActive: true },
      select: { id: true, price: true, openDurationHours: true, createdAt: true },
    });
    if (caseRows.length !== uniqueCaseIds.length) {
      return next(new AppError('Some cases are not available', 400));
    }
    const caseById = new Map(caseRows.map((row) => [row.id, row]));

    const now = Date.now();
    for (const caseId of caseIds) {
      const row = caseById.get(caseId);
      if (!row) {
        return next(new AppError('Some cases are not available', 400));
      }
      if (row.openDurationHours && row.createdAt) {
        const endAt = new Date(row.createdAt).getTime() + row.openDurationHours * 60 * 60 * 1000;
        if (now >= endAt) {
          return next(new AppError('One or more selected cases are expired', 400));
        }
      }
    }

    const totalCost = caseIds.reduce((sum, caseId) => {
      const row = caseById.get(caseId);
      return sum + Number(row?.price || 0);
    }, 0);
    const lobby = await prisma.battleLobby.create({
      data: {
        hostUserId: userId,
        hostName: user.username,
        caseIds,
        totalCost,
      },
    });

    res.json({ status: 'success', data: { lobby } });
  } catch (error) {
    next(error);
  }
};

export const listBattleLobbies = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String((req as any).userId || '').trim();
    const lobbies = await prisma.battleLobby.findMany({
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        hostUser: {
          select: {
            avatarUrl: true,
            avatarMeta: true,
          },
        },
        joinerUser: {
          select: {
            avatarUrl: true,
            avatarMeta: true,
          },
        },
      },
    });
    const serialized = lobbies.map((lobby) => ({
      ...(() => {
        const base = {
          ...lobby,
          hostAvatar: lobby.hostUser?.avatarUrl || null,
          hostAvatarMeta: lobby.hostUser?.avatarMeta || null,
          joinerAvatar: lobby.joinerUser?.avatarUrl || null,
          joinerAvatarMeta: lobby.joinerUser?.avatarMeta || null,
        } as any;

        const rounds = Array.isArray(lobby.roundsJson) ? lobby.roundsJson : [];
        const isParticipant = Boolean(userId) && (lobby.hostUserId === userId || lobby.joinerUserId === userId);
        if (!isParticipant || rounds.length === 0) {
          return base;
        }

        const requesterIsHost = lobby.hostUserId === userId;
        const proofCaseIds = normalizeCaseIds(lobby.caseIds);
        const userDropsForProof = rounds.map((round: any) =>
          toBattleProofDrop(requesterIsHost ? (round.hostDrop || round.userDrop) : (round.joinerDrop || round.opponentDrop))
        );
        const opponentDropsForProof = rounds.map((round: any) =>
          toBattleProofDrop(requesterIsHost ? (round.joinerDrop || round.opponentDrop) : (round.hostDrop || round.userDrop))
        );
        const modeLm = lobby.mode === 'BOT' ? 'BOT' : 'PVP';
        const coreLm = {
          userId,
          mode: modeLm as BattleMode,
          caseIds: proofCaseIds,
          userDrops: userDropsForProof,
          opponentDrops: opponentDropsForProof,
        };
        const tieWinnerLm =
          modeLm === 'PVP'
            ? derivePvpLobbyTieWinnerForRequester(String(lobby.id), proofCaseIds, rounds, requesterIsHost)
            : deriveBattleTieWinner(coreLm);
        const { tieWinner, battleProof } = createBattleProofBundleWithTieWinner(coreLm, tieWinnerLm);
        return {
          ...base,
          battleProof,
          tieWinner,
        };
      })(),
    }));
    res.json({ status: 'success', data: { lobbies: serialized } });
  } catch (error) {
    next(error);
  }
};

export const startBattleLobby = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const lobbyId = String(req.params?.lobbyId || '').trim();
    const mode: BattleMode = String(req.body?.mode || 'PVP').toUpperCase() === 'BOT' ? 'BOT' : 'PVP';
    if (!lobbyId) {
      return next(new AppError('Lobby id is required', 400));
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    const lobby = await prisma.battleLobby.findUnique({ where: { id: lobbyId } });
    if (!lobby) {
      return next(new AppError('Lobby not found', 404));
    }

    if (lobby.status === 'IN_PROGRESS' || lobby.status === 'FINISHED') {
      const rounds = Array.isArray(lobby.roundsJson) ? lobby.roundsJson : [];
      if (rounds.length > 0) {
        const requesterIsHost = lobby.hostUserId === userId;
        const proofCaseIds = normalizeCaseIds(lobby.caseIds);
        const userDropsForProof = rounds.map((round: any) =>
          toBattleProofDrop(requesterIsHost ? (round.hostDrop || round.userDrop) : (round.joinerDrop || round.opponentDrop))
        );
        const opponentDropsForProof = rounds.map((round: any) =>
          toBattleProofDrop(requesterIsHost ? (round.joinerDrop || round.opponentDrop) : (round.hostDrop || round.userDrop))
        );
        const modeReplay = lobby.mode === 'BOT' ? 'BOT' : 'PVP';
        const coreReplay = {
          userId,
          mode: modeReplay as BattleMode,
          caseIds: proofCaseIds,
          userDrops: userDropsForProof,
          opponentDrops: opponentDropsForProof,
        };
        const tieWinnerReplay =
          modeReplay === 'PVP'
            ? derivePvpLobbyTieWinnerForRequester(String(lobby.id), proofCaseIds, rounds, requesterIsHost)
            : deriveBattleTieWinner(coreReplay);
        const { tieWinner, battleProof } = createBattleProofBundleWithTieWinner(coreReplay, tieWinnerReplay);
        return res.json({ status: 'success', data: { lobby, battleProof, tieWinner } });
      }
      return res.json({ status: 'success', data: { lobby } });
    }

    let joinerUserId = lobby.joinerUserId || null;
    let joinerName = lobby.joinerName || null;
    if (mode === 'BOT') {
      if (lobby.hostUserId !== userId) {
        return next(new AppError('Only the host can start a BOT battle', 400));
      }
      if (lobby.joinerUserId) {
        return next(new AppError('An opponent already joined — cannot call bot', 400));
      }
    }
    if (mode === 'PVP') {
      if (lobby.hostUserId === userId) {
        return next(new AppError('Host cannot start PVP without opponent', 400));
      }
      joinerUserId = userId;
      joinerName = user.username;
    }

    const caseIds = Array.isArray(lobby.caseIds) ? lobby.caseIds.map((v) => String(v || '')) : [];
    if (!caseIds.length) {
      return next(new AppError('Lobby has no cases', 400));
    }
    const resolved = await resolveBattleDrops(caseIds, mode);
    const roundsCanonical = resolved.rounds.map((round) => {
      if (mode === 'PVP') {
        const starterIsHost = lobby.hostUserId === userId;
        return starterIsHost
          ? { ...round, hostDrop: round.userDrop, joinerDrop: round.opponentDrop }
          : { ...round, hostDrop: round.opponentDrop, joinerDrop: round.userDrop };
      }
      return { ...round, hostDrop: round.userDrop, joinerDrop: round.opponentDrop };
    });

    const updated = await prisma.battleLobby.update({
      where: { id: lobbyId, status: 'OPEN' },
      data: {
        joinerUserId,
        joinerName,
        mode,
        roundsJson: roundsCanonical as any,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    });

    const requesterIsHost = updated.hostUserId === userId;
    const proofCaseIds = normalizeCaseIds(updated.caseIds);
    const userDropsForProof = roundsCanonical.map((round: any) =>
      toBattleProofDrop(requesterIsHost ? round.hostDrop : round.joinerDrop)
    );
    const opponentDropsForProof = roundsCanonical.map((round: any) =>
      toBattleProofDrop(requesterIsHost ? round.joinerDrop : round.hostDrop)
    );
    const coreStart = {
      userId,
      mode,
      caseIds: proofCaseIds,
      userDrops: userDropsForProof,
      opponentDrops: opponentDropsForProof,
    };
    const tieWinnerStart =
      mode === 'PVP'
        ? derivePvpLobbyTieWinnerForRequester(String(lobbyId), proofCaseIds, roundsCanonical, requesterIsHost)
        : deriveBattleTieWinner(coreStart);
    const { tieWinner, battleProof } = createBattleProofBundleWithTieWinner(coreStart, tieWinnerStart);

    res.json({ status: 'success', data: { lobby: updated, battleProof, tieWinner } });
  } catch (error) {
    next(error);
  }
};

export const joinBattleLobby = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const lobbyId = String(req.params?.lobbyId || '').trim();
    if (!lobbyId) {
      return next(new AppError('Lobby id is required', 400));
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    const lobby = await prisma.battleLobby.findUnique({ where: { id: lobbyId } });
    if (!lobby || lobby.status !== 'OPEN') {
      return next(new AppError('Lobby not found or already started', 404));
    }

    if (lobby.hostUserId === userId) {
      return res.json({ status: 'success', data: { lobby } });
    }

    if (lobby.joinerUserId && lobby.joinerUserId !== userId) {
      return next(new AppError('Battle already has an opponent', 400));
    }

    if (lobby.joinerUserId === userId) {
      return res.json({ status: 'success', data: { lobby } });
    }

    const updated = await prisma.battleLobby.update({
      where: { id: lobbyId, status: 'OPEN' },
      data: {
        joinerUserId: userId,
        joinerName: user.username,
      },
    });

    res.json({ status: 'success', data: { lobby: updated } });
  } catch (error) {
    next(error);
  }
};

export const resolveBattle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String((req as any).userId || '').trim();
    const caseIds = normalizeCaseIds(req.body?.caseIds);
    const mode: BattleMode = String(req.body?.mode || 'PVP').toUpperCase() === 'BOT' ? 'BOT' : 'PVP';
    if (!userId) {
      return next(new AppError('Authentication required', 401));
    }
    if (!caseIds.length) {
      return next(new AppError('Select at least one case', 400));
    }
    const resolved = await resolveBattleDrops(caseIds, mode);
    const userDrops = resolved.rounds.map((round) => toBattleProofDrop(round.userDrop));
    const opponentDrops = resolved.rounds.map((round) => toBattleProofDrop(round.opponentDrop));
    const { tieWinner, battleProof } = createBattleProofBundle({
      userId,
      mode,
      caseIds,
      userDrops,
      opponentDrops,
    });

    res.json({
      status: 'success',
      data: {
        mode: resolved.mode,
        userDrops,
        opponentDrops,
        tieWinner,
        battleProof,
      },
    });
  } catch (error) {
    next(new AppError((error as Error)?.message || 'Failed to resolve battle', 400));
  }
};

export const finishBattleLobby = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const lobbyId = String(req.params?.lobbyId || '').trim();
    if (!lobbyId) {
      return next(new AppError('Lobby id is required', 400));
    }

    const lobby = await prisma.battleLobby.findUnique({ where: { id: lobbyId } });
    if (!lobby || (lobby.status !== 'OPEN' && lobby.status !== 'IN_PROGRESS')) {
      return next(new AppError('Lobby not found', 404));
    }
    if (lobby.hostUserId !== userId && lobby.joinerUserId !== userId) {
      return next(new AppError('Forbidden', 403));
    }

    const updated = await prisma.battleLobby.update({
      where: { id: lobbyId },
      data: {
        status: 'FINISHED',
        winnerName: req.body?.winnerName ? String(req.body.winnerName) : lobby.winnerName,
        finishedAt: new Date(),
      },
    });
    res.json({ status: 'success', data: { lobby: updated } });
  } catch (error) {
    next(error);
  }
};

export const chargeBattle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String((req as any).userId || '').trim();
    const battleProofRaw = String(req.body?.battleProof || '').trim();
    const requestedCaseIds = normalizeCaseIds(req.body?.caseIds);
    if (!userId) {
      return next(new AppError('Authentication required', 401));
    }
    const parsedProof = battleProofRaw ? parseBattleProof(battleProofRaw, userId) : null;
    if (battleProofRaw && !parsedProof) {
      return next(new AppError('Battle proof is invalid or expired', 400));
    }
    const parsedProofKey = parsedProof ? createBattleProofKey(parsedProof.payload) : null;

    const effectiveCaseIds = parsedProof?.payload.caseIds || requestedCaseIds;
    if (!effectiveCaseIds.length) {
      console.error('[chargeBattle] empty caseIds', {
        bodyType: typeof req.body,
        bodyCaseIds: req.body?.caseIds,
        rawBodyLen: typeof (req as any).rawBody === 'string' ? (req as any).rawBody.length : 'n/a',
        contentType: req.headers['content-type'],
        requestedLen: requestedCaseIds.length,
        proofPresent: !!battleProofRaw,
      });
      return next(new AppError('Select at least one case', 400));
    }

    const totalCost = await getBattleCostByCaseIds(prisma, effectiveCaseIds, { requireActive: true });
    if (!Number.isFinite(totalCost) || totalCost <= 0) {
      return next(new AppError('Invalid battle cost', 400));
    }

    const chargeWindowStart = new Date(Date.now() - BATTLE_CHARGE_WINDOW_MS);
    const [user, recentCharges] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.transaction.findMany({
        where: {
          userId,
          type: 'BATTLE',
          timestamp: { gte: chargeWindowStart },
        },
        orderBy: { timestamp: 'desc' },
        take: 120,
      }),
    ]);

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    const existingUnconsumed = parsedProof
      ? recentCharges.find((entry) => {
          const metadata = getChargeMetadata(entry.metadata);
          if (!metadata || metadata.source !== 'battle_start' || metadata.battleConsumedAt) return false;
          const caseCount = Number(metadata?.caseCount || 0);
          const matchesCaseCount = caseCount > 0 && caseCount === effectiveCaseIds.length;
          const matchesAmount = Math.abs(Number(entry.amount || 0) + totalCost) <= 1e-6;
          if (!matchesAmount || !matchesCaseCount) return false;
          const metadataCaseIds = normalizeCaseIds(metadata?.caseIds);
          const matchesCaseIds = hasSameCaseSequence(metadataCaseIds, effectiveCaseIds);
          const metadataProofSig = String(metadata?.battleProofSig || '');
          const metadataProofKey = String(metadata?.battleProofKey || '');
          if (metadataProofSig || metadataProofKey) {
            const signatureOrKeyMatch = (
              (metadataProofSig && metadataProofSig === parsedProof.signature) ||
              (Boolean(parsedProofKey) && metadataProofKey === parsedProofKey)
            );
            if (signatureOrKeyMatch) return true;
            if (!metadataProofKey) return matchesCaseIds;
            return false;
          }
          // Legacy fallback for previously created charge entries without proof fingerprint.
          return matchesCaseIds;
        })
      : null;
    if (existingUnconsumed) {
      return res.json({
        status: 'success',
        data: { balance: user.balance, chargedAmount: 0, alreadyCharged: true },
      });
    }

    if (user.balance < totalCost) {
      return next(new AppError('Insufficient balance', 400));
    }

    const chargeMode: BattleMode =
      parsedProof?.payload.mode ||
      (String(req.body?.mode || 'PVP').toUpperCase() === 'BOT' ? 'BOT' : 'PVP');

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { balance: { decrement: totalCost } },
    });

    await prisma.transaction.create({
      data: {
        userId,
        type: 'BATTLE',
        amount: -totalCost,
        currency: 'USDT',
        metadata: {
          source: 'battle_start',
          battleProofSig: parsedProof?.signature || null,
          battleProofKey: parsedProofKey,
          mode: chargeMode,
          tieWinner: parsedProof?.payload.tieWinner || null,
          caseIds: effectiveCaseIds,
          caseCount: effectiveCaseIds.length,
          totalCost,
        },
      },
    });

    res.json({ status: 'success', data: { balance: updated.balance, chargedAmount: totalCost } });
  } catch (error) {
    next(error);
  }
};

export const createFeedbackMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const topic = String(req.body?.topic || '').trim().toUpperCase();
    const contact = String(req.body?.contact || '').trim();
    const message = String(req.body?.message || '').trim();
    const isEarlyAccess = topic === 'EARLY_ACCESS';
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, referredById: true },
    });

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    if (!FEEDBACK_TOPICS.includes(topic as any)) {
      return next(new AppError('Invalid feedback topic', 400));
    }
    if (!contact || contact.length < 2 || contact.length > 100) {
      return next(new AppError('Contact is required (2-100 chars)', 400));
    }
    if (!message || message.length > (isEarlyAccess ? EARLY_ACCESS_MESSAGE_MAX_LENGTH : 500)) {
      const max = isEarlyAccess ? EARLY_ACCESS_MESSAGE_MAX_LENGTH : 500;
      return next(new AppError(`Message is required (max ${max} chars)`, 400));
    }

    if (isEarlyAccess) {
      const normalizedRole = String(user.role || '').toUpperCase();
      if (normalizedRole === 'MODERATOR') {
        return next(new AppError('You already have early access.', 409));
      }
      if (normalizedRole === 'ADMIN') {
        return next(new AppError('Administrators cannot submit early access requests.', 403));
      }
      if (normalizedRole === 'SUPPORT') {
        return next(new AppError('Support accounts cannot submit early access requests.', 403));
      }
      if (user.referredById) {
        return next(
          new AppError(
            'Referral signups unlock early access automatically after the first confirmed wallet deposit. Applications are not used for this path.',
            403
          )
        );
      }

      const latestEarlyAccessRequest = await prisma.feedbackMessage.findFirst({
        where: {
          userId,
          topic: 'EARLY_ACCESS',
        },
        orderBy: { createdAt: 'desc' },
      });
      if (latestEarlyAccessRequest?.status === 'PENDING') {
        return next(new AppError('Your previous early access request is still under review.', 409));
      }
    }

    const feedback = await prisma.feedbackMessage.create({
      data: {
        userId,
        topic: topic as any,
        status: 'PENDING',
        contact,
        message,
      },
    });

    res.json({
      status: 'success',
      data: {
        id: feedback.id,
        topic: feedback.topic,
        status: feedback.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getEarlyAccessRequestStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const [user, latestRequest] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, referredById: true },
      }),
      prisma.feedbackMessage.findFirst({
        where: {
          userId,
          topic: 'EARLY_ACCESS',
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          topic: true,
          status: true,
          contact: true,
          message: true,
          createdAt: true,
          reviewedAt: true,
        },
      }),
    ]);

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    const normalizedRole = String(user.role || '').toUpperCase();
    if (normalizedRole === 'MODERATOR') {
      res.json({
        status: 'success',
        data: {
          canSubmit: false,
          blockReason: EARLY_ACCESS_BLOCK_REASONS.ALREADY_EARLY_ACCESS,
          request: latestRequest || null,
        },
      });
      return;
    }
    if (normalizedRole === 'ADMIN') {
      res.json({
        status: 'success',
        data: {
          canSubmit: false,
          blockReason: EARLY_ACCESS_BLOCK_REASONS.ADMIN_ACCOUNT,
          request: latestRequest || null,
        },
      });
      return;
    }
    if (normalizedRole === 'SUPPORT') {
      res.json({
        status: 'success',
        data: {
          canSubmit: false,
          blockReason: EARLY_ACCESS_BLOCK_REASONS.SUPPORT_ACCOUNT,
          request: latestRequest || null,
        },
      });
      return;
    }

    if (user.referredById) {
      res.json({
        status: 'success',
        data: {
          canSubmit: false,
          blockReason: EARLY_ACCESS_BLOCK_REASONS.REFERRAL_SIGNUP,
          request: latestRequest || null,
        },
      });
      return;
    }

    if (!latestRequest) {
      res.json({
        status: 'success',
        data: {
          canSubmit: true,
          blockReason: null,
          request: null,
        },
      });
      return;
    }

    const canSubmit = latestRequest.status !== 'PENDING';
    const blockReason = latestRequest.status === 'PENDING'
      ? EARLY_ACCESS_BLOCK_REASONS.PENDING_REVIEW
      : null;

    res.json({
      status: 'success',
      data: {
        canSubmit,
        blockReason,
        request: latestRequest,
      },
    });
  } catch (error) {
    next(error);
  }
};
