import { useState, useEffect } from 'react';
import { Wifi, RefreshCw, Smartphone, TrendingUp, Zap, HelpCircle, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { RouterState } from '../types';

interface RouterControlProps {
  routerName?: string;
  routerIp: string;
}

export default function RouterControl({ routerName, routerIp }: RouterControlProps) {
  const [status, setStatus] = useState<RouterState>({
    ssid: 'FiberHome-SmartHome-5G',
    connectedClients: 8,
    pingMs: 14,
    downloadSpeed: 94.5,
    uploadSpeed: 28.1,
  });
  const [loading, setLoading] = useState(false);
  const [testingSpeed, setTestingSpeed] = useState(false);
  const [systemLog, setSystemLog] = useState<string | null>(null);
  const [showRebootConfirm, setShowRebootConfirm] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/router/status');
      const data = await response.json();
      if (data.success) {
        setStatus({
          ssid: data.ssid,
          connectedClients: data.connectedClients,
          pingMs: data.pingMs,
          downloadSpeed: data.downloadSpeed,
          uploadSpeed: data.uploadSpeed,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const runSpeedtest = async () => {
    setTestingSpeed(true);
    setSystemLog("Menjalankan speed test (download & upload)...");
    try {
      const response = await fetch('/api/router/speedtest');
      const data = await response.json();
      if (data.success) {
        setStatus(prev => ({
          ...prev,
          downloadSpeed: data.download,
          uploadSpeed: data.upload,
          pingMs: data.ping
        }));
        setSystemLog("Speed test selesai!");
      } else {
        setSystemLog(`Speed test gagal: ${data.message || 'tidak diketahui'}`);
      }
    } catch (err) {
      console.error(err);
      setSystemLog("Speed test gagal terhubung ke server.");
    } finally {
      setTestingSpeed(false);
      setTimeout(() => setSystemLog(null), 3000);
    }
  };

  const handleReboot = async () => {
    setShowRebootConfirm(false);
    setSystemLog("Sending reboot sequence to Fiberhome Gateway...");
    try {
      const response = await fetch('/api/router/reboot', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        setSystemLog(data.message);
      }
    } catch (err) {
      console.error(err);
      setSystemLog("Failed to initiate gateway reboot.");
    }
    setTimeout(() => setSystemLog(null), 5000);
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  return (
    <div className="bg-[#121214] rounded-3xl p-6 border border-[#1F1F24] shadow-sm space-y-6 relative overflow-hidden">
      
      {/* Device Info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded-2xl border border-blue-500/15">
            <Wifi className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="font-extrabold text-white text-base tracking-wide">{routerName || 'Fiberhome Gateway'}</h2>
            <p className="text-xs text-zinc-500 font-mono">IP: {routerIp}</p>
          </div>
        </div>

        <button
          onClick={fetchStatus}
          disabled={loading}
          className="p-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-zinc-400 active:scale-95 transition-all"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin text-[#F97316]' : ''} />
        </button>
      </div>

      {/* Network Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-2xl flex items-center gap-3">
          <Smartphone className="text-blue-400" size={20} />
          <div>
            <span className="text-[9px] font-extrabold text-zinc-500 block uppercase tracking-wider">Clients Connected</span>
            <span className="text-xs font-black text-white font-mono">{status.connectedClients} Devices</span>
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-2xl flex items-center gap-3">
          <Zap className="text-[#F97316]" size={20} />
          <div>
            <span className="text-[9px] font-extrabold text-zinc-500 block uppercase tracking-wider">Ping Latency</span>
            <span className="text-xs font-black text-white font-mono">{status.pingMs} ms</span>
          </div>
        </div>
      </div>

      {/* Internet Speed Graph / Card */}
      <div className="bg-gradient-to-tr from-[#151518] to-zinc-950 p-5 rounded-2xl text-white relative overflow-hidden border border-zinc-800/60 shadow-sm">
        <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-4 translate-y-4 text-[#F97316]">
          <TrendingUp size={120} />
        </div>
        
        <div className="flex items-center justify-between mb-3.5">
          <div>
            <span className="text-[9px] font-extrabold text-[#F97316] uppercase block tracking-widest">Active Gateway SSID</span>
            <h3 className="text-xs font-bold text-white mt-0.5">{status.ssid}</h3>
          </div>
          <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-extrabold rounded-md uppercase tracking-wider flex items-center gap-1">
            <ShieldCheck size={10} /> Secure
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-1">
          <div>
            <span className="text-[9px] text-zinc-500 uppercase font-extrabold tracking-wider">Download Speed</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-2xl font-black font-mono tracking-tight text-white">{status.downloadSpeed}</span>
              <span className="text-[9px] font-bold text-[#F97316] uppercase">Mbps</span>
            </div>
          </div>

          <div>
            <span className="text-[9px] text-zinc-500 uppercase font-extrabold tracking-wider">Upload Speed</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-2xl font-black font-mono tracking-tight text-white">{status.uploadSpeed}</span>
              <span className="text-[9px] font-bold text-[#F97316] uppercase">Mbps</span>
            </div>
          </div>
        </div>
      </div>

      {/* Speed Test & Reboot Controls */}
      <div className="grid grid-cols-2 gap-3.5">
        <button
          onClick={runSpeedtest}
          disabled={testingSpeed}
          className="bg-[#F97316] hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-extrabold text-xs py-3 rounded-2xl transition-all shadow-md shadow-orange-500/10 active:scale-95 cursor-pointer"
        >
          {testingSpeed ? 'Running Test...' : 'Speed Test'}
        </button>
        <button
          onClick={() => setShowRebootConfirm(true)}
          className="bg-zinc-900 hover:bg-rose-500/10 hover:text-rose-400 text-zinc-300 border border-zinc-800 font-extrabold text-xs py-3 rounded-2xl transition-all active:scale-95 cursor-pointer"
        >
          Reboot Router
        </button>
      </div>

      {/* Inline Reboot Confirmation Modal to bypass iFrame prompt blockers */}
      {showRebootConfirm && (
        <div className="absolute inset-0 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-50 animate-fade-in">
          <AlertTriangle size={36} className="text-[#F97316] mb-3 animate-bounce" />
          <h3 className="text-sm font-black text-white uppercase tracking-wider">Confirm Gateway Reboot</h3>
          <p className="text-[11px] text-zinc-400 max-w-xs mt-2 leading-relaxed">
            Rebooting the Fiberhome Router will disconnect all smart home connections for 2-3 minutes. Proceed?
          </p>
          <div className="flex items-center gap-3 mt-5 w-full max-w-xs">
            <button 
              onClick={handleReboot}
              className="flex-1 bg-[#F97316] hover:bg-orange-600 text-white font-extrabold text-[11px] py-2.5 rounded-xl uppercase transition-all"
            >
              Reboot
            </button>
            <button 
              onClick={() => setShowRebootConfirm(false)}
              className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 font-extrabold text-[11px] py-2.5 rounded-xl uppercase transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {systemLog && (
        <div className="p-3 bg-zinc-950 border border-zinc-900 rounded-2xl text-left text-[10px] font-mono text-emerald-400">
          <span className="text-zinc-600 mr-1.5">$</span>{systemLog}
        </div>
      )}
    </div>
  );
}

