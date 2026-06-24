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
