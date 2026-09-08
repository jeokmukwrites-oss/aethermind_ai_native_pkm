import React, { useState, useEffect } from 'react';
import { Note } from './types';
import { getStoredNotes, saveNoteToDB, deleteNoteFromDB } from './lib/storage';
import { Navbar, ActiveTab } from './components/Navbar';
import { EditorView } from './components/EditorView';
import { GraphView } from './components/GraphView';
import { RecallView } from './components/RecallView';
import { AgentCuratorView } from './components/AgentCuratorView';
import { VaultView } from './components/VaultView';
import { VoiceCaptureModal } from './components/VoiceCaptureModal';
import { ImageCaptureModal } from './components/ImageCaptureModal';

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');

  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);

  // Load notes on mount
  useEffect(() => {
    getStoredNotes().then((loaded) => {
      setNotes(loaded);
      if (loaded.length > 0 && !selectedNoteId) {
        setSelectedNoteId(loaded[0].id);
      }
    });
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
      <div className="flex-1 flex overflow-hidden">
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
          <GraphView notes={notes} onSelectNote={handleSelectNote} />
        )}

        {activeTab === 'recall' && (
          <RecallView notes={notes} onSelectNote={handleSelectNote} />
        )}

        {activeTab === 'curator' && (
          <AgentCuratorView
            notes={notes}
            onSelectNote={handleSelectNote}
            onCreateSynthesisNote={handleCreateSynthesisNote}
          />
        )}

        {activeTab === 'vault' && (
          <VaultView notes={notes} onReloadNotes={reloadNotes} />
        )}
      </div>

      {/* Voice Capture Modal */}
      <VoiceCaptureModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onTranscribeComplete={handleVoiceTranscribeComplete}
      />

      {/* Image Capture Modal */}
      <ImageCaptureModal
        isOpen={isImageModalOpen}
        onClose={() => setIsImageModalOpen(false)}
        onCaptureComplete={handleImageCaptureComplete}
      />
    </div>
  );
}
