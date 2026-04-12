import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/asyncHandler';

export const getUsers = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      photoUrl: true,
      createdAt: true,
      sites: { include: { site: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ success: true, data: users });
});

export const getUserById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      photoUrl: true,
      createdAt: true,
      sites: { include: { site: { select: { id: true, name: true } } } },
    },
  });

  if (!user) throw new AppError('User not found', 404);

  res.json({ success: true, data: user });
});

export const createUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { username, password, fullName, role, siteIds } = req.body;

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) throw new AppError('Username already taken', 409);

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      fullName,
      role,
      sites: {
        create: siteIds.map((siteId: string) => ({ siteId })),
      },
    },
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      createdAt: true,
      sites: { include: { site: { select: { id: true, name: true } } } },
    },
  });

  res.status(201).json({ success: true, data: user });
});

export const updateUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { fullName, role, siteIds, password } = req.body;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError('User not found', 404);

  const updateData: Record<string, unknown> = {};
  if (fullName) updateData.fullName = fullName;
  if (role) updateData.role = role;
  if (password) updateData.passwordHash = await bcrypt.hash(password, 10);

  await prisma.$transaction(async (tx) => {
    if (siteIds) {
      await tx.userSite.deleteMany({ where: { userId: id } });
      await tx.userSite.createMany({
        data: siteIds.map((siteId: string) => ({ userId: id, siteId })),
      });
    }

    await tx.user.update({ where: { id }, data: updateData });
  });

  const updated = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      createdAt: true,
      sites: { include: { site: { select: { id: true, name: true } } } },
    },
  });

  res.json({ success: true, data: updated });
});

export const deleteUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (id === req.user!.userId) {
    throw new AppError('You cannot delete your own account', 400);
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError('User not found', 404);

  await prisma.user.delete({ where: { id } });

  res.json({ success: true, message: 'User deleted' });
});
