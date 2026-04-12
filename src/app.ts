import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { errorHandler, notFound } from './middleware/errorHandler';

import authRoutes from './routes/auth.routes';
import assetsRoutes from './routes/assets.routes';
import maintenanceRoutes from './routes/maintenance.routes';
import reportsRoutes from './routes/reports.routes';
import sitesRoutes from './routes/sites.routes';
import activityRoutes from './routes/activity.routes';
import checklistsRoutes from './routes/checklists.routes';
import usersRoutes from './routes/users.routes';

const app = express();

const corsOptions = {
  origin: env.ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// ── Handle preflight before everything ────────────────
app.options('*', cors(corsOptions));

// ── Security ───────────────────────────────────────────
app.use(helmet());
app.use(cors(corsOptions));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Too many login attempts' },
});

app.use(globalLimiter);

// ── Body parsing ───────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Health check ───────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ── Routes ─────────────────────────────────────────────
app.use('/api/auth',        authLimiter, authRoutes);
app.use('/api/assets',      assetsRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/reports',     reportsRoutes);
app.use('/api/sites',       sitesRoutes);
app.use('/api/activity',    activityRoutes);
app.use('/api/checklists',  checklistsRoutes);
app.use('/api/users',       usersRoutes);

// ── Error handling ─────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;