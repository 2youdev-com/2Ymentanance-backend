import { Request, Response, NextFunction } from 'express';

const FIELD_LABELS: Record<string, string> = {
  assetNumber: 'Asset Number',
  serialNumber: 'Serial Number',
  qrUuid: 'QR UUID',
  name: 'Asset Name',
  username: 'Username',
  email: 'Email',
};

function toReadableFieldName(field: string) {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  return field
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function buildDuplicateRecordMessage(req: Request, err: Error) {
  const target = (err as { meta?: { target?: string[] | string } }).meta?.target;
  const fields = Array.isArray(target) ? target : target ? [target] : [];

  if (fields.length === 0) {
    return 'A record with the same data already exists.';
  }

  const duplicates = fields.map(field => {
    const value = req.body?.[field];
    return value
      ? `${toReadableFieldName(field)} "${value}"`
      : toReadableFieldName(field);
  });

  if (duplicates.length === 1) {
    return `${duplicates[0]} already exists.`;
  }

  return `These values already exist: ${duplicates.join(', ')}.`;
}

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
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('[2Ymentanance Error]', err.message);

  if ((err as { code?: string }).code === 'P2002') {
    res.status(409).json({ success: false, error: buildDuplicateRecordMessage(req, err) }); return;
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
