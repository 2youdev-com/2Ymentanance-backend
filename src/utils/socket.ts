import { Server } from 'socket.io';

let io: Server;

export const initSocket = (server: Server): void => {
  io = server;
};

export const getIO = (): Server => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};
