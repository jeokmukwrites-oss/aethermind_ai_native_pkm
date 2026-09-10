import React, { useMemo, useState } from 'react';
import {
  Sparkles,
  BookOpen,
  Heart,
  Repeat,
  Quote,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { Note, Digest } from '../types';
import { generateDigest } from '../lib/geminiClient';

interface DigestViewProps {
  notes: Note[];
  onSelectNote: (noteId: string) => void;
  dailyDigest: Digest | null;
  setDailyDigest: React.Dispatch<React.SetStateAction<Digest | null>>;
  weeklyDigest: Digest | null;
  setWeeklyDigest: React.Dispatch<React.SetStateAction<Digest | null>>;
}

function getPeriodNotes(period: 'daily' | 'weekly', notes: Note[]): Note[] {
  // Never send confidential PIN-locked notes' content to an external AI
  // provider — same rule AgentCuratorView applies before its scans.
  const scannableNotes = notes.filter((n) => !(n.isLocked && n.lockType === 'pin'));
  const todayStr = new Date().toISOString().split('T')[0];
  if (period === 'daily') {
    return scannableNotes.filter((n) => n.date === todayStr);
  }
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().split('T')[0];
  return scannableNotes.filter((n) => n.date >= weekAgoStr);
}

// Digest results are owned by App (see dailyDigest/weeklyDigest there) so
// they survive this view unmounting when the user switches tabs — this
// component is lazy-loaded and only rendered while the 다이제스트 tab is active.
export const DigestView: React.FC<DigestViewProps> = ({
  notes,
  onSelectNote,
  dailyDigest,
  setDailyDigest,
  weeklyDigest,
  setWeeklyDigest,
}) => {
  const [period, setPeriod] = useState<'daily' | 'weekly'>('daily');
  const [isGenerating, setIsGenerating] = useState(false);

  const periodNotes = useMemo(() => getPeriodNotes(period, notes), [period, notes]);
  const currentDigest = period === 'daily' ? dailyDigest : weeklyDigest;
  const setCurrentDigest = period === 'daily' ? setDailyDigest : setWeeklyDigest;

  const handleGenerate = async () => {
    if (periodNotes.length === 0) return;
    setIsGenerating(true);
    try {
      const digest = await generateDigest(period, periodNotes);
      setCurrentDigest(digest);
    } catch (err) {
      console.error('Digest generation error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-stone-950 text-stone-100 overflow-y-auto">
      {/* Top Header */}
      <div className="h-14 border-b border-stone-800 px-3 sm:px-6 flex items-center justify-between bg-stone-900/30 sticky top-0 z-10 backdrop-blur-xs">
        <div className="flex items-center space-x-1.5 text-stone-200 text-xs font-semibold min-w-0">
          <BookOpen className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="truncate">일간 · 주간 다이제스트</span>
        </div>

        <div className="flex items-center space-x-1.5 bg-stone-900 p-1 rounded-xl border border-stone-800">
          <button
            id="btn-digest-period-daily"
            onClick={() => setPeriod('daily')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              period === 'daily'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            오늘 (Daily)
          </button>
          <button
            id="btn-digest-period-weekly"
            onClick={() => setPeriod('weekly')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              period === 'weekly'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            이번 주 (Weekly)
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6 max-w-3xl w-full mx-auto space-y-6 pb-10">
        {/* Controls */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-stone-500">
            {periodNotes.length > 0
              ? `${period === 'daily' ? '오늘' : '최근 7일간'} 작성된 노트 ${periodNotes.length}개를 바탕으로 회고 리포트를 만듭니다.`
              : `${period === 'daily' ? '오늘' : '최근 7일간'} 작성된 노트가 없습니다.`}
          </span>
          <button
            id="btn-generate-digest"
            onClick={handleGenerate}
            disabled={isGenerating || periodNotes.length === 0}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-xs font-semibold transition-colors shadow-sm"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>기록을 분석하여 요약 중...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>다이제스트 새로 생성하기</span>
              </>
            )}
          </button>
        </div>

        {/* Content */}
        {isGenerating ? (
          <div className="py-20 text-center flex flex-col items-center justify-center gap-3 text-xs text-stone-400">
            <Sparkles className="w-8 h-8 text-amber-400 animate-spin" />
            <p className="text-sm text-stone-300">기록들의 흐름과 주제를 엮어 이야기를 빚어내고 있습니다...</p>
          </div>
        ) : currentDigest ? (
          <div className="space-y-6">
            {/* Title & Date */}
            <div className="border-b border-stone-800 pb-4">
              <span className="text-[11px] font-mono uppercase tracking-widest text-amber-400/90 block mb-1">
                {currentDigest.dateLabel} · {currentDigest.noteCount}개의 노트 기반
              </span>
              <h3 className="text-xl sm:text-2xl font-semibold text-stone-100 leading-snug">
                {currentDigest.title}
              </h3>
            </div>

            {/* Summary */}
            <div className="p-4 rounded-2xl bg-stone-900/90 border border-stone-800 text-sm text-stone-200 leading-relaxed">
              {currentDigest.summary}
            </div>

            {/* Highlights */}
            {currentDigest.highlights.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>핵심 하이라이트</span>
                </h4>
                <div className="grid gap-2">
                  {currentDigest.highlights.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-stone-900/90 border border-stone-800 text-xs text-stone-300 flex items-start gap-2.5"
                    >
                      <span className="text-amber-400 font-mono font-bold text-xs mt-0.5">
                        0{idx + 1}
                      </span>
                      <span className="leading-relaxed">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Emotional Arc & Themes */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="p-4 rounded-2xl bg-stone-900/90 border border-stone-800 space-y-2">
                <h4 className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5 text-rose-400" />
                  <span>흐름의 궤적</span>
                </h4>
                <p className="text-xs text-stone-300 leading-relaxed">{currentDigest.emotionalArc}</p>
              </div>

              <div className="p-4 rounded-2xl bg-stone-900/90 border border-stone-800 space-y-2">
                <h4 className="text-xs font-semibold text-sky-300 flex items-center gap-1.5">
                  <Repeat className="w-3.5 h-3.5 text-sky-400" />
                  <span>반복된 주제</span>
                </h4>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {currentDigest.recurringThemes.map((theme, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-lg bg-stone-950 border border-stone-800 text-[11px] text-stone-300"
                    >
                      {theme}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Quote */}
            {currentDigest.quoteOfThePeriod && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3">
                <Quote className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-[11px] font-medium text-amber-300 block mb-1">
                    이 기간의 마음에 남는 한 줄
                  </span>
                  <p className="italic text-sm text-stone-100 leading-relaxed">
                    "{currentDigest.quoteOfThePeriod}"
                  </p>
                </div>
              </div>
            )}

            {/* Source notes */}
            <div className="flex flex-wrap gap-1.5 items-center pt-2">
              <span className="text-[11px] text-stone-500">기반 노트:</span>
              {periodNotes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onSelectNote(n.id)}
                  className="text-[11px] px-2 py-0.5 rounded bg-stone-900 text-amber-400 border border-stone-800 hover:bg-stone-800 flex items-center gap-1"
                >
                  <span className="max-w-[160px] truncate">{n.title}</span>
                  <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-16 text-center text-xs text-stone-500 space-y-3">
            <p>아직 생성된 다이제스트가 없습니다.</p>
            <p className="max-w-sm mx-auto">
              위의 '다이제스트 새로 생성하기' 버튼을 누르면 이 기간의 노트를 모아 AI가 회고 리포트를 작성합니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
