import { Request, Response, NextFunction } from 'express';
import { ethers } from 'ethers';
import crypto from 'crypto';
import prisma from '../config/database.js';
import { config } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';

const buildLoginMessage = (nonce: string) => {
  return `CaseFun Login\nNonce: ${nonce}`;
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
          balance: 5000,
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

    // Create session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: {
        userId: user.id,
        token: sessionToken,
        expiresAt,
      },
    });

    // Consume nonce
    await prisma.walletNonce.deleteMany({
      where: { walletAddress: normalizedAddress },
    });

    res.cookie('session', sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.nodeEnv === 'production',
      maxAge: config.sessionTtlDays * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          username: user.username,
          walletAddress: user.walletAddress,
          balance: user.balance,
          role: user.role,
        },
      },
    });
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
    const cookieHeader = req.headers.cookie || '';
    const sessionToken = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('session='))
      ?.split('=')[1];

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
        balance: true,
        role: true,
        createdAt: true,
        inventory: {
          where: { status: 'ACTIVE' },
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

    const burntItems = await prisma.inventoryItem.findMany({
      where: { userId, status: 'BURNT' },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          username: user.username,
          walletAddress: user.walletAddress,
          balance: user.balance,
          role: user.role,
          createdAt: user.createdAt,
        },
        inventory: user.inventory,
        burntItems,
        battleHistory: user.battles,
        transactions: user.transactions,
      },
    });
  } catch (error) {
    next(error);
  }
};
