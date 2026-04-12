import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/asyncHandler';

export const login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      sites: { include: { site: { select: { id: true, name: true } } } },
    },
  });

  if (!user) throw new AppError('Invalid credentials', 401);

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) throw new AppError('Invalid credentials', 401);

  const siteIds = user.sites.map((us) => us.siteId);

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role, siteIds },
    env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        photoUrl: user.photoUrl,
        sites: user.sites.map((us) => ({ id: us.site.id, name: us.site.name })),
      },
    },
  });
});

export const getMe = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: {
      sites: { include: { site: { select: { id: true, name: true } } } },
    },
  });

  if (!user) throw new AppError('User not found', 404);

  res.json({
    success: true,
    data: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      photoUrl: user.photoUrl,
      sites: user.sites.map((us) => ({ id: us.site.id, name: us.site.name })),
    },
  });
});
