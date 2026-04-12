import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { initSocket } from './utils/socket';
import { errorHandler, notFound } from './middleware/errorHandler';

import authRoutes          from './routes/auth.routes';
import assetsRoutes        from './routes/assets.routes';
import maintenanceRoutes   from './routes/maintenance.routes';
import reportsRoutes       from './routes/reports.routes';
import sitesRoutes         from './routes/sites.routes';
import activityRoutes      from './routes/activity.routes';
import checklistsRoutes    from './routes/checklists.routes';
import usersRoutes         from './routes/users.routes';
import dashboardRoutes     from './routes/dashboard.routes';
import exportRoutes        from './routes/export.routes';
import notificationsRoutes from './routes/notifications.routes';

const app = express();
const httpServer = createServer(app);

// ── Socket.io ──────────────────────────────────────────
const io = new Server(httpServer, {
  cors: { origin: env.ALLOWED_ORIGINS, credentials: true },
});

initSocket(io);

io.on('connection', (socket) => {
  socket.on('join:site',  (siteId: string) => socket.join(`site:${siteId}`));
  socket.on('leave:site', (siteId: string) => socket.leave(`site:${siteId}`));
});

// ── Security ───────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: env.ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

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
  res.json({
    success: true,
    status: 'ok',
    project: '2Ymentanance',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// ── Routes ─────────────────────────────────────────────
app.use('/api/auth',          authLimiter, authRoutes);
app.use('/api/assets',        assetsRoutes);
app.use('/api/maintenance',   maintenanceRoutes);
app.use('/api/reports',       reportsRoutes);
app.use('/api/sites',         sitesRoutes);
app.use('/api/activity',      activityRoutes);
app.use('/api/checklists',    checklistsRoutes);
app.use('/api/users',         usersRoutes);
app.use('/api/dashboard',     dashboardRoutes);       // NEW ✅
app.use('/api/export',        exportRoutes);          // NEW ✅
app.use('/api/notifications', notificationsRoutes);   // NEW ✅

// ── Error handling ─────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start ──────────────────────────────────────────────
httpServer.listen(env.PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  2Ymentanance Backend API`);
  console.log(`  Port: ${env.PORT}  |  ${env.NODE_ENV}`);
  console.log(`  Health: http://localhost:${env.PORT}/health`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

export { app, io };
