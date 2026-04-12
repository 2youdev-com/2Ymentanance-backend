import { Role } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  username: string;
  role: Role;
  siteIds: string[];
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface ActivityEvent {
  id: string;
  type: 'SCAN' | 'REGISTRATION' | 'MAINTENANCE' | 'REPORT';
  assetId: string;
  assetName: string;
  technicianName: string;
  siteId: string;
  timestamp: Date;
  details?: string;
}
