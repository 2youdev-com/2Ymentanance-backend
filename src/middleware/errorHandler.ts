import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('[2Ymentanance Error]', err.message);

  if ((err as { code?: string }).code === 'P2002') {
    res.status(409).json({ success: false, error: 'Record already exists' }); return;
  }
  if ((err as { code?: string }).code === 'P2025') {
    res.status(404).json({ success: false, error: 'Record not found' }); return;
  }
  if ((err as { code?: string }).code === 'P2003') {
    res.status(400).json({ success: false, error: 'Related record not found' }); return;
  }
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ success: false, error: err.message }); return;
  }
  if (err.message?.includes('File too large')) {
    res.status(413).json({ success: false, error: 'File too large' }); return;
  }

  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
