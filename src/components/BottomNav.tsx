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
    <nav className="fixed bottom-4 left-4 right-4 bg-[#121214]/90 backdrop-blur-xl border border-zinc-800/80 p-2 z-50 rounded-2xl shadow-2xl max-w-lg mx-auto">
      <div className="flex justify-around items-center">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`relative flex flex-col items-center gap-1.5 py-2 px-3.5 rounded-xl transition-all duration-300 group ${
                isActive
                  ? 'text-[#F97316] font-extrabold scale-105 bg-[#1C1C1F]'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon size={20} className={isActive ? 'stroke-[2.5]' : 'stroke-[2]'} />
              <span className="text-[10px] tracking-widest font-bold uppercase">{item.label}</span>
              
              {/* Premium indicator dot shown in screenshots */}
              {isActive && (
                <span className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-[#F97316] shadow-md shadow-orange-500/80 animate-pulse"></span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

