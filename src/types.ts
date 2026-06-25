export type Device = {
  id: string;
  name: string;
  type: 'cctv' | 'light' | 'tv' | 'router';
  status: 'online' | 'offline' | 'on' | 'off' | 'idle';
};

export type WizLampConfig = {
  id: string;
  name: string;
  ip: string;
  port: string;
  group?: string;
};

export type CctvConfig = {
  id: string;
  name: string;
  ip: string;
  rtspUrl: string;
};

export type SmartConfig = {
  wizName: string;
  wizIp: string;
  wizPort: string;
  wizLamps?: WizLampConfig[];
  icseeName: string;
  icseeIp: string;
  icseeRtspUrl: string;
  cctvs?: CctvConfig[];
  tvName: string;
  tvIp: string;
  routerName: string;
  routerIp: string;
  routerPassword?: string;
};

export type WizState = {
  isOn: boolean;
  brightness: number; // 10-100
  colorTemp: number; // 2200-6500 (Kelvin)
  color: string; // hex
  scene: string;
};

export type TvState = {
  isOn: boolean;
  volume: number;
  currentApp: string;
  inputSource: string;
};

export type RouterState = {
  ssid: string;
  connectedClients: number;
  pingMs: number;
  downloadSpeed: number;
  uploadSpeed: number;
};

export type NvrRecording = {
  id: number;
  camera_id: string;
  camera_name: string;
  start_ts: number;
  end_ts: number;
  duration: number;
  size: number;
  thumb: string | null;
};

export type NvrDetection = {
  id: number;
  camera_id: string;
  camera_name: string;
  ts: number;
  label: string;
  score: number;
  thumb: string | null;
};

export type AutomationAction = {
  deviceType: 'wiz' | 'tv';
  deviceId: string;
  command: string;
};

export type AutomationRule = {
  id: string;
  name?: string;
  enabled: boolean;
  cameraId: string;
  label: string;
  action: AutomationAction;
  cooldownSec: number;
};

export type NvrDevices = {
  lamps: Array<{ id: string; name: string }>;
  cameras: Array<{ id: string; name: string }>;
  tv: { id: string; name: string } | null;
};

export type LightSchedule = {
  id: string;
  name?: string;
  enabled: boolean;
  time: string;
  days: number[];
  action: AutomationAction;
};
