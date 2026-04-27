import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { errorHandler, notFound } from './middleware/errorHandler';

import authRoutes from './routes/auth.routes';
import assetsRoutes from './routes/assets.routes';
import maintenanceRoutes from './routes/maintenance.routes';
import reportsRoutes from './routes/reports.routes';
import sitesRoutes from './routes/sites.routes';
import activityRoutes from './routes/activity.routes';
import checklistsRoutes from './routes/checklists.routes';
import usersRoutes from './routes/users.routes';
import dashboardRoutes from './routes/dashboard.routes';
import exportRoutes from './routes/export.routes';
import notificationsRoutes from './routes/notifications.routes';
import uploadRoutes from './routes/upload.routes';
import verificationRoutes from './routes/verification';

const app = express();

app.set('trust proxy', 1);

const allowedOrigins = [
  'https://2ymentanance-dashboard.vercel.app',
  'http://localhost:5173',
];

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) return callback(null, true);
    const isAllowed =
      allowedOrigins.includes(origin) ||
      /^https:\/\/2ymentanance-dashboard-.*\.vercel\.app$/.test(origin);
    if (isAllowed) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// ── OPTIONS قبل أي حاجة ────────────────────────────────
app.options('*', cors(corsOptions));

// ── Security ───────────────────────────────────────────
app.use(cors(corsOptions));
app.use(helmet());

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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/assets', assetsRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/sites', sitesRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/checklists', checklistsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/verification', verificationRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;