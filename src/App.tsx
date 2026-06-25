import { useState, useEffect } from 'react';
import { 
  Lightbulb, Tv, Camera, Wifi, Settings, LayoutDashboard, 
  Power, ShieldCheck, Activity, Terminal, Shield, Eye,
  Download, X, Pencil, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import Header from './components/Header';
import BottomNav, { TabId } from './components/BottomNav';
import WizControl from './components/WizControl';
import TvControl from './components/TvControl';
import CctvControl from './components/CctvControl';
import RouterControl from './components/RouterControl';
import SettingsPanel from './components/SettingsPanel';
import type { SmartConfig, WizLampConfig } from './types';

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

  // Real physical power and brightness states of each WiZ lamp
  const [wizLampStates, setWizLampStates] = useState<{ 
    [id: string]: { isOn: boolean; brightness: number; colorTemp: number; online: boolean } 
  }>({});

  // Device power states for Quick Controls (TV)
  const [quickStates, setQuickStates] = useState({
    smartTv: false,
  });

  // PWA Installation prompt event listener states
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later
      setDeferredPrompt(e);
      // Update UI notify the user they can install the PWA
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // If the app is already installed & running standalone, don't show the banner
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallBanner(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    // Show the install prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA: User response to install prompt: ${outcome}`);
    // We've used the prompt, discard it
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  // Quick lamp name and configuration editor states
  const [editingLamp, setEditingLamp] = useState<WizLampConfig | null>(null);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);

  // Auto-hide notifications after 3 seconds
  useEffect(() => {
    if (notificationMessage) {
      const timer = setTimeout(() => setNotificationMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notificationMessage]);

  // Direct quick-edit handler for updating single lamp metadata on the fly
  const handleUpdateSingleLamp = async (updatedLamp: WizLampConfig) => {
    const updatedLamps = (config.wizLamps || []).map(lamp => 
      lamp.id === updatedLamp.id ? updatedLamp : lamp
    );
    const newConfig = { ...config, wizLamps: updatedLamps };

    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      const data = await response.json();
      if (data.success) {
        setConfig(data.config);
        setNotificationMessage(`Berhasil menyimpan nama "${updatedLamp.name}"!`);
        fetchWizStatus();
        setEditingLamp(null);
      } else {
        setNotificationMessage('Gagal memperbarui konfigurasi lampu.');
      }
    } catch (err) {
      console.error("Error updating single lamp:", err);
      setNotificationMessage('Koneksi terputus saat memperbarui lampu.');
    }
  };

  const [deviceStatuses, setDeviceStatuses] = useState({
    wiz: 'online',
    tv: 'online',
    cctv: 'online',
    router: 'online'
  });

  // Fetch real physical status of all lamps from the server
  const fetchWizStatus = async () => {
    try {
      const response = await fetch('/api/wiz/status');
      const data = await response.json();
      if (data.success && data.statuses) {
        setWizLampStates(data.statuses);
      }
    } catch (err) {
      console.error("Gagal memuat status riil lampu WiZ:", err);
    }
  };

  // Fetch saved configuration on load
  const loadConfig = async () => {
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      if (data.success && data.config) {
        setConfig(data.config);
      }
      // Also fetch real lamp status concurrently
      await fetchWizStatus();
    } catch (err) {
      console.error("Gagal memuat konfigurasi:", err);
    }
  };

  useEffect(() => {
    loadConfig();
    // Poll the lamp status every 15 seconds to ensure browser refresh and dashboard are always real-time
    const interval = setInterval(fetchWizStatus, 15000);
    return () => clearInterval(interval);
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
        setNotificationMessage('Konfigurasi integrasi berhasil disimpan ke Armbian!');
        fetchWizStatus(); // Refresh statuses for newly saved lamps
      } else {
        setNotificationMessage('Gagal menyimpan konfigurasi');
      }
    } catch (err) {
      console.error(err);
      setNotificationMessage('Error menghubungkan ke backend STB');
    }
  };

  // Toggles an individual dynamic WiZ lamp state
  const handleToggleDynamicWiz = async (id: string, lampIp: string, lampPort: string, currentState: boolean) => {
    const nextState = !currentState;

    // Optimistic state update
    setWizLampStates(prev => ({
      ...prev,
      [id]: {
        ...(prev[id] || { brightness: 80, colorTemp: 4000, online: true }),
        isOn: nextState
      }
    }));

    try {
      await fetch('/api/wiz/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isOn: nextState,
          brightness: 80,
          colorTemp: 4000,
          ip: lampIp,
          port: lampPort || '38899'
        })
      });
    } catch (err) {
      console.error("Error toggling dynamic WiZ lamp:", err);
    }
  };

  // Master Action: Toggle all lights on or off at once depending on active states
  const handleQuickToggleAllLamps = async () => {
    const lampsList = config.wizLamps || [];
    if (lampsList.length === 0) return;

    // Check if any registered lamp is currently on. If yes, turn all off. Otherwise, turn all on.
    const anyOn = lampsList.some(lamp => wizLampStates[lamp.id]?.isOn);
    const targetState = !anyOn;

    // Optimistically update states
    const nextStates = { ...wizLampStates };
    lampsList.forEach(lamp => {
      nextStates[lamp.id] = {
        ...(nextStates[lamp.id] || { brightness: 80, colorTemp: 4000, online: true }),
        isOn: targetState
      };
    });
    setWizLampStates(nextStates);

    try {
      // Send UDP packets to all lamps concurrently
      await Promise.all(lampsList.map(lamp => {
        return fetch('/api/wiz/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isOn: targetState,
            brightness: 80,
            colorTemp: 4000,
            ip: lamp.ip,
            port: lamp.port || '38899'
          })
        });
      }));
    } catch (err) {
      console.error("Gagal melakukan master control group:", err);
    }
  };

  // Toggles other lights/devices locally or via mock APis
  const handleToggleDevice = (key: 'smartTv', targetState: boolean) => {
    setQuickStates(prev => ({ ...prev, [key]: targetState }));
    
    // If it's the TV, trigger mock TV power control
    if (key === 'smartTv') {
      fetch('/api/tv/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'power' })
      }).catch(console.error);
    }
  };

  // Count active elements
  const registeredLamps = config.wizLamps || [];
  const activeLightsCount = registeredLamps.filter(lamp => wizLampStates[lamp.id]?.isOn).length;
  const totalLightsCount = registeredLamps.length;
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
                    <span className="text-[9px] text-zinc-500 font-bold">/{totalLightsCount}</span>
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
                {/* Dynamically Rendered Active Registered Lamps */}
                {registeredLamps.length > 0 ? (
                  registeredLamps.map(lamp => {
                    const lampState = wizLampStates[lamp.id] || { isOn: false, online: true };
                    return (
                      <div key={lamp.id} className="bg-[#121214] border border-[#1F1F24] p-3 rounded-2xl flex flex-col justify-between h-24">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <div className={`p-1.5 rounded-xl ${lampState.isOn ? 'bg-orange-500/10 text-[#F97316]' : 'bg-zinc-900 text-zinc-600'}`}>
                              <Lightbulb size={16} />
                            </div>
                            <button
                              onClick={() => setEditingLamp(lamp)}
                              className="p-1 hover:bg-zinc-850 text-zinc-500 hover:text-[#F97316] rounded-lg transition-colors cursor-pointer"
                              title="Edit Nama/Sistem Lampu"
                            >
                              <Pencil size={10} className="stroke-[2.5]" />
                            </button>
                          </div>
                          {/* iOS style compact switch */}
                          <button 
                            onClick={() => handleToggleDynamicWiz(lamp.id, lamp.ip, lamp.port, lampState.isOn)}
                            className={`w-9 h-5 rounded-full p-0.5 transition-all duration-300 focus:outline-none cursor-pointer ${lampState.isOn ? 'bg-[#F97316]' : 'bg-zinc-850'}`}
                          >
                            <div className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-300 ${lampState.isOn ? 'translate-x-4' : 'translate-x-0'}`} />
                          </button>
                        </div>
                        <div className="truncate">
                          <p className="text-[11px] font-black text-white truncate leading-tight">{lamp.name}</p>
                          <p className="text-[9px] text-zinc-500 truncate leading-none mt-0.5">
                            {lamp.group || 'Tanpa Kelompok'} • {lamp.ip}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-2 bg-zinc-950/60 rounded-2xl border border-dashed border-zinc-900 p-4 flex flex-col items-center justify-center text-center h-24">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Belum Ada Lampu Terdaftar</p>
                    <button 
                      onClick={() => setActiveTab('settings')}
                      className="text-[9px] text-[#F97316] font-bold uppercase tracking-wide mt-1 hover:underline cursor-pointer"
                    >
                      + Tambah Lampu Sekarang
                    </button>
                  </div>
                )}

                {/* Smart TV Ruang Tamu */}
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
                  onClick={handleQuickToggleAllLamps}
                  className="flex flex-col items-center justify-center p-3 bg-orange-500/5 hover:bg-orange-500/10 active:scale-95 transition-all rounded-xl border border-[#1F1F24] hover:border-[#F97316]/30 text-[#F97316] font-bold text-xs gap-1.5 cursor-pointer"
                >
                  <Lightbulb size={18} className="stroke-[2.5]" />
                  {activeLightsCount > 0 ? 'Matikan WiZ Full' : 'Nyalakan WiZ Full'}
                </button>

                <button 
                  onClick={() => {
                    fetch('/api/tv/control', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ command: 'launch_app', value: 'com.google.android.youtube.tv' })
                    });
                    setNotificationMessage('Meluncurkan YouTube di Android TV...');
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
            <WizControl wizName={config.wizName} wizIp={config.wizIp} wizPort={config.wizPort} wizLamps={config.wizLamps} onEditLamp={setEditingLamp} />

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

      {/* Toast Notification */}
      <AnimatePresence>
        {notificationMessage && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.9 }}
            className="fixed bottom-24 left-4 right-4 z-50 max-w-xs mx-auto bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 text-white font-extrabold text-[10px] uppercase tracking-wider px-4 py-3 rounded-xl flex items-center justify-between shadow-2xl shadow-black/80"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-[#F97316]" />
              <span>{notificationMessage}</span>
            </div>
            <button onClick={() => setNotificationMessage(null)} className="text-zinc-500 hover:text-white cursor-pointer p-1">
              <X size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Edit Lamp Bottom Sheet */}
      <AnimatePresence>
        {editingLamp && (
          <>
            {/* Dimmed Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingLamp(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />

            {/* Sheet container */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto px-4 pb-4 sm:pb-6"
            >
              <div className="bg-[#121214] border border-zinc-800/85 rounded-t-3xl rounded-b-3xl sm:rounded-b-3xl shadow-2xl overflow-hidden p-6 space-y-4">
                {/* Pull bar / handle */}
                <div className="w-12 h-1 bg-zinc-800 rounded-full mx-auto" />

                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-orange-500/15 text-[#F97316] rounded-xl">
                      <Pencil size={16} />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-white uppercase tracking-wider">Ubah Pengaturan Lampu</h3>
                      <p className="text-[9px] text-zinc-500 font-mono mt-0.5">ID: {editingLamp.id}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setEditingLamp(null)}
                    className="p-1.5 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 rounded-lg cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Form */}
                <div className="space-y-3.5 pt-1">
                  <div>
                    <label className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1 block">Nama Lampu</label>
                    <input 
                      type="text"
                      defaultValue={editingLamp.name}
                      id="edit-lamp-name"
                      placeholder="Contoh: Lampu Ruang Tamu"
                      className="w-full bg-zinc-950 border border-zinc-900 px-3.5 py-2 text-xs rounded-xl font-bold focus:outline-none focus:ring-1 focus:ring-orange-500 text-white placeholder-zinc-700"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1 block">Kelompok / Grup</label>
                      <select 
                        defaultValue={editingLamp.group || 'Ruang Tamu'}
                        id="edit-lamp-group"
                        className="w-full bg-zinc-950 border border-zinc-900 px-3 py-2 text-xs rounded-xl font-bold focus:outline-none focus:ring-1 focus:ring-orange-500 text-white"
                      >
                        <option value="Ruang Tamu">Ruang Tamu</option>
                        <option value="Kamar Tidur">Kamar Tidur</option>
                        <option value="Teras Depan">Teras Depan</option>
                        <option value="Dapur">Dapur</option>
                        <option value="Taman">Taman</option>
                        <option value="Lainnya">Lainnya</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1 block">UDP Port</label>
                      <input 
                        type="text"
                        defaultValue={editingLamp.port || '38899'}
                        id="edit-lamp-port"
                        placeholder="38899"
                        className="w-full bg-zinc-950 border border-zinc-900 px-3 py-2 text-xs rounded-xl font-mono focus:outline-none focus:ring-1 focus:ring-orange-500 text-white placeholder-zinc-700 text-center"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider mb-1 block">IP Address</label>
                    <input 
                      type="text"
                      defaultValue={editingLamp.ip}
                      id="edit-lamp-ip"
                      placeholder="192.168.1.10"
                      className="w-full bg-zinc-950 border border-zinc-900 px-3.5 py-2 text-xs rounded-xl font-mono focus:outline-none focus:ring-1 focus:ring-orange-500 text-white placeholder-zinc-700"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-900">
                  <button
                    type="button"
                    onClick={() => setEditingLamp(null)}
                    className="py-2.5 bg-zinc-950 hover:bg-zinc-900 border border-zinc-900 rounded-xl text-[10px] font-black uppercase tracking-wider text-zinc-400 cursor-pointer text-center"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const nameVal = (document.getElementById('edit-lamp-name') as HTMLInputElement)?.value || '';
                      const groupVal = (document.getElementById('edit-lamp-group') as HTMLSelectElement)?.value || 'Lainnya';
                      const ipVal = (document.getElementById('edit-lamp-ip') as HTMLInputElement)?.value || '';
                      const portVal = (document.getElementById('edit-lamp-port') as HTMLInputElement)?.value || '38899';

                      if (!nameVal.trim() || !ipVal.trim()) {
                        setNotificationMessage('Nama dan IP Address wajib diisi!');
                        return;
                      }

                      handleUpdateSingleLamp({
                        id: editingLamp.id,
                        name: nameVal,
                        group: groupVal,
                        ip: ipVal,
                        port: portVal
                      });
                    }}
                    className="py-2.5 bg-[#F97316] hover:bg-[#EA580C] rounded-xl text-[10px] font-black uppercase tracking-wider text-white shadow-md shadow-orange-500/10 cursor-pointer text-center"
                  >
                    Simpan
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Android Native Style PWA Installation Bottom Sheet */}
      <AnimatePresence>
        {showInstallBanner && (
          <>
            {/* Dimmed Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInstallBanner(false)}
              className="fixed inset-0 bg-black/75 backdrop-blur-[3px] z-50"
            />

            {/* Sheet container */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: 'spring', damping: 24, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto px-4 pb-4 sm:pb-6"
            >
              <div className="bg-[#121214] border border-zinc-800/90 rounded-t-3xl rounded-b-3xl sm:rounded-b-3xl shadow-2xl p-6 space-y-5">
                {/* Pull bar / handle */}
                <div className="w-12 h-1 bg-zinc-800 rounded-full mx-auto" />

                {/* App Icon Circle / Squircle */}
                <div className="flex flex-col items-center text-center space-y-2">
                  <div className="w-16 h-16 bg-zinc-950 p-1.5 rounded-[22px] border border-zinc-800/80 shadow-inner flex items-center justify-center relative group">
                    <img 
                      src="/icon-192.png" 
                      alt="Adilanet Logo" 
                      className="w-full h-full object-cover rounded-[16px]"
                      referrerPolicy="no-referrer"
                    />
                    <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#F97316] text-white rounded-full flex items-center justify-center shadow-md border border-[#121214]">
                      <Sparkles size={10} className="animate-pulse" />
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white tracking-wide">Adilanet Smart Home</h3>
                    <p className="text-[10px] text-zinc-500 font-mono">dashboard.adilanet.local</p>
                  </div>
                </div>

                {/* Feature Highlights */}
                <div className="bg-zinc-950/80 border border-zinc-900 rounded-2xl p-4.5 space-y-2.5">
                  <p className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-widest block pl-1">Fitur Aplikasi Android</p>
                  
                  <div className="space-y-2 text-xs text-zinc-300">
                    <div className="flex items-start gap-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F97316] mt-1.5 shrink-0" />
                      <p className="text-[11px] leading-relaxed">
                        <strong className="text-white font-extrabold">Akses Sekali Sentuh:</strong> Luncurkan instan dari home screen HP atau tablet Anda.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F97316] mt-1.5 shrink-0" />
                      <p className="text-[11px] leading-relaxed">
                        <strong className="text-white font-extrabold">Tampilan Layar Penuh:</strong> Hilangkan bilah navigasi & bar alamat URL browser untuk performa imersif.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F97316] mt-1.5 shrink-0" />
                      <p className="text-[11px] leading-relaxed">
                        <strong className="text-white font-extrabold">Cepat & Ringan:</strong> Beroperasi lancar layaknya aplikasi bawaan (native) Android Anda.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Android Style Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowInstallBanner(false)}
                    className="flex-1 py-3 bg-zinc-950 hover:bg-zinc-900 border border-zinc-900 rounded-2xl text-xs font-black uppercase tracking-wider text-zinc-400 transition-colors cursor-pointer text-center"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleInstallPWA}
                    className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-[#F97316] hover:from-orange-600 hover:to-orange-500 rounded-2xl text-xs font-black uppercase tracking-wider text-white shadow-xl shadow-orange-500/10 transition-all cursor-pointer text-center"
                  >
                    Instal Aplikasi
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Persistent Elegant Bottom Navigation (Android Native style) */}
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}

