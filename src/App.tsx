import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Note, ContradictionIssue, StaleNoteIssue, SynthesisProposal, Digest } from './types';
import { getStoredNotes, saveNoteToDB, deleteNoteFromDB } from './lib/storage';
import { syncNotes, SyncStatus } from './lib/sync';
import { consumeBackHandler } from './lib/backHandler';
import { Navbar, ActiveTab } from './components/Navbar';
import { MobileNav } from './components/MobileNav';
import { EditorView } from './components/EditorView';

// Only the editor (default tab) loads eagerly; the rest — including the
// d3-heavy graph view — are code-split so mobile devices on slow networks
// don't pay for them until the tab is actually opened.
const GraphView = lazy(() => import('./components/GraphView').then((m) => ({ default: m.GraphView })));
const RecallView = lazy(() => import('./components/RecallView').then((m) => ({ default: m.RecallView })));
const AgentCuratorView = lazy(() =>
  import('./components/AgentCuratorView').then((m) => ({ default: m.AgentCuratorView }))
);
const VaultView = lazy(() => import('./components/VaultView').then((m) => ({ default: m.VaultView })));
const DigestView = lazy(() => import('./components/DigestView').then((m) => ({ default: m.DigestView })));
const VoiceCaptureModal = lazy(() =>
  import('./components/VoiceCaptureModal').then((m) => ({ default: m.VoiceCaptureModal }))
);
const ImageCaptureModal = lazy(() =>
  import('./components/ImageCaptureModal').then((m) => ({ default: m.ImageCaptureModal }))
);

const TabFallback = () => (
  <div className="flex-1 flex items-center justify-center bg-stone-950">
    <div className="w-6 h-6 border-2 border-stone-700 border-t-amber-400 rounded-full animate-spin" />
  </div>
);

// Curator (능동적 정리) demo seed data, shown until the user runs a real scan.
// Owned here (not inside AgentCuratorView's local state) so the results
// survive the user switching tabs — AgentCuratorView is lazy-loaded and
// unmounts whenever the 정리 tab isn't active.
const INITIAL_CONTRADICTIONS: ContradictionIssue[] = [
  {
    id: 'contra-1',
    noteIdA: 'note-algo-risk-v1',
    noteTitleA: '알고리즘 트레이딩 리스크 관리: 변동성 기반 동적 포지션 사이징',
    noteIdB: 'note-algo-momentum',
    noteTitleB: '고빈도 및 모멘텀 전략: 확실한 알파 구간에서의 레버리지 극대화',
    explanation:
      '노트 A는 변동성 확대 시 즉시 포지션을 50% 축소해야 한다고 주장하는 반면, 노트 B는 승률 65% 이상 구간에서 레버리지를 3배까지 공격적으로 확대해야 한다고 주장하여 직접적인 리스크 원칙 충돌이 발생합니다.',
    suggestedResolution:
      '8월 25일 회고 노트(note-algo-retrospective)에서 레버리지 가설의 오류가 확인되었으므로, 노트 B의 상태를 "실험 종료 및 폐기"로 업데이트하거나 노트 C의 복합 유동성 모델로 통합하세요.',
    resolved: false,
  },
];

const INITIAL_STALE_NOTES: StaleNoteIssue[] = [
  {
    id: 'stale-1',
    noteId: 'note-local-first',
    noteTitle: '로컬 우선(Local-First) 아키텍처와 사용자 데이터 주권',
    reason: '작성일로부터 60일 이상 경과하였으며, "대규모 10만 개 이상 노트에서 브라우저 WASM 벡터 인덱스의 메모리 한계"에 대한 미해결 질문이 남아 있습니다.',
    suggestedAction: '최신 IndexedDB 벤치마크 결과 또는 파이썬 로컬 백엔드 연동 계획을 메모에 추가하세요.',
    resolved: false,
  },
];

