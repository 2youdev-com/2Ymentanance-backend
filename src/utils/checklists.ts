import { AssetType, MaintenanceType } from '@prisma/client';

export interface ChecklistTemplate {
  itemCode: string;
  description: string;
  method: string;
  expected: string;
}

const checklists: Partial<Record<AssetType, Record<MaintenanceType, ChecklistTemplate[]>>> = {
  CHILLER: {
    PREVENTIVE: [
      { itemCode: 'PM-CH-01', description: 'Compressor operating pressure', method: 'Gauge reading', expected: 'Within manufacturer spec' },
      { itemCode: 'PM-CH-02', description: 'Refrigerant level / charge', method: 'Sight glass / sensor', expected: 'Full charge, no bubbles' },
      { itemCode: 'PM-CH-03', description: 'Condenser coil condition', method: 'Visual inspection', expected: 'Clean, no debris or fouling' },
      { itemCode: 'PM-CH-04', description: 'Evaporator inlet/outlet temperature', method: 'Thermometer / sensor', expected: 'Within 2C of setpoint' },
      { itemCode: 'PM-CH-05', description: 'Compressor oil level', method: 'Sight glass', expected: 'Between min-max marks' },
      { itemCode: 'PM-CH-06', description: 'Electrical connections and terminals', method: 'Visual + torque check', expected: 'Tight, no discoloration or burn marks' },
      { itemCode: 'PM-CH-07', description: 'Vibration level', method: 'Vibration meter / touch', expected: 'Below 4.5 mm/s, no abnormal vibration' },
      { itemCode: 'PM-CH-08', description: 'Control panel status and alarms', method: 'Panel inspection', expected: 'No active alarms or error codes' },
      { itemCode: 'PM-CH-09', description: 'Chilled water flow rate', method: 'Flow meter reading', expected: 'Within design GPM range' },
      { itemCode: 'PM-CH-10', description: 'General condition, leaks, corrosion', method: 'Visual walk-around', expected: 'No leaks, no rust, no physical damage' },
    ],
    CORRECTIVE: [
      { itemCode: 'COR-CH-01', description: 'Identify fault / error code', method: 'Panel + diagnostic', expected: 'Root cause identified' },
      { itemCode: 'COR-CH-02', description: 'Check refrigerant for leak', method: 'Leak detector', expected: 'No leak detected or leak isolated' },
      { itemCode: 'COR-CH-03', description: 'Inspect compressor condition', method: 'Visual + pressure test', expected: 'Compressor operating normally' },
      { itemCode: 'COR-CH-04', description: 'Check electrical components', method: 'Multimeter', expected: 'No short circuit or open circuit' },
      { itemCode: 'COR-CH-05', description: 'Verify repair and restart', method: 'Operational test', expected: 'Unit running within normal parameters' },
    ],
  },
  AHU: {
    PREVENTIVE: [
      { itemCode: 'PM-AH-01', description: 'Air filter condition / pressure drop', method: 'Visual + DP gauge', expected: 'Clean or replace if delta-P exceeds limit' },
      { itemCode: 'PM-AH-02', description: 'Belt tension and condition', method: 'Manual inspection', expected: 'No cracks, correct tension, aligned' },
      { itemCode: 'PM-AH-03', description: 'Fan motor bearing temperature', method: 'IR thermometer', expected: 'Below 70C' },
      { itemCode: 'PM-AH-04', description: 'Damper actuator operation', method: 'Functional test', expected: 'Opens and closes fully, smooth movement' },
      { itemCode: 'PM-AH-05', description: 'Heating/cooling coil condition', method: 'Visual inspection', expected: 'No fouling, fins straight and intact' },
      { itemCode: 'PM-AH-06', description: 'Drain pan and condensate drain', method: 'Visual inspection', expected: 'Draining freely, no standing water or algae' },
      { itemCode: 'PM-AH-07', description: 'Supply air temperature', method: 'Thermometer at diffuser', expected: 'Within 1C of setpoint' },
      { itemCode: 'PM-AH-08', description: 'VFD / motor electrical readings', method: 'Panel reading', expected: 'Frequency, voltage, and amps within normal range' },
    ],
    CORRECTIVE: [
      { itemCode: 'COR-AH-01', description: 'Identify fault', method: 'Inspection + diagnostic', expected: 'Fault identified' },
      { itemCode: 'COR-AH-02', description: 'Check/replace filter', method: 'Visual + replacement', expected: 'Filter clean or replaced' },
      { itemCode: 'COR-AH-03', description: 'Check motor and belts', method: 'Manual + electrical test', expected: 'Motor and belts in good condition' },
      { itemCode: 'COR-AH-04', description: 'Verify airflow after repair', method: 'Anemometer', expected: 'Airflow within design CFM' },
    ],
  },
  ELEVATOR: {
    PREVENTIVE: [
      { itemCode: 'PM-EL-01', description: 'Door opening/closing operation', method: 'Functional test each floor', expected: 'Smooth operation, no grinding, proper timing' },
      { itemCode: 'PM-EL-02', description: 'Floor leveling accuracy', method: 'Visual / ruler measurement', expected: 'Within 6mm of landing level' },
      { itemCode: 'PM-EL-03', description: 'Emergency intercom / phone', method: 'Test call to control room', expected: 'Clear two-way communication' },
      { itemCode: 'PM-EL-04', description: 'Emergency brake system', method: 'Controlled test', expected: 'Engages properly, holds car securely' },
      { itemCode: 'PM-EL-05', description: 'Guide rail lubrication', method: 'Visual inspection', expected: 'Adequate lubricant, no dry spots' },
      { itemCode: 'PM-EL-06', description: 'Hoisting ropes / belts condition', method: 'Visual inspection', expected: 'No fraying, broken strands, or excessive wear' },
      { itemCode: 'PM-EL-07', description: 'Machine room temperature', method: 'Thermometer', expected: 'Below 40C, ventilation adequate' },
      { itemCode: 'PM-EL-08', description: 'Car interior: lighting, fan, alarm', method: 'Visual / functional test', expected: 'All lights on, fan running, alarm button works' },
      { itemCode: 'PM-EL-09', description: 'Safety edge / photo eye sensors', method: 'Obstruction test', expected: 'Door reverses when blocked' },
      { itemCode: 'PM-EL-10', description: 'Pit condition and sump pump', method: 'Visual inspection', expected: 'Clean, dry, pump functional' },
    ],
    CORRECTIVE: [
      { itemCode: 'COR-EL-01', description: 'Identify fault code', method: 'Controller diagnostic', expected: 'Error code read and documented' },
      { itemCode: 'COR-EL-02', description: 'Check door mechanism', method: 'Manual + visual', expected: 'Door opens/closes without obstruction' },
      { itemCode: 'COR-EL-03', description: 'Check safety systems', method: 'Functional test', expected: 'All safety features operational' },
      { itemCode: 'COR-EL-04', description: 'Test run after repair', method: 'Full operational test', expected: 'Elevator running normally on all floors' },
    ],
  },
  FIRE_PUMP: {
    PREVENTIVE: [
      { itemCode: 'PM-FP-01', description: 'Automatic start on pressure drop signal', method: 'Signal simulation test', expected: 'Pump starts within 10 seconds' },
      { itemCode: 'PM-FP-02', description: 'Suction and discharge pressure', method: 'Gauge readings', expected: 'Within rated design parameters' },
      { itemCode: 'PM-FP-03', description: 'Jockey pump cycling pattern', method: 'Observe for 15 minutes', expected: 'Normal on/off pattern, no rapid cycling' },
      { itemCode: 'PM-FP-04', description: 'Diesel fuel level (if diesel pump)', method: 'Tank gauge / dipstick', expected: 'Above 2/3 full' },
      { itemCode: 'PM-FP-05', description: 'Starting battery voltage', method: 'Multimeter test', expected: '12.4V+ per battery, charger functional' },
      { itemCode: 'PM-FP-06', description: 'Packing gland / mechanical seals', method: 'Visual inspection', expected: 'No excessive leakage or dripping' },
      { itemCode: 'PM-FP-07', description: 'Controller alarm panel', method: 'Panel inspection', expected: 'No active alarms, all indicators green' },
      { itemCode: 'PM-FP-08', description: 'Weekly run test (30 minutes)', method: 'Timed run at rated speed', expected: 'Stable pressure, no overheating, no unusual noise' },
    ],
    CORRECTIVE: [
      { itemCode: 'COR-FP-01', description: 'Identify fault', method: 'Alarm panel + inspection', expected: 'Fault identified' },
      { itemCode: 'COR-FP-02', description: 'Check pump mechanical seals', method: 'Visual inspection', expected: 'No leaks' },
      { itemCode: 'COR-FP-03', description: 'Check electrical and controller', method: 'Multimeter + panel', expected: 'No electrical faults' },
      { itemCode: 'COR-FP-04', description: 'Test pump after repair', method: 'Run test', expected: 'Pump starts and runs normally' },
    ],
  },
  UPS: {
    PREVENTIVE: [
      { itemCode: 'PM-UP-01', description: 'Input/output voltage and frequency', method: 'Panel reading', expected: 'Within nominal range (380V/50Hz)' },
      { itemCode: 'PM-UP-02', description: 'Battery voltage per string', method: 'Multimeter', expected: 'Within manufacturer spec per cell' },
      { itemCode: 'PM-UP-03', description: 'Battery temperature', method: 'IR thermometer', expected: 'Below 25C (room temp controlled)' },
      { itemCode: 'PM-UP-04', description: 'Load percentage', method: 'Panel display', expected: 'Below 80% capacity' },
      { itemCode: 'PM-UP-05', description: 'Cooling fan operation', method: 'Visual / listen', expected: 'All fans running, no unusual noise' },
      { itemCode: 'PM-UP-06', description: 'Transfer switch test (manual)', method: 'Simulated transfer', expected: 'Seamless switchover, no interruption' },
      { itemCode: 'PM-UP-07', description: 'Alarm and event log review', method: 'Panel / software', expected: 'No recurring alarms' },
      { itemCode: 'PM-UP-08', description: 'Physical inspection (cables, connections)', method: 'Visual', expected: 'Tight connections, no corrosion' },
    ],
    CORRECTIVE: [
      { itemCode: 'COR-UP-01', description: 'Identify alarm / fault', method: 'Panel + software log', expected: 'Fault identified' },
      { itemCode: 'COR-UP-02', description: 'Check battery condition', method: 'Load test', expected: 'Batteries holding charge' },
      { itemCode: 'COR-UP-03', description: 'Check bypass and transfer', method: 'Functional test', expected: 'Transfer completes without interruption' },
      { itemCode: 'COR-UP-04', description: 'Clear alarms after repair', method: 'Panel reset', expected: 'No active alarms' },
    ],
  },
  PRECISION_COOLING: {
    PREVENTIVE: [
      { itemCode: 'PM-CR-01', description: 'Supply/return air temperature', method: 'Thermometer', expected: 'Supply: 18-20C, Return: 30-35C' },
      { itemCode: 'PM-CR-02', description: 'Compressor operating pressure', method: 'Gauge', expected: 'Within design spec' },
      { itemCode: 'PM-CR-03', description: 'Condensate drain', method: 'Visual', expected: 'Draining freely' },
      { itemCode: 'PM-CR-04', description: 'Air filter condition', method: 'Visual / DP gauge', expected: 'Clean or replace' },
      { itemCode: 'PM-CR-05', description: 'Fan motor current', method: 'Clamp meter', expected: 'Within rated amps' },
      { itemCode: 'PM-CR-06', description: 'Humidity level', method: 'Hygrometer / panel', expected: '45-55% RH' },
      { itemCode: 'PM-CR-07', description: 'Refrigerant level', method: 'Sight glass', expected: 'Full charge, no bubbles' },
      { itemCode: 'PM-CR-08', description: 'Alarm panel check', method: 'Panel review', expected: 'No active alarms' },
    ],
    CORRECTIVE: [
      { itemCode: 'COR-CR-01', description: 'Identify fault', method: 'Alarm panel', expected: 'Fault identified' },
      { itemCode: 'COR-CR-02', description: 'Check refrigerant', method: 'Sight glass + leak detector', expected: 'Full charge, no leak' },
      { itemCode: 'COR-CR-03', description: 'Check temperature setpoints', method: 'Controller', expected: 'Setpoints correct' },
      { itemCode: 'COR-CR-04', description: 'Verify cooling after repair', method: 'Temperature measurement', expected: 'Supply temp within spec' },
    ],
  },
};

