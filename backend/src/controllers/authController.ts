import { Request, Response, NextFunction } from 'express';
import { ethers } from 'ethers';
import crypto from 'crypto';
import prisma from '../config/database.js';
import { config } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthRequest } from '../middleware/auth.js';
import { verifyTelegramWebAppInitData } from '../utils/telegramAuth.js';

const buildLoginMessage = (nonce: string) => {
  return `CaseFun Login\nNonce: ${nonce}`;
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
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    maxAge: config.sessionTtlDays * 24 * 60 * 60 * 1000,
    path: '/',
  });
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

const upsertUserByTelegramIdentity = async (telegram: TelegramIdentityPayload) => {
  let user = await prisma.user.findUnique({
    where: { telegramId: telegram.telegramId },
  });

  if (!user) {
    const usernameSeed = telegram.telegramUsername || `TG_${telegram.telegramId.slice(-8)}`;
    const username = await makeUniqueUsername(usernameSeed);
    const placeholderWallet = await makeTelegramPlaceholderWallet(telegram.telegramId);

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

    if (!walletAddress) {
      return next(new AppError('Missing required fields', 400));
    }

    const nonce = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + config.nonceTtlMinutes * 60 * 1000);

    await prisma.walletNonce.create({
      data: {
        walletAddress: walletAddress.toLowerCase(),
        nonce,
        expiresAt,
      },
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
    const { walletAddress, signature, message } = req.body;

    if (!walletAddress || !signature || !message) {
      return next(new AppError('Missing required fields', 400));
    }

    const normalizedAddress = walletAddress.toLowerCase();

    const nonceRecord = await prisma.walletNonce.findFirst({
      where: {
        walletAddress: normalizedAddress,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!nonceRecord) {
      return next(new AppError('Nonce expired or not found', 401));
    }

    if (!message.includes(nonceRecord.nonce)) {
      return next(new AppError('Invalid message', 401));
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
      
      user = await prisma.user.create({
        data: {
          walletAddress: normalizedAddress,
          username,
          balance: 0,
          hasLinkedWallet: true,
          walletLinkedAt: new Date(),
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

    if (config.bootstrapAdminWallet && normalizedAddress === config.bootstrapAdminWallet.toLowerCase()) {
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
    const initData = String(req.body?.initData || '').trim();
    const telegram = verifyTelegramWebAppInitData({
      initData,
      botToken: config.telegramBotToken,
      maxAgeSeconds: config.telegramAuthMaxAgeSeconds,
    });

    const user = await upsertUserByTelegramIdentity({
      telegramId: telegram.telegramId,
      telegramUsername: telegram.telegramUsername,
      telegramFirstName: telegram.telegramFirstName,
      telegramLastName: telegram.telegramLastName,
      telegramPhotoUrl: telegram.telegramPhotoUrl,
    });

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

    const user = await upsertUserByTelegramIdentity({
      telegramId: generatedId,
      telegramUsername: inputUsername || `dev_${generatedId.slice(-8)}`,
      telegramFirstName: String(req.body?.telegramFirstName || 'Dev'),
      telegramLastName: String(req.body?.telegramLastName || ''),
      telegramPhotoUrl: null,
    });

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

    const normalizedAddress = String(walletAddress).toLowerCase();
    const nonceRecord = await prisma.walletNonce.findFirst({
      where: {
        walletAddress: normalizedAddress,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!nonceRecord) {
      return next(new AppError('Nonce expired or not found', 401));
    }
    if (!String(message).includes(nonceRecord.nonce)) {
      return next(new AppError('Invalid message', 401));
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
          throw new AppError('Wallet is linked to another Telegram account', 409);
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
