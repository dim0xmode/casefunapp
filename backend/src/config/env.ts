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
  ethereumRpcUrl: process.env.ETHEREUM_RPC_URL || '',
  chainId: parseInt(process.env.CHAIN_ID || '11155111', 10),
  treasuryAddress: process.env.TREASURY_ADDRESS || '',
  tokenFactoryAddress: process.env.TOKEN_FACTORY_ADDRESS || '',
  priceFeedAddress: process.env.PRICE_FEED_ADDRESS || '',
  treasuryPrivateKey: process.env.TREASURY_PRIVATE_KEY || process.env.PRIVATE_KEY || '',
  treasuryPayoutAddress: process.env.TREASURY_PAYOUT_ADDRESS || '',
  confirmations: parseInt(process.env.CONFIRMATIONS || '1', 10),
  twitterClientId: process.env.TWITTER_CLIENT_ID || '',
  twitterClientSecret: process.env.TWITTER_CLIENT_SECRET || '',
  twitterRedirectUri: process.env.TWITTER_REDIRECT_URI || '',
};

// Validate required environment variables
if (!config.databaseUrl) {
  console.warn('⚠️  WARNING: DATABASE_URL is not set. Database operations will fail.');
}

if (config.nodeEnv === 'production' && config.jwtSecret === 'dev-secret-change-in-production') {
  console.warn('⚠️  WARNING: Using default JWT_SECRET in production is insecure!');
}

if (!config.ethereumRpcUrl || !config.treasuryAddress || !config.tokenFactoryAddress) {
  console.warn('⚠️  WARNING: Blockchain config is incomplete (RPC/TREASURY/TOKEN_FACTORY).');
}

if (config.twitterClientId && !config.twitterClientSecret) {
  console.warn('⚠️  WARNING: TWITTER_CLIENT_ID is set without TWITTER_CLIENT_SECRET.');
}

export const isDevelopment = config.nodeEnv === 'development';
export const isProduction = config.nodeEnv === 'production';
