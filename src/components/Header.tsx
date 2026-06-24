import { useState, useEffect } from 'react';
import { ShieldCheck, Cpu, Clock } from 'lucide-react';

export default function Header() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  return (
    <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800/40 pb-5">
      <div className="flex items-center gap-4.5">
        <div className="w-12 h-12 bg-zinc-900 border border-orange-500/20 rounded-2xl flex items-center justify-center text-[#F97316] shadow-sm shadow-orange-500/5">
          <ShieldCheck size={24} className="stroke-[1.5]" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-wider text-white uppercase font-sans">
            Adilanet
          </h1>
          <p className="text-[10px] text-zinc-400 font-bold tracking-widest uppercase mt-0.5">
            Dasbord Control
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-4">
        {/* System Online Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/60 border border-zinc-800/50">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
            System Online
          </span>
        </div>

        {/* Date / Time Status */}
        <div className="text-right flex items-center gap-3 bg-zinc-900/40 px-4 py-1.5 rounded-2xl border border-zinc-800/20">
          <Clock size={14} className="text-[#F97316]" />
          <div>
            <p className="text-xs font-bold text-white font-mono tracking-tight">{formatTime(time)}</p>
            <p className="text-[9px] text-zinc-400 font-semibold uppercase tracking-wider">{formatDate(time)}</p>
          </div>
        </div>
      </div>
    </header>
  );
}

