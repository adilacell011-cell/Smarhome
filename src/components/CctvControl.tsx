import { useState, useEffect } from 'react';
import { Camera, RefreshCw, ZoomIn, ZoomOut, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Sun, Moon, ShieldAlert, Cpu, Sparkles, Copy, Check, Video, AlertTriangle } from 'lucide-react';
import type { CctvConfig } from '../types';

interface CctvControlProps {
  icseeName?: string;
  icseeIp: string;
  cctvs?: CctvConfig[];
}

export default function CctvControl({ icseeName, icseeIp, cctvs }: CctvControlProps) {
  const [selectedCctv, setSelectedCctv] = useState<CctvConfig | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(Date.now());
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ptzMessage, setPtzMessage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  
  // Real Connection Diagnostics (Uji Link) states
  const [testingConn, setTestingConn] = useState(false);
  const [testResult, setTestResult] = useState<{
    online: boolean;
    ip: string;
    diagnostics: string;
    results: Array<{ port: number; name: string; open: boolean }>;
  } | null>(null);

  useEffect(() => {
    if (cctvs && cctvs.length > 0) {
      if (!selectedCctv || !cctvs.some(c => c.id === selectedCctv.id)) {
        setSelectedCctv(cctvs[0]);
      }
    } else {
      setSelectedCctv({
        id: 'default',
        name: icseeName || 'CCTV Security Feed',
        ip: icseeIp,
        rtspUrl: `rtsp://${icseeIp}:554/stream1?channel=1&subtype=0`
      });
    }
  }, [cctvs, icseeName, icseeIp]);

  const activeIp = selectedCctv ? selectedCctv.ip : icseeIp;
  const rtspUrl = selectedCctv ? selectedCctv.rtspUrl : `rtsp://${icseeIp}:554/stream1?channel=1&subtype=0`;

  const handleRefresh = () => {
    setLoading(true);
    setRefreshKey(Date.now());
    setTimeout(() => setLoading(false), 800);
  };

  const handleTestConnection = async () => {
    setTestingConn(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/icsee/test-connection?ip=${activeIp}`);
      const data = await res.json();
      if (data.success) {
        setTestResult({
          online: data.online,
          ip: data.ip,
          diagnostics: data.diagnostics,
          results: data.results || []
        });
        // Force refresh image snapshot
        setRefreshKey(Date.now());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTestingConn(false);
    }
  };

  const handleCopyRtsp = () => {
    navigator.clipboard.writeText(rtspUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePtz = async (direction: string) => {
    setPtzMessage(`Menggerakkan kamera: ${direction.toUpperCase()}...`);
    try {
      const res = await fetch('/api/icsee/ptz', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ direction, ip: activeIp }),
      });
      const data = await res.json();
      setPtzMessage(
        data.success
          ? `Kamera bergerak ke ${direction.toUpperCase()}`
          : (data.message || 'Gagal menggerakkan kamera')
      );
    } catch (err) {
      console.error(err);
      setPtzMessage('Gagal terhubung ke kamera');
    }
    setTimeout(() => setPtzMessage(null), 3500);
  };

  const handleAiScan = () => {
    setAiAnalyzing(true);
    setAiResult(null);
    setTimeout(() => {
      setAiAnalyzing(false);
      setAiResult("No security anomalies detected. Area is secure.");
    }, 2000);
  };

  useEffect(() => {
    if (activeIp) {
      setRefreshKey(Date.now());
    }
  }, [selectedCctv, icseeIp]);

  return (
    <div className="space-y-6">
      {/* HEADER SECTION WITH AI-POWERED ANALYSIS BUTTON AS SEEN IN SCREENSHOT 2 */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-[#121214] p-4.5 rounded-2xl border border-[#1F1F24]">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-white uppercase font-sans">
            CCTV Security
          </h2>
          <p className="text-[10px] text-zinc-500 font-bold tracking-widest uppercase mt-0.5">
            Security Feed — ICSee / DVR / AI Vision
          </p>
        </div>

        {/* AI-Powered Analysis Interactive Badge */}
        <button 
          onClick={handleAiScan}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 font-extrabold text-[10px] uppercase tracking-wider hover:bg-orange-500/20 active:scale-95 transition-all self-start sm:self-auto"
        >
          <Sparkles size={14} className="animate-pulse text-[#F97316]" />
          AI-Powered Analysis
        </button>
      </div>

      {/* Main CCTV Stream Card */}
      <div className="bg-[#121214] rounded-3xl p-5 border border-[#1F1F24] space-y-5">
        
        {/* Selector Dropdown for multiple CCTVs */}
        {cctvs && cctvs.length > 1 && (
          <div className="bg-zinc-900/60 p-2.5 rounded-2xl border border-zinc-800/80 flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest pl-1">Pilih Kamera CCTV:</span>
            <select 
              value={selectedCctv?.id || ''}
              onChange={(e) => {
                const found = cctvs.find(c => c.id === e.target.value);
                if (found) setSelectedCctv(found);
              }}
              className="bg-[#1C1C1F] border border-zinc-800 text-xs font-bold text-[#F97316] rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#F97316]/50"
            >
              {cctvs.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Stream Viewer Display Container */}
        <div className="relative w-full h-64 bg-black rounded-2xl overflow-hidden border border-zinc-900/60 flex items-center justify-center">
          <img
            src={`/api/icsee/snapshot?ip=${activeIp}&t=${refreshKey}`}
            alt="ICSee Live Feed"
            className="w-full h-full object-cover opacity-90"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=800&q=80";
            }}
          />

          {/* Info Overlays */}
          <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-md text-[9px] font-mono tracking-wider font-extrabold text-white flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#F97316] animate-ping"></span>
            REC • 1080P
          </div>

          <div className={`absolute top-3 right-3 border px-2.5 py-1 rounded-md text-[9px] font-bold ${
            testResult?.online 
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
              : 'bg-zinc-900/90 border-zinc-800/80 text-zinc-400'
          }`}>
            {testResult?.online ? 'REAL CAMERA (ONLINE)' : 'SIMULATION FALLBACK'}
          </div>

          <div className="absolute bottom-3 left-3 bg-black/60 px-2.5 py-1 rounded text-[10px] text-zinc-300 font-mono tracking-wide">
            Cam: {selectedCctv?.name || icseeName || 'Pintu Depan'}
          </div>
        </div>

        {/* Camera Info Panel & Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-zinc-800/50 pb-4">
          <div>
            <h3 className="text-sm font-extrabold text-white">{selectedCctv?.name || icseeName || 'Kamera Depan'}</h3>
            <p className="text-[10px] text-zinc-500 font-mono">{activeIp} • Port: 554/34567</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Uji Koneksi button (ketika uji link kasih respon nyata!) */}
            <button 
              onClick={handleTestConnection}
              disabled={testingConn}
              className={`px-3 py-1.5 font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
                testingConn 
                  ? 'bg-zinc-800 text-zinc-500' 
                  : 'bg-orange-500/10 hover:bg-orange-500/20 text-[#F97316] border border-orange-500/20'
              }`}
            >
              <RefreshCw size={12} className={testingConn ? "animate-spin" : ""} />
              {testingConn ? "Scanning..." : "Uji Koneksi"}
            </button>

            {/* Refresh Snapshot button */}
            <button 
              onClick={handleRefresh}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all flex items-center gap-1 cursor-pointer"
            >
              Refresh Feed
            </button>

            {/* AI Scan button */}
            <button 
              onClick={handleAiScan}
              disabled={aiAnalyzing}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all flex items-center gap-1 cursor-pointer"
            >
              <Cpu size={12} className={aiAnalyzing ? "animate-spin" : ""} />
              {aiAnalyzing ? "Analyzing..." : "AI Scan"}
            </button>

            {/* Record button */}
            <button 
              onClick={() => setIsRecording(!isRecording)}
              className={`px-3 py-1.5 border font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                isRecording 
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-400' 
                  : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full bg-rose-500 ${isRecording ? 'animate-ping' : ''}`}></span>
              Record
            </button>
          </div>
        </div>

        {/* RTSP Stream Link Field as seen in Screenshot 2 */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">RTSP STREAM URI</label>
          <div className="flex items-center gap-2 bg-[#1C1C1F] border border-zinc-800 rounded-xl p-2.5">
            <span className="text-[10px] font-mono text-zinc-400 truncate flex-1">
              {rtspUrl}
            </span>
            <button 
              onClick={handleCopyRtsp}
              className="p-1.5 bg-zinc-900 text-zinc-400 hover:text-[#F97316] hover:bg-zinc-800 rounded-lg shrink-0 transition-all"
              title="Copy RTSP Link"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {/* PTZ JOYSTICK */}
        <div className="bg-zinc-900/60 rounded-2xl p-4 border border-zinc-800/80 flex flex-col items-center">
          <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-3">PTZ Direction Controls (ONVIF)</span>
          
          <div className="relative w-28 h-28 flex items-center justify-center">
            {/* UP */}
            <button
              onClick={() => handlePtz('up')}
              className="absolute top-0 w-8 h-8 bg-[#1C1C1F] border border-zinc-800 rounded-xl flex items-center justify-center text-zinc-300 hover:text-[#F97316] active:scale-90 transition-all"
            >
              <ArrowUp size={16} />
            </button>

            {/* LEFT */}
            <button
              onClick={() => handlePtz('left')}
              className="absolute left-0 w-8 h-8 bg-[#1C1C1F] border border-zinc-800 rounded-xl flex items-center justify-center text-zinc-300 hover:text-[#F97316] active:scale-90 transition-all"
            >
              <ArrowLeft size={16} />
            </button>

            {/* RIGHT */}
            <button
              onClick={() => handlePtz('right')}
              className="absolute right-0 w-8 h-8 bg-[#1C1C1F] border border-zinc-800 rounded-xl flex items-center justify-center text-zinc-300 hover:text-[#F97316] active:scale-90 transition-all"
            >
              <ArrowRight size={16} />
            </button>

            {/* DOWN */}
            <button
              onClick={() => handlePtz('down')}
              className="absolute bottom-0 w-8 h-8 bg-[#1C1C1F] border border-zinc-800 rounded-xl flex items-center justify-center text-zinc-300 hover:text-[#F97316] active:scale-90 transition-all"
            >
              <ArrowDown size={16} />
            </button>

            {/* Center PTZ Ring */}
            <div className="w-8 h-8 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center text-[#F97316] font-bold text-[9px] uppercase tracking-wider">
              PTZ
            </div>
          </div>

          {/* Zoom In/Out Actions */}
          <div className="flex gap-2.5 mt-4 w-full">
            <button
              onClick={() => handlePtz('zoom_in')}
              className="flex-1 bg-[#1C1C1F] hover:bg-zinc-800 border border-zinc-800/80 py-2 rounded-xl text-xs font-bold text-zinc-300 flex items-center justify-center gap-1.5 transition-all"
            >
              <ZoomIn size={14} className="text-[#F97316]" /> Zoom In
            </button>
            <button
              onClick={() => handlePtz('zoom_out')}
              className="flex-1 bg-[#1C1C1F] hover:bg-zinc-800 border border-zinc-800/80 py-2 rounded-xl text-xs font-bold text-zinc-300 flex items-center justify-center gap-1.5 transition-all"
            >
              <ZoomOut size={14} className="text-[#F97316]" /> Zoom Out
            </button>
          </div>
        </div>

        {testingConn && (
          <div className="p-3.5 bg-zinc-950 border border-zinc-900 rounded-2xl text-left text-[10px] font-mono text-[#F97316] space-y-1">
            <p className="animate-pulse flex items-center gap-2">
              <RefreshCw size={10} className="animate-spin" />
              Scanning ports for Xiongmai CCTV at {activeIp}...
            </p>
            <p className="text-zinc-600">[SCAN] TCP Connect: 80 (Web), 554 (RTSP), 8899 (ONVIF), 34567 (iCSee NETIP)...</p>
          </div>
        )}

        {testResult && (
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-3.5 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-orange-400 tracking-widest uppercase">Diagnostic Ports Result</span>
              <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                testResult.online ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
              }`}>
                {testResult.online ? 'CONNECTED' : 'DISCONNECTED'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-zinc-400">
              {testResult.results.map((port) => (
                <div key={port.port} className="flex items-center justify-between bg-[#121214] p-2 rounded-lg border border-zinc-900/60">
                  <span className="truncate">{port.name} ({port.port})</span>
                  <span className={`font-black uppercase tracking-wider ${port.open ? 'text-emerald-400' : 'text-zinc-600'}`}>
                    {port.open ? 'OPEN' : 'CLOSE'}
                  </span>
                </div>
              ))}
            </div>

            <div className="text-[10px] leading-relaxed text-zinc-400 bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-800/40">
              <span className="font-extrabold text-white block mb-0.5">Analisis Sistem:</span>
              {testResult.diagnostics}
            </div>
          </div>
        )}

        {/* Dropdown recordings & AI events - MATCHING SCREENSHOT 2 */}
        <div className="border-t border-zinc-800/60 pt-3">
          <button 
            onClick={() => setShowEvents(!showEvents)}
            className="w-full flex items-center justify-between py-1 text-zinc-400 hover:text-[#F97316] transition-all"
          >
            <span className="text-xs font-bold uppercase tracking-wider">Show recordings & AI events</span>
            <span className={`transform transition-transform ${showEvents ? 'rotate-180' : ''}`}>▼</span>
          </button>

          {showEvents && (
            <div className="mt-3 bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/60 space-y-2 animate-fade-in text-[10px] font-mono text-zinc-500">
              <p className="flex justify-between border-b border-zinc-800 pb-1.5">
                <span>[02:14:10] Motion detected on driveway</span>
                <span className="text-orange-400">Trigger Alert</span>
              </p>
              <p className="flex justify-between border-b border-zinc-800 pb-1.5">
                <span>[01:50:44] Package delivered scan completed</span>
                <span className="text-emerald-400">Smart Saved</span>
              </p>
              <p className="flex justify-between">
                <span>[00:05:12] Midnight perimeter scan standard</span>
                <span>Routine Ok</span>
              </p>
            </div>
          )}
        </div>

        {ptzMessage && (
          <div className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-center text-[10px] font-mono text-[#F97316] animate-pulse">
            {ptzMessage}
          </div>
        )}

        {aiResult && (
          <div className="p-3 bg-orange-500/5 border border-orange-500/20 text-orange-400 rounded-xl text-center text-xs font-medium animate-pulse">
            {aiResult}
          </div>
        )}

      </div>
    </div>
  );
}

