import { PrismaClient, AssetType, AssetStatus, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Sites ──────────────────────────────────────────────
  const tower = await prisma.site.upsert({
    where: { id: 'site-tower' },
    update: {},
    create: {
      id: 'site-tower',
      name: 'Bank Tower',
      address: 'King Fahd Road, Al-Muruj, Riyadh, KSA',
    },
  });

  const nrr = await prisma.site.upsert({
    where: { id: 'site-nrr' },
    update: {},
    create: {
      id: 'site-nrr',
      name: 'NRR IT Hub',
      address: 'King Fahd Road, Al-Muruj, Riyadh, KSA',
    },
  });

  console.log('✅ Sites created');

  // ── Users ──────────────────────────────────────────────
  const hash = await bcrypt.hash('demo1234', 10);

  const supervisor = await prisma.user.upsert({
    where: { username: 'supervisor' },
    update: {},
    create: {
      username: 'supervisor',
      passwordHash: hash,
      fullName: 'Ahmed Al-Rashidi',
      role: Role.ADMIN,
      sites: {
        create: [{ siteId: tower.id }, { siteId: nrr.id }],
      },
    },
  });

  const tech1 = await prisma.user.upsert({
    where: { username: 'tech1' },
    update: {},
    create: {
      username: 'tech1',
      passwordHash: hash,
      fullName: 'Khalid Al-Mutairi',
      role: Role.TECHNICIAN,
      sites: { create: [{ siteId: tower.id }] },
    },
  });

  const tech2 = await prisma.user.upsert({
    where: { username: 'tech2' },
    update: {},
    create: {
      username: 'tech2',
      passwordHash: hash,
      fullName: 'Faisal Al-Harbi',
      role: Role.TECHNICIAN,
      sites: { create: [{ siteId: nrr.id }] },
    },
  });

  const viewer = await prisma.user.upsert({
    where: { username: 'viewer' },
    update: {},
    create: {
      username: 'viewer',
      passwordHash: hash,
      fullName: 'Sara Al-Otaibi',
      role: Role.VIEWER,
      sites: { create: [{ siteId: tower.id }, { siteId: nrr.id }] },
    },
  });

  console.log('✅ Users created');
  console.log('   supervisor / demo1234 → ADMIN (Tower + NRR)');
  console.log('   tech1      / demo1234 → TECHNICIAN (Tower)');
  console.log('   tech2      / demo1234 → TECHNICIAN (NRR)');
  console.log('   viewer     / demo1234 → VIEWER (Tower + NRR)');

  // ── Tower Assets (15) ─────────────────────────────────
  const towerAssets = [
    { id: 'AST-TW-001', type: AssetType.CHILLER,           name: 'Chiller Unit #1',          model: 'Trane RTAC 400',         serial: 'TR-2019-44821', assetNum: 'AST-TW-001', building: 'Tower', floor: 'Basement 2', zone: 'Mechanical Room',   status: AssetStatus.OPERATIONAL },
    { id: 'AST-TW-002', type: AssetType.CHILLER,           name: 'Chiller Unit #2',          model: 'Trane RTAC 400',         serial: 'TR-2019-44822', assetNum: 'AST-TW-002', building: 'Tower', floor: 'Basement 2', zone: 'Mechanical Room',   status: AssetStatus.OPERATIONAL },
    { id: 'AST-TW-003', type: AssetType.AHU,               name: 'AHU - Floor 20',           model: 'Carrier 39CQ20',         serial: 'CR-2018-77234', assetNum: 'AST-TW-003', building: 'Tower', floor: 'Floor 20',   zone: 'MEP Core',          status: AssetStatus.OPERATIONAL },
    { id: 'AST-TW-004', type: AssetType.AHU,               name: 'AHU - Floor 30',           model: 'Carrier 39CQ30',         serial: 'CR-2018-77241', assetNum: 'AST-TW-004', building: 'Tower', floor: 'Floor 30',   zone: 'MEP Core',          status: AssetStatus.OPERATIONAL },
    { id: 'AST-TW-005', type: AssetType.ELEVATOR,          name: 'Passenger Elevator #1',    model: 'KONE MonoSpace 700',     serial: 'KN-2017-33101', assetNum: 'AST-TW-005', building: 'Tower', floor: 'Floors 1-22', zone: 'Core A',            status: AssetStatus.OPERATIONAL },
    { id: 'AST-TW-006', type: AssetType.ELEVATOR,          name: 'Passenger Elevator #3',    model: 'KONE MonoSpace 700',     serial: 'KN-2017-33103', assetNum: 'AST-TW-006', building: 'Tower', floor: 'Floors 1-44', zone: 'Core C',            status: AssetStatus.OPERATIONAL },
    { id: 'AST-TW-007', type: AssetType.ELECTRICAL_PANEL,  name: 'Main Switchgear Panel A',  model: 'ABB UniGear ZS1',        serial: 'AB-2017-90445', assetNum: 'AST-TW-007', building: 'Tower', floor: 'Basement 1', zone: 'Main Electrical Room', status: AssetStatus.OPERATIONAL },
    { id: 'AST-TW-008', type: AssetType.ELECTRICAL_PANEL,  name: 'Emergency Switchgear',     model: 'Schneider Prisma iPM',   serial: 'SC-2017-65221', assetNum: 'AST-TW-008', building: 'Tower', floor: 'Basement 1', zone: 'Electrical Room',   status: AssetStatus.OPERATIONAL },
    { id: 'AST-TW-009', type: AssetType.GENERATOR,         name: 'Diesel Generator #1',      model: 'Caterpillar C32 ACERT',  serial: 'CT-2017-56312', assetNum: 'AST-TW-009', building: 'Tower', floor: 'Basement 1', zone: 'Generator Room',    status: AssetStatus.OPERATIONAL },
    { id: 'AST-TW-010', type: AssetType.GENERATOR,         name: 'Diesel Generator #2',      model: 'Caterpillar C32 ACERT',  serial: 'CT-2017-56313', assetNum: 'AST-TW-010', building: 'Tower', floor: 'Basement 1', zone: 'Generator Room',    status: AssetStatus.OPERATIONAL },
    { id: 'AST-TW-011', type: AssetType.FIRE_PUMP,         name: 'Fire Pump - Main Electric', model: 'Armstrong 4300 HSC',    serial: 'AR-2017-11287', assetNum: 'AST-TW-011', building: 'Tower', floor: 'Basement 3', zone: 'Fire Pump Room',    status: AssetStatus.OPERATIONAL },
    { id: 'AST-TW-012', type: AssetType.FIRE_PUMP,         name: 'Fire Pump - Jockey',       model: 'Grundfos CR 45-3',       serial: 'GF-2017-29944', assetNum: 'AST-TW-012', building: 'Tower', floor: 'Basement 3', zone: 'Fire Pump Room',    status: AssetStatus.OPERATIONAL },
    { id: 'AST-TW-013', type: AssetType.FCU,               name: 'FCU - Office 2012',        model: 'Daikin FWB-BT',          serial: 'DK-2019-62103', assetNum: 'AST-TW-013', building: 'Tower', floor: 'Floor 20',   zone: 'Office Zone B',     status: AssetStatus.NEEDS_MAINTENANCE },
    { id: 'AST-TW-014', type: AssetType.FCU,               name: 'FCU - Office 3005',        model: 'Daikin FWB-BT',          serial: 'DK-2019-62189', assetNum: 'AST-TW-014', building: 'Tower', floor: 'Floor 30',   zone: 'Office Zone A',     status: AssetStatus.OPERATIONAL },
    { id: 'AST-TW-015', type: AssetType.COOLING_TOWER,     name: 'Cooling Tower #1',         model: 'BAC Series 3000',        serial: 'BC-2017-44190', assetNum: 'AST-TW-015', building: 'Tower', floor: 'Rooftop',    zone: 'Mechanical Area',   status: AssetStatus.OPERATIONAL },
  ];

  for (const a of towerAssets) {
    await prisma.asset.upsert({
      where: { qrUuid: a.id },
      update: {},
      create: {
        qrUuid: a.id,
        type: a.type,
        name: a.name,
        model: a.model,
        serialNumber: a.serial,
        assetNumber: a.assetNum,
        building: a.building,
        floor: a.floor,
        zone: a.zone,
        status: a.status,
        siteId: tower.id,
        createdBy: supervisor.id,
        lastPreventiveDate: new Date('2025-12-01'),
        lastCorrectiveDate: a.status === AssetStatus.NEEDS_MAINTENANCE ? new Date('2025-10-15') : null,
        remarks: a.status === AssetStatus.NEEDS_MAINTENANCE ? 'Filter needs replacement' : null,
      },
    });
  }

  console.log('✅ Tower assets created (15)');

  // ── NRR Assets (8) ────────────────────────────────────
  const nrrAssets = [
    { id: 'AST-NR-001', type: AssetType.PRECISION_COOLING,    name: 'CRAC Unit - Server Room A', model: 'Vertiv Liebert CRV 35kW',  serial: 'VT-2022-88471', assetNum: 'AST-NR-001', building: 'NRR', floor: 'Ground', zone: 'Server Room A' },
    { id: 'AST-NR-002', type: AssetType.PRECISION_COOLING,    name: 'CRAC Unit - Server Room B', model: 'Vertiv Liebert CRV 35kW',  serial: 'VT-2022-88472', assetNum: 'AST-NR-002', building: 'NRR', floor: 'Ground', zone: 'Server Room B' },
    { id: 'AST-NR-003', type: AssetType.UPS,                  name: 'UPS System - Main',         model: 'Eaton 93PM 200kVA',        serial: 'ET-2022-45039', assetNum: 'AST-NR-003', building: 'NRR', floor: 'Ground', zone: 'UPS Room' },
    { id: 'AST-NR-004', type: AssetType.UPS,                  name: 'UPS System - Redundant',    model: 'Eaton 93PM 200kVA',        serial: 'ET-2022-45040', assetNum: 'AST-NR-004', building: 'NRR', floor: 'Ground', zone: 'UPS Room' },
    { id: 'AST-NR-005', type: AssetType.POWER_DISTRIBUTION,   name: 'PDU - Rack Row A',          model: 'Vertiv Geist rPDU',        serial: 'VT-2022-91003', assetNum: 'AST-NR-005', building: 'NRR', floor: 'Ground', zone: 'Server Room A, Row A' },
    { id: 'AST-NR-006', type: AssetType.FIRE_SUPPRESSION,     name: 'Fire Suppression Panel',    model: 'Kidde FM-200 System',      serial: 'KD-2022-30112', assetNum: 'AST-NR-006', building: 'NRR', floor: 'Ground', zone: 'Server Room A' },
    { id: 'AST-NR-007', type: AssetType.GENERATOR,            name: 'Diesel Generator',          model: 'Cummins QSK60-G23',        serial: 'CM-2022-18445', assetNum: 'AST-NR-007', building: 'NRR', floor: 'Ground', zone: 'Generator Room' },
    { id: 'AST-NR-008', type: AssetType.AUTO_TRANSFER_SWITCH, name: 'ATS - Main Transfer',       model: 'ASCO 7000 Series',         serial: 'AS-2022-76891', assetNum: 'AST-NR-008', building: 'NRR', floor: 'Ground', zone: 'Electrical Room' },
  ];

  for (const a of nrrAssets) {
    await prisma.asset.upsert({
      where: { qrUuid: a.id },
      update: {},
      create: {
        qrUuid: a.id,
        type: a.type,
        name: a.name,
        model: a.model,
        serialNumber: a.serial,
        assetNumber: a.assetNum,
        building: a.building,
        floor: a.floor,
        zone: a.zone,
        status: AssetStatus.OPERATIONAL,
        siteId: nrr.id,
        createdBy: supervisor.id,
        lastPreventiveDate: new Date('2026-01-15'),
      },
    });
  }

  console.log('✅ NRR assets created (8)');

  // ── Sample maintenance log ─────────────────────────────
  const chillerAsset = await prisma.asset.findUnique({ where: { qrUuid: 'AST-TW-001' } });
  if (chillerAsset) {
    const existingLog = await prisma.maintenanceLog.findFirst({
      where: { assetId: chillerAsset.id, technicianId: tech1.id },
    });

    if (!existingLog) {
      const log = await prisma.maintenanceLog.create({
        data: {
          assetId: chillerAsset.id,
          technicianId: tech1.id,
          type: 'PREVENTIVE',
          status: 'COMPLETED',
          startedAt: new Date('2026-04-01T09:00:00'),
          completedAt: new Date('2026-04-01T10:30:00'),
          checklistItems: {
            create: [
              { itemCode: 'PM-CH-01', description: 'Compressor operating pressure', result: 'PASS' },
              { itemCode: 'PM-CH-02', description: 'Refrigerant level / charge', result: 'PASS' },
              { itemCode: 'PM-CH-03', description: 'Condenser coil condition', result: 'PASS' },
              { itemCode: 'PM-CH-04', description: 'Evaporator inlet/outlet temperature', result: 'PASS' },
              { itemCode: 'PM-CH-05', description: 'Compressor oil level', result: 'PASS' },
              { itemCode: 'PM-CH-06', description: 'Electrical connections and terminals', result: 'PASS' },
              { itemCode: 'PM-CH-07', description: 'Vibration level', result: 'PASS' },
              { itemCode: 'PM-CH-08', description: 'Control panel status and alarms', result: 'PASS' },
              { itemCode: 'PM-CH-09', description: 'Chilled water flow rate', result: 'PASS' },
              { itemCode: 'PM-CH-10', description: 'General condition, leaks, corrosion', result: 'PASS' },
            ],
          },
        },
      });
      console.log('✅ Sample maintenance log created for Chiller Unit #1');

      // Sample problem report for FCU
      const fcuAsset = await prisma.asset.findUnique({ where: { qrUuid: 'AST-TW-013' } });
      if (fcuAsset) {
        const fcuLog = await prisma.maintenanceLog.create({
          data: {
            assetId: fcuAsset.id,
            technicianId: tech1.id,
            type: 'CORRECTIVE',
            status: 'COMPLETED',
            startedAt: new Date('2026-04-03T14:00:00'),
            completedAt: new Date('2026-04-03T15:00:00'),
            checklistItems: {
              create: [
                { itemCode: 'PM-AH-01', description: 'Air filter condition', result: 'FAIL', notes: 'Filter heavily clogged, requires immediate replacement' },
                { itemCode: 'PM-AH-02', description: 'Belt tension and condition', result: 'PASS' },
              ],
            },
          },
        });

        await prisma.problemReport.create({
          data: {
            logId: fcuLog.id,
            assetId: fcuAsset.id,
            category: 'FILTER_CLOGGED',
            severity: 'MEDIUM',
            description: 'Air filter in FCU Office 2012 is heavily clogged causing reduced airflow to office zone B on floor 20. Replacement required.',
            resolved: false,
          },
        });
        console.log('✅ Sample problem report created for FCU Office 2012');
      }
    }
  }

  console.log('\n🎉 Seed complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Total assets: 23 (15 Tower + 8 NRR)');
  console.log('Users: 4 (supervisor, tech1, tech2, viewer)');
  console.log('Default password: demo1234');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
