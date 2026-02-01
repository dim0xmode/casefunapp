import dotenv from 'dotenv';

dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001'),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  databaseUrl: process.env.DATABASE_URL,
  sessionTtlDays: parseInt(process.env.SESSION_TTL_DAYS || '7', 10),
  nonceTtlMinutes: parseInt(process.env.NONCE_TTL_MINUTES || '10', 10),
  bootstrapAdminWallet: process.env.BOOTSTRAP_ADMIN_WALLET || '',
};

// Validate required environment variables
if (!config.databaseUrl) {
  console.warn('⚠️  WARNING: DATABASE_URL is not set. Database operations will fail.');
}

if (config.nodeEnv === 'production' && config.jwtSecret === 'dev-secret-change-in-production') {
  console.warn('⚠️  WARNING: Using default JWT_SECRET in production is insecure!');
}

export const isDevelopment = config.nodeEnv === 'development';
export const isProduction = config.nodeEnv === 'production';
