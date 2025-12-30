
export enum SafetyStatus {
  SAFE = 'SAFE',
  WARNING = 'WARNING',
  DANGER = 'DANGER'
}

export enum MLState {
  NORMAL = 'NORMAL',
  NO_MOVEMENT = 'NO_MOVEMENT',
  FALL_LIKELY = 'FALL_LIKELY',
  GAS_SMOKE_ALERT = 'GAS_SMOKE_ALERT',
  OVERHEAT_RISK = 'OVERHEAT_RISK',
  LOUD_NOISE = 'LOUD_NOISE'
}

export interface SensorData {
  motion_events_last_15min: number;
  avg_temperature_c: number;
  avg_humidity: number;
  gas_level: number;
  smoke_level: number;
  noise_level: number;
  door_open: boolean;
}

export interface RoomContext {
  room_id: string;
  time: string;
  ml_state: MLState;
  ml_confidence: number;
  sensors: SensorData;
  expected_occupancy: string;
  notes: string;
}

export interface GeminiSafetyReport {
  status: SafetyStatus;
  summary: string;
  actions_for_user: string[];
  actions_for_warden: string[];
}

export interface LogEntry {
  timestamp: string;
  status: SafetyStatus;
  ml_state: MLState;
  sensor_summary: string;
}
