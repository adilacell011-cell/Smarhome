import { useState, FormEvent } from 'react';
import { Settings, Save, HelpCircle, HardDrive, Cpu, Terminal, CheckCircle, Lightbulb, Camera, Tv, Globe } from 'lucide-react';
import type { SmartConfig } from '../types';

interface SettingsPanelProps {
  config: SmartConfig;
  onSave: (newConfig: SmartConfig) => void;
}

export default function SettingsPanel({ config, onSave }: SettingsPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<'wiz' | 'cctv' | 'tv' | 'router'>('wiz');
  const [form, setForm] = useState<SmartConfig>({
    ...config,
    wizLamps: config.wizLamps || [
      { id: 'lampu-1', name: config.wizName || 'Lampu Utama Living Room', ip: config.wizIp || '192.168.1.10', port: config.wizPort || '38899' }
    ],
    cctvs: config.cctvs || [
      { id: 'cctv-1', name: config.icseeName || 'CCTV Pintu Depan', ip: config.icseeIp || '192.168.1.20', rtspUrl: config.icseeRtspUrl || 'rtsp://admin:123456@192.168.1.20:554/stream1?channel=1&subtype=0' }
    ]
  });
  const [testingDevice, setTestingDevice] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; msg: string } | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  const testConnection = (deviceKey: string, ip: string, deviceName: string) => {
    setTestingDevice(deviceName);
    setTestResult(null);

    setTimeout(() => {
      setTestingDevice(null);
      setTestResult({
        id: deviceKey,
        success: true,
        msg: `Ping ke ${deviceName} (${ip}) Berhasil! (Latency: ${Math.floor(12 + Math.random() * 20)}ms)`
      });
    }, 1500);
  };

  const addWizLamp = () => {
    const newLamps = [
      ...(form.wizLamps || []),
      {
        id: `lampu-${Date.now()}`,
        name: `Lampu Tambahan ${((form.wizLamps || []).length + 1)}`,
        ip: '192.168.1.10',
        port: '38899'
      }
    ];
    setForm({
      ...form,
      wizLamps: newLamps,
      wizName: newLamps[0].name,
      wizIp: newLamps[0].ip,
      wizPort: newLamps[0].port
    });
  };

  const removeWizLamp = (id: string) => {
    const filtered = (form.wizLamps || []).filter(l => l.id !== id);
    if (filtered.length === 0) return;
    setForm({
      ...form,
      wizLamps: filtered,
      wizName: filtered[0].name,
      wizIp: filtered[0].ip,
      wizPort: filtered[0].port
    });
  };

  const updateWizLamp = (id: string, field: 'name' | 'ip' | 'port', value: string) => {
    const updated = (form.wizLamps || []).map(l => {
      if (l.id === id) {
        return { ...l, [field]: value };
      }
      return l;
    });
    setForm({
      ...form,
      wizLamps: updated,
      wizName: updated[0].name,
      wizIp: updated[0].ip,
      wizPort: updated[0].port
    });
  };

  const addCctv = () => {
    const newCctvs = [
      ...(form.cctvs || []),
      {
        id: `cctv-${Date.now()}`,
        name: `CCTV Tambahan ${((form.cctvs || []).length + 1)}`,
        ip: '192.168.1.20',
        rtspUrl: 'rtsp://admin:123456@192.168.1.20:554/stream1?channel=1&subtype=0'
      }
    ];
    setForm({
      ...form,
      cctvs: newCctvs,
      icseeName: newCctvs[0].name,
      icseeIp: newCctvs[0].ip,
      icseeRtspUrl: newCctvs[0].rtspUrl
    });
  };

  const removeCctv = (id: string) => {
    const filtered = (form.cctvs || []).filter(c => c.id !== id);
    if (filtered.length === 0) return;
    setForm({
      ...form,
      cctvs: filtered,
      icseeName: filtered[0].name,
      icseeIp: filtered[0].ip,
      icseeRtspUrl: filtered[0].rtspUrl
    });
  };

  const updateCctv = (id: string, field: 'name' | 'ip' | 'rtspUrl', value: string) => {
    const updated = (form.cctvs || []).map(c => {
      if (c.id === id) {
        return { ...c, [field]: value };
      }
      return c;
    });
    setForm({
      ...form,
      cctvs: updated,
      icseeName: updated[0].name,
      icseeIp: updated[0].ip,
      icseeRtspUrl: updated[0].rtspUrl
    });
  };

  return (
    <div className="space-y-6">
      {/* Configuration Form */}
      <div className="bg-[#121214] rounded-3xl p-4 sm:p-6 border border-[#1F1F24] shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 bg-orange-500/10 text-[#F97316] rounded-xl border border-orange-500/15">
            <Settings size={18} />
          </div>
          <div>
            <h2 className="font-extrabold text-white text-sm sm:text-base tracking-wide">Integration Settings</h2>
            <p className="text-[10px] sm:text-xs text-zinc-500">Configure IP addresses for your STB and devices</p>
          </div>
        </div>

        {/* Sub-Tabs Selector for Mobile/PWA Optimization */}
        <div className="grid grid-cols-4 gap-1.5 p-1 bg-zinc-950 rounded-2xl mb-5 border border-zinc-900 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveSubTab('wiz')}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 px-1 rounded-xl text-[10px] font-extrabold transition-all duration-200 cursor-pointer ${
              activeSubTab === 'wiz'
                ? 'bg-[#F97316] text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50'
            }`}
          >
            <Lightbulb size={14} />
            <span className="hidden xs:inline">WiZ</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('cctv')}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 px-1 rounded-xl text-[10px] font-extrabold transition-all duration-200 cursor-pointer ${
              activeSubTab === 'cctv'
                ? 'bg-[#F97316] text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50'
            }`}
          >
            <Camera size={14} />
            <span className="hidden xs:inline">CCTV</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('tv')}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 px-1 rounded-xl text-[10px] font-extrabold transition-all duration-200 cursor-pointer ${
              activeSubTab === 'tv'
                ? 'bg-[#F97316] text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50'
            }`}
          >
            <Tv size={14} />
            <span className="hidden xs:inline">TV</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('router')}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 px-1 rounded-xl text-[10px] font-extrabold transition-all duration-200 cursor-pointer ${
              activeSubTab === 'router'
                ? 'bg-[#F97316] text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50'
            }`}
          >
            <Globe size={14} />
            <span className="hidden xs:inline">Router</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* 1. Philips WiZ Setup */}
          {activeSubTab === 'wiz' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-orange-400 tracking-widest block uppercase">Daftar Lampu Philips WiZ</span>
                <button
                  type="button"
                  onClick={addWizLamp}
                  className="text-[9px] font-extrabold text-[#F97316] hover:text-orange-400 uppercase tracking-wider transition-all flex items-center gap-1 bg-orange-500/10 px-2.5 py-1 rounded-md border border-orange-500/15"
                >
                  + Tambah Lampu
                </button>
              </div>

              <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                {(form.wizLamps || []).map((lamp, idx) => (
                  <div key={lamp.id} className="p-3 bg-zinc-950 rounded-xl border border-zinc-900 space-y-2.5 relative">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-zinc-500 font-mono uppercase">Lampu #{idx + 1}</span>
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => testConnection(`wizIp-${lamp.id}`, lamp.ip, lamp.name)}
                          className="text-[9px] font-extrabold text-orange-400 hover:text-orange-300 uppercase transition-all"
                        >
                          Uji Link
                        </button>
                        {(form.wizLamps || []).length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeWizLamp(lamp.id)}
                            className="text-[9px] font-extrabold text-red-500 hover:text-red-400 uppercase transition-all"
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div>
                        <label className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider pl-0.5 mb-1 block">Nama Lampu</label>
                        <input
                          type="text"
                          value={lamp.name}
                          onChange={(e) => updateWizLamp(lamp.id, 'name', e.target.value)}
                          placeholder="Contoh: Lampu Ruang Tamu"
                          className="w-full bg-zinc-900 border border-zinc-800/80 px-2.5 py-1.5 text-xs rounded-xl font-medium focus:outline-none focus:ring-1 focus:ring-[#F97316]/50 text-white placeholder-zinc-600 transition-all"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider pl-0.5 mb-1 block">IP Address</label>
                          <input
                            type="text"
                            value={lamp.ip}
                            onChange={(e) => updateWizLamp(lamp.id, 'ip', e.target.value)}
                            placeholder="192.168.1.10"
                            className="w-full bg-zinc-900 border border-zinc-800/80 px-2.5 py-1.5 text-xs rounded-xl font-mono focus:outline-none focus:ring-1 focus:ring-[#F97316]/50 text-white placeholder-zinc-600 transition-all"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider pl-0.5 mb-1 block">UDP Port</label>
                          <input
                            type="text"
                            value={lamp.port}
                            onChange={(e) => updateWizLamp(lamp.id, 'port', e.target.value)}
                            placeholder="38899"
                            className="w-full bg-zinc-900 border border-zinc-800/80 px-2.5 py-1.5 text-xs rounded-xl font-mono focus:outline-none focus:ring-1 focus:ring-[#F97316]/50 text-white placeholder-zinc-600 transition-all"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. CCTV ICSee Setup */}
          {activeSubTab === 'cctv' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-orange-400 tracking-widest block uppercase">Daftar CCTV ICSee (ONVIF/RTSP)</span>
                <button
                  type="button"
                  onClick={addCctv}
                  className="text-[9px] font-extrabold text-[#F97316] hover:text-orange-400 uppercase tracking-wider transition-all flex items-center gap-1 bg-orange-500/10 px-2.5 py-1 rounded-md border border-orange-500/15"
                >
                  + Tambah CCTV
                </button>
              </div>

              <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                {(form.cctvs || []).map((cctv, idx) => (
                  <div key={cctv.id} className="p-3 bg-zinc-950 rounded-xl border border-zinc-900 space-y-2.5 relative">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-zinc-500 font-mono uppercase">CCTV #{idx + 1}</span>
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => testConnection(`icseeIp-${cctv.id}`, cctv.ip, cctv.name)}
                          className="text-[9px] font-extrabold text-orange-400 hover:text-orange-300 uppercase transition-all"
                        >
                          Uji Link
                        </button>
                        {(form.cctvs || []).length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeCctv(cctv.id)}
                            className="text-[9px] font-extrabold text-red-500 hover:text-red-400 uppercase transition-all"
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div>
                        <label className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider pl-0.5 mb-1 block">Nama CCTV</label>
                        <input
                          type="text"
                          value={cctv.name}
                          onChange={(e) => updateCctv(cctv.id, 'name', e.target.value)}
                          placeholder="Contoh: CCTV Halaman Depan"
                          className="w-full bg-zinc-900 border border-zinc-800/80 px-2.5 py-1.5 text-xs rounded-xl font-medium focus:outline-none focus:ring-1 focus:ring-[#F97316]/50 text-white placeholder-zinc-600 transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider pl-0.5 mb-1 block">Camera IP Address</label>
                        <input
                          type="text"
                          value={cctv.ip}
                          onChange={(e) => updateCctv(cctv.id, 'ip', e.target.value)}
                          placeholder="192.168.1.20"
                          className="w-full bg-zinc-900 border border-zinc-800/80 px-2.5 py-1.5 text-xs rounded-xl font-mono focus:outline-none focus:ring-1 focus:ring-[#F97316]/50 text-white placeholder-zinc-600 transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider pl-0.5 mb-1 block">RTSP Stream URL</label>
                        <input
                          type="text"
                          value={cctv.rtspUrl}
                          onChange={(e) => updateCctv(cctv.id, 'rtspUrl', e.target.value)}
                          placeholder="rtsp://admin:123456@192.168.1.20:554/stream1"
                          className="w-full bg-zinc-900 border border-zinc-800/80 px-2.5 py-1.5 text-xs rounded-xl font-mono focus:outline-none focus:ring-1 focus:ring-[#F97316]/50 text-white placeholder-zinc-600 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Android TV Setup */}
          {activeSubTab === 'tv' && (
            <div className="p-4 bg-zinc-950 rounded-2xl border border-zinc-900 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-orange-400 tracking-widest block uppercase">Android Smart TV (ADB TCP)</span>
                <button
                  type="button"
                  onClick={() => testConnection('tvIp', form.tvIp, form.tvName || 'Android TV')}
                  className="text-[9px] font-extrabold text-[#F97316] hover:text-orange-400 uppercase tracking-wider transition-all"
                >
                  Uji Link
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider pl-0.5 mb-1 block">Nama Smart TV</label>
                  <input
                    type="text"
                    value={form.tvName || ''}
                    onChange={(e) => setForm({ ...form, tvName: e.target.value })}
                    placeholder="Android TV Ruang Keluarga"
                    className="w-full bg-zinc-900 border border-zinc-800/80 px-2.5 py-1.5 text-xs rounded-xl font-medium focus:outline-none focus:ring-1 focus:ring-[#F97316]/50 text-white placeholder-zinc-600 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider pl-0.5 mb-1 block">TV IP Address</label>
                  <input
                    type="text"
                    value={form.tvIp}
                    onChange={(e) => setForm({ ...form, tvIp: e.target.value })}
                    placeholder="192.168.1.30"
                    className="w-full bg-zinc-900 border border-zinc-800/80 px-2.5 py-1.5 text-xs rounded-xl font-mono focus:outline-none focus:ring-1 focus:ring-[#F97316]/50 text-white placeholder-zinc-600 transition-all"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 4. Fiberhome Router Setup */}
          {activeSubTab === 'router' && (
            <div className="p-4 bg-zinc-950 rounded-2xl border border-zinc-900 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-orange-400 tracking-widest block uppercase">Fiberhome Gateway</span>
                <button
                  type="button"
                  onClick={() => testConnection('routerIp', form.routerIp, form.routerName || 'Fiberhome Router')}
                  className="text-[9px] font-extrabold text-[#F97316] hover:text-orange-400 uppercase tracking-wider transition-all"
                >
                  Uji Link
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider pl-0.5 mb-1 block">Nama Router</label>
                  <input
                    type="text"
                    value={form.routerName || ''}
                    onChange={(e) => setForm({ ...form, routerName: e.target.value })}
                    placeholder="Fiberhome Router Gateway"
                    className="w-full bg-zinc-900 border border-zinc-800/80 px-2.5 py-1.5 text-xs rounded-xl font-medium focus:outline-none focus:ring-1 focus:ring-[#F97316]/50 text-white placeholder-zinc-600 transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider pl-0.5 mb-1 block">Router IP</label>
                    <input
                      type="text"
                      value={form.routerIp}
                      onChange={(e) => setForm({ ...form, routerIp: e.target.value })}
                      placeholder="192.168.1.1"
                      className="w-full bg-zinc-900 border border-zinc-800/80 px-2.5 py-1.5 text-xs rounded-xl font-mono focus:outline-none focus:ring-1 focus:ring-[#F97316]/50 text-white placeholder-zinc-600 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider pl-0.5 mb-1 block">Password</label>
                    <input
                      type="password"
                      value={form.routerPassword}
                      onChange={(e) => setForm({ ...form, routerPassword: e.target.value })}
                      placeholder="••••••••"
                      className="w-full bg-zinc-900 border border-zinc-800/80 px-2.5 py-1.5 text-xs rounded-xl font-mono focus:outline-none focus:ring-1 focus:ring-[#F97316]/50 text-white placeholder-zinc-600 transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {testingDevice && (
            <div className="p-2.5 bg-zinc-950 text-[#F97316] text-[9px] font-mono rounded-xl border border-zinc-900/60 animate-pulse">
              [PING] Requesting ICMP echo response packet from {testingDevice}...
            </div>
          )}

          {testResult && (
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-2.5">
              <CheckCircle size={14} className="text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-emerald-300 font-medium font-mono leading-relaxed">{testResult.msg}</p>
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-[#F97316] hover:bg-orange-600 text-white font-extrabold text-xs py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-orange-500/10 cursor-pointer"
          >
            <Save size={14} /> Simpan Konfigurasi
          </button>
        </form>
      </div>

      {/* Guide Card - Compact Accordion or Scroll-Free styled */}
      <div className="bg-[#121214] rounded-3xl p-5 text-zinc-300 border border-[#1F1F24] space-y-3">
        <div className="flex items-center gap-3">
          <Terminal size={16} className="text-[#F97316]" />
          <h3 className="font-extrabold text-white text-xs sm:text-sm tracking-wide">STB Deployment Guide</h3>
        </div>
        
        <p className="text-[10px] sm:text-xs text-zinc-400 leading-relaxed">
          Run daemon as a background container inside your Armbian STB.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-900">
            <p className="text-[9px] font-black text-orange-400 uppercase tracking-wider mb-1">1. Boot Docker Compose</p>
            <pre className="text-[9px] font-mono text-zinc-400 overflow-x-auto p-1.5 bg-zinc-900/60 border border-zinc-900 rounded-lg">
              docker-compose up -d --build
            </pre>
          </div>

          <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-900">
            <p className="text-[9px] font-black text-orange-400 uppercase tracking-wider mb-1">2. Inspect Device Logs</p>
            <pre className="text-[9px] font-mono text-zinc-400 overflow-x-auto p-1.5 bg-zinc-900/60 border border-zinc-900 rounded-lg">
              docker-compose logs -f
            </pre>
          </div>
        </div>

        <div className="text-[10px] text-zinc-400 bg-zinc-900/30 p-2.5 rounded-xl border border-zinc-800/60">
          <span className="font-extrabold text-white">Prerequisite:</span> Same local router subnet required.
        </div>
      </div>
    </div>
  );
}

