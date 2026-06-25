import { useState, useEffect, useCallback } from 'react';
import { Lightbulb, Power, Sliders, Palette, RefreshCw, FolderOpen, User, Layers, CheckCircle, Pencil, Clock, Plus, Trash2 } from 'lucide-react';
import type { WizState, WizLampConfig, LightSchedule } from '../types';

interface WizControlProps {
  wizName?: string;
  wizIp: string;
  wizPort?: string;
  wizLamps?: WizLampConfig[];
  onEditLamp?: (lamp: WizLampConfig) => void;
}

export default function WizControl({ wizName, wizIp, wizPort, wizLamps, onEditLamp }: WizControlProps) {
  const [activeTab, setActiveTab] = useState<'group' | 'individual'>('group');
  const [selectedLamp, setSelectedLamp] = useState<WizLampConfig | null>(null);
  
  // Single Lamp state
  const [state, setState] = useState<WizState>({
    isOn: true,
    brightness: 80,
    colorTemp: 4000,
    color: '#FF7A00',
    scene: 'Warm White',
  });

  // Group States
  const [groupStates, setGroupStates] = useState<{ [group: string]: WizState }>({});
  const [individualLampOnStates, setIndividualLampOnStates] = useState<{ [id: string]: boolean }>({});
  
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Parse Groups from wizLamps
  const lamps = wizLamps || [];
  const groupsMap: { [key: string]: WizLampConfig[] } = {};
  lamps.forEach(lamp => {
    const g = lamp.group || 'Lainnya';
    if (!groupsMap[g]) groupsMap[g] = [];
    groupsMap[g].push(lamp);
  });
  const groupNames = Object.keys(groupsMap);
  
  const [activeGroup, setActiveGroup] = useState<string>(groupNames[0] || 'Ruang Tamu');

  // If active group is empty but groups exist, update active group
  useEffect(() => {
    if (groupNames.length > 0 && !groupNames.includes(activeGroup)) {
      setActiveGroup(groupNames[0]);
    }
  }, [wizLamps]);

  // Set default selected lamp
  useEffect(() => {
    if (wizLamps && wizLamps.length > 0) {
      if (!selectedLamp || !wizLamps.some(l => l.id === selectedLamp.id)) {
        setSelectedLamp(wizLamps[0]);
      }
    } else {
      setSelectedLamp({
        id: 'default',
        name: wizName || 'Philips WiZ Lamp',
        ip: wizIp,
        port: wizPort || '38899',
        group: 'Ruang Tamu'
      });
    }
  }, [wizLamps, wizName, wizIp, wizPort]);

  // Fetch real physical status of all lamps from the server
  const fetchRealStatus = async () => {
    try {
      const response = await fetch('/api/wiz/status');
      const data = await response.json();
      if (data.success && data.statuses) {
        // Sync individual states
        const updatedOnStates: { [id: string]: boolean } = {};
        lamps.forEach(l => {
          if (data.statuses[l.id] !== undefined) {
            updatedOnStates[l.id] = data.statuses[l.id].isOn;
          } else {
            updatedOnStates[l.id] = false;
          }
        });
        setIndividualLampOnStates(updatedOnStates);

        // If a lamp is selected, sync the state
        if (selectedLamp && data.statuses[selectedLamp.id]) {
          const s = data.statuses[selectedLamp.id];
          setState(prev => ({
            ...prev,
            isOn: s.isOn,
            brightness: s.brightness,
            colorTemp: s.colorTemp,
          }));
        }

        // Sync group states: if any lamp in a group is on, the group is considered on
        const newGroupStates: { [group: string]: WizState } = {};
        groupNames.forEach(groupName => {
          const groupLamps = groupsMap[groupName] || [];
          const anyOn = groupLamps.some(l => data.statuses[l.id]?.isOn);
          const firstLampStatus = groupLamps.length > 0 ? data.statuses[groupLamps[0].id] : null;
          newGroupStates[groupName] = {
            isOn: anyOn,
            brightness: firstLampStatus?.brightness || 80,
            colorTemp: firstLampStatus?.colorTemp || 4000,
            color: '#FF7A00',
            scene: 'Custom',
          };
        });
        setGroupStates(newGroupStates);
      }
    } catch (err) {
      console.error("Gagal mendeteksi status riil lampu dari server:", err);
    }
  };

  // Run on mount or when lamps list changes
  useEffect(() => {
    if (lamps.length > 0) {
      fetchRealStatus();
    }
  }, [wizLamps]);

  // Re-sync status when the selected lamp changes (reuses fetchRealStatus)
  useEffect(() => {
    if (selectedLamp) {
      fetchRealStatus();
    }
  }, [selectedLamp]);

  // Get current active state depending on tab
  const getGroupState = (group: string): WizState => {
    if (!groupStates[group]) {
      return {
        isOn: true,
        brightness: 80,
        colorTemp: 4000,
        color: '#FF7A00',
        scene: 'Warm White',
      };
    }
    return groupStates[group];
  };

  // Update single WiZ Lamp
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
        setStatusMessage(`Perintah dikirim ke ${selectedLamp?.name || 'Lampu'}`);
        // If single lamp status changed, keep state synced
        if (selectedLamp) {
          setIndividualLampOnStates(prev => ({
            ...prev,
            [selectedLamp.id]: newState.isOn
          }));
        }
      } else {
        setStatusMessage('Gagal mengirim perintah');
      }
    } catch (err) {
      console.error(err);
      setStatusMessage('Koneksi terputus');
    } finally {
      setLoading(false);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  // Master Group Control: Update all lamps in a specific group
  const updateGroupWiz = async (groupName: string, updates: Partial<WizState>) => {
    const groupLamps = groupsMap[groupName] || [];
    if (groupLamps.length === 0) return;

    const currentGroupState = getGroupState(groupName);
    const newGroupState = { ...currentGroupState, ...updates };
    
    setGroupStates(prev => ({
      ...prev,
      [groupName]: newGroupState
    }));

    setLoading(true);
    setStatusMessage(`Mengirim perintah kelompok "${groupName}"...`);

    try {
      // Send UDP request to all lamps in the group concurrently
      const promises = groupLamps.map(lamp => {
        return fetch('/api/wiz/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isOn: newGroupState.isOn,
            brightness: newGroupState.brightness,
            colorTemp: newGroupState.colorTemp,
            color: newGroupState.color,
            scene: newGroupState.scene,
            ip: lamp.ip,
            port: lamp.port || '38899'
          }),
        })
        .then(r => r.json())
        .then(res => {
          if (res.success) {
            setIndividualLampOnStates(prev => ({
              ...prev,
              [lamp.id]: newGroupState.isOn
            }));
          }
          return res;
        })
        .catch(err => ({ success: false, error: err }));
      });

      const results = await Promise.all(promises);
      const successCount = results.filter(r => r.success).length;
      setStatusMessage(`Kelompok "${groupName}": ${successCount}/${groupLamps.length} lampu berhasil diupdate.`);
    } catch (err) {
      console.error(err);
      setStatusMessage('Gagal mengirim kontrol kelompok');
    } finally {
      setLoading(false);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  // Toggle individual lamp inside a group ("mematikan sebagian")
  const toggleIndividualLampInGroup = async (lamp: WizLampConfig) => {
    const currentOn = individualLampOnStates[lamp.id] !== false; // default true
    const nextOn = !currentOn;

    setLoading(true);
    setStatusMessage(`Mengubah status ${lamp.name}...`);

    try {
      const response = await fetch('/api/wiz/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isOn: nextOn,
          brightness: 80,
          colorTemp: 4000,
          ip: lamp.ip,
          port: lamp.port || '38899'
        })
      });
      const result = await response.json();
      if (result.success) {
        setIndividualLampOnStates(prev => ({
          ...prev,
          [lamp.id]: nextOn
        }));
        setStatusMessage(`${lamp.name} berhasil ${nextOn ? 'Dinyalakan' : 'Dimatikan'}.`);
      } else {
        setStatusMessage(`Gagal mengontrol ${lamp.name}`);
      }
    } catch (err) {
      console.error(err);
      setStatusMessage('Gagal terhubung ke lampu');
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

  const currentActiveGroupState = getGroupState(activeGroup);

  return (
    <div className="bg-[#121214] rounded-3xl p-6 border border-[#1F1F24] shadow-sm space-y-5">
      
      {/* Tab Selectors */}
      {groupNames.length > 0 && (
        <div className="flex bg-zinc-950 p-1 rounded-2xl border border-zinc-900">
          <button
            onClick={() => setActiveTab('group')}
            className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'group'
                ? 'bg-[#F97316] text-white shadow'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Layers size={13} />
            Kontrol Kelompok
          </button>
          <button
            onClick={() => setActiveTab('individual')}
            className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'individual'
                ? 'bg-[#F97316] text-white shadow'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Lightbulb size={13} />
            Lampu Satuan ({lamps.length})
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 1: KONTROL KELOMPOK (GROUP CONTROL) */}
      {/* ========================================================= */}
      {activeTab === 'group' && groupNames.length > 0 && (
        <div className="space-y-5 animate-fade-in">
          {/* Group Selector Dropdown / Pills */}
          <div className="bg-zinc-900/60 p-3 rounded-2xl border border-zinc-800/80 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest pl-1">Pilih Kelompok Aktif:</span>
              <span className="text-[10px] font-mono text-orange-400 font-bold bg-orange-500/10 px-2 py-0.5 rounded-md">
                {groupsMap[activeGroup]?.length || 0} Lampu
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {groupNames.map(g => (
                <button
                  key={g}
                  onClick={() => setActiveGroup(g)}
                  className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    activeGroup === g
                      ? 'bg-zinc-800 text-white border-orange-500/40 shadow'
                      : 'bg-zinc-950 text-zinc-500 border-transparent hover:text-zinc-300'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Master Toggle Area for Group */}
          <div className="p-4 bg-zinc-950/60 rounded-2xl border border-zinc-900 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-2xl ${currentActiveGroupState.isOn ? 'bg-orange-500/10 text-[#F97316]' : 'bg-zinc-800/40 text-zinc-500'} border border-zinc-800/50`}>
                <Layers className={`w-6 h-6 ${currentActiveGroupState.isOn ? 'animate-pulse' : ''}`} />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-base tracking-wide uppercase">Kelompok: {activeGroup}</h3>
                <p className="text-[10px] text-zinc-500">Saklar Master untuk mengontrol seluruh ruangan sekaligus</p>
              </div>
            </div>

            <button
              onClick={() => updateGroupWiz(activeGroup, { isOn: !currentActiveGroupState.isOn })}
              className={`p-3.5 rounded-2xl transition-all duration-300 cursor-pointer ${
                currentActiveGroupState.isOn
                  ? 'bg-[#F97316] text-white shadow-lg shadow-orange-500/20 ring-4 ring-orange-500/10'
                  : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700 border border-zinc-700/50'
              }`}
              title="Toggle Seluruh Kelompok"
            >
              <Power size={20} />
            </button>
          </div>

          {/* Sub-device controller: Toggle sebagian lampu dalam kelompok */}
          <div className="space-y-2.5">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest pl-1 block">
              Daftar Lampu di {activeGroup} (Bisa Matikan Sebagian):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(groupsMap[activeGroup] || []).map(lamp => {
                const isLampOn = individualLampOnStates[lamp.id] !== false;
                return (
                  <div 
                    key={lamp.id} 
                    className="p-3 bg-zinc-900/40 rounded-xl border border-zinc-800/60 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${isLampOn ? 'bg-[#F97316] shadow-[0_0_8px_rgba(249,115,22,0.8)]' : 'bg-zinc-700'}`} />
                      <div className="truncate pr-2">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-extrabold text-white truncate">{lamp.name}</p>
                          {onEditLamp && (
                            <button
                              onClick={() => onEditLamp(lamp)}
                              className="p-0.5 hover:bg-zinc-800 text-zinc-500 hover:text-[#F97316] rounded transition-colors cursor-pointer"
                              title="Ubah nama lampu"
                            >
                              <Pencil size={9} className="stroke-[2.5]" />
                            </button>
                          )}
                        </div>
                        <p className="text-[9px] font-mono text-zinc-500 truncate">{lamp.ip}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleIndividualLampInGroup(lamp)}
                      className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg border transition-all cursor-pointer ${
                        isLampOn
                          ? 'bg-orange-500/10 text-[#F97316] border-orange-500/20 hover:bg-orange-500/20'
                          : 'bg-zinc-950 text-zinc-500 border-zinc-900 hover:text-zinc-400'
                      }`}
                    >
                      {isLampOn ? 'MATIKAN' : 'NYALAKAN'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {currentActiveGroupState.isOn ? (
            <div className="space-y-6 pt-2 border-t border-zinc-900">
              {/* Group Brightness */}
              <div className="space-y-2.5">
                <div className="flex justify-between text-xs font-bold text-zinc-400">
                  <span className="flex items-center gap-1.5"><Sliders size={13} className="text-[#F97316]" /> Brightness Kelompok</span>
                  <span className="font-mono text-[#F97316]">{currentActiveGroupState.brightness}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={currentActiveGroupState.brightness}
                  onChange={(e) => updateGroupWiz(activeGroup, { brightness: Number(e.target.value), scene: 'Custom' })}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#F97316]"
                />
              </div>

              {/* Group Color Temp */}
              <div className="space-y-2.5">
                <div className="flex justify-between text-xs font-bold text-zinc-400">
                  <span className="flex items-center gap-1.5"><Palette size={13} className="text-[#F97316]" /> Color Temp Kelompok</span>
                  <span className="font-mono text-zinc-400">{currentActiveGroupState.colorTemp}K</span>
                </div>
                <input
                  type="range"
                  min="2200"
                  max="6500"
                  step="100"
                  value={currentActiveGroupState.colorTemp}
                  onChange={(e) => updateGroupWiz(activeGroup, { colorTemp: Number(e.target.value), scene: 'Custom' })}
                  className="w-full h-1.5 bg-gradient-to-r from-amber-200 via-orange-100 to-blue-200 rounded-lg appearance-none cursor-pointer accent-zinc-200"
                />
              </div>

              {/* Group Quick Colors */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-zinc-400 block pl-0.5">Quick Colors Kelompok</span>
                <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-none">
                  {quickColors.map((color) => (
                    <button
                      key={color.name}
                      onClick={() => updateGroupWiz(activeGroup, { color: color.hex, colorTemp: 4000, scene: color.name })}
                      style={{ backgroundColor: color.hex }}
                      className={`w-8 h-8 rounded-full transition-all duration-300 border-2 shrink-0 cursor-pointer ${
                        currentActiveGroupState.scene === color.name ? 'border-white scale-110 shadow-lg shadow-black/50' : 'border-transparent hover:scale-105'
                      }`}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>

              {/* Group Light Effects / Scenes */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-zinc-400 block pl-0.5">Light Effects Kelompok</span>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {scenes.map((scene) => (
                    <button
                      key={scene.name}
                      onClick={() =>
                        updateGroupWiz(activeGroup, {
                          scene: scene.name,
                          colorTemp: scene.temp,
                          brightness: scene.bright,
                        })
                      }
                      className={`px-2 py-2 rounded-xl text-[10px] sm:text-xs font-bold transition-all duration-300 border cursor-pointer ${
                        currentActiveGroupState.scene === scene.name
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
            <div className="h-40 flex flex-col items-center justify-center bg-zinc-900/40 rounded-2xl border border-dashed border-zinc-800/80">
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Semua lampu kelompok mati</p>
              <p className="text-[10px] text-zinc-600 mt-1">Nyalakan saklar master untuk menyalakan semua lampu kelompok</p>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: KONTROL SATUAN (INDIVIDUAL CONTROL) */}
      {/* ========================================================= */}
      {(activeTab === 'individual' || groupNames.length === 0) && (
        <div className="space-y-5 animate-fade-in">
          {/* Selector Dropdown for multiple lamps */}
          {lamps.length > 1 && (
            <div className="bg-zinc-900/60 p-2.5 rounded-2xl border border-zinc-800/80 flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest pl-1">Pilih Lampu Aktif:</span>
              <select 
                value={selectedLamp?.id || ''}
                onChange={(e) => {
                  const found = lamps.find(l => l.id === e.target.value);
                  if (found) {
                    setSelectedLamp(found);
                    // Match current individual on-off state
                    setState(prev => ({
                      ...prev,
                      isOn: individualLampOnStates[found.id] !== false
                    }));
                  }
                }}
                className="bg-[#1C1C1F] border border-zinc-800 text-xs font-bold text-[#F97316] rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#F97316]/50"
              >
                {lamps.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.name} {l.group ? `(${l.group})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-2xl ${state.isOn ? 'bg-orange-500/10 text-[#F97316]' : 'bg-zinc-800/40 text-zinc-500'} border border-zinc-800/50`}>
                <Lightbulb className={`w-6 h-6 ${state.isOn ? 'animate-pulse' : ''}`} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 className="font-extrabold text-white text-base tracking-wide">{selectedLamp?.name || wizName || 'Philips WiZ Lamp'}</h2>
                  {onEditLamp && selectedLamp && selectedLamp.id !== 'default' && (
                    <button
                      onClick={() => onEditLamp(selectedLamp)}
                      className="p-1 hover:bg-zinc-800 text-zinc-500 hover:text-[#F97316] rounded-lg transition-colors cursor-pointer"
                      title="Edit Nama Lampu"
                    >
                      <Pencil size={11} className="stroke-[2.5]" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-zinc-500 font-mono">IP: {selectedLamp?.ip || wizIp}</span>
                  {selectedLamp?.group && (
                    <span className="text-[9px] bg-zinc-800 px-1.5 py-0.5 text-zinc-400 font-bold rounded">
                      {selectedLamp.group}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => updateWiz({ isOn: !state.isOn })}
              className={`p-3.5 rounded-2xl transition-all duration-300 cursor-pointer ${
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
                  <span className="font-mono text-zinc-400">{state.colorTemp}K</span>
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

              {/* Quick Colors */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-zinc-400 block pl-0.5">Quick Colors</span>
                <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-none">
                  {quickColors.map((color) => (
                    <button
                      key={color.name}
                      onClick={() => updateWiz({ color: color.hex, colorTemp: 4000, scene: color.name })}
                      style={{ backgroundColor: color.hex }}
                      className={`w-8 h-8 rounded-full transition-all duration-300 border-2 shrink-0 cursor-pointer ${
                        state.scene === color.name ? 'border-white scale-110 shadow-lg shadow-black/50' : 'border-transparent hover:scale-105'
                      }`}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>

              {/* Light Effects / Scenes */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-zinc-400 block pl-0.5">Light Effects</span>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
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
                      className={`px-2 py-2 rounded-xl text-[10px] sm:text-xs font-bold transition-all duration-300 border cursor-pointer ${
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
            <div className="h-40 flex flex-col items-center justify-center bg-zinc-900/40 rounded-2xl border border-dashed border-zinc-800/80">
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Lampu sedang mati</p>
              <p className="text-[10px] text-zinc-600 mt-1">Nyalakan lampu untuk mengatur pencahayaan</p>
            </div>
          )}
        </div>
      )}

      {/* Connection / Diagnostics Toast Message */}
      {statusMessage && (
        <div className="p-3 bg-zinc-950 border border-zinc-900 rounded-xl flex items-center justify-center text-[10px] font-mono font-medium text-[#F97316] animate-fade-in leading-normal text-center">
          {loading ? <RefreshCw className="animate-spin text-[#F97316] mr-2 shrink-0" size={12} /> : null}
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Time-based light scheduler */}
      <LightScheduler lamps={lamps} />
    </div>
  );
}

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function LightScheduler({ lamps }: { lamps: WizLampConfig[] }) {
  const [schedules, setSchedules] = useState<LightSchedule[]>([]);
  const [time, setTime] = useState('18:00');
  const [deviceId, setDeviceId] = useState('all');
  const [command, setCommand] = useState<'on' | 'off'>('on');
  const [days, setDays] = useState<number[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lampOptions = [{ id: 'all', name: 'Semua Lampu' }, ...lamps.map((l) => ({ id: l.id, name: l.name }))];

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/nvr/schedules');
      const d = await r.json();
      if (d.success) setSchedules(d.schedules);
    } catch {
      /* offline / not on LAN */
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const persist = async (next: LightSchedule[]) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/nvr/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedules: next }),
      });
      const d = await r.json();
      if (d.success) {
        setSchedules(d.schedules);
        setMsg('Jadwal disimpan');
      } else {
        setMsg(d.message || 'Gagal menyimpan jadwal');
      }
    } catch {
      setMsg('Gagal terhubung ke server');
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 3000);
    }
  };

  const toggleDay = (d: number) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  };

  const addSchedule = () => {
    if (!/^\d{2}:\d{2}$/.test(time)) {
      setMsg('Format jam tidak valid');
      return;
    }
    const lampName = lampOptions.find((l) => l.id === deviceId)?.name || 'Lampu';
    const newSchedule: LightSchedule = {
      id: `sch-${Date.now()}`,
      name: `${lampName} ${command === 'on' ? 'Nyala' : 'Mati'} ${time}`,
      enabled: true,
      time,
      days,
      action: { deviceType: 'wiz', deviceId, command },
    };
    persist([...schedules, newSchedule]);
  };

  const toggleSchedule = (id: string) => {
    persist(schedules.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  };

  const removeSchedule = async (id: string) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/nvr/schedules/${id}`, { method: 'DELETE' });
      const d = await r.json();
      if (d.success) setSchedules(d.schedules);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const daysLabel = (ds: number[]) => (ds.length === 0 ? 'Setiap hari' : ds.map((d) => DAY_LABELS[d]).join(', '));

  return (
    <div className="bg-zinc-950/40 rounded-2xl p-4 border border-zinc-800/60 space-y-4">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-xl bg-orange-500/10 text-[#F97316] border border-orange-500/20">
          <Clock size={16} />
        </div>
        <div>
          <h3 className="font-extrabold text-white text-sm tracking-wide uppercase">Jadwal Lampu Otomatis</h3>
          <p className="text-[10px] text-zinc-500">Nyalakan / matikan lampu otomatis pada jam tertentu</p>
        </div>
      </div>

      {/* Form aturan baru */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/70 p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest pl-0.5 block">Jam</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full bg-[#1C1C1F] border border-zinc-800 text-xs font-bold text-white rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-[#F97316]/50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest pl-0.5 block">Aksi</label>
            <div className="flex bg-[#1C1C1F] p-1 rounded-lg border border-zinc-800">
              <button
                onClick={() => setCommand('on')}
                className={`flex-1 py-1.5 text-[10px] font-black uppercase rounded-md transition-all cursor-pointer ${command === 'on' ? 'bg-[#F97316] text-white' : 'text-zinc-500'}`}
              >
                Nyala
              </button>
              <button
                onClick={() => setCommand('off')}
                className={`flex-1 py-1.5 text-[10px] font-black uppercase rounded-md transition-all cursor-pointer ${command === 'off' ? 'bg-zinc-700 text-white' : 'text-zinc-500'}`}
              >
                Mati
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest pl-0.5 block">Lampu</label>
          <select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="w-full bg-[#1C1C1F] border border-zinc-800 text-xs font-bold text-[#F97316] rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-[#F97316]/50"
          >
            {lampOptions.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest pl-0.5 block">Hari (kosongkan = setiap hari)</label>
          <div className="flex flex-wrap gap-1.5">
            {DAY_LABELS.map((label, idx) => (
              <button
                key={label}
                onClick={() => toggleDay(idx)}
                className={`px-2.5 py-1.5 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                  days.includes(idx)
                    ? 'bg-[#F97316] text-white border-[#F97316]'
                    : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:text-zinc-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={addSchedule}
          disabled={busy}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-[#F97316] text-white text-xs font-black uppercase tracking-wider rounded-xl hover:bg-orange-600 transition-all cursor-pointer disabled:opacity-50"
        >
          <Plus size={14} /> Tambah Jadwal
        </button>
      </div>

      {/* Daftar jadwal */}
      {schedules.length === 0 ? (
        <p className="text-[10px] text-zinc-600 text-center py-3">Belum ada jadwal. Tambahkan di atas.</p>
      ) : (
        <div className="space-y-2">
          {schedules.map((s) => (
            <div key={s.id} className="p-3 bg-zinc-900/40 rounded-xl border border-zinc-800/60 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`font-mono font-black text-base ${s.enabled ? 'text-[#F97316]' : 'text-zinc-600'}`}>{s.time}</span>
                <div className="min-w-0">
                  <p className={`text-xs font-bold truncate ${s.enabled ? 'text-white' : 'text-zinc-500'}`}>
                    {(lampOptions.find((l) => l.id === s.action.deviceId)?.name) || 'Lampu'} · {s.action.command === 'on' ? 'Nyala' : 'Mati'}
                  </p>
                  <p className="text-[9px] text-zinc-500 truncate">{daysLabel(s.days)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => toggleSchedule(s.id)}
                  className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg border transition-all cursor-pointer ${
                    s.enabled
                      ? 'bg-orange-500/10 text-[#F97316] border-orange-500/20'
                      : 'bg-zinc-950 text-zinc-500 border-zinc-900'
                  }`}
                >
                  {s.enabled ? 'Aktif' : 'Nonaktif'}
                </button>
                <button
                  onClick={() => removeSchedule(s.id)}
                  className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                  title="Hapus jadwal"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {msg && (
        <div className="text-[10px] font-mono font-medium text-center text-[#F97316] animate-fade-in">{msg}</div>
      )}
    </div>
  );
}