const INITIAL_SYNTHESIS_PROPOSALS: SynthesisProposal[] = [
  {
    id: 'synth-1',
    title: '종합 보고서: 개인 지식 관리(PKM)와 LLM 자율 에이전트의 메모리 공통 모델',
    sourceNoteIds: ['note-ai-agent-memory', 'note-pkm-philosophy', 'note-local-first'],
    sourceNoteTitles: [
      'LLM 자율 에이전트의 다층 메모리 아키텍처와 시맨틱 지식 그래프',
      'AI 네이티브 PKM 시스템의 철학: 저장(Storage)에서 이해(Understanding)로',
      '로컬 우선(Local-First) 아키텍처와 사용자 데이터 주권',
    ],
    synthesisSummary:
      '분산된 세 개의 아키텍처 메모를 하나의 통합 프레임워크("인간과 AI의 하이브리드 연상 지식 메모리")로 결합한 종합 노트 제안입니다.',
    draftContent: `# 종합 노트: 인간과 AI의 하이브리드 연상 지식 메모리

## 개요
이 문서는 다음 세 가지 개별 메모의 핵심 통찰을 하나로 통합한 종합 연구 초안입니다:
1. **에이전트 메모리 구조**: 에피소딕(시간) + 시맨틱(의미 그래프) 계층 분리
2. **PKM 철학**: 수동 위키링크를 대체하는 RAG 기반 지능형 연상 및 대화형 회상
3. **로컬 우선 주권**: 브라우저 IndexedDB 기반의 클라이언트 우선 프라이버시

## 통합 아키텍처 결론
- 지식의 본질은 "정적 저장고"가 아니라 "동적으로 상호작용하는 인지적 에이전트"이다.
- 모든 지식 단위는 시간(Date)과 의미적 엣지(인과, 모순, 확장)를 통해 스스로를 정합화해야 한다.`,
    status: 'pending',
  },
];

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');

  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [showExitHint, setShowExitHint] = useState(false);
  const lastBackPressRef = useRef(0);

  // Mobile-only screen within the 캡처 tab: list-first, drilling into the
  // note editor on selection — kept in App (not EditorView) so it survives
  // EditorView unmounting when the user switches tabs and back.
  const [mobileScreen, setMobileScreen] = useState<'list' | 'note'>('list');

  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    state: 'idle',
    lastSyncAt: null,
    message: '',
  });
  const syncTimerRef = useRef<number | null>(null);

  // Agentic curator scan state — lifted up here (not local to
  // AgentCuratorView) so results survive the user switching away from the
  // 정리 tab and back; see the component for why.
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<string | null>(null);
  const [contradictions, setContradictions] = useState<ContradictionIssue[]>(INITIAL_CONTRADICTIONS);
  const [staleNotes, setStaleNotes] = useState<StaleNoteIssue[]>(INITIAL_STALE_NOTES);
  const [synthesisProposals, setSynthesisProposals] = useState<SynthesisProposal[]>(
    INITIAL_SYNTHESIS_PROPOSALS
  );
  const unreadAgentIssuesCount =
    contradictions.filter((c) => !c.resolved).length + staleNotes.filter((s) => !s.resolved).length;

  // Digest results — lifted up here (not local to DigestView) so the last
  // generated daily/weekly digest survives switching away from the
  // 다이제스트 tab and back; see the component for why.
  const [dailyDigest, setDailyDigest] = useState<Digest | null>(null);
  const [weeklyDigest, setWeeklyDigest] = useState<Digest | null>(null);

  const runSync = useCallback(
    async (reloadAfter: boolean) => {
      setSyncStatus((prev) => ({
        ...prev,
        state: 'syncing',
        message: '동기화 진행 중...',
      }));
      const result = await syncNotes();
      if (result.ok) {
        setSyncStatus({
          state: 'synced',
          lastSyncAt: new Date().toISOString(),
          message: '동기화 완료',
        });
        if (reloadAfter && result.notes) {
          setNotes(result.notes);
          setSelectedNoteId((prev) =>
            prev && result.notes!.some((n) => n.id === prev)
              ? prev
              : result.notes![0]?.id ?? null
          );
        }
      } else {
        setSyncStatus({
          state: 'offline',
          lastSyncAt: null,
          message: result.error || '동기화 실패',
        });
      }
      return result;
    },
    []
  );

  // Schedule a lightweight background sync (debounced) after local changes.
  const scheduleSync = useCallback(() => {
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = window.setTimeout(() => {
      void runSync(false);
    }, 2500);
  }, [runSync]);

  // Native Android setup: status bar matching the app's dark theme. Android
  // 15+ (targetSdk 35+) forces edge-to-edge and ignores setBackgroundColor,
  // so the WebView draws under the status bar regardless — overlay is set
  // explicitly to match that, and Navbar carries its own
  // safe-area-inset-top padding so content isn't hidden behind it.
  // setBackgroundColor is kept for older Android versions where it still
  // has effect (no-op elsewhere).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#1c1917' }).catch(() => {});
  }, []);

  // Hardware/gesture back button: close the top-most registered overlay
  // (drawers/modals via useBackHandler), else fall back to tab, else
  // require a second press within 2s to actually exit the app.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listenerPromise = CapacitorApp.addListener('backButton', () => {
      if (consumeBackHandler()) return;
      if (isVoiceModalOpen) {
        setIsVoiceModalOpen(false);
        return;
      }
      if (isImageModalOpen) {
        setIsImageModalOpen(false);
        return;
      }
      if (activeTab === 'editor' && mobileScreen === 'note') {
        setMobileScreen('list');
        return;
      }
      if (activeTab !== 'editor') {
        setActiveTab('editor');
        return;
      }
      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        CapacitorApp.exitApp();
      } else {
        lastBackPressRef.current = now;
        setShowExitHint(true);
        setTimeout(() => setShowExitHint(false), 2000);
      }
    });
    return () => {
      void listenerPromise.then((h) => h.remove());
    };
  }, [activeTab, isVoiceModalOpen, isImageModalOpen, mobileScreen]);

  // Load notes on mount
  useEffect(() => {
    getStoredNotes().then((loaded) => {
      setNotes(loaded);
      if (loaded.length > 0 && !selectedNoteId) {
        setSelectedNoteId(loaded[0].id);
      }
      // Reconcile with the sync server (pull authoritative state to this device).
      void runSync(true);
    });
    return () => {
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
      }
    };
  }, []);

  const currentNote = notes.find((n) => n.id === selectedNoteId) || null;

  // Every entry point that activates a specific note funnels through here so
  // the mobile list→note screen transition never gets missed.
  const openNoteInEditor = (noteId: string) => {
    setSelectedNoteId(noteId);
    setActiveTab('editor');
    setMobileScreen('note');
  };

  const handleSelectNote = (noteId: string) => {
    openNoteInEditor(noteId);
  };

  const handleSaveNote = async (updatedNote: Note) => {
    await saveNoteToDB(updatedNote);
    setNotes((prev) => {
      const idx = prev.findIndex((n) => n.id === updatedNote.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updatedNote;
        return next;
      }
      return [updatedNote, ...prev];
    });
    scheduleSync();
  };

  const handleDeleteNote = async (noteId: string) => {
    // Optimistic UI state update
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== noteId);
      return next;
    });
    setSelectedNoteId((prevSelected) => {
      if (prevSelected === noteId) {
        const remaining = notes.filter((n) => n.id !== noteId);
        if (remaining.length === 0) setMobileScreen('list');
        return remaining[0]?.id || null;
      }
      return prevSelected;
    });

    try {
      await deleteNoteFromDB(noteId);
    } catch (err) {
      console.error('Failed to delete note from DB:', err);
    }
    scheduleSync();
  };

  const handleNewNote = () => {
    const today = new Date().toISOString().split('T')[0];
    const newNote: Note = {
      id: `note-${Date.now()}`,
      title: '새 메모 ' + today,
      content: '',
      date: today,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      entities: [],
      claims: [],
      openQuestions: [],
      approvedRelations: [],
      suggestedRelations: [],
    };

    setNotes((prev) => [newNote, ...prev]);
    openNoteInEditor(newNote.id);
    saveNoteToDB(newNote);
  };

  const handleVoiceTranscribeComplete = (transcribedText: string) => {
    if (currentNote) {
      const updated: Note = {
        ...currentNote,
        content: currentNote.content
          ? `${currentNote.content}\n\n## 음성 캡처\n${transcribedText}`
          : `# 음성 캡처\n${transcribedText}`,
        updatedAt: new Date().toISOString(),
      };
      handleSaveNote(updated);
      setMobileScreen('note');
    } else {
      const today = new Date().toISOString().split('T')[0];
      const newNote: Note = {
        id: `note-voice-${Date.now()}`,
        title: '음성 메모 ' + today,
        content: `# 음성 메모\n${transcribedText}`,
        date: today,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        entities: [],
        claims: [],
        openQuestions: [],
        approvedRelations: [],
        suggestedRelations: [],
      };
      handleSaveNote(newNote);
      openNoteInEditor(newNote.id);
    }
  };

  const handleImageCaptureComplete = ({ title, content }: { title: string; content: string }) => {
    const today = new Date().toISOString().split('T')[0];
    const newNote: Note = {
      id: `note-img-${Date.now()}`,
      title,
      content,
      date: today,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      entities: [],
      claims: [],
      openQuestions: [],
      approvedRelations: [],
      suggestedRelations: [],
    };
    handleSaveNote(newNote);
    openNoteInEditor(newNote.id);
  };

  const handleCreateSynthesisNote = (title: string, content: string) => {
    const today = new Date().toISOString().split('T')[0];
    const newNote: Note = {
      id: `note-synth-${Date.now()}`,
      title,
      content,
      date: today,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      summary: '자율 에이전트가 흩어진 메모들을 종합하여 생성한 연구 노트',
      entities: ['종합 연구', '통합 모델'],
      claims: ['개별 메모 간의 인과적·논리적 종합 완료'],
      openQuestions: ['통합 모델을 실전에서 추가 검증할 것'],
      intent: 'conceptual_definition',
      approvedRelations: [],
      suggestedRelations: [],
    };
    handleSaveNote(newNote);
    openNoteInEditor(newNote.id);
  };

  const reloadNotes = async () => {
    const loaded = await getStoredNotes();
    setNotes(loaded);
    if (loaded.length > 0) {
      setSelectedNoteId(loaded[0].id);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-stone-950 font-sans antialiased select-none">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onNewNote={handleNewNote}
        onOpenVoiceModal={() => setIsVoiceModalOpen(true)}
        onOpenImageModal={() => setIsImageModalOpen(true)}
        notesCount={notes.length}
        unreadAgentIssuesCount={unreadAgentIssuesCount}
      />

      {/* Main Tab Content */}
      <div className="flex-1 flex overflow-hidden pb-14 lg:pb-0">
        {activeTab === 'editor' && (
          <EditorView
            notes={notes}
            currentNote={currentNote}
            onSelectNote={handleSelectNote}
            onSaveNote={handleSaveNote}
            onDeleteNote={handleDeleteNote}
            onNewNote={handleNewNote}
            onOpenVoiceModal={() => setIsVoiceModalOpen(true)}
            onOpenImageModal={() => setIsImageModalOpen(true)}
            mobileScreen={mobileScreen}
            onBackToList={() => setMobileScreen('list')}
          />
        )}

        {activeTab === 'graph' && (
          <Suspense fallback={<TabFallback />}>
            <GraphView notes={notes} onSelectNote={handleSelectNote} />
          </Suspense>
        )}

        {activeTab === 'recall' && (
          <Suspense fallback={<TabFallback />}>
            <RecallView notes={notes} onSelectNote={handleSelectNote} />
          </Suspense>
        )}

        {activeTab === 'curator' && (
          <Suspense fallback={<TabFallback />}>
            <AgentCuratorView
              notes={notes}
              onSelectNote={handleSelectNote}
              onCreateSynthesisNote={handleCreateSynthesisNote}
              isScanning={isScanning}
              setIsScanning={setIsScanning}
              lastScanTime={lastScanTime}
              setLastScanTime={setLastScanTime}
              contradictions={contradictions}
              setContradictions={setContradictions}
              staleNotes={staleNotes}
              setStaleNotes={setStaleNotes}
              synthesisProposals={synthesisProposals}
              setSynthesisProposals={setSynthesisProposals}
            />
          </Suspense>
        )}

        {activeTab === 'digest' && (
          <Suspense fallback={<TabFallback />}>
            <DigestView
              notes={notes}
              onSelectNote={handleSelectNote}
              dailyDigest={dailyDigest}
              setDailyDigest={setDailyDigest}
              weeklyDigest={weeklyDigest}
              setWeeklyDigest={setWeeklyDigest}
            />
          </Suspense>
        )}

        {activeTab === 'vault' && (
          <Suspense fallback={<TabFallback />}>
            <VaultView
              notes={notes}
              onReloadNotes={reloadNotes}
              syncStatus={syncStatus}
              onSyncNow={() => runSync(true)}
            />
          </Suspense>
        )}
      </div>

      {/* Voice Capture Modal */}
      {isVoiceModalOpen && (
        <Suspense fallback={null}>
          <VoiceCaptureModal
            isOpen={isVoiceModalOpen}
            onClose={() => setIsVoiceModalOpen(false)}
            onTranscribeComplete={handleVoiceTranscribeComplete}
          />
        </Suspense>
      )}

      {/* Image Capture Modal */}
      {isImageModalOpen && (
        <Suspense fallback={null}>
          <ImageCaptureModal
            isOpen={isImageModalOpen}
            onClose={() => setIsImageModalOpen(false)}
            onCaptureComplete={handleImageCaptureComplete}
          />
        </Suspense>
      )}

      {/* Mobile Bottom Tab Bar */}
      <MobileNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        unreadAgentIssuesCount={unreadAgentIssuesCount}
      />

      {/* "Press back again to exit" hint (Android hardware/gesture back) */}
      {showExitHint && (
        <div className="fixed bottom-20 lg:bottom-6 inset-x-0 z-50 flex justify-center pointer-events-none">
          <div className="px-4 py-2 rounded-full bg-stone-900/95 border border-stone-700 text-stone-200 text-xs shadow-lg shadow-black/40">
            한 번 더 누르면 종료됩니다
          </div>
        </div>
      )}
    </div>
  );
}
