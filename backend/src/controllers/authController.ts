import { Request, Response, NextFunction } from 'express';
import { ethers } from 'ethers';
import crypto from 'crypto';
import prisma from '../config/database.js';
import { config } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthRequest } from '../middleware/auth.js';
import { verifyTelegramWebAppInitData } from '../utils/telegramAuth.js';
import { resolveReferrerIdByCode } from '../utils/referral.js';

const buildLoginMessage = (nonce: string) => {
  return `CaseFun Login\nNonce: ${nonce}`;
};

const NONCE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastNonceCleanupAt = 0;

/** Matches frontend main admin / adminController bootstrap fallback */
const MAIN_ADMIN_WALLET_LOWER = '0xc459241d1ac02250de56b8b7165ebedf59236524';

const normalizeEvmWalletAddress = (value: unknown): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return ethers.getAddress(raw).toLowerCase();
  } catch {
    return '';
  }
};

const cleanupExpiredWalletNonces = async () => {
  const now = Date.now();
  if (now - lastNonceCleanupAt < NONCE_CLEANUP_INTERVAL_MS) return;
  lastNonceCleanupAt = now;
  await prisma.walletNonce.deleteMany({
    where: {
      expiresAt: { lt: new Date(now) },
    },
  });
};

const extractNonceFromMessage = (message: string) => {
  const match = String(message || '').match(/nonce:\s*([a-f0-9]+)/i);
  return match?.[1] ? String(match[1]).toLowerCase() : '';
};

