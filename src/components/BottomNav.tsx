import { LayoutDashboard, Lightbulb, Video, Wifi, Settings } from 'lucide-react';

export type TabId = 'dashboard' | 'devices' | 'cctv' | 'router' | 'settings';

interface BottomNavProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
}

export default function BottomNav({ activeTab, setActiveTab }: BottomNavProps) {
  const navItems = [
    { id: 'dashboard' as TabId, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'devices' as TabId, label: 'Lights', icon: Lightbulb },
    { id: 'cctv' as TabId, label: 'Cameras', icon: Video },
    { id: 'router' as TabId, label: 'Network', icon: Wifi },
    { id: 'settings' as TabId, label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="fixed bottom-4 left-4 right-4 bg-[#121214]/95 backdrop-blur-xl border border-zinc-800/85 p-1.5 z-50 rounded-2xl shadow-2xl max-w-md mx-auto">
      <div className="flex justify-between items-center px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 sm:gap-1 py-1.5 px-1 rounded-xl transition-all duration-300 group cursor-pointer ${
                isActive
                  ? 'text-[#F97316] font-black scale-105 bg-[#1C1C1F]'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon size={16} className={`sm:w-[18px] sm:h-[18px] ${isActive ? 'stroke-[2.5]' : 'stroke-[2]'}`} />
              <span className="text-[8px] sm:text-[9px] font-black tracking-wide uppercase text-center block">
                {item.label}
              </span>
              
              {/* Premium indicator dot shown in screenshots */}
              {isActive && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#F97316] shadow-md shadow-orange-500/80 animate-pulse"></span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

