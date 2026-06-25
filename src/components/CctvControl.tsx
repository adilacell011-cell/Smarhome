import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ZoomIn, ZoomOut, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Cpu, Copy, Check, Video, Trash2, Play, X, ScanEye, Download, Zap, Plus, Lightbulb, Tv, PlayCircle, Send, Clock } from 'lucide-react';
import type { CctvConfig, NvrRecording, NvrDetection, AutomationRule, NvrDevices, TelegramSnapSchedule } from '../types';

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

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

const DETECT_LABELS = ['person', 'car', 'motorcycle', 'bicycle', 'bus', 'truck', 'cat', 'dog'];

const WIZ_COMMANDS: Record<string, string> = { on: 'Nyalakan Lampu', off: 'Matikan Lampu' };
const TV_COMMANDS: Record<string, string> = { power: 'Power TV', youtube: 'Buka YouTube', mute: 'Mute TV' };

function actionLabel(action: AutomationRule['action'], devices: NvrDevices): string {
  if (action.deviceType === 'wiz') {
    const name = action.deviceId === 'all' ? 'Semua Lampu' : (devices.lamps.find(l => l.id === action.deviceId)?.name || 'Lampu');
    return `${WIZ_COMMANDS[action.command] || action.command} — ${name}`;
  }
  return TV_COMMANDS[action.command] || `TV: ${action.command}`;
}

