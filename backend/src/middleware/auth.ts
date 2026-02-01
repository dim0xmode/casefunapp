import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { AppError } from './errorHandler.js';

export interface AuthRequest extends Request {
  userId?: string;
  walletAddress?: string;
  role?: string;
}

const getCookieValue = (cookieHeader: string, key: string) => {
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${key}=`))
    ?.split('=')[1];
};

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const cookieHeader = req.headers.cookie || '';
    const sessionToken = getCookieValue(cookieHeader, 'session');

    if (!sessionToken) {
      return next(new AppError('Authentication required', 401));
    }

    const session = await prisma.session.findUnique({
      where: { token: sessionToken },
      include: { user: true },
    });

    if (!session || session.expiresAt <= new Date()) {
      return next(new AppError('Invalid or expired session', 401));
    }

    if (session.user.isBanned) {
      return next(new AppError('Account is banned', 403));
    }

    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });

    req.userId = session.userId;
    req.walletAddress = session.user.walletAddress;
    req.role = session.user.role;
    next();
  } catch (error) {
    return next(new AppError('Authentication required', 401));
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.role || !roles.includes(req.role)) {
      return next(new AppError('Forbidden', 403));
    }
    return next();
  };
};
