import app from '../src/app';
import { VercelRequest, VercelResponse } from '@vercel/node';

const allowedOrigins = [
  'https://2ymentanance-dashboard.vercel.app',
  'https://2ymentanance-dashboard-git-main-2youdev-1819s-projects.vercel.app',
  'https://2ymentanance-dashboard-ms3aoao8o-2youdev-1819s-projects.vercel.app',
  'http://localhost:5173'
];

export default function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  return app(req, res);
}