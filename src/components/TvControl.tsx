import { useState } from 'react';
import { Tv, Power, Volume2, VolumeX, Volume1, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, CornerDownLeft, Home, Menu, Play, Square } from 'lucide-react';
import type { TvState } from '../types';

interface TvControlProps {
  tvName?: string;
  tvIp: string;
}

export default function TvControl({ tvName, tvIp }: TvControlProps) {
  const [state, setState] = useState<TvState>({
    isOn: true,
    volume: 15,
    currentApp: 'Home Dashboard',
    inputSource: 'HDMI 1',
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const sendCommand = async (command: string, value?: string | number) => {
    setLoading(true);
    setStatus(null);
    try {
      const response = await fetch('/api/tv/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, value }),
      });
      const result = await response.json();
      if (result.success) {
        setStatus(`ADB command ${command} successfully transmitted`);
      } else {
        setStatus('Failed to send ADB command');
      }
    } catch (err) {
      console.error(err);
      setStatus('ADB connection offline');
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const apps = [
    { name: 'YouTube', package: 'com.google.android.youtube.tv' },
    { name: 'Netflix', package: 'com.netflix.ninja' },
    { name: 'Spotify', package: 'com.spotify.tv.android' },
    { name: 'Live TV', package: 'input_hdmi1' },
  ];

  return (
    <div className="bg-[#121214] rounded-3xl p-6 border border-[#1F1F24] shadow-sm">
      {/* Device Info */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-500/10 text-purple-400 rounded-2xl border border-purple-500/15">
            <Tv className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="font-extrabold text-white text-base tracking-wide">{tvName || 'Android Smart TV'}</h2>
            <p className="text-xs text-zinc-500 font-mono">IP: {tvIp}</p>
          </div>
        </div>

        <button
          onClick={() => {
            const nextOn = !state.isOn;
            setState({ ...state, isOn: nextOn });
            sendCommand('KEY_POWER');
          }}
          className={`p-3.5 rounded-2xl transition-all duration-300 ${
            state.isOn
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20 ring-4 ring-purple-600/10'
              : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700 border border-zinc-700/50'
          }`}
        >
          <Power size={18} />
        </button>
      </div>

      {state.isOn ? (
        <div className="space-y-6">
          {/* ADB D-Pad Controller */}
          <div className="flex flex-col items-center py-2">
            <div className="relative w-40 h-40 bg-zinc-900/60 rounded-full border border-zinc-800 flex items-center justify-center shadow-inner">
              
              {/* UP */}
              <button
                onClick={() => sendCommand('KEY_UP')}
                className="absolute top-1.5 p-2 text-zinc-400 hover:text-[#F97316] active:scale-95 transition-all"
                title="Up"
              >
                <ArrowUp size={24} />
              </button>

              {/* LEFT */}
              <button
                onClick={() => sendCommand('KEY_LEFT')}
                className="absolute left-1.5 p-2 text-zinc-400 hover:text-[#F97316] active:scale-95 transition-all"
                title="Left"
              >
                <ArrowLeft size={24} />
              </button>

              {/* CENTER / ENTER */}
              <button
                onClick={() => sendCommand('KEY_ENTER')}
                className="w-14 h-14 bg-[#F97316] hover:bg-orange-600 active:scale-90 rounded-full flex items-center justify-center text-white font-black text-sm shadow-lg shadow-orange-500/20 transition-all duration-300"
                title="OK"
              >
                OK
              </button>

              {/* RIGHT */}
              <button
                onClick={() => sendCommand('KEY_RIGHT')}
                className="absolute right-1.5 p-2 text-zinc-400 hover:text-[#F97316] active:scale-95 transition-all"
                title="Right"
              >
                <ArrowRight size={24} />
              </button>

              {/* DOWN */}
              <button
                onClick={() => sendCommand('KEY_DOWN')}
                className="absolute bottom-1.5 p-2 text-zinc-400 hover:text-[#F97316] active:scale-95 transition-all"
                title="Down"
              >
                <ArrowDown size={24} />
              </button>

            </div>
          </div>

          {/* Navigation & Volume buttons */}
          <div className="grid grid-cols-3 gap-2.5">
            <button
              onClick={() => sendCommand('KEY_BACK')}
              className="flex flex-col items-center justify-center p-3.5 bg-zinc-900 hover:bg-zinc-800 active:scale-95 rounded-2xl text-zinc-300 font-bold border border-zinc-800 transition-all"
            >
              <CornerDownLeft size={16} />
              <span className="text-[10px] tracking-wider uppercase mt-1">Back</span>
            </button>
            <button
              onClick={() => sendCommand('KEY_HOME')}
              className="flex flex-col items-center justify-center p-3.5 bg-zinc-900 hover:bg-zinc-800 active:scale-95 rounded-2xl text-zinc-300 font-bold border border-zinc-800 transition-all"
            >
              <Home size={16} />
              <span className="text-[10px] tracking-wider uppercase mt-1">Home</span>
            </button>
            <button
              onClick={() => sendCommand('KEY_MENU')}
              className="flex flex-col items-center justify-center p-3.5 bg-zinc-900 hover:bg-zinc-800 active:scale-95 rounded-2xl text-zinc-300 font-bold border border-zinc-800 transition-all"
            >
              <Menu size={16} />
              <span className="text-[10px] tracking-wider uppercase mt-1">Menu</span>
            </button>

            <button
              onClick={() => {
                const nextVol = Math.max(0, state.volume - 1);
                setState({ ...state, volume: nextVol });
                sendCommand('VOLUME_DOWN', nextVol);
              }}
              className="flex items-center justify-center gap-1.5 p-3 bg-zinc-900 hover:bg-zinc-800 active:scale-95 rounded-2xl text-zinc-300 border border-zinc-800 transition-all"
            >
              <Volume1 size={14} className="text-[#F97316]" />
              <span className="text-xs font-bold font-mono">Vol -</span>
            </button>
            <div className="flex items-center justify-center p-3 bg-purple-500/10 rounded-2xl text-purple-400 font-mono text-sm font-black border border-purple-500/20">
              {state.volume}
            </div>
            <button
              onClick={() => {
                const nextVol = Math.min(30, state.volume + 1);
                setState({ ...state, volume: nextVol });
                sendCommand('VOLUME_UP', nextVol);
              }}
              className="flex items-center justify-center gap-1.5 p-3 bg-zinc-900 hover:bg-zinc-800 active:scale-95 rounded-2xl text-zinc-300 border border-zinc-800 transition-all"
            >
              <Volume2 size={14} className="text-[#F97316]" />
              <span className="text-xs font-bold font-mono">Vol +</span>
            </button>
          </div>

          {/* Quick Launcher Shortcuts */}
          <div className="space-y-3 pt-1">
            <span className="text-xs font-bold text-zinc-400 block pl-0.5">Quick App Launcher</span>
            <div className="grid grid-cols-2 gap-2">
              {apps.map((app) => (
                <button
                  key={app.name}
                  onClick={() => {
                    setState({ ...state, currentApp: app.name });
                    sendCommand('LAUNCH_APP', app.package);
                  }}
                  className={`p-3 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 ${
                    state.currentApp === app.name
                      ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-800/80 hover:bg-zinc-800'
                  }`}
                >
                  <Play size={10} className="fill-current" />
                  {app.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="h-96 flex flex-col items-center justify-center bg-zinc-900/40 rounded-2xl border border-dashed border-zinc-800/80">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Televisi Mati</p>
          <p className="text-[10px] text-zinc-600 mt-1">Nyalakan TV untuk mengakses remote kontrol ADB</p>
        </div>
      )}

      {status && (
        <div className="mt-4 p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-[10px] font-mono font-medium text-purple-400 animate-fade-in">
          {status}
        </div>
      )}
    </div>
  );
}

