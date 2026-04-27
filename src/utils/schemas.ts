import { z } from 'zod';

// ── Auth ──────────────────────────────────────────────
export const loginSchema = z.object({
  body: z.object({
    username: z.string().min(1, 'Username is required'),
    password: z.string().min(1, 'Password is required'),
  }),
});

// ── Assets ────────────────────────────────────────────
export const createAssetSchema = z.object({
  body: z.object({
    qrUuid: z.string().min(1, 'QR UUID is required'),
    type: z.enum([
      'CHILLER',
      'AHU',
      'ELEVATOR',
      'ELECTRICAL_PANEL',
      'GENERATOR',
      'FIRE_PUMP',
      'FCU',
      'UPS',
      'PRECISION_COOLING',
      'COOLING_TOWER',
      'AUTO_TRANSFER_SWITCH',
      'FIRE_SUPPRESSION',
      'POWER_DISTRIBUTION',
      'OTHER',
    ]),
    name: z.string().min(1, 'Asset name is required'),
    model: z.string().min(1, 'Model is required'),
    serialNumber: z.string().min(1, 'Serial number is required'),
    assetNumber: z.string().min(1, 'Asset number is required'),
    building: z.string().optional(),
    floor: z.string().optional(),
    zone: z.string().optional(),
    status: z.enum(['OPERATIONAL', 'NEEDS_MAINTENANCE', 'OUT_OF_SERVICE']).optional(),
    remarks: z.string().optional(),
    lastPreventiveDate: z
      .string()
      .datetime({ offset: true })
      .optional()
      .or(z.string().date().optional()),
    lastCorrectiveDate: z
      .string()
      .datetime({ offset: true })
      .optional()
      .or(z.string().date().optional()),
    siteId: z.string().min(1, 'Site ID is required'),
  }),
});

export const updateAssetSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    serialNumber: z.string().min(1).optional(),
    assetNumber: z.string().min(1).optional(),
    building: z.string().optional(),
    floor: z.string().optional(),
    zone: z.string().optional(),
    status: z.enum(['OPERATIONAL', 'NEEDS_MAINTENANCE', 'OUT_OF_SERVICE']).optional(),
    remarks: z.string().optional(),
    lastPreventiveDate: z.string().optional(),
    lastCorrectiveDate: z.string().optional(),
  }),
});

export const getAssetsQuerySchema = z.object({
  query: z.object({
    siteId: z.string().optional(),
    type: z.string().optional(),
    status: z.enum(['OPERATIONAL', 'NEEDS_MAINTENANCE', 'OUT_OF_SERVICE']).optional(),
    search: z.string().optional(),
    page: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
  }),
});

// ── Maintenance ───────────────────────────────────────
export const startMaintenanceSchema = z.object({
  body: z.object({
    assetId: z.string().min(1, 'Asset ID is required'),
    type: z.enum(['PREVENTIVE', 'CORRECTIVE']),
    technicianId: z.string().min(1).optional(),
  }),
});

export const submitChecklistSchema = z.object({
  params: z.object({
    logId: z.string().min(1, 'logId is required'),
  }),
  body: z.object({
    items: z.preprocess(
      (value) => {
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        }
        return value;
      },
      z
        .array(
          z.object({
            itemCode: z.string().min(1, 'itemCode is required'),
            description: z.string().min(1, 'description is required'),
            result: z.enum(['PASS', 'FAIL', 'NA']),
            notes: z.string().optional(),
          })
        )
        .min(1, 'At least one checklist item is required')
    ),
  }),
});

export const getMaintenanceLogsQuerySchema = z.object({
  query: z.object({
    siteId: z.string().optional(),
    assetId: z.string().optional(),
    type: z.enum(['PREVENTIVE', 'CORRECTIVE']).optional(),
    technicianId: z.string().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    status: z.enum(['IN_PROGRESS', 'COMPLETED']).optional(),
    page: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
  }),
});

// ── Problem Reports ───────────────────────────────────
export const createReportSchema = z.object({
  body: z.object({
    logId: z.string().min(1, 'Log ID is required'),
    category: z.enum([
      'OVERHEATING',
      'UNUSUAL_NOISE',
      'WATER_LEAK',
      'ELECTRICAL_FAULT',
      'SENSOR_FAILURE',
      'PHYSICAL_DAMAGE',
      'PRESSURE_DROP',
      'MECHANICAL_JAM',
      'BATTERY_FAILURE',
      'FILTER_CLOGGED',
    ]),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    description: z.string().min(10, 'Description must be at least 10 characters'),
    // Client uploads media directly to Cloudinary and sends back the secure URLs
    videoUrl: z.string().url().optional(),
    audioUrl: z.string().url().optional(),
    extraPhotoUrls: z
      .union([z.string(), z.array(z.string().url())])
      .optional()
      .transform((v) => {
        if (!v) return [];
        if (Array.isArray(v)) return v;
        // single string from multipart field
        return [v];
      }),
  }),
});

// ── Users ─────────────────────────────────────────────
export const createUserSchema = z.object({
  body: z.object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    fullName: z.string().min(1, 'Full name is required'),
    role: z.enum(['TECHNICIAN', 'VIEWER', 'ADMIN']),
    siteIds: z.array(z.string()).min(1, 'At least one site is required'),
  }),
});

export const updateUserSchema = z.object({
  body: z.object({
    fullName: z.string().min(1).optional(),
    role: z.enum(['TECHNICIAN', 'VIEWER', 'ADMIN']).optional(),
    siteIds: z.array(z.string()).optional(),
    password: z.string().min(8).optional(),
  }),
});
