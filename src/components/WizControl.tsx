import { useState, useEffect } from 'react';
import { Lightbulb, Power, Sliders, Palette, RefreshCw } from 'lucide-react';
import type { WizState, WizLampConfig } from '../types';

interface WizControlProps {
  wizName?: string;
  wizIp: string;
  wizPort?: string;
  wizLamps?: WizLampConfig[];
}

export default function WizControl({ wizName, wizIp, wizPort, wizLamps }: WizControlProps) {
  const [selectedLamp, setSelectedLamp] = useState<WizLampConfig | null>(null);
  const [state, setState] = useState<WizState>({
    isOn: true,
    brightness: 80,
    colorTemp: 4000,
    color: '#FF7A00',
    scene: 'Warm White',
  });
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (wizLamps && wizLamps.length > 0) {
      // Find current selected, or default to first
      if (!selectedLamp || !wizLamps.some(l => l.id === selectedLamp.id)) {
        setSelectedLamp(wizLamps[0]);
      }
    } else {
      setSelectedLamp({
        id: 'default',
        name: wizName || 'Philips WiZ Lamp',
        ip: wizIp,
        port: wizPort || '38899'
      });
    }
  }, [wizLamps, wizName, wizIp, wizPort]);

  const updateWiz = async (updates: Partial<WizState>) => {
    const newState = { ...state, ...updates };
    setState(newState);
    setLoading(true);
    setStatusMessage(null);

    const activeIp = selectedLamp ? selectedLamp.ip : wizIp;
    const activePort = selectedLamp ? selectedLamp.port : (wizPort || '38899');

    try {
      const response = await fetch('/api/wiz/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newState,
          ip: activeIp,
          port: activePort
        }),
      });
      const result = await response.json();
      if (result.success) {
        setStatusMessage(`UDP command sent to ${activeIp}`);
      } else {
        setStatusMessage('Failed to transmit command');
      }
    } catch (err) {
      console.error(err);
      setStatusMessage('Connection lost');
    } finally {
      setLoading(false);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const quickColors = [
    { name: 'Red', hex: '#EF4444' },
    { name: 'Orange', hex: '#F97316' },
    { name: 'Yellow', hex: '#FBBF24' },
    { name: 'Green', hex: '#10B981' },
    { name: 'Blue', hex: '#3B82F6' },
    { name: 'Purple', hex: '#8B5CF6' },
    { name: 'Teal', hex: '#06B6D4' },
    { name: 'Warm Slate', hex: '#8E9196' },
  ];

  const scenes = [
    { name: 'Cozy', temp: 2700, bright: 50 },
    { name: 'Focus', temp: 5000, bright: 100 },
    { name: 'Relax', temp: 3000, bright: 40 },
    { name: 'Nightlight', temp: 2200, bright: 10 },
    { name: 'Daylight', temp: 6500, bright: 100 },
  ];

  return (
    <div className="bg-[#121214] rounded-3xl p-6 border border-[#1F1F24] shadow-sm">
      {/* Selector Dropdown for multiple lamps */}
      {wizLamps && wizLamps.length > 1 && (
        <div className="mb-5 bg-zinc-900/60 p-2.5 rounded-2xl border border-zinc-800/80 flex items-center justify-between">
          <span className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest pl-1">Pilih Lampu Aktif:</span>
          <select 
            value={selectedLamp?.id || ''}
            onChange={(e) => {
              const found = wizLamps.find(l => l.id === e.target.value);
              if (found) setSelectedLamp(found);
            }}
            className="bg-[#1C1C1F] border border-zinc-800 text-xs font-bold text-[#F97316] rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#F97316]/50"
          >
            {wizLamps.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-2xl ${state.isOn ? 'bg-orange-500/10 text-[#F97316]' : 'bg-zinc-800/40 text-zinc-500'} border border-zinc-800/50`}>
            <Lightbulb className={`w-6 h-6 ${state.isOn ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <h2 className="font-extrabold text-white text-base tracking-wide">{selectedLamp?.name || wizName || 'Philips WiZ Lamp'}</h2>
            <p className="text-xs text-zinc-500 font-mono">IP: {selectedLamp?.ip || wizIp}</p>
          </div>
        </div>

        <button
          onClick={() => updateWiz({ isOn: !state.isOn })}
          className={`p-3.5 rounded-2xl transition-all duration-300 ${
            state.isOn
              ? 'bg-[#F97316] text-white shadow-lg shadow-orange-500/20 ring-4 ring-orange-500/10'
              : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700 border border-zinc-700/50'
          }`}
        >
          <Power size={20} />
        </button>
      </div>

      {state.isOn ? (
        <div className="space-y-6">
          {/* Brightness Control */}
          <div className="space-y-2.5">
            <div className="flex justify-between text-xs font-bold text-zinc-400">
              <span className="flex items-center gap-1.5"><Sliders size={13} className="text-[#F97316]" /> Brightness</span>
              <span className="font-mono text-[#F97316]">{state.brightness}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              value={state.brightness}
              onChange={(e) => updateWiz({ brightness: Number(e.target.value), scene: 'Custom' })}
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#F97316]"
            />
          </div>

          {/* Color Temp Control */}
          <div className="space-y-2.5">
            <div className="flex justify-between text-xs font-bold text-zinc-400">
              <span className="flex items-center gap-1.5"><Palette size={13} className="text-[#F97316]" /> Color Temp</span>
              <span className="font-mono text-zinc-400">{state.colorTemp}K • Neutral</span>
            </div>
            <input
              type="range"
              min="2200"
              max="6500"
              step="100"
              value={state.colorTemp}
              onChange={(e) => updateWiz({ colorTemp: Number(e.target.value), scene: 'Custom' })}
              className="w-full h-1.5 bg-gradient-to-r from-amber-200 via-orange-100 to-blue-200 rounded-lg appearance-none cursor-pointer accent-zinc-200"
            />
          </div>

          {/* Quick Colors - Beautiful dots matching Screenshot 1 */}
          <div className="space-y-3 pt-1">
            <span className="text-xs font-bold text-zinc-400 block pl-0.5">Quick Colors</span>
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-none">
              {quickColors.map((color) => (
                <button
                  key={color.name}
                  onClick={() => updateWiz({ color: color.hex, colorTemp: 4000, scene: color.name })}
                  style={{ backgroundColor: color.hex }}
                  className={`w-8 h-8 rounded-full transition-all duration-300 border-2 shrink-0 ${
                    state.scene === color.name ? 'border-white scale-110 shadow-lg shadow-black/50' : 'border-transparent hover:scale-105'
                  }`}
                  title={color.name}
                />
              ))}
            </div>
          </div>

          {/* Light Effects / Scenes */}
          <div className="space-y-3 pt-1">
            <span className="text-xs font-bold text-zinc-400 block pl-0.5">Light Effects</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {scenes.map((scene) => (
                <button
                  key={scene.name}
                  onClick={() =>
                    updateWiz({
                      scene: scene.name,
                      colorTemp: scene.temp,
                      brightness: scene.bright,
                    })
                  }
                  className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 border ${
                    state.scene === scene.name
                      ? 'bg-[#F97316] text-white border-[#F97316]'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800'
                  }`}
                >
                  {scene.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="h-44 flex flex-col items-center justify-center bg-zinc-900/40 rounded-2xl border border-dashed border-zinc-800/80">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Lampu sedang mati</p>
          <p className="text-[10px] text-zinc-600 mt-1">Nyalakan lampu untuk mengatur pencahayaan</p>
        </div>
      )}

      {statusMessage && (
        <div className="mt-4 p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-[10px] font-mono font-medium text-[#F97316] animate-fade-in">
          {loading ? <RefreshCw className="animate-spin text-[#F97316] mr-2" size={12} /> : null}
          {statusMessage}
        </div>
      )}
    </div>
  );
}

