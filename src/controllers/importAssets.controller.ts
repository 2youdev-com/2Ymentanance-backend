// src/controllers/importAssets.controller.ts
import { Request, Response } from 'express';
import AdmZip from 'adm-zip';
import * as XLSX from 'xlsx';
import { prisma } from '../config/database';
import { asyncHandler } from '../middleware/asyncHandler';
import { uploadToCloudinary } from '../middleware/upload';
import { AssetStatus, AssetType } from '@prisma/client';

const VALID_TYPES = new Set<string>([
  'CHILLER', 'AHU', 'ELEVATOR', 'ELECTRICAL_PANEL', 'GENERATOR',
  'FIRE_PUMP', 'FCU', 'UPS', 'PRECISION_COOLING', 'COOLING_TOWER',
  'AUTO_TRANSFER_SWITCH', 'FIRE_SUPPRESSION', 'POWER_DISTRIBUTION', 'OTHER',
]);

const VALID_STATUSES = new Set<string>([
  'OPERATIONAL', 'NEEDS_MAINTENANCE', 'OUT_OF_SERVICE',
]);

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function getExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

// Parse a sheet row into a plain string record
function parseRow(row: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(row)) {
    const val = row[key];
    out[key.trim()] = val == null ? '' : String(val).trim();
  }
  return out;
}

// Handle CSV text content to remove empty lines
function csvToRows(csvText: string): Record<string, string>[] {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 1) return [];
  const header = lines[0].split(',').map(h => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const row: Record<string, string> = {};
    header.forEach((h, idx) => row[h] = (values[idx] || '').trim());
    rows.push(row);
  }
  return rows;
}

export const importAssetsFromZip = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ success: false, error: 'No file uploaded.' });
    return;
  }

  const user = req.user!;

  let zip: AdmZip;
  try {
    zip = new AdmZip(req.file.buffer);
  } catch (zipErr: any) {
    res.status(400).json({
      success: false,
      error: `Invalid zip file: ${zipErr?.message ?? 'Could not read zip archive.'}`,
    });
    return;
  }

  const entries = zip.getEntries();

  // Log all entries for debugging
  const allNames = entries.map(e => e.entryName);
  console.log('[import-zip] entries:', allNames);

  // Find CSV or Excel sheet
  const sheetEntry = entries.find(e => {
    const n = e.entryName.toLowerCase();
    return !e.isDirectory && (n.endsWith('.csv') || n.endsWith('.xlsx') || n.endsWith('.xls'));
  });

  if (!sheetEntry) {
    res.status(400).json({
      success: false,
      error: `No CSV or Excel file found inside the zip. Files found: [${allNames.join(', ')}]`,
    });
    return;
  }

  let rows: Record<string, string>[] = [];

  try {
    const buffer = sheetEntry.getData();

    if (sheetEntry.entryName.toLowerCase().endsWith('.csv')) {
      const text = buffer.toString('utf-8').trim();
      rows = csvToRows(text);
    } else {
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('Excel file has no sheets.');
      const sheet = workbook.Sheets[sheetName];
      const raw: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      rows = raw.map(parseRow).filter(r => !Object.values(r).some(v => String(v).startsWith('#')));
    }
  } catch (parseErr: any) {
    res.status(400).json({
      success: false,
      error: `Could not parse "${sheetEntry.entryName}": ${parseErr?.message ?? 'Unknown parse error. Make sure you use the provided template.'}`,
    });
    return;
  }

  if (rows.length === 0) {
    res.status(400).json({
      success: false,
      error: 'The spreadsheet has no data rows. Make sure there is at least one row below the header.',
    });
    return;
  }

  // Validate headers — check that required columns exist
  const firstRow = rows[0];
  const missingHeaders: string[] = [];
  for (const required of ['name', 'type', 'siteId']) {
    if (!(required in firstRow)) missingHeaders.push(required);
  }
  if (missingHeaders.length > 0) {
    res.status(400).json({
      success: false,
      error: `Missing required column(s): ${missingHeaders.join(', ')}. Found columns: [${Object.keys(firstRow).join(', ')}]. Use the provided template.`,
    });
    return;
  }

  // Build photo map: serialNumber (lowercase) → buffer
  const photoMap = new Map<string, Buffer>();
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const ext = getExt(entry.entryName);
    if (!IMAGE_EXTS.has(ext)) continue;

    const baseName = entry.entryName.split('/').pop()!.slice(0, -(ext.length)).trim().toLowerCase();
    photoMap.set(baseName, entry.getData());
  }

  let created = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    if (!row.name || !row.type || !row.siteId) {
      const missing = ['name', 'type', 'siteId'].filter(f => !row[f]).join(', ');
      errors.push(`Row ${rowNum}: missing required field(s): ${missing}`);
      failed++;
      continue;
    }

    if (!VALID_TYPES.has(row.type.toUpperCase())) {
      errors.push(`Row ${rowNum} (${row.name}): invalid type "${row.type}". Valid types: ${[...VALID_TYPES].join(', ')}`);
      failed++;
      continue;
    }

    const status = (row.status || 'OPERATIONAL').toUpperCase();
    if (!VALID_STATUSES.has(status)) {
      errors.push(`Row ${rowNum} (${row.name}): invalid status "${row.status}". Valid: OPERATIONAL, NEEDS_MAINTENANCE, OUT_OF_SERVICE`);
      failed++;
      continue;
    }

    if (user.role !== 'ADMIN' && !user.siteIds.includes(row.siteId)) {
      errors.push(`Row ${rowNum} (${row.name}): not authorized for siteId "${row.siteId}"`);
      failed++;
      continue;
    }

    const serial = (row.serialNumber || '').toLowerCase();
    const assetName = row.name.toLowerCase().replace(/\s+/g, '_');

    let photoUrl: string | undefined;
    const photoBuffer = photoMap.get(serial) || photoMap.get(assetName);

    if (photoBuffer) {
      try {
        photoUrl = await uploadToCloudinary(photoBuffer, 'assets', 'image');
      } catch (uploadErr: any) {
        console.error(`Row ${rowNum}: photo upload failed`, uploadErr);
        // non-fatal — continue without photo
      }
    }

    const parseDate = (val: string) => {
      if (!val) return null;
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    };

    try {
      await prisma.asset.create({
        data: {
          qrUuid: crypto.randomUUID(),
          name: row.name,
          type: row.type.toUpperCase() as AssetType,
          model: row.model || 'N/A',
          serialNumber: row.serialNumber || `SN-${Date.now()}-${i}`,
          assetNumber: row.assetNumber || `AST-${Date.now()}-${i}`,
          building: row.building || undefined,
          floor: row.floor || undefined,
          zone: row.zone || undefined,
          status: status as AssetStatus,
          photoUrl: photoUrl ?? undefined,
          remarks: row.remarks || undefined,
          lastPreventiveDate: parseDate(row.lastPreventiveDate),
          lastCorrectiveDate: parseDate(row.lastCorrectiveDate),
          siteId: row.siteId,
          createdBy: user.userId,
        },
      });
      created++;
    } catch (dbErr: any) {
      const msg = dbErr?.meta?.target
        ? `duplicate value for ${dbErr.meta.target}`
        : (dbErr?.message ?? 'database error');
      errors.push(`Row ${rowNum} (${row.name}): ${msg}`);
      failed++;
    }
  }

  res.json({ success: true, data: { created, failed, errors } });
});