import React from 'react';
import {
  Sparkles,
  Link2,
  Check,
  X,
  ExternalLink,
  BookOpen,
  HelpCircle,
  Lightbulb,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { Note, NoteRelation, RelationType } from '../types';

interface RealtimeSidebarProps {
  currentNote: Note;
  relatedMatches: Array<{ note: Note; score: number; matchReasons: string[] }>;
  onSelectNote: (noteId: string) => void;
  onApproveRelation: (relation: NoteRelation) => void;
  onRejectRelation: (relationId: string) => void;
  onInsertMention: (targetTitle: string) => void;
  isAnalyzing: boolean;
  style?: React.CSSProperties;
  className?: string;
}

const RELATION_LABEL_MAP: Record<RelationType, { label: string; color: string }> = {
  CAUSATION: { label: '인과 (Cause)', color: 'bg-emerald-950/80 text-emerald-300 border-emerald-800' },
  CONTRAST: { label: '대조/반론 (Contrast)', color: 'bg-amber-950/80 text-amber-300 border-amber-800' },
  EXTENSION: { label: '확장/심화 (Extension)', color: 'bg-sky-950/80 text-sky-300 border-sky-800' },
  CONTRADICTION: { label: '모순 (Contradiction)', color: 'bg-rose-950/80 text-rose-300 border-rose-800' },
  PREREQUISITE: { label: '선행조건 (Prereq)', color: 'bg-purple-950/80 text-purple-300 border-purple-800' },
};

export const RealtimeSidebar: React.FC<RealtimeSidebarProps> = ({
  currentNote,
  relatedMatches,
  onSelectNote,
  onApproveRelation,
  onRejectRelation,
  onInsertMention,
  isAnalyzing,
  style,
  className,
}) => {
  return (
    <aside
      style={style}
      className={`border-l border-stone-800/80 bg-gradient-to-b from-stone-900/70 via-stone-950/70 to-stone-950 p-4 flex flex-col space-y-5 overflow-y-auto h-full text-stone-200 shrink-0 shadow-lg shadow-black/30 ${
        className !== undefined
          ? className
          : 'w-80 md:w-96 lg:w-[26%] xl:w-[27%] 2xl:w-[28%] min-w-[340px] max-w-[640px]'
      }`}
    >
      {/* Header & Obsidian Comparison Badge */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h4 className="text-sm font-semibold tracking-tight text-stone-100">
              실시간 AI 코파일럿
            </h4>
          </div>
          {isAnalyzing && (
            <span className="text-[11px] text-amber-400 animate-pulse font-medium">
              실시간 맥락 분석 중...
            </span>
          )}
        </div>

        {/* Why better than Obsidian badge */}
        <div className="p-3 rounded-xl bg-gradient-to-br from-stone-950 via-stone-900/60 to-stone-950 border border-stone-800/90 shadow-md shadow-black/30 text-[11px] text-stone-400 leading-relaxed ring-1 ring-white/5">
          <span className="text-amber-400 font-semibold block mb-0.5">
            ✦ Obsidian 대비 차별점
          </span>
          수동으로 [[링크]]를 찾을 필요 없이, 타이핑 흐름에 맞춰 연관 노트와 관계(인과·대조·모순)를 시스템이 능동 제안합니다.
        </div>
      </div>

      {/* Suggested Relations (User Approves / Rejects) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-stone-400 flex items-center space-x-1.5">
            <Link2 className="w-3.5 h-3.5 text-amber-400" />
            <span>AI 추천 관계 엣지</span>
          </h5>
          <span className="text-[10px] text-amber-400/90 font-mono bg-stone-900/80 px-2 py-0.5 rounded-full border border-stone-800">
            {currentNote.suggestedRelations?.filter((r) => r.status === 'pending').length || 0}건 대기
          </span>
        </div>

        {currentNote.suggestedRelations &&
        currentNote.suggestedRelations.filter((r) => r.status === 'pending').length > 0 ? (
          <div className="space-y-2.5">
            {currentNote.suggestedRelations
              .filter((r) => r.status === 'pending')
              .map((rel) => {
                const badge = RELATION_LABEL_MAP[rel.relationType] || {
                  label: rel.relationType,
                  color: 'bg-stone-800 text-stone-300',
                };
                return (
                  <div
                    key={rel.id}
                    className="p-3 rounded-xl bg-gradient-to-b from-stone-900/90 via-stone-900/50 to-stone-950/90 border border-stone-800/90 space-y-2 transition-all hover:border-stone-700/90 shadow-md shadow-black/40 ring-1 ring-white/5"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-md border shadow-xs ${badge.color}`}
                      >
                        {badge.label}
                      </span>
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => onApproveRelation(rel)}
                          title="관계 승인 (지식 그래프에 영구 연결)"
                          className="p-1 rounded-md bg-emerald-950 hover:bg-emerald-900 text-emerald-400 border border-emerald-800/80 transition-colors shadow-xs"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onRejectRelation(rel.id)}
                          title="관계 거절"
                          className="p-1 rounded-md bg-stone-900 hover:bg-rose-950 text-stone-400 hover:text-rose-400 border border-stone-800 transition-colors shadow-xs"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="text-xs font-semibold text-stone-100">
                      → {rel.targetTitle}
                    </div>
                    <p className="text-[11px] text-stone-400 leading-snug">
                      {rel.explanation}
                    </p>
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="p-3.5 text-center border border-dashed border-stone-800/80 rounded-xl text-stone-500 text-xs bg-stone-950/40">
            대기 중인 관계 제안이 없습니다. 저장 시 새로운 관계가 추론됩니다.
          </div>
        )}
      </div>

      {/* Realtime In-Flight Related Notes (RAG) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-stone-400 flex items-center space-x-1.5">
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>실시간 연관 지식 (RAG)</span>
          </h5>
          <span className="text-[10px] text-stone-400 font-mono bg-stone-900/80 px-2 py-0.5 rounded-full border border-stone-800">
            {relatedMatches.length}건 감지
          </span>
        </div>

        {relatedMatches.length > 0 ? (
          <div className="space-y-2.5">
            {relatedMatches.map(({ note, score, matchReasons }) => (
              <div
                key={note.id}
                className="p-3.5 rounded-xl bg-gradient-to-b from-stone-900/90 via-stone-900/50 to-stone-950/90 border border-stone-800/90 hover:border-stone-700/90 hover:shadow-lg hover:shadow-black/50 transition-all space-y-2 group ring-1 ring-white/5"
              >
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold text-stone-200 line-clamp-1 group-hover:text-amber-300 transition-colors">
                    {note.title}
                  </span>
                  <button
                    onClick={() => onSelectNote(note.id)}
                    title="노트 열기"
                    className="opacity-60 group-hover:opacity-100 p-1 text-stone-400 hover:text-white transition-opacity"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>

                <p className="text-[11px] text-stone-400 line-clamp-2 leading-relaxed">
                  {note.summary || note.content.slice(0, 100)}
                </p>

                {/* Match badges */}
                <div className="flex flex-wrap gap-1 pt-1">
                  {matchReasons.slice(0, 2).map((reason, idx) => (
                    <span
                      key={idx}
                      className="text-[9px] px-1.5 py-0.5 rounded-md bg-stone-900/90 text-amber-400/90 border border-stone-800/80 shadow-xs"
                    >
                      {reason}
                    </span>
                  ))}
                  <button
                    onClick={() => onInsertMention(note.title)}
                    className="text-[9px] px-2 py-0.5 rounded-md bg-stone-800/90 hover:bg-stone-700 text-stone-300 ml-auto flex items-center space-x-0.5 border border-stone-700/60 shadow-xs transition-colors"
                    title="노트 인용 삽입"
                  >
                    <span>인용</span>
                    <ArrowRight className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-3.5 text-center border border-dashed border-stone-800/80 rounded-xl text-stone-500 text-xs bg-stone-950/40">
            현재 작성 중인 문맥과 직접 연관된 메모가 아직 없습니다.
          </div>
        )}
      </div>

      {/* Extracted Metadata Inspector */}
      <div className="space-y-3 pt-3 border-t border-stone-800/80">
        <h5 className="text-xs font-semibold uppercase tracking-wider text-stone-400 flex items-center space-x-1.5">
          <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
          <span>구조화된 의미적 메타데이터</span>
        </h5>

        {/* Entities */}
        <div className="space-y-1.5">
          <span className="text-[10px] text-stone-400 uppercase tracking-wider">
            핵심 개념 (Entities)
          </span>
          <div className="flex flex-wrap gap-1.5">
            {currentNote.entities && currentNote.entities.length > 0 ? (
              currentNote.entities.map((ent, idx) => (
                <span
                  key={idx}
                  className="text-xs px-2.5 py-0.5 rounded-full bg-gradient-to-b from-stone-800 to-stone-850 text-stone-200 border border-stone-700/80 shadow-xs"
                >
                  #{ent}
                </span>
              ))
            ) : (
              <span className="text-xs text-stone-500 italic">추출 대기 중</span>
            )}
          </div>
        </div>

        {/* Core Claims */}
        <div className="space-y-1.5">
          <span className="text-[10px] text-stone-400 uppercase tracking-wider flex items-center space-x-1">
            <TrendingUp className="w-3 h-3 text-amber-400" />
            <span>핵심 주장 (Claims)</span>
          </span>
          {currentNote.claims && currentNote.claims.length > 0 ? (
            <ul className="space-y-1.5 text-xs text-stone-300">
              {currentNote.claims.map((claim, idx) => (
                <li
                  key={idx}
                  className="p-2 rounded-lg bg-stone-950/60 border border-stone-800/70 text-stone-300 leading-snug shadow-xs"
                >
                  • {claim}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-xs text-stone-500 italic">저장 시 추출됩니다</span>
          )}
        </div>

        {/* Open Questions */}
        <div className="space-y-1.5">
          <span className="text-[10px] text-stone-400 uppercase tracking-wider flex items-center space-x-1">
            <HelpCircle className="w-3 h-3 text-rose-400" />
            <span>미해결 질문 (Open Questions)</span>
          </span>
          {currentNote.openQuestions && currentNote.openQuestions.length > 0 ? (
            <ul className="space-y-1.5 text-xs text-stone-300">
              {currentNote.openQuestions.map((q, idx) => (
                <li
                  key={idx}
                  className="p-2 rounded-lg bg-rose-950/30 border border-rose-900/40 text-rose-200/90 leading-snug shadow-xs"
                >
                  ? {q}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-xs text-stone-500 italic">저장 시 추론됩니다</span>
          )}
        </div>
      </div>
    </aside>
  );
};
