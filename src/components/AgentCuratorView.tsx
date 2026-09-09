import React from 'react';
import {
  Sparkles,
  AlertTriangle,
  Clock,
  Layers,
  CheckCircle2,
  ExternalLink,
  Plus,
  Loader2,
  RefreshCw,
  HelpCircle,
  ShieldAlert,
} from 'lucide-react';
import Markdown from 'react-markdown';
import { Note, ContradictionIssue, StaleNoteIssue, SynthesisProposal } from '../types';
import { runAgenticScan } from '../lib/geminiClient';

interface AgentCuratorViewProps {
  notes: Note[];
  onSelectNote: (noteId: string) => void;
  onCreateSynthesisNote: (title: string, content: string) => void;
  isScanning: boolean;
  setIsScanning: React.Dispatch<React.SetStateAction<boolean>>;
  lastScanTime: string | null;
  setLastScanTime: React.Dispatch<React.SetStateAction<string | null>>;
  contradictions: ContradictionIssue[];
  setContradictions: React.Dispatch<React.SetStateAction<ContradictionIssue[]>>;
  staleNotes: StaleNoteIssue[];
  setStaleNotes: React.Dispatch<React.SetStateAction<StaleNoteIssue[]>>;
  synthesisProposals: SynthesisProposal[];
  setSynthesisProposals: React.Dispatch<React.SetStateAction<SynthesisProposal[]>>;
}