// Default generic checklist for asset types without specific templates
const genericChecklist = (type: MaintenanceType): ChecklistTemplate[] =>
  type === 'PREVENTIVE'
    ? [
        { itemCode: 'PM-GEN-01', description: 'Visual inspection - overall condition', method: 'Visual', expected: 'No visible damage or leaks' },
        { itemCode: 'PM-GEN-02', description: 'Electrical connections check', method: 'Visual + torque', expected: 'All connections tight' },
        { itemCode: 'PM-GEN-03', description: 'Operational test', method: 'Functional test', expected: 'Unit operating normally' },
        { itemCode: 'PM-GEN-04', description: 'Clean and lubricate as needed', method: 'Manual', expected: 'Clean, lubricated' },
        { itemCode: 'PM-GEN-05', description: 'Check alarms and controls', method: 'Panel inspection', expected: 'No active alarms' },
      ]
    : [
        { itemCode: 'COR-GEN-01', description: 'Identify and document fault', method: 'Inspection', expected: 'Fault documented' },
        { itemCode: 'COR-GEN-02', description: 'Isolate affected components', method: 'Manual isolation', expected: 'Safely isolated' },
        { itemCode: 'COR-GEN-03', description: 'Perform corrective action', method: 'Repair/replace', expected: 'Fault resolved' },
        { itemCode: 'COR-GEN-04', description: 'Test after repair', method: 'Functional test', expected: 'Operating normally' },
      ];

export const getChecklistTemplate = (
  assetType: AssetType,
  maintenanceType: MaintenanceType
): ChecklistTemplate[] => {
  return checklists[assetType]?.[maintenanceType] ?? genericChecklist(maintenanceType);
};