function RuleForm({ devices, onSave, onCancel }: {
  devices: NvrDevices;
  onSave: (rule: AutomationRule) => void;
  onCancel: () => void;
}) {
  const [cameraId, setCameraId] = useState<string>('any');
  const [label, setLabel] = useState<string>('person');
  const [deviceType, setDeviceType] = useState<'wiz' | 'tv'>('wiz');
  const [deviceId, setDeviceId] = useState<string>('all');
  const [command, setCommand] = useState<string>('on');
  const [cooldownSec, setCooldownSec] = useState<number>(60);

  const submit = () => {
    const id = (globalThis.crypto?.randomUUID?.() || `rule_${Date.now()}`);
    const action = deviceType === 'wiz'
      ? { deviceType, deviceId, command }
      : { deviceType, deviceId: 'tv', command };
    onSave({ id, enabled: true, cameraId, label, action, cooldownSec });
  };

  const selClass = 'bg-[#1C1C1F] border border-zinc-800 text-xs font-bold text-zinc-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#F97316]/50 w-full';

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-3">
      <p className="text-[10px] font-extrabold text-orange-400 uppercase tracking-widest">Buat Aturan Baru</p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">JIKA Kamera</label>
          <select value={cameraId} onChange={e => setCameraId(e.target.value)} className={selClass}>
            <option value="any">Semua Kamera</option>
            {devices.cameras.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Mendeteksi</label>
          <select value={label} onChange={e => setLabel(e.target.value)} className={selClass}>
            <option value="any">Apa Saja</option>
            {DETECT_LABELS.map(l => <option key={l} value={l}>{LABEL_ID[l] || l}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">MAKA Perangkat</label>
          <select
            value={deviceType}
            onChange={e => {
              const dt = e.target.value as 'wiz' | 'tv';
              setDeviceType(dt);
              if (dt === 'wiz') { setDeviceId('all'); setCommand('on'); }
              else { setDeviceId('tv'); setCommand('power'); }
            }}
            className={selClass}
          >
            <option value="wiz">Lampu WiZ</option>
            {devices.tv && <option value="tv">Android TV</option>}
          </select>
        </div>
        {deviceType === 'wiz' ? (
          <div>
            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Pilih Lampu</label>
            <select value={deviceId} onChange={e => setDeviceId(e.target.value)} className={selClass}>
              <option value="all">Semua Lampu</option>
              {devices.lamps.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        ) : <div />}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Aksi</label>
          <select value={command} onChange={e => setCommand(e.target.value)} className={selClass}>
            {Object.entries(deviceType === 'wiz' ? WIZ_COMMANDS : TV_COMMANDS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Jeda (detik)</label>
          <input
            type="number" min={0} value={cooldownSec}
            onChange={e => setCooldownSec(Math.max(0, parseInt(e.target.value) || 0))}
            className={selClass}
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={submit} className="flex-1 bg-orange-500/15 border border-orange-500/40 text-orange-400 font-extrabold text-[11px] uppercase tracking-wider py-2.5 rounded-xl hover:bg-orange-500/25 transition-all">Simpan Aturan</button>
        <button onClick={onCancel} className="px-4 bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold text-[11px] uppercase tracking-wider py-2.5 rounded-xl hover:bg-zinc-800 transition-all">Batal</button>
      </div>
    </div>
  );
}

function SnapForm({ cameras, onSave, onCancel }: {
  cameras: Array<{ id: string; name: string }>;
  onSave: (s: TelegramSnapSchedule) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState<string>('');
  const [time, setTime] = useState<string>('07:00');
  const [cameraId, setCameraId] = useState<string>('all');
  const [days, setDays] = useState<number[]>([]);

  const toggleDay = (d: number) => setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const submit = () => {
    const id = (globalThis.crypto?.randomUUID?.() || `snap_${Date.now()}`);
    onSave({ id, name: name.trim() || undefined, enabled: true, time, days, cameraId });
  };

  const selClass = 'bg-[#1C1C1F] border border-zinc-800 text-xs font-bold text-zinc-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#F97316]/50 w-full';

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-3">
      <p className="text-[10px] font-extrabold text-sky-400 uppercase tracking-widest">Jadwal Snapshot Baru</p>

      <div>
        <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Nama (opsional)</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Contoh: Cek Pagi" className={selClass} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Jam Kirim</label>
          <input type="time" value={time} onChange={e => setTime(e.target.value)} className={selClass} />
        </div>
        <div>
          <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Kamera</label>
          <select value={cameraId} onChange={e => setCameraId(e.target.value)} className={selClass}>
            <option value="all">Semua Kamera</option>
            {cameras.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Hari (kosong = setiap hari)</label>
        <div className="flex flex-wrap gap-1.5">
          {DAY_LABELS.map((lbl, d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(d)}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold transition-all ${days.includes(d) ? 'bg-sky-500/20 border border-sky-500/40 text-sky-300' : 'bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-300'}`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={submit} className="flex-1 bg-sky-500/15 border border-sky-500/40 text-sky-400 font-extrabold text-[11px] uppercase tracking-wider py-2.5 rounded-xl hover:bg-sky-500/25 transition-all">Simpan Jadwal</button>
        <button onClick={onCancel} className="px-4 bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold text-[11px] uppercase tracking-wider py-2.5 rounded-xl hover:bg-zinc-800 transition-all">Batal</button>
      </div>
    </div>
  );
}

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

  // Automation state
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [devices, setDevices] = useState<NvrDevices>({ lamps: [], cameras: [], tv: null });
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [autoMessage, setAutoMessage] = useState<string | null>(null);

  // Telegram snapshot state
  const [tgSchedules, setTgSchedules] = useState<TelegramSnapSchedule[]>([]);
  const [tgConfigured, setTgConfigured] = useState(false);
  const [showSnapForm, setShowSnapForm] = useState(false);
  const [tgMessage, setTgMessage] = useState<string | null>(null);
  const [tgTesting, setTgTesting] = useState(false);

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

  const loadAutomation = useCallback(async () => {
    try {
      const [devRes, ruleRes] = await Promise.all([
        fetch('/api/nvr/devices'),
        fetch('/api/nvr/rules'),
      ]);
      const dev = await devRes.json();
      const rule = await ruleRes.json();
      if (dev.success) setDevices({ lamps: dev.lamps || [], cameras: dev.cameras || [], tv: dev.tv || null });
      if (rule.success) setRules(rule.rules || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => { loadAutomation(); }, [loadAutomation]);

  const persistRules = async (next: AutomationRule[]) => {
    setRules(next);
    try {
      await fetch('/api/nvr/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: next }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const toggleRule = (id: string) => {
    persistRules(rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const removeRule = async (id: string) => {
    setRules(rules.filter(r => r.id !== id));
    try { await fetch(`/api/nvr/rules/${id}`, { method: 'DELETE' }); } catch (err) { console.error(err); }
  };

  const testAction = async (action: AutomationRule['action']) => {
    setAutoMessage('Menguji aksi...');
    try {
      const res = await fetch('/api/nvr/rules/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setAutoMessage(data.message || (data.success ? 'Berhasil' : 'Gagal'));
    } catch (err) {
      console.error(err);
      setAutoMessage('Gagal mengirim aksi');
    }
    setTimeout(() => setAutoMessage(null), 5000);
  };

  const loadTelegram = useCallback(async () => {
    try {
      const [statusRes, schedRes] = await Promise.all([
        fetch('/api/nvr/telegram/status'),
        fetch('/api/nvr/telegram/schedules'),
      ]);
      const status = await statusRes.json();
      const sched = await schedRes.json();
      if (status.success) setTgConfigured(!!status.configured);
      if (sched.success) setTgSchedules(sched.schedules || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => { loadTelegram(); }, [loadTelegram]);

  const persistSnap = async (next: TelegramSnapSchedule[]) => {
    const prev = tgSchedules;
    setTgSchedules(next);
    try {
      const res = await fetch('/api/nvr/telegram/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedules: next }),
      });
      const data = await res.json();
      if (!data.success) {
        setTgSchedules(prev);
        setTgMessage(data.message || 'Gagal menyimpan jadwal');
        setTimeout(() => setTgMessage(null), 5000);
      }
    } catch (err) {
      console.error(err);
      setTgSchedules(prev);
    }
  };

  const toggleSnap = (id: string) => {
    persistSnap(tgSchedules.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  const removeSnap = async (id: string) => {
    setTgSchedules(tgSchedules.filter(s => s.id !== id));
    try { await fetch(`/api/nvr/telegram/schedules/${id}`, { method: 'DELETE' }); } catch (err) { console.error(err); }
  };

  const testSnap = async () => {
    setTgTesting(true);
    setTgMessage('Mengambil & mengirim snapshot...');
    try {
      const res = await fetch('/api/nvr/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cameraId }),
      });
      const data = await res.json();
      setTgMessage(data.message || (data.success ? 'Berhasil' : 'Gagal'));
    } catch (err) {
      console.error(err);
      setTgMessage('Gagal mengirim snapshot');
    }
    setTgTesting(false);
    setTimeout(() => setTgMessage(null), 6000);
  };

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
                  <a
                    href={`/api/nvr/recordings/${r.id}/video?download=1`}
                    download
                    className="p-2 text-zinc-500 hover:text-[#F97316] hover:bg-orange-500/10 rounded-lg transition-all shrink-0"
                    title="Unduh rekaman"
                  >
                    <Download size={14} />
                  </a>
                  <button onClick={() => deleteRecording(r.id)} className="p-2 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all shrink-0" title="Hapus rekaman">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Automation rules */}
        <div className="border-t border-zinc-800/60 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5"><Zap size={13} className="text-amber-400" /> Otomatisasi AI</span>
            {!showRuleForm && (
              <button onClick={() => setShowRuleForm(true)} className="flex items-center gap-1 px-2.5 py-1.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 font-extrabold text-[10px] uppercase tracking-wider rounded-lg hover:bg-orange-500/20 transition-all">
                <Plus size={12} /> Aturan
              </button>
            )}
          </div>
          <p className="text-[10px] text-zinc-600 font-mono leading-relaxed">Jika AI mendeteksi objek tertentu, perangkat otomatis dijalankan (mis. nyalakan lampu saat ada orang).</p>

          {showRuleForm && (
            <RuleForm
              devices={devices}
              onSave={(rule) => { persistRules([...rules, rule]); setShowRuleForm(false); }}
              onCancel={() => setShowRuleForm(false)}
            />
          )}

          {autoMessage && (
            <div className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-center text-[10px] font-mono text-amber-400">{autoMessage}</div>
          )}

          {rules.length === 0 && !showRuleForm ? (
            <p className="text-[10px] text-zinc-600 font-mono py-1">Belum ada aturan otomatis.</p>
          ) : (
            <div className="space-y-2">
              {rules.map((r) => {
                const camName = r.cameraId === 'any' ? 'Semua Kamera' : (devices.cameras.find(c => c.id === r.cameraId)?.name || r.cameraId);
                const objName = r.label === 'any' ? 'apa saja' : (LABEL_ID[r.label] || r.label);
                return (
                  <div key={r.id} className={`bg-zinc-900/40 p-3 rounded-xl border ${r.enabled ? 'border-amber-500/20' : 'border-zinc-800/60'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-zinc-300 leading-snug">
                          <span className="text-zinc-500">Jika</span> <b className="text-white">{camName}</b> <span className="text-zinc-500">deteksi</span> <b className="text-emerald-400">{objName}</b>
                        </p>
                        <p className="text-[11px] text-zinc-300 leading-snug mt-0.5 flex items-center gap-1">
                          <span className="text-zinc-500">maka</span>
                          {r.action.deviceType === 'wiz' ? <Lightbulb size={11} className="text-amber-400" /> : <Tv size={11} className="text-purple-400" />}
                          <b className="text-white truncate">{actionLabel(r.action, devices)}</b>
                        </p>
                        <p className="text-[9px] text-zinc-600 font-mono mt-1">jeda {r.cooldownSec}d</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => testAction(r.action)} className="p-1.5 text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all" title="Uji aksi">
                          <PlayCircle size={15} />
                        </button>
                        <button
                          onClick={() => toggleRule(r.id)}
                          className={`relative w-9 h-5 rounded-full transition-all ${r.enabled ? 'bg-amber-500' : 'bg-zinc-700'}`}
                          title={r.enabled ? 'Nonaktifkan' : 'Aktifkan'}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${r.enabled ? 'left-4.5' : 'left-0.5'}`} style={{ left: r.enabled ? '18px' : '2px' }}></span>
                        </button>
                        <button onClick={() => removeRule(r.id)} className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all" title="Hapus aturan">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Telegram auto snapshots */}
        <div className="border-t border-zinc-800/60 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5"><Send size={13} className="text-sky-400" /> Snapshot Telegram</span>
            <div className="flex items-center gap-1.5">
              <button onClick={testSnap} disabled={tgTesting || !tgConfigured} className="flex items-center gap-1 px-2.5 py-1.5 bg-sky-500/10 border border-sky-500/20 text-sky-400 font-extrabold text-[10px] uppercase tracking-wider rounded-lg hover:bg-sky-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                <Send size={12} /> Tes Kirim
              </button>
              {!showSnapForm && (
                <button onClick={() => setShowSnapForm(true)} className="flex items-center gap-1 px-2.5 py-1.5 bg-sky-500/10 border border-sky-500/20 text-sky-400 font-extrabold text-[10px] uppercase tracking-wider rounded-lg hover:bg-sky-500/20 transition-all">
                  <Plus size={12} /> Jadwal
                </button>
              )}
            </div>
          </div>
          <p className="text-[10px] text-zinc-600 font-mono leading-relaxed">Foto kamera otomatis dikirim ke admin lewat bot Telegram sesuai jadwal. Atur token bot & Chat ID di menu Pengaturan → Telegram.</p>

          {!tgConfigured && (
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[10px] font-mono text-amber-400 leading-relaxed">
              Bot Telegram belum diatur. Buka Pengaturan → Telegram untuk mengisi token bot dan Chat ID admin.
            </div>
          )}

          {showSnapForm && (
            <SnapForm
              cameras={(cctvs && cctvs.length > 0) ? cctvs.map(c => ({ id: c.id, name: c.name })) : [{ id: 'icsee', name: icseeName || 'CCTV' }]}
              onSave={(s) => { persistSnap([...tgSchedules, s]); setShowSnapForm(false); }}
              onCancel={() => setShowSnapForm(false)}
            />
          )}

          {tgMessage && (
            <div className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-center text-[10px] font-mono text-sky-400">{tgMessage}</div>
          )}

          {tgSchedules.length === 0 && !showSnapForm ? (
            <p className="text-[10px] text-zinc-600 font-mono py-1">Belum ada jadwal snapshot.</p>
          ) : (
            <div className="space-y-2">
              {tgSchedules.map((s) => {
                const camName = s.cameraId === 'all' ? 'Semua Kamera' : ((cctvs?.find(c => c.id === s.cameraId)?.name) || (s.cameraId === 'icsee' ? (icseeName || 'CCTV') : s.cameraId));
                const dayText = s.days.length === 0 ? 'Setiap hari' : s.days.slice().sort((a, b) => a - b).map(d => DAY_LABELS[d]).join(', ');
                return (
                  <div key={s.id} className={`bg-zinc-900/40 p-3 rounded-xl border ${s.enabled ? 'border-sky-500/20' : 'border-zinc-800/60'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-zinc-300 leading-snug flex items-center gap-1.5">
                          <Clock size={11} className="text-sky-400 shrink-0" />
                          <b className="text-white">{s.time}</b>
                          {s.name && <span className="text-zinc-500 truncate">• {s.name}</span>}
                        </p>
                        <p className="text-[11px] text-zinc-300 leading-snug mt-0.5">
                          <span className="text-zinc-500">Kamera:</span> <b className="text-white">{camName}</b>
                        </p>
                        <p className="text-[9px] text-zinc-600 font-mono mt-1">{dayText}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => toggleSnap(s.id)}
                          className={`relative w-9 h-5 rounded-full transition-all ${s.enabled ? 'bg-sky-500' : 'bg-zinc-700'}`}
                          title={s.enabled ? 'Nonaktifkan' : 'Aktifkan'}
                        >
                          <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: s.enabled ? '18px' : '2px' }}></span>
                        </button>
                        <button onClick={() => removeSnap(s.id)} className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all" title="Hapus jadwal">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
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
