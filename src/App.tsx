import { useState, useEffect } from 'react';
import { 
  Lightbulb, Tv, Camera, Wifi, Settings, LayoutDashboard, 
  Power, ShieldCheck, Activity, Terminal, Shield, Eye
} from 'lucide-react';

import Header from './components/Header';
import BottomNav, { TabId } from './components/BottomNav';
import WizControl from './components/WizControl';
import TvControl from './components/TvControl';
import CctvControl from './components/CctvControl';
import RouterControl from './components/RouterControl';
import SettingsPanel from './components/SettingsPanel';
import type { SmartConfig } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [config, setConfig] = useState<SmartConfig>({
    wizName: 'Lampu Utama Living Room',
    wizIp: '192.168.1.10',
    wizPort: '38899',
    icseeName: 'CCTV Halaman Belakang',
    icseeIp: '192.168.1.20',
    icseeRtspUrl: 'rtsp://admin:123456@192.168.1.20:554/onvif1',
    tvName: 'Android TV Ruang Keluarga',
    tvIp: '192.168.1.30',
    routerName: 'Fiberhome Router Gateway',
    routerIp: '192.168.1.1',
    routerPassword: ''
  });

  // Device power states for Quick Controls
  const [quickStates, setQuickStates] = useState({
    lampuTamu: true,
    lampuKamar: false,
    lampuDapur: true,
    smartTv: false,
  });

  const [deviceStatuses, setDeviceStatuses] = useState({
    wiz: 'online',
    tv: 'online',
    cctv: 'online',
    router: 'online'
  });

  // Fetch saved configuration on load
  const loadConfig = async () => {
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      if (data.success && data.config) {
        setConfig(data.config);
      }
    } catch (err) {
      console.error("Gagal memuat konfigurasi:", err);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleSaveConfig = async (newConfig: SmartConfig) => {
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      const data = await response.json();
      if (data.success) {
        setConfig(data.config);
        alert('Konfigurasi integrasi berhasil disimpan ke Armbian!');
      } else {
        alert('Gagal menyimpan konfigurasi');
      }
    } catch (err) {
      console.error(err);
      alert('Error menghubungkan ke backend STB');
    }
  };

  // Toggles the main Philips WiZ lamp state
  const handleToggleWiz = async (targetState: boolean) => {
    setQuickStates(prev => ({ ...prev, lampuTamu: targetState }));
    try {
      await fetch('/api/wiz/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isOn: targetState, brightness: 80, colorTemp: 4000 })
      });
    } catch (err) {
      console.error("Error toggling WiZ:", err);
    }
  };

  // Turn all lights on or off at once
  const handleQuickToggleLight = () => {
    const targetState = !quickStates.lampuTamu;
    setQuickStates(prev => ({
      ...prev,
      lampuTamu: targetState,
      lampuKamar: targetState,
      lampuDapur: targetState,
    }));
    handleToggleWiz(targetState);
  };

  // Toggles other lights/devices locally or via mock APis
  const handleToggleDevice = (key: keyof typeof quickStates, targetState: boolean) => {
    setQuickStates(prev => ({ ...prev, [key]: targetState }));
    
    // If it's the TV, trigger mock TV power control
    if (key === 'smartTv') {
      fetch('/api/tv/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: targetState ? 'KEY_POWER' : 'KEY_POWER' })
      }).catch(console.error);
    }
  };

  // Count active elements
  const activeLightsCount = (quickStates.lampuTamu ? 1 : 0) + (quickStates.lampuKamar ? 1 : 0) + (quickStates.lampuDapur ? 1 : 0);
  const activeDisplaysCount = quickStates.smartTv ? 1 : 0;
  const camerasOnlineCount = deviceStatuses.cctv === 'online' ? 1 : 0;

  return (
    <div className="min-h-screen bg-[#0A0A0C] font-sans text-zinc-100 pb-36 pt-4">
      {/* Container utama dengan batasan lebar mobile-first / tablet-responsive */}
      <div className="max-w-md md:max-w-xl mx-auto px-4.5">
        
        {/* Dynamic header with clock & system state */}
        <Header />

        {/* --- MAIN TABS ROUTER --- */}
        
        {/* TAB 1: DASHBOARD / BERANDA */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4.5 animate-fade-in">
            
            {/* HOME STATUS OVERVIEW - COMPACT 3-COLUMN GRID */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase block pl-1">
                Home Status Overview
              </span>

              <div className="grid grid-cols-3 gap-2.5">
                {/* 1. Lights Active */}
                <div 
                  onClick={() => setActiveTab('devices')}
                  className="bg-[#121214] border border-[#1F1F24] hover:border-orange-500/30 p-3 rounded-2xl flex flex-col items-center justify-center text-center transition-all duration-300 cursor-pointer shadow-sm group"
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${activeLightsCount > 0 ? 'bg-orange-500/10 text-[#F97316]' : 'bg-zinc-800/40 text-zinc-500'} border border-zinc-800/30 group-hover:scale-105 mb-1.5`}>
                    <Lightbulb size={18} className={activeLightsCount > 0 ? 'fill-[#F97316]/10 stroke-[2]' : 'stroke-[1.5]'} />
                  </div>
                  <span className="text-[9px] text-zinc-400 font-bold tracking-wide">Lights</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-lg font-black text-white">{activeLightsCount}</span>
                    <span className="text-[9px] text-zinc-500 font-bold">/3</span>
                  </div>
                </div>

                {/* 2. Displays Active */}
                <div 
                  onClick={() => setActiveTab('devices')}
                  className="bg-[#121214] border border-[#1F1F24] hover:border-purple-500/30 p-3 rounded-2xl flex flex-col items-center justify-center text-center transition-all duration-300 cursor-pointer shadow-sm group"
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${activeDisplaysCount > 0 ? 'bg-purple-500/10 text-purple-400' : 'bg-zinc-800/40 text-zinc-500'} border border-zinc-800/30 group-hover:scale-105 mb-1.5`}>
                    <Tv size={18} className={activeDisplaysCount > 0 ? 'stroke-[2]' : 'stroke-[1.5]'} />
                  </div>
                  <span className="text-[9px] text-zinc-400 font-bold tracking-wide">TVs</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-lg font-black text-white">{activeDisplaysCount}</span>
                    <span className="text-[9px] text-zinc-500 font-bold">/1</span>
                  </div>
                </div>

                {/* 3. Cameras Online */}
                <div 
                  onClick={() => setActiveTab('cctv')}
                  className="bg-[#121214] border border-[#1F1F24] hover:border-blue-500/30 p-3 rounded-2xl flex flex-col items-center justify-center text-center transition-all duration-300 cursor-pointer shadow-sm group"
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${camerasOnlineCount > 0 ? 'bg-blue-500/10 text-blue-400' : 'bg-zinc-800/40 text-zinc-500'} border border-zinc-800/30 group-hover:scale-105 mb-1.5`}>
                    <Camera size={18} className={camerasOnlineCount > 0 ? 'stroke-[2]' : 'stroke-[1.5]'} />
                  </div>
                  <span className="text-[9px] text-zinc-400 font-bold tracking-wide">CCTVs</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-lg font-black text-white">{camerasOnlineCount}</span>
                    <span className="text-[9px] text-zinc-500 font-bold">/1</span>
                  </div>
                </div>
              </div>
            </div>

            {/* QUICK CONTROLS - COMPACT 2x2 BENTO GRID */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 pl-1">
                <span className="text-xs text-orange-500 font-bold">✦</span>
                <span className="text-[10px] font-bold text-zinc-400 tracking-widest uppercase">
                  Quick Controls
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                
                {/* 1. Lampu Ruang Tamu */}
                <div className="bg-[#121214] border border-[#1F1F24] p-3 rounded-2xl flex flex-col justify-between h-24">
                  <div className="flex items-center justify-between">
                    <div className={`p-1.5 rounded-xl ${quickStates.lampuTamu ? 'bg-orange-500/10 text-[#F97316]' : 'bg-zinc-900 text-zinc-600'}`}>
                      <Lightbulb size={16} />
                    </div>
                    {/* iOS style compact switch */}
                    <button 
                      onClick={() => handleToggleWiz(!quickStates.lampuTamu)}
                      className={`w-9 h-5 rounded-full p-0.5 transition-all duration-300 focus:outline-none cursor-pointer ${quickStates.lampuTamu ? 'bg-[#F97316]' : 'bg-zinc-850'}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-300 ${quickStates.lampuTamu ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  <div className="truncate">
                    <p className="text-[11px] font-black text-white truncate leading-tight">{config.wizName || 'Lampu Utama'}</p>
                    <p className="text-[9px] text-zinc-500 truncate leading-none mt-0.5">Living Room • {config.wizIp}</p>
                  </div>
                </div>

                {/* 2. Lampu Kamar Tidur */}
                <div className="bg-[#121214] border border-[#1F1F24] p-3 rounded-2xl flex flex-col justify-between h-24">
                  <div className="flex items-center justify-between">
                    <div className={`p-1.5 rounded-xl ${quickStates.lampuKamar ? 'bg-orange-500/10 text-[#F97316]' : 'bg-zinc-900 text-zinc-600'}`}>
                      <Lightbulb size={16} />
                    </div>
                    <button 
                      onClick={() => handleToggleDevice('lampuKamar', !quickStates.lampuKamar)}
                      className={`w-9 h-5 rounded-full p-0.5 transition-all duration-300 focus:outline-none cursor-pointer ${quickStates.lampuKamar ? 'bg-[#F97316]' : 'bg-zinc-850'}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-300 ${quickStates.lampuKamar ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  <div className="truncate">
                    <p className="text-[11px] font-black text-white truncate leading-tight">Lampu Kamar Tidur</p>
                    <p className="text-[9px] text-zinc-500 truncate leading-none mt-0.5">Kamar • Port {config.wizPort}</p>
                  </div>
                </div>

                {/* 3. Lampu Dapur */}
                <div className="bg-[#121214] border border-[#1F1F24] p-3 rounded-2xl flex flex-col justify-between h-24">
                  <div className="flex items-center justify-between">
                    <div className={`p-1.5 rounded-xl ${quickStates.lampuDapur ? 'bg-orange-500/10 text-[#F97316]' : 'bg-zinc-900 text-zinc-600'}`}>
                      <Lightbulb size={16} />
                    </div>
                    <button 
                      onClick={() => handleToggleDevice('lampuDapur', !quickStates.lampuDapur)}
                      className={`w-9 h-5 rounded-full p-0.5 transition-all duration-300 focus:outline-none cursor-pointer ${quickStates.lampuDapur ? 'bg-[#F97316]' : 'bg-zinc-850'}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-300 ${quickStates.lampuDapur ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  <div className="truncate">
                    <p className="text-[11px] font-black text-white truncate leading-tight">Lampu Dapur</p>
                    <p className="text-[9px] text-zinc-500 truncate leading-none mt-0.5">Dapur • Smart WiZ</p>
                  </div>
                </div>

                {/* 4. Smart TV Ruang Tamu */}
                <div className="bg-[#121214] border border-[#1F1F24] p-3 rounded-2xl flex flex-col justify-between h-24">
                  <div className="flex items-center justify-between">
                    <div className={`p-1.5 rounded-xl ${quickStates.smartTv ? 'bg-purple-500/10 text-purple-400' : 'bg-zinc-900 text-zinc-600'}`}>
                      <Tv size={16} />
                    </div>
                    <button 
                      onClick={() => handleToggleDevice('smartTv', !quickStates.smartTv)}
                      className={`w-9 h-5 rounded-full p-0.5 transition-all duration-300 focus:outline-none cursor-pointer ${quickStates.smartTv ? 'bg-purple-600' : 'bg-zinc-850'}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-300 ${quickStates.smartTv ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  <div className="truncate">
                    <p className="text-[11px] font-black text-white truncate leading-tight">{config.tvName || 'Smart TV'}</p>
                    <p className="text-[9px] text-zinc-500 truncate leading-none mt-0.5">TV • {config.tvIp}</p>
                  </div>
                </div>

              </div>
            </div>

            {/* QUICK ACTIONS ROUTE SHORTCUT */}
            <div className="bg-[#121214] border border-[#1F1F24] p-4 rounded-2xl space-y-3">
              <span className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase block pl-1">
                Aksi Cepat Adilanet
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                <button 
                  onClick={handleQuickToggleLight}
                  className="flex flex-col items-center justify-center p-3 bg-orange-500/5 hover:bg-orange-500/10 active:scale-95 transition-all rounded-xl border border-[#1F1F24] hover:border-[#F97316]/30 text-[#F97316] font-bold text-xs gap-1.5 cursor-pointer"
                >
                  <Lightbulb size={18} className="stroke-[2.5]" />
                  Nyalakan WiZ Full
                </button>

                <button 
                  onClick={() => {
                    fetch('/api/tv/control', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ command: 'LAUNCH_APP', value: 'com.google.android.youtube.tv' })
                    });
                    alert('Meluncurkan YouTube di Android TV...');
                  }}
                  className="flex flex-col items-center justify-center p-3 bg-purple-500/5 hover:bg-purple-500/10 active:scale-95 transition-all rounded-xl border border-[#1F1F24] hover:border-purple-500/30 text-purple-400 font-bold text-xs gap-1.5 cursor-pointer"
                >
                  <Tv size={18} className="stroke-[2.5]" />
                  Buka YouTube TV
                </button>
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: DETAILED DEVICES CONTROLS */}
        {activeTab === 'devices' && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest px-1">Kontrol Perangkat</h2>
            
            {/* Philips WiZ Controller */}
            <WizControl wizName={config.wizName} wizIp={config.wizIp} wizPort={config.wizPort} wizLamps={config.wizLamps} />

            {/* Android TV Controller */}
            <TvControl tvName={config.tvName} tvIp={config.tvIp} />
          </div>
        )}

        {/* TAB 3: CCTV VIEWER & PAN TILT */}
        {activeTab === 'cctv' && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest px-1">Monitoring CCTV</h2>
            <CctvControl icseeName={config.icseeName} icseeIp={config.icseeIp} cctvs={config.cctvs} />
          </div>
        )}

        {/* TAB 4: FIBERHOME ROUTER INTERNET */}
        {activeTab === 'router' && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest px-1">Koneksi Internet</h2>
            <RouterControl routerName={config.routerName} routerIp={config.routerIp} />
          </div>
        )}

        {/* TAB 5: INTEGRATION SETTINGS */}
        {activeTab === 'settings' && (
          <SettingsPanel config={config} onSave={handleSaveConfig} />
        )}

      </div>

      {/* Persistent Elegant Bottom Navigation (Android Native style) */}
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}

