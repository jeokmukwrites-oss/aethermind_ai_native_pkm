import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { Note } from './types';
import { getStoredNotes, saveNoteToDB, deleteNoteFromDB } from './lib/storage';
import { syncNotes, SyncStatus } from './lib/sync';
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

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');

  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    state: 'idle',
    lastSyncAt: null,
    message: '',
  });
  const syncTimerRef = useRef<number | null>(null);

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

  const handleSelectNote = (noteId: string) => {
    setSelectedNoteId(noteId);
    setActiveTab('editor');
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
    setSelectedNoteId(newNote.id);
    setActiveTab('editor');
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
      setSelectedNoteId(newNote.id);
      setActiveTab('editor');
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
    setSelectedNoteId(newNote.id);
    setActiveTab('editor');
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
    setSelectedNoteId(newNote.id);
    setActiveTab('editor');
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
        unreadAgentIssuesCount={2}
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
        unreadAgentIssuesCount={2}
      />
    </div>
  );
}
