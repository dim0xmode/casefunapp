import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { config } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiRateLimit } from './middleware/rateLimit.js';
import authRoutes from './routes/authRoutes.js';
import caseRoutes from './routes/caseRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import userRoutes from './routes/userRoutes.js';
import walletRoutes from './routes/walletRoutes.js';
import tokenRoutes from './routes/tokenRoutes.js';
import prisma from './config/database.js';
import { startCaseExpiryWorker } from './workers/caseExpiryWorker.js';
import { syncTelegramMiniAppMenuButton, ensureTelegramBotLinkPolling } from './services/telegramLinkBotService.js';

const app = express();

// Middleware
app.set('trust proxy', 1);

const trimSlash = (value: string) => value.replace(/\/$/, '');
const frontendBase = trimSlash(String(config.frontendUrl || '').trim());
const allowedOrigins = new Set<string>(['http://localhost:5174']);
if (frontendBase) {
  allowedOrigins.add(frontendBase);
  if (frontendBase.startsWith('https://') && !frontendBase.includes('://www.')) {
    allowedOrigins.add(frontendBase.replace('https://', 'https://www.'));
  }
  if (frontendBase.startsWith('http://') && !frontendBase.includes('://www.')) {
    allowedOrigins.add(frontendBase.replace('http://', 'http://www.'));
  }
}
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const norm = trimSlash(origin);
    if (allowedOrigins.has(norm)) return callback(null, true);
    if (config.nodeEnv === 'development' && origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(apiRateLimit);

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/auth')) return next();
  const start = Date.now();
  res.on('finish', () => {
    const pathOnly = String(req.originalUrl || req.url || '').split('?')[0];
    console.log(`[auth] ${req.method} ${pathOnly} -> ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ALLOWED_CONTENT_TYPES = new Set([
  'application/json',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain',
]);

app.use((req, res, next) => {
  const method = String(req.method || '').toUpperCase();
  if (!BODY_METHODS.has(method)) return next();

  const rawContentType = String(req.headers['content-type'] || '').trim().toLowerCase();
  if (!rawContentType) return next();

  const normalized = rawContentType.split(';')[0]?.trim();
  if (!normalized || ALLOWED_CONTENT_TYPES.has(normalized)) return next();

  return res.status(415).json({
    status: 'error',
    message: 'Unsupported content type',
  });
});

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/cases', caseRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/token', tokenRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found' });
});

// Start server
app.listen(config.port, async () => {
  console.log(`🚀 Server running on http://localhost:${config.port}`);
  console.log(`📝 Environment: ${config.nodeEnv}`);
  console.log(`🌐 Frontend URL: ${config.frontendUrl}`);
  console.log(`✅ Health check: http://localhost:${config.port}/api/health`);
  
  // Test database connection
  try {
    await prisma.$connect();
    console.log(`✅ Database connected successfully`);
  } catch (error) {
    console.error(`❌ Database connection failed:`, error);
    console.error(`⚠️  Make sure PostgreSQL is running and DATABASE_URL is correct`);
  }

  if (config.nodeEnv === 'production' && config.telegramBotToken) {
    void syncTelegramMiniAppMenuButton()
      .then(() => {
        console.log('✅ Telegram Mini App menu synced');
      })
      .catch((error) => {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`⚠️  Telegram Mini App menu sync skipped: ${reason}`);
      });
    try {
      ensureTelegramBotLinkPolling();
      console.log('✅ Telegram bot polling started');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`⚠️  Telegram bot polling skipped: ${reason}`);
    }
  }

  startCaseExpiryWorker();
});

export default app;
