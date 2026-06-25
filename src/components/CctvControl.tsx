import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ZoomIn, ZoomOut, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Cpu, Copy, Check, Video, Trash2, Play, X, ScanEye } from 'lucide-react';
import type { CctvConfig, NvrRecording, NvrDetection } from '../types';

interface CctvControlProps {
  icseeName?: string;
  icseeIp: string;
  cctvs?: CctvConfig[];
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function fmtDur(sec: number) {
  const s = Math.round(sec || 0);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}d` : `${s}d`;
}
function fmtSize(bytes: number) {
  if (!bytes) return '0 MB';
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

const LABEL_ID: Record<string, string> = {
  person: 'Orang', car: 'Mobil', motorcycle: 'Motor', bicycle: 'Sepeda',
  bus: 'Bus', truck: 'Truk', cat: 'Kucing', dog: 'Anjing',
};

export default function CctvControl({ icseeName, icseeIp, cctvs }: CctvControlProps) {
  const [selectedCctv, setSelectedCctv] = useState<CctvConfig | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(Date.now());
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ptzMessage, setPtzMessage] = useState<string | null>(null);

  // NVR state
  const [recording, setRecording] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [nvrBusy, setNvrBusy] = useState(false);
  const [nvrMessage, setNvrMessage] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<NvrRecording[]>([]);
  const [detections, setDetections] = useState<NvrDetection[]>([]);
  const [playingId, setPlayingId] = useState<number | null>(null);

  const [testingConn, setTestingConn] = useState(false);
  const [testResult, setTestResult] = useState<{
    online: boolean; ip: string; diagnostics: string;
    results: Array<{ port: number; name: string; open: boolean }>;
  } | null>(null);

  useEffect(() => {
    if (cctvs && cctvs.length > 0) {
      if (!selectedCctv || !cctvs.some(c => c.id === selectedCctv.id)) {
        setSelectedCctv(cctvs[0]);
      }
    } else {
      setSelectedCctv({
        id: 'icsee',
        name: icseeName || 'CCTV Security Feed',
        ip: icseeIp,
        rtspUrl: `rtsp://${icseeIp}:554/stream1?channel=1&subtype=0`,
      });
    }
  }, [cctvs, icseeName, icseeIp]);

  const activeIp = selectedCctv ? selectedCctv.ip : icseeIp;
  const cameraId = selectedCctv?.id || 'default';
  const rtspUrl = selectedCctv ? selectedCctv.rtspUrl : `rtsp://${icseeIp}:554/stream1?channel=1&subtype=0`;

  const refreshNvr = useCallback(async () => {
    try {
      const [statusRes, recRes, detRes] = await Promise.all([
        fetch('/api/nvr/status'),
        fetch(`/api/nvr/recordings?cameraId=${encodeURIComponent(cameraId)}`),
        fetch(`/api/nvr/detections?cameraId=${encodeURIComponent(cameraId)}`),
      ]);
      const status = await statusRes.json();
      const rec = await recRes.json();
      const det = await detRes.json();
      if (status.success) {
        setRecording(!!status.recording?.[cameraId]);
        setDetecting(!!status.detecting?.[cameraId]);
      }
      if (rec.success) setRecordings(rec.recordings || []);
      if (det.success) setDetections(det.detections || []);
    } catch (err) {
      console.error(err);
    }
  }, [cameraId]);

  useEffect(() => {
    setPlayingId(null);
    refreshNvr();
    const interval = setInterval(refreshNvr, 5000);
    return () => clearInterval(interval);
  }, [refreshNvr]);

  useEffect(() => {
    if (activeIp) setRefreshKey(Date.now());
  }, [selectedCctv, icseeIp]);

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
        setTestResult({ online: data.online, ip: data.ip, diagnostics: data.diagnostics, results: data.results || [] });
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
      setPtzMessage(data.success ? `Kamera bergerak ke ${direction.toUpperCase()}` : (data.message || 'Gagal menggerakkan kamera'));
    } catch (err) {
      console.error(err);
      setPtzMessage('Gagal terhubung ke kamera');
    }
    setTimeout(() => setPtzMessage(null), 3500);
  };

  const callNvr = async (path: string) => {
    setNvrBusy(true);
    setNvrMessage(null);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cameraId }),
      });
      const data = await res.json();
      setNvrMessage(data.message || (data.success ? 'Berhasil' : 'Gagal'));
      await refreshNvr();
    } catch (err) {
      console.error(err);
      setNvrMessage('Gagal terhubung ke server NVR');
    } finally {
      setNvrBusy(false);
      setTimeout(() => setNvrMessage(null), 6000);
    }
  };

  const toggleRecord = () => callNvr(recording ? '/api/nvr/record/stop' : '/api/nvr/record/start');
  const toggleDetect = () => callNvr(detecting ? '/api/nvr/detect/stop' : '/api/nvr/detect/start');

  const deleteRecording = async (id: number) => {
    try {
      await fetch(`/api/nvr/recordings/${id}`, { method: 'DELETE' });
      if (playingId === id) setPlayingId(null);
      await refreshNvr();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-[#121214] p-4.5 rounded-2xl border border-[#1F1F24]">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-white uppercase font-sans">CCTV Security</h2>
          <p className="text-[10px] text-zinc-500 font-bold tracking-widest uppercase mt-0.5">
            NVR Lokal — Rekaman & AI Deteksi (COCO-SSD)
          </p>
        </div>

        <button
          onClick={toggleDetect}
          disabled={nvrBusy}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl font-extrabold text-[10px] uppercase tracking-wider active:scale-95 transition-all self-start sm:self-auto border ${
            detecting
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              : 'bg-orange-500/10 border-orange-500/20 text-orange-400 hover:bg-orange-500/20'
          } ${nvrBusy ? 'opacity-60' : ''}`}
        >
          <ScanEye size={14} className={detecting ? 'animate-pulse' : ''} />
          {detecting ? 'AI Deteksi: AKTIF' : 'Aktifkan AI Deteksi'}
        </button>
      </div>

      {/* Main CCTV Stream Card */}
      <div className="bg-[#121214] rounded-3xl p-5 border border-[#1F1F24] space-y-5">

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
              {cctvs.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </div>
        )}

        {/* Stream / Playback Viewer */}
        <div className="relative w-full h-64 bg-black rounded-2xl overflow-hidden border border-zinc-900/60 flex items-center justify-center">
          {playingId !== null ? (
            <>
              <video
                key={playingId}
                src={`/api/nvr/recordings/${playingId}/video`}
                controls
                autoPlay
                className="w-full h-full object-contain bg-black"
              />
              <button
                onClick={() => setPlayingId(null)}
                className="absolute top-2 right-2 bg-black/70 hover:bg-black text-white p-1.5 rounded-lg z-10"
                title="Tutup pemutar"
              >
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <img
                src={`/api/icsee/snapshot?ip=${activeIp}&t=${refreshKey}`}
                alt="ICSee Live Feed"
                className="w-full h-full object-cover opacity-90"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=800&q=80';
                }}
              />
              {recording && (
                <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-md text-[9px] font-mono tracking-wider font-extrabold text-rose-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                  REC
                </div>
              )}
              {detecting && (
                <div className="absolute bottom-3 right-3 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-md text-[9px] font-extrabold text-emerald-400 flex items-center gap-1.5">
                  <ScanEye size={10} /> AI ON
                </div>
              )}
              <div className={`absolute top-3 right-3 border px-2.5 py-1 rounded-md text-[9px] font-bold ${
                testResult?.online ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-zinc-900/90 border-zinc-800/80 text-zinc-400'
              }`}>
                {testResult?.online ? 'REAL CAMERA (ONLINE)' : 'SNAPSHOT'}
              </div>
              <div className="absolute bottom-3 left-3 bg-black/60 px-2.5 py-1 rounded text-[10px] text-zinc-300 font-mono tracking-wide">
                Cam: {selectedCctv?.name || icseeName || 'Pintu Depan'}
              </div>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-zinc-800/50 pb-4">
          <div>
            <h3 className="text-sm font-extrabold text-white">{selectedCctv?.name || icseeName || 'Kamera Depan'}</h3>
            <p className="text-[10px] text-zinc-500 font-mono">{activeIp} • Port: 554/34567</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleTestConnection}
              disabled={testingConn}
              className={`px-3 py-1.5 font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
                testingConn ? 'bg-zinc-800 text-zinc-500' : 'bg-orange-500/10 hover:bg-orange-500/20 text-[#F97316] border border-orange-500/20'
              }`}
            >
              <RefreshCw size={12} className={testingConn ? 'animate-spin' : ''} />
              {testingConn ? 'Scanning...' : 'Uji Koneksi'}
            </button>

            <button
              onClick={handleRefresh}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh Feed
            </button>

            <button
              onClick={toggleDetect}
              disabled={nvrBusy}
              className={`px-3 py-1.5 border font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
                detecting ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
              } ${nvrBusy ? 'opacity-60' : ''}`}
            >
              <Cpu size={12} className={nvrBusy ? 'animate-spin' : ''} />
              {detecting ? 'AI Stop' : 'AI Scan'}
            </button>

            <button
              onClick={toggleRecord}
              disabled={nvrBusy}
              className={`px-3 py-1.5 border font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                recording ? 'bg-rose-500/15 border-rose-500/40 text-rose-400' : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
              } ${nvrBusy ? 'opacity-60' : ''}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full bg-rose-500 ${recording ? 'animate-ping' : ''}`}></span>
              {recording ? 'Stop Rekam' : 'Rekam'}
            </button>
          </div>
        </div>

        {nvrMessage && (
          <div className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-center text-[10px] font-mono text-[#F97316]">
            {nvrMessage}
          </div>
        )}

        {/* RTSP Stream Link */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">RTSP STREAM URI</label>
          <div className="flex items-center gap-2 bg-[#1C1C1F] border border-zinc-800 rounded-xl p-2.5">
            <span className="text-[10px] font-mono text-zinc-400 truncate flex-1">{rtspUrl}</span>
            <button onClick={handleCopyRtsp} className="p-1.5 bg-zinc-900 text-zinc-400 hover:text-[#F97316] hover:bg-zinc-800 rounded-lg shrink-0 transition-all" title="Copy RTSP Link">
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {/* PTZ JOYSTICK */}
        <div className="bg-zinc-900/60 rounded-2xl p-4 border border-zinc-800/80 flex flex-col items-center">
          <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-3">PTZ Direction Controls (ONVIF)</span>
          <div className="relative w-28 h-28 flex items-center justify-center">
            <button onClick={() => handlePtz('up')} className="absolute top-0 w-8 h-8 bg-[#1C1C1F] border border-zinc-800 rounded-xl flex items-center justify-center text-zinc-300 hover:text-[#F97316] active:scale-90 transition-all"><ArrowUp size={16} /></button>
            <button onClick={() => handlePtz('left')} className="absolute left-0 w-8 h-8 bg-[#1C1C1F] border border-zinc-800 rounded-xl flex items-center justify-center text-zinc-300 hover:text-[#F97316] active:scale-90 transition-all"><ArrowLeft size={16} /></button>
            <button onClick={() => handlePtz('right')} className="absolute right-0 w-8 h-8 bg-[#1C1C1F] border border-zinc-800 rounded-xl flex items-center justify-center text-zinc-300 hover:text-[#F97316] active:scale-90 transition-all"><ArrowRight size={16} /></button>
            <button onClick={() => handlePtz('down')} className="absolute bottom-0 w-8 h-8 bg-[#1C1C1F] border border-zinc-800 rounded-xl flex items-center justify-center text-zinc-300 hover:text-[#F97316] active:scale-90 transition-all"><ArrowDown size={16} /></button>
            <div className="w-8 h-8 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center text-[#F97316] font-bold text-[9px] uppercase tracking-wider">PTZ</div>
          </div>
          <div className="flex gap-2.5 mt-4 w-full">
            <button onClick={() => handlePtz('zoom_in')} className="flex-1 bg-[#1C1C1F] hover:bg-zinc-800 border border-zinc-800/80 py-2 rounded-xl text-xs font-bold text-zinc-300 flex items-center justify-center gap-1.5 transition-all"><ZoomIn size={14} className="text-[#F97316]" /> Zoom In</button>
            <button onClick={() => handlePtz('zoom_out')} className="flex-1 bg-[#1C1C1F] hover:bg-zinc-800 border border-zinc-800/80 py-2 rounded-xl text-xs font-bold text-zinc-300 flex items-center justify-center gap-1.5 transition-all"><ZoomOut size={14} className="text-[#F97316]" /> Zoom Out</button>
          </div>
        </div>

        {testingConn && (
          <div className="p-3.5 bg-zinc-950 border border-zinc-900 rounded-2xl text-left text-[10px] font-mono text-[#F97316] space-y-1">
            <p className="animate-pulse flex items-center gap-2"><RefreshCw size={10} className="animate-spin" /> Scanning ports for Xiongmai CCTV at {activeIp}...</p>
            <p className="text-zinc-600">[SCAN] TCP Connect: 80 (Web), 554 (RTSP), 8899 (ONVIF), 34567 (iCSee NETIP)...</p>
          </div>
        )}

        {testResult && (
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-3.5 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-orange-400 tracking-widest uppercase">Diagnostic Ports Result</span>
              <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${testResult.online ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                {testResult.online ? 'CONNECTED' : 'DISCONNECTED'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-zinc-400">
              {testResult.results.map((port) => (
                <div key={port.port} className="flex items-center justify-between bg-[#121214] p-2 rounded-lg border border-zinc-900/60">
                  <span className="truncate">{port.name} ({port.port})</span>
                  <span className={`font-black uppercase tracking-wider ${port.open ? 'text-emerald-400' : 'text-zinc-600'}`}>{port.open ? 'OPEN' : 'CLOSE'}</span>
                </div>
              ))}
            </div>
            <div className="text-[10px] leading-relaxed text-zinc-400 bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-800/40">
              <span className="font-extrabold text-white block mb-0.5">Analisis Sistem:</span>
              {testResult.diagnostics}
            </div>
          </div>
        )}

        {/* AI Detection Events */}
        <div className="border-t border-zinc-800/60 pt-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5"><ScanEye size={13} className="text-emerald-400" /> Event AI Deteksi</span>
            <span className="text-[9px] font-bold text-zinc-600">{detections.length} event</span>
          </div>
          {detections.length === 0 ? (
            <p className="text-[10px] text-zinc-600 font-mono py-2">Belum ada deteksi. Aktifkan AI Deteksi untuk mulai memantau orang/kendaraan.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {detections.map((d) => (
                <div key={d.id} className="flex items-center gap-3 bg-zinc-900/40 p-2 rounded-xl border border-zinc-800/60">
                  {d.thumb ? (
                    <img src={`/api/nvr/thumb/${d.id}?kind=det`} alt={d.label} className="w-14 h-14 rounded-lg object-cover bg-black shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0"><ScanEye size={18} className="text-zinc-600" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-extrabold text-white capitalize">{LABEL_ID[d.label] || d.label} <span className="text-[10px] font-bold text-emerald-400">{Math.round(d.score * 100)}%</span></p>
                    <p className="text-[10px] text-zinc-500 font-mono truncate">{fmtTime(d.ts)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recordings */}
        <div className="border-t border-zinc-800/60 pt-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5"><Video size={13} className="text-rose-400" /> Rekaman Tersimpan</span>
            <span className="text-[9px] font-bold text-zinc-600">{recordings.length} klip</span>
          </div>
          {recordings.length === 0 ? (
            <p className="text-[10px] text-zinc-600 font-mono py-2">Belum ada rekaman. Tekan "Rekam" untuk mulai menyimpan video ke server.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {recordings.map((r) => (
                <div key={r.id} className="flex items-center gap-3 bg-zinc-900/40 p-2 rounded-xl border border-zinc-800/60">
                  <button onClick={() => setPlayingId(r.id)} className="relative w-16 h-12 rounded-lg overflow-hidden bg-black shrink-0 group">
                    {r.thumb ? (
                      <img src={`/api/nvr/thumb/${r.id}?kind=rec`} alt="thumb" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Video size={16} className="text-zinc-600" /></div>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-all"><Play size={16} className="text-white" fill="white" /></span>
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{fmtTime(r.start_ts)}</p>
                    <p className="text-[10px] text-zinc-500 font-mono">{fmtDur(r.duration)} • {fmtSize(r.size)}</p>
                  </div>
                  <button onClick={() => deleteRecording(r.id)} className="p-2 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all shrink-0" title="Hapus rekaman">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {ptzMessage && (
          <div className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-center text-[10px] font-mono text-[#F97316] animate-pulse">{ptzMessage}</div>
        )}
      </div>
    </div>
  );
}