const resolveWalletNonceRecord = async (walletAddress: string, message: string) => {
  const normalizedAddress = String(walletAddress || '').toLowerCase();
  if (!normalizedAddress) return null;

  const extractedNonce = extractNonceFromMessage(message);
  if (extractedNonce) {
    const exactRecord = await prisma.walletNonce.findFirst({
      where: {
        walletAddress: normalizedAddress,
        nonce: extractedNonce,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (exactRecord) {
      return exactRecord;
    }
  }

  const latestRecord = await prisma.walletNonce.findFirst({
    where: {
      walletAddress: normalizedAddress,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!latestRecord) {
    return null;
  }
  if (!String(message || '').includes(latestRecord.nonce)) {
    return null;
  }
  return latestRecord;
};

const toPublicUser = (user: any) => ({
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
  referralCode: user.referralCode ?? null,
  referralConfirmedCount: user.referralConfirmedCount ?? 0,
  referredById: user.referredById ?? null,
  referralConfirmedAt: user.referralConfirmedAt
    ? (user.referralConfirmedAt instanceof Date
        ? user.referralConfirmedAt.toISOString()
        : user.referralConfirmedAt)
    : null,
});

const getCookieValue = (cookieHeader: string, key: string) => {
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${key}=`))
    ?.split('=')[1];
};

const getSessionTokenFromRequest = (req: Request) => {
  const cookieHeader = req.headers.cookie || '';
  return getCookieValue(cookieHeader, 'session') || '';
};

interface TelegramWalletBrowserLinkSession {
  userId: string;
  expiresAt: number;
}

interface TelegramTopUpBrowserLinkSession {
  userId: string;
  expiresAt: number;
  amountUsdt?: number;
}

const TELEGRAM_WALLET_BROWSER_LINK_TTL_MS = 10 * 60 * 1000;
const telegramWalletBrowserLinkSessions = new Map<string, TelegramWalletBrowserLinkSession>();
const telegramTopUpBrowserLinkSessions = new Map<string, TelegramTopUpBrowserLinkSession>();

const trimTrailingSlash = (value: string) => String(value || '').replace(/\/+$/, '');

const cleanupTelegramWalletBrowserLinkSessions = () => {
  const now = Date.now();
  for (const [token, session] of telegramWalletBrowserLinkSessions.entries()) {
    if (!session || session.expiresAt <= now) {
      telegramWalletBrowserLinkSessions.delete(token);
    }
  }
};

const createTelegramWalletBrowserLinkSession = (userId: string) => {
  cleanupTelegramWalletBrowserLinkSessions();
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + TELEGRAM_WALLET_BROWSER_LINK_TTL_MS;
  telegramWalletBrowserLinkSessions.set(token, { userId, expiresAt });
  return { token, expiresAt };
};

const consumeTelegramWalletBrowserLinkSession = (token: string) => {
  cleanupTelegramWalletBrowserLinkSessions();
  const session = telegramWalletBrowserLinkSessions.get(token);
  if (!session) return null;
  telegramWalletBrowserLinkSessions.delete(token);
  if (session.expiresAt <= Date.now()) return null;
  return session;
};

const cleanupTelegramTopUpBrowserLinkSessions = () => {
  const now = Date.now();
  for (const [token, session] of telegramTopUpBrowserLinkSessions.entries()) {
    if (!session || session.expiresAt <= now) {
      telegramTopUpBrowserLinkSessions.delete(token);
    }
  }
};

const createTelegramTopUpBrowserLinkSession = (userId: string, amountUsdt?: number) => {
  cleanupTelegramTopUpBrowserLinkSessions();
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + TELEGRAM_WALLET_BROWSER_LINK_TTL_MS;
  telegramTopUpBrowserLinkSessions.set(token, { userId, expiresAt, amountUsdt });
  return { token, expiresAt };
};

const consumeTelegramTopUpBrowserLinkSession = (token: string) => {
  cleanupTelegramTopUpBrowserLinkSessions();
  const session = telegramTopUpBrowserLinkSessions.get(token);
  if (!session) return null;
  telegramTopUpBrowserLinkSessions.delete(token);
  if (session.expiresAt <= Date.now()) return null;
  return session;
};

const createSessionForUser = async (userId: string, res: Response) => {
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      token: sessionToken,
      expiresAt,
    },
  });

  res.cookie('session', sessionToken, {
    httpOnly: true,
    sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
    secure: config.nodeEnv === 'production',
    maxAge: config.sessionTtlDays * 24 * 60 * 60 * 1000,
    path: '/',
  });
};

const buildTelegramWalletBrowserLinkClaimUrl = (token: string) => {
  const base = trimTrailingSlash(config.frontendUrl);
  return `${base}/api/auth/telegram/wallet-link/claim?token=${encodeURIComponent(token)}`;
};

const buildTelegramTopUpBrowserLinkClaimUrl = (token: string) => {
  const base = trimTrailingSlash(config.frontendUrl);
  return `${base}/api/auth/telegram/topup-link/claim?token=${encodeURIComponent(token)}`;
};

const buildTelegramWalletBrowserLinkRedirectUrl = () => {
  const base = trimTrailingSlash(config.frontendUrl);
  return `${base}/tg?walletLinkMode=bridge`;
};

const buildTelegramTopUpBrowserLinkRedirectUrl = (amountUsdt?: number) => {
  const base = trimTrailingSlash(config.frontendUrl);
  const amount =
    typeof amountUsdt === 'number' && Number.isFinite(amountUsdt) && amountUsdt > 0
      ? Number(amountUsdt.toFixed(2))
      : 0;
  return amount > 0
    ? `${base}/tg?topupMode=bridge&amountUsdt=${encodeURIComponent(String(amount))}`
    : `${base}/tg?topupMode=bridge`;
};

const buildTelegramWalletBrowserLinkErrorRedirectUrl = (code: string) => {
  const base = trimTrailingSlash(config.frontendUrl);
  return `${base}/?walletLinkError=${encodeURIComponent(code)}`;
};

const normalizeUsernameCandidate = (value: string) => {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const noReservedPrefix = cleaned.startsWith('USER_') ? cleaned.replace(/^USER_+/, 'TG_') : cleaned;
  const fallback = noReservedPrefix || 'TG_USER';
  const padded = fallback.length < 3 ? `${fallback}TG` : fallback;
  return padded.slice(0, 20);
};

const makeUniqueUsername = async (baseCandidate: string) => {
  const base = normalizeUsernameCandidate(baseCandidate);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const suffix = attempt === 0 ? '' : `_${attempt}`;
    const head = base.slice(0, Math.max(1, 20 - suffix.length));
    const candidate = `${head}${suffix}`;
    const exists = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!exists) {
      return candidate;
    }
  }
  return `TG_${crypto.randomBytes(6).toString('hex').toUpperCase().slice(0, 16)}`;
};

const makeTelegramPlaceholderWallet = async (telegramId: string) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = crypto.randomBytes(4).toString('hex');
    const candidate = `tg_${telegramId}_${suffix}`.slice(0, 191);
    const exists = await prisma.user.findUnique({
      where: { walletAddress: candidate },
      select: { id: true },
    });
    if (!exists) {
      return candidate;
    }
  }
  throw new AppError('Failed to allocate wallet placeholder', 500);
};

interface TelegramIdentityPayload {
  telegramId: string;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLastName: string | null;
  telegramPhotoUrl: string | null;
}

const upsertUserByTelegramIdentity = async (
  telegram: TelegramIdentityPayload,
  options?: { referralCode?: string }
) => {
  let user = await prisma.user.findUnique({
    where: { telegramId: telegram.telegramId },
  });

  if (!user) {
    const usernameSeed = telegram.telegramUsername || `TG_${telegram.telegramId.slice(-8)}`;
    const username = await makeUniqueUsername(usernameSeed);
    const placeholderWallet = await makeTelegramPlaceholderWallet(telegram.telegramId);
    const referredById = await resolveReferrerIdByCode(prisma, options?.referralCode);

    user = await prisma.user.create({
      data: {
        username,
        walletAddress: placeholderWallet,
        hasLinkedWallet: false,
        walletLinkedAt: null,
        balance: 0,
        telegramId: telegram.telegramId,
        telegramUsername: telegram.telegramUsername,
        telegramFirstName: telegram.telegramFirstName,
        telegramLastName: telegram.telegramLastName,
        telegramPhotoUrl: telegram.telegramPhotoUrl,
        telegramLinkedAt: new Date(),
        ...(referredById ? { referredById } : {}),
      },
    });
  } else {
    if (user.isBanned) {
      throw new AppError('Account is banned', 403);
    }
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        telegramUsername: telegram.telegramUsername,
        telegramFirstName: telegram.telegramFirstName,
        telegramLastName: telegram.telegramLastName,
        telegramPhotoUrl: telegram.telegramPhotoUrl,
        telegramLinkedAt: user.telegramLinkedAt || new Date(),
      },
    });
  }

  return user;
};

export const getNonce = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { walletAddress } = req.query as { walletAddress?: string };

    const normalizedAddress = normalizeEvmWalletAddress(walletAddress);
    if (!normalizedAddress) {
      return next(new AppError('Valid EVM wallet address required', 400));
    }

    await cleanupExpiredWalletNonces();

    const nonce = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + config.nonceTtlMinutes * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      // Keep only one active nonce per wallet to avoid unbounded growth.
      await tx.walletNonce.deleteMany({
        where: { walletAddress: normalizedAddress },
      });
      await tx.walletNonce.create({
        data: {
          walletAddress: normalizedAddress,
          nonce,
          expiresAt,
        },
      });
    });

    res.json({
      status: 'success',
      data: {
        nonce,
        message: buildLoginMessage(nonce),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const loginWithWallet = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { walletAddress, signature, message, referralCode } = req.body;

    if (!walletAddress || !signature || !message) {
      return next(new AppError('Missing required fields', 400));
    }

    const normalizedAddress = normalizeEvmWalletAddress(walletAddress);
    if (!normalizedAddress) {
      return next(new AppError('Valid EVM wallet address required', 400));
    }

    const nonceRecord = await resolveWalletNonceRecord(normalizedAddress, String(message || ''));
    if (!nonceRecord) {
      return next(new AppError('Nonce expired or not found', 401));
    }

    // Verify signature
    const recoveredAddress = ethers.verifyMessage(message, signature);

    if (recoveredAddress.toLowerCase() !== normalizedAddress) {
      return next(new AppError('Invalid signature', 401));
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { walletAddress: normalizedAddress },
    });

    if (!user) {
      // Generate username from wallet address
      const username = `user_${walletAddress.slice(2, 8)}`;
      const referredById = await resolveReferrerIdByCode(prisma, referralCode);

      user = await prisma.user.create({
        data: {
          walletAddress: normalizedAddress,
          username,
          balance: 0,
          hasLinkedWallet: true,
          walletLinkedAt: new Date(),
          ...(referredById ? { referredById } : {}),
        },
      });
    } else if (!user.hasLinkedWallet) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          hasLinkedWallet: true,
          walletLinkedAt: user.walletLinkedAt || new Date(),
        },
      });
    }

    const envBootstrap = String(config.bootstrapAdminWallet || '')
      .trim()
      .toLowerCase();
    const isMainAdminWallet =
      normalizedAddress === MAIN_ADMIN_WALLET_LOWER ||
      (envBootstrap.length > 0 && normalizedAddress === envBootstrap);
    if (isMainAdminWallet) {
      const existingAdmin = await prisma.user.findFirst({
        where: { role: 'ADMIN' },
      });
      if (!existingAdmin && user.role !== 'ADMIN') {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { role: 'ADMIN' },
        });
      }
    }

    await createSessionForUser(user.id, res);

    // Consume nonce
    await prisma.walletNonce.deleteMany({
      where: { walletAddress: normalizedAddress },
    });

    res.json({
      status: 'success',
      data: {
        user: toPublicUser(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const loginWithTelegram = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const oldSessionToken = getSessionTokenFromRequest(req);
    if (oldSessionToken) {
      await prisma.session.deleteMany({ where: { token: oldSessionToken } }).catch(() => {});
    }

    const initData = String(req.body?.initData || '').trim();
    const telegram = verifyTelegramWebAppInitData({
      initData,
      botToken: config.telegramBotToken,
      maxAgeSeconds: config.telegramAuthMaxAgeSeconds,
    });

    const referralCode = req.body?.referralCode;

    const user = await upsertUserByTelegramIdentity(
      {
        telegramId: telegram.telegramId,
        telegramUsername: telegram.telegramUsername,
        telegramFirstName: telegram.telegramFirstName,
        telegramLastName: telegram.telegramLastName,
        telegramPhotoUrl: telegram.telegramPhotoUrl,
      },
      { referralCode }
    );

    await createSessionForUser(user.id, res);

    res.json({
      status: 'success',
      data: {
        user: toPublicUser(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const loginWithTelegramDev = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (config.nodeEnv !== 'development') {
      return next(new AppError('Dev Telegram login is disabled', 403));
    }

    const inputId = String(req.body?.telegramId || '').trim();
    const generatedId = inputId || `dev_${crypto.randomBytes(6).toString('hex')}`;
    const inputUsername = String(req.body?.telegramUsername || '').trim().replace(/^@+/, '');

    const referralCode = req.body?.referralCode;

    const user = await upsertUserByTelegramIdentity(
      {
        telegramId: generatedId,
        telegramUsername: inputUsername || `dev_${generatedId.slice(-8)}`,
        telegramFirstName: String(req.body?.telegramFirstName || 'Dev'),
        telegramLastName: String(req.body?.telegramLastName || ''),
        telegramPhotoUrl: null,
      },
      { referralCode }
    );

    await createSessionForUser(user.id, res);

    res.json({
      status: 'success',
      data: {
        user: toPublicUser(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const linkWalletToCurrentAccount = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = String(req.userId || '').trim();
    const { walletAddress, signature, message } = req.body || {};
    if (!userId) {
      return next(new AppError('Authentication required', 401));
    }
    if (!walletAddress || !signature || !message) {
      return next(new AppError('Missing required fields', 400));
    }

    const normalizedAddress = normalizeEvmWalletAddress(walletAddress);
    if (!normalizedAddress) {
      return next(new AppError('Valid EVM wallet address required', 400));
    }
    const nonceRecord = await resolveWalletNonceRecord(normalizedAddress, String(message || ''));
    if (!nonceRecord) {
      return next(new AppError('Nonce expired or not found', 401));
    }

    const recoveredAddress = ethers.verifyMessage(String(message), String(signature));
    if (recoveredAddress.toLowerCase() !== normalizedAddress) {
      return next(new AppError('Invalid signature', 401));
    }

    const sessionToken = getSessionTokenFromRequest(req);
    const linkedUser = await prisma.$transaction(async (tx) => {
      const currentUser = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          walletAddress: true,
          hasLinkedWallet: true,
          walletLinkedAt: true,
          balance: true,
          telegramId: true,
          telegramUsername: true,
          telegramFirstName: true,
          telegramLastName: true,
          telegramPhotoUrl: true,
          telegramLinkedAt: true,
        },
      });
      if (!currentUser) {
        throw new AppError('User not found', 404);
      }

      if (currentUser.hasLinkedWallet && currentUser.walletAddress === normalizedAddress) {
        await tx.walletNonce.deleteMany({ where: { walletAddress: normalizedAddress } });
        const sameUser = await tx.user.findUnique({ where: { id: currentUser.id } });
        if (!sameUser) throw new AppError('User not found', 404);
        return sameUser;
      }
      if (currentUser.hasLinkedWallet && currentUser.walletAddress !== normalizedAddress) {
        throw new AppError('Wallet is already linked for this account', 409);
      }

      const walletOwner = await tx.user.findUnique({
        where: { walletAddress: normalizedAddress },
        select: {
          id: true,
          telegramId: true,
          walletLinkedAt: true,
        },
      });

      let targetUserId = currentUser.id;
      if (walletOwner && walletOwner.id !== currentUser.id) {
        if (!currentUser.telegramId) {
          throw new AppError('Telegram account is not linked', 409);
        }
        if (walletOwner.telegramId && walletOwner.telegramId !== currentUser.telegramId) {
          throw new AppError(
            `Wallet ${normalizedAddress} is already linked to another Telegram account. Switch account in wallet app or unlink it first.`,
            409
          );
        }

        const [
          inventoryCount,
          openingsCount,
          transactionsCount,
          battlesCount,
          depositsCount,
          claimsCount,
          feedbackCount,
        ] = await Promise.all([
          tx.inventoryItem.count({ where: { userId: currentUser.id } }),
          tx.caseOpening.count({ where: { userId: currentUser.id } }),
          tx.transaction.count({ where: { userId: currentUser.id } }),
          tx.battle.count({ where: { userId: currentUser.id } }),
          tx.deposit.count({ where: { userId: currentUser.id } }),
          tx.claim.count({ where: { userId: currentUser.id } }),
          tx.feedbackMessage.count({ where: { userId: currentUser.id } }),
        ]);
        const hasActivity =
          Number(currentUser.balance || 0) > 0 ||
          inventoryCount > 0 ||
          openingsCount > 0 ||
          transactionsCount > 0 ||
          battlesCount > 0 ||
          depositsCount > 0 ||
          claimsCount > 0 ||
          feedbackCount > 0;
        if (hasActivity) {
          throw new AppError('Wallet is already linked to another active account', 409);
        }

        // Release telegram unique fields from temporary telegram-only account first.
        await tx.user.update({
          where: { id: currentUser.id },
          data: {
            telegramId: null,
            telegramUsername: null,
            telegramFirstName: null,
            telegramLastName: null,
            telegramPhotoUrl: null,
            telegramLinkedAt: null,
          },
        });

        await tx.user.update({
          where: { id: walletOwner.id },
          data: {
            telegramId: currentUser.telegramId,
            telegramUsername: currentUser.telegramUsername,
            telegramFirstName: currentUser.telegramFirstName,
            telegramLastName: currentUser.telegramLastName,
            telegramPhotoUrl: currentUser.telegramPhotoUrl,
            telegramLinkedAt: currentUser.telegramLinkedAt || new Date(),
            hasLinkedWallet: true,
            walletLinkedAt: walletOwner.walletLinkedAt || new Date(),
          },
        });

        if (sessionToken) {
          await tx.session.updateMany({
            where: { token: sessionToken, userId: currentUser.id },
            data: { userId: walletOwner.id, lastSeenAt: new Date() },
          });
        }

        await tx.session.deleteMany({ where: { userId: currentUser.id } });
        await tx.user.delete({ where: { id: currentUser.id } });
        targetUserId = walletOwner.id;
      } else {
        await tx.user.update({
          where: { id: currentUser.id },
          data: {
            walletAddress: normalizedAddress,
            hasLinkedWallet: true,
            walletLinkedAt: new Date(),
          },
        });
      }

      await tx.walletNonce.deleteMany({
        where: { walletAddress: normalizedAddress },
      });

      const targetUser = await tx.user.findUnique({ where: { id: targetUserId } });
      if (!targetUser) {
        throw new AppError('User not found', 404);
      }
      return targetUser;
    });

    res.json({
      status: 'success',
      data: {
        user: toPublicUser(linkedUser),
      },
    });
  } catch (error: any) {
    const prismaCode = String(error?.code || '');
    const target = Array.isArray(error?.meta?.target) ? error.meta.target.map((v: any) => String(v)) : [];
    if (prismaCode === 'P2002' && target.includes('telegramId')) {
      return next(new AppError('Telegram account is already linked to another user', 409));
    }
    next(error);
  }
};

/**
 * Link wallet to a Telegram-authenticated account with signature proof.
 * Prevents arbitrary wallet binding by requiring nonce-based message signing.
 */
export const linkWalletFromTelegram = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = String(req.userId || '').trim();
    const { walletAddress, signature, message } = req.body || {};
    if (!userId) {
      return next(new AppError('Authentication required', 401));
    }
    if (!walletAddress || !signature || !message) {
      return next(new AppError('Missing required fields', 400));
    }

    const normalizedAddress = normalizeEvmWalletAddress(walletAddress);
    if (!normalizedAddress) {
      return next(new AppError('Valid EVM wallet address required', 400));
    }
    const nonceRecord = await resolveWalletNonceRecord(normalizedAddress, String(message || ''));
    if (!nonceRecord) {
      return next(new AppError('Nonce expired or not found', 401));
    }
    const recoveredAddress = ethers.verifyMessage(String(message), String(signature));
    if (recoveredAddress.toLowerCase() !== normalizedAddress) {
      return next(new AppError('Invalid signature', 401));
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        walletAddress: true,
        hasLinkedWallet: true,
        walletLinkedAt: true,
        balance: true,
        telegramId: true,
        telegramUsername: true,
        telegramFirstName: true,
        telegramLastName: true,
        telegramPhotoUrl: true,
        telegramLinkedAt: true,
        isBanned: true,
      },
    });
    if (!currentUser) {
      return next(new AppError('User not found', 404));
    }
    if (currentUser.isBanned) {
      return next(new AppError('Account is banned', 403));
    }
    if (!currentUser.telegramId) {
      return next(new AppError('Only Telegram-authenticated accounts can use this endpoint', 403));
    }

    if (currentUser.hasLinkedWallet && currentUser.walletAddress === normalizedAddress) {
      return res.json({ status: 'success', data: { user: toPublicUser(currentUser) } });
    }
    if (currentUser.hasLinkedWallet && currentUser.walletAddress !== normalizedAddress) {
      return next(new AppError('A different wallet is already linked to this account', 409));
    }

    const sessionToken = getSessionTokenFromRequest(req);
    const linkedUser = await prisma.$transaction(async (tx) => {
      const walletOwner = await tx.user.findUnique({
        where: { walletAddress: normalizedAddress },
        select: { id: true, telegramId: true, walletLinkedAt: true },
      });

      let targetUserId = currentUser.id;
      if (walletOwner && walletOwner.id !== currentUser.id) {
        if (walletOwner.telegramId && walletOwner.telegramId !== currentUser.telegramId) {
          throw new AppError(
            'This wallet is already linked to another Telegram account.',
            409
          );
        }

        const [
          inventoryCount, openingsCount, transactionsCount,
          battlesCount, depositsCount, claimsCount, feedbackCount,
        ] = await Promise.all([
          tx.inventoryItem.count({ where: { userId: currentUser.id } }),
          tx.caseOpening.count({ where: { userId: currentUser.id } }),
          tx.transaction.count({ where: { userId: currentUser.id } }),
          tx.battle.count({ where: { userId: currentUser.id } }),
          tx.deposit.count({ where: { userId: currentUser.id } }),
          tx.claim.count({ where: { userId: currentUser.id } }),
          tx.feedbackMessage.count({ where: { userId: currentUser.id } }),
        ]);
        const hasActivity =
          Number(currentUser.balance || 0) > 0 ||
          inventoryCount > 0 || openingsCount > 0 || transactionsCount > 0 ||
          battlesCount > 0 || depositsCount > 0 || claimsCount > 0 || feedbackCount > 0;
        if (hasActivity) {
          throw new AppError('Wallet is already linked to another active account', 409);
        }

        await tx.user.update({
          where: { id: currentUser.id },
          data: {
            telegramId: null, telegramUsername: null,
            telegramFirstName: null, telegramLastName: null,
            telegramPhotoUrl: null, telegramLinkedAt: null,
          },
        });

        await tx.user.update({
          where: { id: walletOwner.id },
          data: {
            telegramId: currentUser.telegramId,
            telegramUsername: currentUser.telegramUsername,
            telegramFirstName: currentUser.telegramFirstName,
            telegramLastName: currentUser.telegramLastName,
            telegramPhotoUrl: currentUser.telegramPhotoUrl,
            telegramLinkedAt: currentUser.telegramLinkedAt || new Date(),
            hasLinkedWallet: true,
            walletLinkedAt: walletOwner.walletLinkedAt || new Date(),
          },
        });

        if (sessionToken) {
          await tx.session.updateMany({
            where: { token: sessionToken, userId: currentUser.id },
            data: { userId: walletOwner.id, lastSeenAt: new Date() },
          });
        }
        await tx.session.deleteMany({ where: { userId: currentUser.id } });
        await tx.user.delete({ where: { id: currentUser.id } });
        targetUserId = walletOwner.id;
      } else {
        await tx.user.update({
          where: { id: currentUser.id },
          data: { walletAddress: normalizedAddress, hasLinkedWallet: true, walletLinkedAt: new Date() },
        });
      }

      await tx.walletNonce.deleteMany({
        where: { walletAddress: normalizedAddress },
      });

      const targetUser = await tx.user.findUnique({ where: { id: targetUserId } });
      if (!targetUser) throw new AppError('User not found', 404);
      return targetUser;
    });

    res.json({ status: 'success', data: { user: toPublicUser(linkedUser) } });
  } catch (error: any) {
    const prismaCode = String(error?.code || '');
    const target = Array.isArray(error?.meta?.target) ? error.meta.target.map((v: any) => String(v)) : [];
    if (prismaCode === 'P2002' && target.includes('telegramId')) {
      return next(new AppError('Telegram account is already linked to another user', 409));
    }
    next(error);
  }
};

export const startTelegramWalletBrowserLink = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = String(req.userId || '').trim();
    if (!userId) {
      return next(new AppError('Authentication required', 401));
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        telegramId: true,
        hasLinkedWallet: true,
        isBanned: true,
      },
    });
    if (!user) {
      return next(new AppError('User not found', 404));
    }
    if (user.isBanned) {
      return next(new AppError('Account is banned', 403));
    }
    if (!user.telegramId) {
      return next(new AppError('Telegram account is not linked', 409));
    }
    if (user.hasLinkedWallet) {
      return next(new AppError('Wallet is already linked', 409));
    }

    const session = createTelegramWalletBrowserLinkSession(user.id);
    const claimUrl = buildTelegramWalletBrowserLinkClaimUrl(session.token);

    res.json({
      status: 'success',
      data: {
        token: session.token,
        expiresAt: new Date(session.expiresAt).toISOString(),
        claimUrl,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const startTelegramTopUpBrowserLink = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = String(req.userId || '').trim();
    if (!userId) {
      return next(new AppError('Authentication required', 401));
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        telegramId: true,
        hasLinkedWallet: true,
        isBanned: true,
      },
    });
    if (!user) {
      return next(new AppError('User not found', 404));
    }
    if (user.isBanned) {
      return next(new AppError('Account is banned', 403));
    }
    if (!user.telegramId) {
      return next(new AppError('Telegram account is not linked', 409));
    }
    if (!user.hasLinkedWallet) {
      return next(new AppError('Link wallet first', 409));
    }

    const rawAmount = Number(req.body?.amountUsdt);
    const amountUsdt =
      Number.isFinite(rawAmount) && rawAmount > 0 ? Math.min(1_000_000, Number(rawAmount.toFixed(2))) : undefined;

    const session = createTelegramTopUpBrowserLinkSession(user.id, amountUsdt);
    const claimUrl = buildTelegramTopUpBrowserLinkClaimUrl(session.token);

    res.json({
      status: 'success',
      data: {
        token: session.token,
        expiresAt: new Date(session.expiresAt).toISOString(),
        claimUrl,
        amountUsdt: amountUsdt ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const claimTelegramWalletBrowserLink = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = String(req.query?.token || '').trim();
    if (!token) {
      return res.redirect(302, buildTelegramWalletBrowserLinkErrorRedirectUrl('missing_token'));
    }

    const session = consumeTelegramWalletBrowserLinkSession(token);
    if (!session) {
      return res.redirect(302, buildTelegramWalletBrowserLinkErrorRedirectUrl('expired_token'));
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        isBanned: true,
      },
    });
    if (!user || user.isBanned) {
      return res.redirect(302, buildTelegramWalletBrowserLinkErrorRedirectUrl('invalid_user'));
    }

    await createSessionForUser(user.id, res);
    return res.redirect(302, buildTelegramWalletBrowserLinkRedirectUrl());
  } catch (error) {
    next(error);
  }
};

export const claimTelegramTopUpBrowserLink = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = String(req.query?.token || '').trim();
    if (!token) {
      return res.redirect(302, buildTelegramWalletBrowserLinkErrorRedirectUrl('missing_token'));
    }

    const session = consumeTelegramTopUpBrowserLinkSession(token);
    if (!session) {
      return res.redirect(302, buildTelegramWalletBrowserLinkErrorRedirectUrl('expired_token'));
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        isBanned: true,
      },
    });
    if (!user || user.isBanned) {
      return res.redirect(302, buildTelegramWalletBrowserLinkErrorRedirectUrl('invalid_user'));
    }

    await createSessionForUser(user.id, res);
    return res.redirect(302, buildTelegramTopUpBrowserLinkRedirectUrl(session.amountUsdt));
  } catch (error) {
    next(error);
  }
};

export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const sessionToken = getSessionTokenFromRequest(req);

    if (sessionToken) {
      await prisma.session.deleteMany({
        where: { token: sessionToken },
      });
    }

    res.clearCookie('session', { path: '/' });
    res.json({ status: 'success' });
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        walletAddress: true,
        hasLinkedWallet: true,
        walletLinkedAt: true,
        balance: true,
        role: true,
        avatarUrl: true,
        avatarMeta: true,
        telegramId: true,
        telegramUsername: true,
        telegramFirstName: true,
        telegramLastName: true,
        telegramPhotoUrl: true,
        telegramLinkedAt: true,
        twitterId: true,
        twitterUsername: true,
        twitterName: true,
        twitterLinkedAt: true,
        referralCode: true,
        referralConfirmedCount: true,
        referredById: true,
        referralConfirmedAt: true,
        createdAt: true,
        inventory: {
          where: { status: 'ACTIVE', claimedAt: null },
          orderBy: { createdAt: 'desc' },
        },
        battles: {
          orderBy: { timestamp: 'desc' },
        },
        transactions: {
          orderBy: { timestamp: 'desc' },
          take: 200,
        },
      },
    });

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    if (user.referredById && user.referralConfirmedAt && user.role === 'USER') {
      await prisma.user.update({
        where: { id: userId },
        data: { role: 'MODERATOR' },
      });
      (user as { role: string }).role = 'MODERATOR';
    }

    const [burntItems, claimedItems] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: { userId, status: 'BURNT' },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.inventoryItem.findMany({
        where: { userId, status: 'ACTIVE', claimedAt: { not: null } },
        orderBy: { claimedAt: 'desc' },
      }),
    ]);

    const [caseOpeningsAgg, upgradesAttempted, upgradesSuccess] = await Promise.all([
      prisma.caseOpening.aggregate({
        where: { userId },
        _count: { _all: true },
        _sum: { wonValue: true },
      }),
      prisma.transaction.count({
        where: { userId, type: 'UPGRADE' },
      }),
      prisma.transaction.count({
        where: {
          userId,
          type: 'UPGRADE',
          metadata: { path: ['success'], equals: true },
        },
      }),
    ]);

    res.json({
      status: 'success',
      data: {
        user: {
          ...toPublicUser(user),
          createdAt: user.createdAt,
          stats: {
            casesOpened: caseOpeningsAgg._count._all,
            totalWon: caseOpeningsAgg._sum.wonValue ?? 0,
            upgradesAttempted,
            upgradeSuccessCount: upgradesSuccess,
          },
        },
        inventory: user.inventory,
        burntItems,
        claimedItems,
        battleHistory: user.battles,
        transactions: user.transactions,
      },
    });
  } catch (error) {
    next(error);
  }
};
