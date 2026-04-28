import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

export class AssistantTools {
  private userId: string;
  private userRole: Role;

  constructor(userId: string, userRole: Role) {
    this.userId = userId;
    this.userRole = userRole;
  }

  async searchAssets(filters: any = {}) {
    const { name, type, siteName, site, status, location } = filters;

    const where: any = {};

    if (name) {
      where.name = { contains: String(name), mode: 'insensitive' };
    }

    if (type) {
      where.type = this.normalizeAssetType(type);
    }

    if (status) {
      where.status = this.normalizeAssetStatus(status);
    }

    const siteFilter = siteName || site;
    if (siteFilter) {
      where.site = {
        name: { contains: String(siteFilter), mode: 'insensitive' },
      };
    }

    if (location) {
      where.OR = [
        { building: { contains: String(location), mode: 'insensitive' } },
        { floor: { contains: String(location), mode: 'insensitive' } },
        { zone: { contains: String(location), mode: 'insensitive' } },
      ];
    }

    const assets = await prisma.asset.findMany({
      where,
      include: { site: { select: { name: true } } },
      take: 20,
      orderBy: { updatedAt: 'desc' },
    });

    return assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      status: asset.status,
      site: asset.site.name,
      model: asset.model,
      serialNumber: asset.serialNumber,
      assetNumber: asset.assetNumber,
      location: `${asset.building || ''} ${asset.floor || ''} ${asset.zone || ''}`.trim(),
    }));
  }

  async getAssetDetails(assetId: string) {
    return prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        site: true,
        maintenanceLogs: {
          take: 5,
          orderBy: { startedAt: 'desc' },
          include: {
            technician: { select: { fullName: true } },
            problemReport: true,
          },
        },
      },
    });
  }

  async getLastMaintenanceByAsset(assetId: string) {
    const log = await prisma.maintenanceLog.findFirst({
      where: { assetId },
      orderBy: { startedAt: 'desc' },
      include: {
        technician: { select: { fullName: true } },
        asset: { select: { name: true, type: true, assetNumber: true } },
        problemReport: true,
      },
    });

    if (!log) {
      return { message: 'No maintenance records found for this asset.' };
    }

    return {
      id: log.id,
      asset: log.asset.name,
      assetType: log.asset.type,
      assetNumber: log.asset.assetNumber,
      maintenanceType: log.type,
      status: log.status,
      startedAt: log.startedAt,
      completedAt: log.completedAt,
      technician: log.technician.fullName,
      hasProblem: !!log.problemReport,
      problemSeverity: log.problemReport?.severity || null,
      problemCategory: log.problemReport?.category || null,
    };
  }

  async getRecentMaintenanceRecords(limit = 10) {
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);

    const logs = await prisma.maintenanceLog.findMany({
      take: safeLimit,
      orderBy: { startedAt: 'desc' },
      include: {
        asset: {
          select: {
            name: true,
            type: true,
            assetNumber: true,
            site: { select: { name: true } },
          },
        },
        technician: { select: { fullName: true } },
        problemReport: true,
      },
    });

    return logs.map((log) => ({
      id: log.id,
      asset: log.asset.name,
      assetType: log.asset.type,
      assetNumber: log.asset.assetNumber,
      site: log.asset.site.name,
      technician: log.technician.fullName,
      maintenanceType: log.type,
      status: log.status,
      date: log.startedAt,
      hasProblem: !!log.problemReport,
    }));
  }

  async getTechnicianWorkHistory(techName?: string) {
    const where: any = {};

    if (techName) {
      where.technician = {
        fullName: { contains: String(techName), mode: 'insensitive' },
      };
    } else if (this.userRole === Role.TECHNICIAN) {
      where.technicianId = this.userId;
    }

    const logs = await prisma.maintenanceLog.findMany({
      where,
      take: 15,
      orderBy: { startedAt: 'desc' },
      include: {
        asset: {
          select: {
            name: true,
            type: true,
            site: { select: { name: true } },
          },
        },
      },
    });

    return logs.map((log) => ({
      id: log.id,
      asset: log.asset.name,
      assetType: log.asset.type,
      site: log.asset.site.name,
      maintenanceType: log.type,
      status: log.status,
      date: log.startedAt,
    }));
  }

  async getOpenProblemReports() {
    const reports = await prisma.problemReport.findMany({
      where: { resolved: false },
      orderBy: { submittedAt: 'desc' },
      include: {
        asset: {
          select: {
            name: true,
            type: true,
            assetNumber: true,
            site: { select: { name: true } },
          },
        },
        log: {
          include: {
            technician: { select: { fullName: true } },
          },
        },
      },
    });

    return reports.map((report) => ({
      id: report.id,
      asset: report.asset.name,
      assetType: report.asset.type,
      assetNumber: report.asset.assetNumber,
      site: report.asset.site.name,
      category: report.category,
      severity: report.severity,
      description: report.description,
      technician: report.log.technician.fullName,
      submittedAt: report.submittedAt,
    }));
  }

  async getHighSeverityProblems() {
    const reports = await prisma.problemReport.findMany({
      where: {
        resolved: false,
        severity: { in: ['HIGH', 'CRITICAL'] },
      },
      orderBy: { submittedAt: 'desc' },
      include: {
        asset: {
          select: {
            name: true,
            type: true,
            assetNumber: true,
            site: { select: { name: true } },
          },
        },
        log: {
          include: {
            technician: { select: { fullName: true } },
          },
        },
      },
    });

    return reports.map((report) => ({
      id: report.id,
      asset: report.asset.name,
      assetType: report.asset.type,
      assetNumber: report.asset.assetNumber,
      site: report.asset.site.name,
      category: report.category,
      severity: report.severity,
      description: report.description,
      technician: report.log.technician.fullName,
      submittedAt: report.submittedAt,
    }));
  }

  async getSiteMaintenanceSummary(siteName: string) {
    if (!siteName) {
      return { message: 'Please specify a site name.' };
    }

    const siteRecord = await prisma.site.findFirst({
      where: {
        OR: [
          { id: siteName },
          { name: { contains: siteName, mode: 'insensitive' } },
        ],
      },
      include: {
        assets: true,
      },
    });

    if (!siteRecord) {
      return { message: 'Site not found.' };
    }

    const totalAssets = siteRecord.assets.length;
    const needsMaintenance = siteRecord.assets.filter(
      (asset) => asset.status === 'NEEDS_MAINTENANCE'
    ).length;
    const outOfService = siteRecord.assets.filter(
      (asset) => asset.status === 'OUT_OF_SERVICE'
    ).length;
    const operational = siteRecord.assets.filter(
      (asset) => asset.status === 'OPERATIONAL'
    ).length;

    return {
      siteName: siteRecord.name,
      totalAssets,
      operational,
      needsMaintenance,
      outOfService,
    };
  }

  private normalizeAssetStatus(status: string) {
    const value = String(status).toUpperCase().replace(/\s+/g, '_');

    if (value.includes('NEEDS') || value.includes('MAINTENANCE')) {
      return 'NEEDS_MAINTENANCE';
    }

    if (value.includes('OUT')) {
      return 'OUT_OF_SERVICE';
    }

    if (value.includes('OPERATIONAL')) {
      return 'OPERATIONAL';
    }

    return value;
  }

  private normalizeAssetType(type: string) {
    return String(type).toUpperCase().replace(/\s+/g, '_');
  }
}