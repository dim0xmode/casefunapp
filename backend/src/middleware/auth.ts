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

    const touched = await prisma.session.updateMany({
      where: { id: session.id, token: sessionToken },
      data: { lastSeenAt: new Date() },
    });
    if (touched.count === 0) {
      return next(new AppError('Invalid or expired session', 401));
    }

    req.userId = session.userId;
    req.walletAddress = session.user.walletAddress;
    req.role = session.user.role;
    next();
  } catch (error) {
    return next(new AppError('Authentication required', 401));
  }
};

export const requireRole = (roles: string[]) => {
  const allowed = roles.map((r) => String(r).toUpperCase());
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = String(req.role || '').toUpperCase();
    if (!role || !allowed.includes(role)) {
      return next(new AppError('Forbidden', 403));
    }
    return next();
  };
};
