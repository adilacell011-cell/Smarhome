import { LayoutDashboard, Lightbulb, Video, Wifi, Settings } from 'lucide-react';
import { motion } from 'motion/react';

export type TabId = 'dashboard' | 'devices' | 'cctv' | 'router' | 'settings';

interface BottomNavProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
}

export default function BottomNav({ activeTab, setActiveTab }: BottomNavProps) {
  const navItems = [
    { id: 'dashboard' as TabId, label: 'Beranda', icon: LayoutDashboard },
    { id: 'devices' as TabId, label: 'Lampu', icon: Lightbulb },
    { id: 'cctv' as TabId, label: 'Kamera', icon: Video },
    { id: 'router' as TabId, label: 'Sinyal', icon: Wifi },
    { id: 'settings' as TabId, label: 'Setelan', icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#0E0E11]/95 backdrop-blur-2xl border-t border-[#1F1F24] p-1 z-45 max-w-md mx-auto">
      <div className="flex justify-around items-center h-14">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className="relative flex-1 flex flex-col items-center justify-center h-full focus:outline-none cursor-pointer group"
            >
              {/* Material 3 capsule pill container */}
              <div className="relative py-1 px-5 rounded-full flex items-center justify-center transition-all duration-300">
                {isActive && (
                  <motion.div
                    layoutId="activeTabPill"
                    className="absolute inset-0 bg-[#F97316]/15 rounded-full"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
                <Icon 
                  size={18} 
                  className={`relative transition-all duration-300 ${
                    isActive ? 'text-[#F97316] stroke-[2.5] scale-110' : 'text-zinc-500 group-hover:text-zinc-300 stroke-[2]'
                  }`} 
                />
              </div>
              
              {/* Label */}
              <span 
                className={`text-[8px] sm:text-[9px] mt-1 transition-all duration-300 tracking-wider font-extrabold uppercase ${
                  isActive ? 'text-white' : 'text-zinc-500'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

