import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app';
import { env } from './config/env';
import { initSocket } from './utils/socket';

// Socket.io — local dev only (not used on Vercel)
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: env.ALLOWED_ORIGINS, credentials: true },
});

initSocket(io);

io.on('connection', (socket) => {
  socket.on('join:site', (siteId: string) => socket.join(`site:${siteId}`));
  socket.on('leave:site', (siteId: string) => socket.leave(`site:${siteId}`));
});

httpServer.listen(env.PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`2Ymentanance API  |  port ${env.PORT}  |  ${env.NODE_ENV}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

export { app, io };