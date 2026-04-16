import { Server } from 'socket.io';

let io: Server | null = null;

export const initSocket = (server: Server): void => {
  io = server;
};

export const getIO = (): Server | null => {
  return io;
};

export const hasIO = (): boolean => {
  return io !== null;
};