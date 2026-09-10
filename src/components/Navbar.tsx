import React from 'react';
import {
  PenLine,
  Network,
  MessageSquareQuote,
  Sparkles,
  Database,
  Plus,
  Mic,
  Image as ImageIcon,
  BookOpen,
} from 'lucide-react';

export type ActiveTab = 'editor' | 'graph' | 'recall' | 'curator' | 'digest' | 'vault';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onNewNote: () => void;
  onOpenVoiceModal: () => void;
  onOpenImageModal: () => void;
  notesCount: number;
  unreadAgentIssuesCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onNewNote,
  onOpenVoiceModal,
  onOpenImageModal,
  notesCount,
  unreadAgentIssuesCount,
}) => {
  return (
    <header className="sticky top-0 z-30 pt-[env(safe-area-inset-top)] bg-stone-950/95 text-stone-100 border-b border-stone-800/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 lg:h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-2.5 sm:space-x-3">
          <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-gradient-to-br from-amber-500/25 via-amber-600/15 to-stone-900 border border-amber-500/40 shadow-inner shadow-amber-500/10 flex items-center justify-center text-amber-400 font-serif font-bold text-base lg:text-lg">
            Æ
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center space-x-2">
              <span className="font-semibold tracking-tight text-white text-base">
                AetherMind
              </span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded-md bg-stone-900 text-amber-400 border border-amber-500/30 shadow-xs">
                AI-Native PKM
              </span>
            </div>
            <p className="text-xs text-stone-400 hidden sm:block">
              저장을 넘어 이해로: 의미적 지식 관리 & 대화형 회상
            </p>
          </div>
        </div>

        {/* Tab Navigation (Desktop only - mobile uses bottom bar) */}
        <nav className="hidden lg:flex items-center space-x-1 sm:space-x-1.5">
          <button
            id="nav-tab-editor"
            onClick={() => setActiveTab('editor')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
              activeTab === 'editor'
                ? 'bg-stone-800 text-amber-300 border border-stone-700/80 ring-1 ring-white/5'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-850/60'
            }`}
          >
            <PenLine className="w-4 h-4" />
            <span>지능형 캡처</span>
          </button>

          <button
            id="nav-tab-graph"
            onClick={() => setActiveTab('graph')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
              activeTab === 'graph'
                ? 'bg-stone-800 text-amber-300 border border-stone-700/80 ring-1 ring-white/5'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-850/60'
            }`}
          >
            <Network className="w-4 h-4" />
            <span>의미 그래프</span>
          </button>

          <button
            id="nav-tab-recall"
            onClick={() => setActiveTab('recall')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
              activeTab === 'recall'
                ? 'bg-stone-800 text-amber-300 border border-stone-700/80 ring-1 ring-white/5'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-850/60'
            }`}
          >
            <MessageSquareQuote className="w-4 h-4" />
            <span>대화형 회상</span>
          </button>

          <button
            id="nav-tab-curator"
            onClick={() => setActiveTab('curator')}
            className={`relative flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
              activeTab === 'curator'
                ? 'bg-stone-800 text-amber-300 border border-stone-700/80 ring-1 ring-white/5'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-850/60'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>능동적 정리</span>
            {unreadAgentIssuesCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-stone-950 font-bold shadow-xs">
                {unreadAgentIssuesCount}
              </span>
            )}
          </button>

          <button
            id="nav-tab-digest"
            onClick={() => setActiveTab('digest')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
              activeTab === 'digest'
                ? 'bg-stone-800 text-amber-300 border border-stone-700/80 ring-1 ring-white/5'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-850/60'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>다이제스트</span>
          </button>

          <button
            id="nav-tab-vault"
            onClick={() => setActiveTab('vault')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
              activeTab === 'vault'
                ? 'bg-stone-800 text-amber-300 border border-stone-700/80 ring-1 ring-white/5'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-850/60'
            }`}
          >
            <Database className="w-4 h-4" />
            <span className="hidden md:inline">보관소 & 프라이버시</span>
            <span className="md:hidden">보관소</span>
          </button>
        </nav>

        {/* Action Controls */}
        <div className="flex items-center space-x-2">
          <button
            id="btn-voice-capture"
            onClick={onOpenVoiceModal}
            title="음성 메모 캡처"
            className="p-2 rounded-lg bg-stone-900/60 hover:bg-stone-800 text-stone-400 hover:text-white border border-stone-800/80 shadow-xs transition-colors"
          >
            <Mic className="w-4 h-4" />
          </button>

          <button
            id="btn-image-capture"
            onClick={onOpenImageModal}
            title="이미지/도표 지식 추출"
            className="p-2 rounded-lg bg-stone-900/60 hover:bg-stone-800 text-stone-400 hover:text-white border border-stone-800/80 shadow-xs transition-colors"
          >
            <ImageIcon className="w-4 h-4" />
          </button>

          <button
            id="btn-new-note"
            onClick={onNewNote}
            className="flex items-center space-x-1 px-3.5 py-1.5 rounded-lg bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-stone-950 text-xs sm:text-sm font-semibold transition-all shadow-md shadow-amber-950/40 hover:shadow-amber-950/60 active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">새 노트</span>
          </button>
        </div>
      </div>
    </header>
  );
};
