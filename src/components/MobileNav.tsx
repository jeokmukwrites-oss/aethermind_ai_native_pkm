import React from 'react';
import { PenLine, Network, MessageSquareQuote, Sparkles, Database } from 'lucide-react';
import { ActiveTab } from './Navbar';

interface MobileNavProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  unreadAgentIssuesCount: number;
}

const MOBILE_TABS: Array<{ id: ActiveTab; label: string; icon: React.ElementType }> = [
  { id: 'editor', label: '캡처', icon: PenLine },
  { id: 'graph', label: '그래프', icon: Network },
  { id: 'recall', label: '회상', icon: MessageSquareQuote },
  { id: 'curator', label: '정리', icon: Sparkles },
  { id: 'vault', label: '보관소', icon: Database },
];

export const MobileNav: React.FC<MobileNavProps> = ({ activeTab, setActiveTab, unreadAgentIssuesCount }) => {
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-stone-950/95 border-t border-stone-800/80 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch justify-around px-1">
        {MOBILE_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex flex-col items-center justify-center flex-1 py-2.5 min-w-0 transition-colors ${
                isActive ? 'text-amber-400' : 'text-stone-500 hover:text-stone-300'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.2 : 1.8} />
                {tab.id === 'curator' && unreadAgentIssuesCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 px-1 min-w-[16px] h-4 rounded-full bg-amber-500 text-stone-950 text-[9px] font-bold flex items-center justify-center">
                    {unreadAgentIssuesCount}
                  </span>
                )}
              </div>
              <span className={`text-[10px] mt-0.5 ${isActive ? 'font-semibold' : 'font-medium'}`}>
                {tab.label}
              </span>
              {isActive && (
                <span className="absolute top-0 w-8 h-0.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};