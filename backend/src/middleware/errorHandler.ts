import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err && (err as any).name === 'MulterError') {
    const code = (err as any).code;
    const message = code === 'LIMIT_FILE_SIZE' ? 'File too large (max 1MB)' : 'Upload failed';
    return res.status(400).json({
      status: 'error',
      message,
    });
  }
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
  }

  console.error('ERROR:', err);

  return res.status(500).json({
    status: 'error',
    message: 'Internal server error',
  });
};
