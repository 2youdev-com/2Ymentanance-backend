import { Prisma } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

export const handlePrismaError = (err: unknown): AppError => {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        const fields = (err.meta?.target as string[])?.join(', ') || 'field';
        return new AppError(`A record with this ${fields} already exists`, 409);
      }
      case 'P2025':
        return new AppError('Record not found', 404);
      case 'P2003':
        return new AppError('Related record not found', 400);
      case 'P2014':
        return new AppError('Invalid relation', 400);
      default:
        return new AppError(`Database error: ${err.code}`, 500);
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return new AppError('Invalid data provided', 400);
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    return new AppError('Database connection failed', 503);
  }

  return new AppError('Internal server error', 500);
};