// Scan results are owned by App (see INITIAL_AGENT_REPORT there) so they
// survive this view unmounting when the user switches tabs — this component
// is lazy-loaded and only rendered while the 정리 tab is active.
export const AgentCuratorView: React.FC<AgentCuratorViewProps> = ({
  notes,
  onSelectNote,
  onCreateSynthesisNote,
  isScanning,
  setIsScanning,
  lastScanTime,
  setLastScanTime,
  contradictions,
  setContradictions,
  staleNotes,
  setStaleNotes,
  synthesisProposals,
  setSynthesisProposals,
}) => {
  const handleRunScan = async () => {
    setIsScanning(true);
    try {
      // Never send confidential PIN-locked notes' content to an external AI provider.
      const scannableNotes = notes.filter((n) => !(n.isLocked && n.lockType === 'pin'));
      const result = await runAgenticScan(scannableNotes);
      if (result.contradictions && result.contradictions.length > 0) {
        setContradictions(
          result.contradictions.map((c: any, idx: number) => ({
            id: `c-${Date.now()}-${idx}`,
            noteIdA: c.noteIdA,
            noteTitleA: c.noteTitleA,
            noteIdB: c.noteIdB,
            noteTitleB: c.noteTitleB,
            explanation: c.explanation,
            suggestedResolution: c.suggestedResolution,
            resolved: false,
          }))
        );
      }

      if (result.staleNotes && result.staleNotes.length > 0) {
        setStaleNotes(
          result.staleNotes.map((s: any, idx: number) => ({
            id: `s-${Date.now()}-${idx}`,
            noteId: s.noteId,
            noteTitle: s.noteTitle,
            reason: s.reason,
            suggestedAction: s.suggestedAction,
            resolved: false,
          }))
        );
      }

      if (result.synthesisProposals && result.synthesisProposals.length > 0) {
        setSynthesisProposals(
          result.synthesisProposals.map((sp: any, idx: number) => ({
            id: `sp-${Date.now()}-${idx}`,
            title: sp.title,
            sourceNoteIds: sp.sourceNoteIds,
            sourceNoteTitles: sp.sourceNoteTitles,
            synthesisSummary: sp.synthesisSummary,
            draftContent: sp.draftContent,
            status: 'pending',
          }))
        );
      }

      setLastScanTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.error('Scan error:', err);
    } finally {
      setIsScanning(false);
    }
  };

  const handleApplySynthesis = (prop: SynthesisProposal) => {
    onCreateSynthesisNote(prop.title, prop.draftContent);
    setSynthesisProposals((prev) =>
      prev.map((p) => (p.id === prop.id ? { ...p, status: 'applied' } : p))
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-stone-950 text-stone-100 overflow-y-auto">
      {/* Top Header */}
      <div className="h-14 border-b border-stone-800 px-3 sm:px-6 flex items-center justify-between bg-stone-900/30 sticky top-0 z-10 backdrop-blur-xs">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="flex items-center space-x-1.5 text-stone-200 text-xs font-semibold min-w-0">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate">능동적 지식 큐레이터</span>
          </div>
          {lastScanTime && (
            <span className="text-[11px] text-stone-500">
              최근 스캔: {lastScanTime}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-3">
          {/* Why better than Obsidian badge */}
          <div className="hidden lg:flex items-center space-x-2 text-[11px] text-stone-400 bg-stone-950/80 px-3 py-1 rounded-full border border-stone-800">
            <span className="text-amber-400 font-semibold">✦ Obsidian 대비 차별점:</span>
            <span>노트가 방치되지 않도록 에이전트가 생각 간 모순과 노후 메모를 찾아 종합 초안을 먼저 제안합니다.</span>
          </div>

          <button
            id="btn-run-agent-scan"
            onClick={handleRunScan}
            disabled={isScanning}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-xs font-semibold transition-colors shadow-sm"
          >
            {isScanning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>지식 베이스 스캔 중...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>지식 건강 스캔 실행</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6 max-w-5xl w-full mx-auto space-y-8 pb-10">
        {/* Section 1: Contradictions */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-md bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/40">
                <ShieldAlert className="w-3.5 h-3.5" />
              </div>
              <h3 className="font-semibold text-xs sm:text-sm text-stone-100">
                1. 상충 주장 & 모순점 ({contradictions.filter((c) => !c.resolved).length}건)
              </h3>
            </div>
            <span className="hidden md:inline text-xs text-stone-500">
              서로 반대되거나 충돌하는 두 메모를 비교하여 논리적 불일치를 해결하도록 유도합니다.
            </span>
          </div>

          <div className="space-y-3">
            {contradictions.map((c) => (
              <div
                key={c.id}
                className={`p-4 rounded-xl border transition-all space-y-3 ${
                  c.resolved
                    ? 'bg-stone-900/40 border-stone-800 opacity-60'
                    : 'bg-stone-900/90 border-rose-900/40 shadow-sm'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
                  <div className="flex flex-col sm:flex-row sm:items-stretch sm:space-x-2 space-y-2 sm:space-y-0 text-xs font-medium">
                    <button
                      onClick={() => onSelectNote(c.noteIdA)}
                      className="text-amber-400 hover:underline flex items-center space-x-1"
                    >
                      <span className="line-clamp-2">노트 A: {c.noteTitleA}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </button>
                    <span className="text-rose-400 font-bold shrink-0">VS</span>
                    <button
                      onClick={() => onSelectNote(c.noteIdB)}
                      className="text-amber-400 hover:underline flex items-center space-x-1"
                    >
                      <span className="line-clamp-2">노트 B: {c.noteTitleB}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </button>
                  </div>

                  <button
                    onClick={() =>
                      setContradictions((prev) =>
                        prev.map((item) =>
                          item.id === c.id ? { ...item, resolved: !item.resolved } : item
                        )
                      )
                    }
                    className={`text-xs px-2.5 py-1 rounded-md border flex items-center space-x-1 transition-colors ${
                      c.resolved
                        ? 'bg-stone-800 text-stone-400 border-stone-700'
                        : 'bg-rose-950/60 text-rose-300 border-rose-800 hover:bg-rose-900'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{c.resolved ? '해결됨' : '해결 완료로 표시'}</span>
                  </button>
                </div>

                <div className="p-3 bg-stone-950/70 rounded-lg border border-stone-800 text-xs space-y-1.5 text-stone-300 leading-relaxed">
                  <p>
                    <strong className="text-rose-400">발견된 충돌 내용:</strong> {c.explanation}
                  </p>
                  <p className="text-stone-400">
                    <strong className="text-amber-400">에이전트 제안 해결책:</strong>{' '}
                    {c.suggestedResolution}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 2: Stale Notes */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/40">
                <Clock className="w-3.5 h-3.5" />
              </div>
              <h3 className="font-semibold text-sm text-stone-100">
                2. 노후 메모 및 업데이트 점검 ({staleNotes.filter((s) => !s.resolved).length}건)
              </h3>
            </div>
            <span className="text-xs text-stone-500">
              미해결 질문이 장시간 방치되었거나 후속 업데이트가 필요한 메모입니다.
            </span>
          </div>

          <div className="space-y-3">
            {staleNotes.map((s) => (
              <div
                key={s.id}
                className="p-4 rounded-xl bg-stone-900/90 border border-stone-800 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-200">
                    {s.noteTitle}
                  </span>
                  <button
                    onClick={() => onSelectNote(s.noteId)}
                    className="px-2.5 py-1 rounded-md bg-stone-800 hover:bg-stone-700 text-amber-400 text-xs flex items-center space-x-1"
                  >
                    <span>노트 열기</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>

                <div className="text-xs text-stone-400 space-y-1 bg-stone-950/60 p-3 rounded-lg border border-stone-800/80">
                  <p>
                    <span className="text-stone-300 font-medium">플래그 사유:</span> {s.reason}
                  </p>
                  <p>
                    <span className="text-amber-400 font-medium">권장 액션:</span>{' '}
                    {s.suggestedAction}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: Synthesis Proposals */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-md bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/40">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <h3 className="font-semibold text-sm text-stone-100">
                3. 종합 노트 제안 (Synthesis Draft Proposals)
              </h3>
            </div>
            <span className="text-xs text-stone-500">
              흩어진 메모 클러스터를 하나의 완성된 종합 인사이트 노트로 묶어 제안합니다.
            </span>
          </div>

          <div className="space-y-4">
            {synthesisProposals.map((prop) => (
              <div
                key={prop.id}
                className="p-5 rounded-xl bg-stone-900/90 border border-sky-900/30 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                      통합 클러스터 ({prop.sourceNoteTitles.length}개 노트)
                    </span>
                    <h4 className="text-sm font-bold text-white mt-1.5">
                      {prop.title}
                    </h4>
                  </div>

                  <button
                    onClick={() => handleApplySynthesis(prop)}
                    disabled={prop.status === 'applied'}
                    className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-stone-950 text-xs font-semibold flex items-center space-x-1.5 transition-colors self-start sm:self-auto"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{prop.status === 'applied' ? '생성 완료됨' : '새 종합 노트로 생성'}</span>
                  </button>
                </div>

                <p className="text-xs text-stone-300 leading-relaxed">
                  {prop.synthesisSummary}
                </p>

                {/* Source Notes */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[11px] text-stone-500">기반 메모:</span>
                  {prop.sourceNoteTitles.map((t, idx) => (
                    <span
                      key={idx}
                      className="text-[11px] px-2 py-0.5 rounded bg-stone-950 text-stone-300 border border-stone-800"
                    >
                      {t}
                    </span>
                  ))}
                </div>

                {/* Draft Content Preview */}
                <div className="bg-stone-950 p-3.5 rounded-lg border border-stone-800 max-h-48 overflow-y-auto text-xs font-mono text-stone-300 whitespace-pre-wrap leading-relaxed">
                  {prop.draftContent}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
