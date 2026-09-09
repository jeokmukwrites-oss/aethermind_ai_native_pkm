import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  Calendar,
  Save,
  Trash2,
  Eye,
  Edit3,
  Sparkles,
  Loader2,
  Clock,
  Tag,
  Mic,
  Image as ImageIcon,
  CheckCircle2,
  Lock,
  Unlock,
  Shield,
  KeyRound,
  AlertTriangle,
  RotateCcw,
  Columns,
  ArrowLeft,
} from 'lucide-react';
import Markdown from 'react-markdown';
import { Note, NoteRelation } from '../types';
import { RealtimeSidebar } from './RealtimeSidebar';
import { searchNotesHybrid } from '../lib/storage';
import { analyzeNoteWithAI, embedText } from '../lib/geminiClient';
import { useBackHandler } from '../lib/backHandler';

interface EditorViewProps {
  notes: Note[];
  currentNote: Note | null;
  onSelectNote: (noteId: string) => void;
  onSaveNote: (note: Note) => void;
  onDeleteNote: (noteId: string) => void;
  onNewNote: () => void;
  onOpenVoiceModal: () => void;
  onOpenImageModal: () => void;
  mobileScreen: 'list' | 'note';
  onBackToList: () => void;
}

export const EditorView: React.FC<EditorViewProps> = ({
  notes,
  currentNote,
  onSelectNote,
  onSaveNote,
  onDeleteNote,
  onNewNote,
  onOpenVoiceModal,
  onOpenImageModal,
  mobileScreen,
  onBackToList,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isPreview, setIsPreview] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<{ id: string; title: string } | null>(null);

  // Lock & Protection states
  const [unlockedNoteIds, setUnlockedNoteIds] = useState<Set<string>>(new Set());
  const [showLockModal, setShowLockModal] = useState(false);
  const [lockChoice, setLockChoice] = useState<'readonly' | 'pin'>('readonly');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinModalError, setPinModalError] = useState<string | null>(null);

  // In-session PIN unlock states
  const [unlockPinInput, setUnlockPinInput] = useState('');
  const [unlockPinError, setUnlockPinError] = useState<string | null>(null);

  // Mobile-only AI copilot drawer (the note list is now its own top-level
  // mobile screen — see `mobileScreen` prop — not a drawer).
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);

  // Manage Lock Modal
  const [showManageLockModal, setShowManageLockModal] = useState(false);
  const [manageTab, setManageTab] = useState<'info' | 'remove' | 'change'>('info');
  const [currentPinVerify, setCurrentPinVerify] = useState('');
  const [changeNewPin, setChangeNewPin] = useState('');
  const [changeConfirmPin, setChangeConfirmPin] = useState('');
  const [manageError, setManageError] = useState<string | null>(null);

  // Android hardware/gesture back button closes whichever overlay below is
  // currently open (top-most first) instead of exiting the app. Registered
  // before App's own list<->note screen handling so an open overlay always
  // wins over leaving the note screen.
  const closeAiDrawer = useCallback(() => setIsAiDrawerOpen(false), []);
  const closeLockModal = useCallback(() => setShowLockModal(false), []);
  const closeManageLockModal = useCallback(() => setShowManageLockModal(false), []);
  const closeDeleteConfirm = useCallback(() => setNoteToDelete(null), []);
  useBackHandler(isAiDrawerOpen, closeAiDrawer);
  useBackHandler(showLockModal, closeLockModal);
  useBackHandler(showManageLockModal, closeManageLockModal);
  useBackHandler(noteToDelete !== null, closeDeleteConfirm);

  // Local draft state for current note
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [date, setDate] = useState('');

  // 3-column proportional width scaling & interactive drag resize
  const [leftWidth, setLeftWidth] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem('aethermind_left_width');
      return saved ? parseInt(saved, 10) : null;
    } catch {
      return null;
    }
  });
  const [rightWidth, setRightWidth] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem('aethermind_right_width');
      return saved ? parseInt(saved, 10) : null;
    } catch {
      return null;
    }
  });
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  const leftAsideRef = useRef<HTMLElement | null>(null);
  const rightAsideRef = useRef<HTMLDivElement | null>(null);

  const handleLeftResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingLeft(true);
    const startX = e.clientX;
    const currentWidth = leftAsideRef.current?.getBoundingClientRect().width || 320;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newW = Math.min(Math.max(240, Math.round(currentWidth + delta)), 680);
      setLeftWidth(newW);
      try {
        localStorage.setItem('aethermind_left_width', String(newW));
      } catch {}
    };

    const onMouseUp = () => {
      setIsDraggingLeft(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleRightResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingRight(true);
    const startX = e.clientX;
    const currentWidth = rightAsideRef.current?.getBoundingClientRect().width || 380;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const newW = Math.min(Math.max(280, Math.round(currentWidth + delta)), 760);
      setRightWidth(newW);
      try {
        localStorage.setItem('aethermind_right_width', String(newW));
      } catch {}
    };

    const onMouseUp = () => {
      setIsDraggingRight(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleResetWidths = () => {
    setLeftWidth(null);
    setRightWidth(null);
    try {
      localStorage.removeItem('aethermind_left_width');
      localStorage.removeItem('aethermind_right_width');
    } catch {}
  };

  // Lock status helpers for current note
  const isCurrentLocked = !!currentNote?.isLocked;
  const isCurrentPinLocked = isCurrentLocked && currentNote?.lockType === 'pin';
  const isCurrentUnlocked = !isCurrentPinLocked || (currentNote ? unlockedNoteIds.has(currentNote.id) : true);
  const isCurrentReadonly = isCurrentLocked && currentNote?.lockType === 'readonly';

  // Realtime matches for sidebar
  const [relatedMatches, setRelatedMatches] = useState<
    Array<{ note: Note; score: number; matchReasons: string[] }>
  >([]);

  // Sync draft when selected note changes
  useEffect(() => {
    if (currentNote) {
      setTitle(currentNote.title);
      setContent(currentNote.content);
      setDate(currentNote.date || new Date().toISOString().split('T')[0]);
      setUnlockPinInput('');
      setUnlockPinError(null);
      // Read-only notes can't be edited anyway, so start on the rendered
      // preview instead of raw, un-rendered markdown source.
      if (currentNote.isLocked && currentNote.lockType === 'readonly') {
        setIsPreview(true);
      }
    }
  }, [currentNote?.id]);

  // Debounced real-time RAG context retrieval
  useEffect(() => {
    if (!currentNote) return;

    const timer = setTimeout(async () => {
      const draftText = `${title}\n${content}`;
      if (draftText.trim().length < 15) {
        setRelatedMatches([]);
        return;
      }

      // Filter out current note and any other confidential PIN-locked notes
      const otherNotes = notes.filter((n) => n.id !== currentNote.id);

      // In-memory hybrid search
      const matches = searchNotesHybrid(draftText, otherNotes, currentNote.embedding, 4);
      setRelatedMatches(matches);
    }, 600);

    return () => clearTimeout(timer);
  }, [title, content, currentNote?.id, notes]);

  // Lock Action Handlers
  const handleApplyLock = () => {
    if (!currentNote) return;
    setPinModalError(null);

    if (lockChoice === 'readonly') {
      const updatedNote: Note = {
        ...currentNote,
        isLocked: true,
        lockType: 'readonly',
        lockPin: undefined,
      };
      onSaveNote(updatedNote);
      setShowLockModal(false);
      setIsPreview(true);
      setSaveSuccessMessage('노트가 편집 보호(Read-only) 상태로 설정되었습니다.');
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } else {
      const pin = newPin.trim();
      if (!pin || pin.length < 4) {
        setPinModalError('비밀번호(PIN)는 최소 4자리 이상이어야 합니다.');
        return;
      }
      if (pin !== confirmPin.trim()) {
        setPinModalError('비밀번호 확인이 일치하지 않습니다.');
        return;
      }

      const updatedNote: Note = {
        ...currentNote,
        isLocked: true,
        lockType: 'pin',
        lockPin: pin,
      };
      onSaveNote(updatedNote);
      setUnlockedNoteIds((prev) => new Set([...prev, currentNote.id]));
      setShowLockModal(false);
      setNewPin('');
      setConfirmPin('');
      setSaveSuccessMessage('노트가 비밀번호(PIN)로 잠금 설정되었습니다.');
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    }
  };

  const handleUnlockReadonly = () => {
    if (!currentNote) return;
    const updatedNote: Note = {
      ...currentNote,
      isLocked: false,
      lockType: undefined,
      lockPin: undefined,
    };
    onSaveNote(updatedNote);
    setIsPreview(false);
    setSaveSuccessMessage('편집 보호가 해제되었습니다. 이제 수정할 수 있습니다.');
    setTimeout(() => setSaveSuccessMessage(null), 3000);
  };

  const handleUnlockWithPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentNote) return;
    if (unlockPinInput.trim() === currentNote.lockPin) {
      setUnlockedNoteIds((prev) => new Set([...prev, currentNote.id]));
      setUnlockPinInput('');
      setUnlockPinError(null);
      setSaveSuccessMessage('노트 잠금이 해제되었습니다.');
      setTimeout(() => setSaveSuccessMessage(null), 2500);
    } else {
      setUnlockPinError('비밀번호(PIN)가 일치하지 않습니다. 다시 확인해 주세요.');
    }
  };

  const handleRelockNow = () => {
    if (!currentNote) return;
    setUnlockedNoteIds((prev) => {
      const next = new Set(prev);
      next.delete(currentNote.id);
      return next;
    });
    setShowManageLockModal(false);
    setSaveSuccessMessage('노트가 다시 잠겼습니다.');
    setTimeout(() => setSaveSuccessMessage(null), 3000);
  };

  const handleRemovePinLock = () => {
    if (!currentNote) return;
    if (currentPinVerify.trim() !== currentNote.lockPin) {
      setManageError('현재 비밀번호가 일치하지 않습니다.');
      return;
    }
    const updatedNote: Note = {
      ...currentNote,
      isLocked: false,
      lockType: undefined,
      lockPin: undefined,
    };
    onSaveNote(updatedNote);
    setShowManageLockModal(false);
    setCurrentPinVerify('');
    setManageError(null);
    setSaveSuccessMessage('비밀번호 잠금이 완전히 해제되었습니다.');
    setTimeout(() => setSaveSuccessMessage(null), 3000);
  };

  const handleChangePin = () => {
    if (!currentNote) return;
    if (currentPinVerify.trim() !== currentNote.lockPin) {
      setManageError('현재 비밀번호가 일치하지 않습니다.');
      return;
    }
    const nextPin = changeNewPin.trim();
    if (!nextPin || nextPin.length < 4) {
      setManageError('새 비밀번호는 최소 4자리 이상이어야 합니다.');
      return;
    }
    if (nextPin !== changeConfirmPin.trim()) {
      setManageError('새 비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    const updatedNote: Note = {
      ...currentNote,
      lockPin: nextPin,
    };
    onSaveNote(updatedNote);
    setShowManageLockModal(false);
    setCurrentPinVerify('');
    setChangeNewPin('');
    setChangeConfirmPin('');
    setManageError(null);
    setSaveSuccessMessage('비밀번호가 성공적으로 변경되었습니다.');
    setTimeout(() => setSaveSuccessMessage(null), 3000);
  };

  const handleSaveAndAnalyze = async () => {
    if (!currentNote) return;
    if (isCurrentReadonly) {
      setSaveSuccessMessage('편집 보호 상태입니다. 수정하려면 상단에서 보호를 해제하세요.');
      return;
    }
    setIsAnalyzing(true);
    setSaveSuccessMessage(null);

    try {
      // 1. Generate new embedding for note
      const fullText = `${title}\n${content}`;
      const embedding = await embedText(fullText);

      // 2. Call Gemini for extraction & relationship inference
      const otherNotes = notes.filter((n) => n.id !== currentNote.id);
      const aiResult = await analyzeNoteWithAI(title, content, otherNotes);

      // Convert suggested relations into format
      const newSuggestedRelations: NoteRelation[] = (aiResult.suggestedRelations || []).map(
        (sr: any, idx: number) => ({
          id: `suggested-${Date.now()}-${idx}`,
          sourceNoteId: currentNote.id,
          targetNoteId: sr.targetNoteId || '',
          targetTitle: sr.targetConcept,
          relationType: sr.relationType,
          explanation: sr.explanation,
          status: 'pending',
        })
      );

      const updatedNote: Note = {
        ...currentNote,
        title: title.trim() || '제목 없는 메모',
        content,
        date: date || new Date().toISOString().split('T')[0],
        updatedAt: new Date().toISOString(),
        summary: aiResult.summary,
        entities: aiResult.entities || [],
        claims: aiResult.claims || [],
        openQuestions: aiResult.openQuestions || [],
        intent: aiResult.intent || 'conceptual_definition',
        embedding,
        suggestedRelations: [
          ...(currentNote.suggestedRelations || []).filter((r) => r.status !== 'pending'),
          ...newSuggestedRelations,
        ],
      };

      onSaveNote(updatedNote);
      setSaveSuccessMessage('저장 및 AI 메타데이터 파싱 완료');
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Save & analyze error:', err);
      // Still save local changes even if AI fails
      const fallbackNote: Note = {
        ...currentNote,
        title: title.trim() || '제목 없는 메모',
        content,
        date: date || new Date().toISOString().split('T')[0],
        updatedAt: new Date().toISOString(),
      };
      onSaveNote(fallbackNote);
      setSaveSuccessMessage('로컬 저장 완료 (AI 분석 지연)');
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApproveRelation = (relation: NoteRelation) => {
    if (!currentNote) return;
    const updatedApproved = [...(currentNote.approvedRelations || []), { ...relation, status: 'approved' as const }];
    const updatedSuggested = (currentNote.suggestedRelations || []).map((r) =>
      r.id === relation.id ? { ...r, status: 'approved' as const } : r
    );

    const updatedNote: Note = {
      ...currentNote,
      approvedRelations: updatedApproved,
      suggestedRelations: updatedSuggested,
    };
    onSaveNote(updatedNote);
  };

  const handleRejectRelation = (relationId: string) => {
    if (!currentNote) return;
    const updatedSuggested = (currentNote.suggestedRelations || []).map((r) =>
      r.id === relationId ? { ...r, status: 'rejected' as const } : r
    );
    const updatedNote: Note = {
      ...currentNote,
      suggestedRelations: updatedSuggested,
    };
    onSaveNote(updatedNote);
  };

  const handleInsertMention = (targetTitle: string) => {
    setContent((prev) => `${prev} [[${targetTitle}]] `);
  };

  const filteredNotes = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.entities.some((e) => e.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const renderSearchAndNotesList = () => (
    <>
      {/* Search & Actions */}
      <div className="p-3.5 border-b border-stone-800/80 space-y-2.5 bg-stone-950/40">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-stone-500" />
          <input
            id="input-search-notes"
            type="text"
            placeholder="메모 검색 또는 #태그..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-stone-950 border border-stone-800 rounded-xl text-xs text-stone-200 placeholder-stone-500 focus:outline-hidden focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 transition-all"
          />
        </div>
        <div className="flex items-center justify-between text-xs text-stone-400 px-1">
          <span>보관된 노트 {notes.length}개</span>
          <span className="text-[10px] text-amber-400 font-mono bg-stone-900/80 px-2 py-0.5 rounded-full border border-stone-800">로컬 IndexedDB</span>
        </div>
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto divide-y divide-stone-800/50">
        {filteredNotes.map((note) => {
          const isSelected = currentNote?.id === note.id;
          const isLockedPin = note.isLocked && note.lockType === 'pin';
          const isUnlocked = unlockedNoteIds.has(note.id);
          const isLockedReadonly = note.isLocked && note.lockType === 'readonly';

          return (
            <div
              key={note.id}
              onClick={() => onSelectNote(note.id)}
              className={`group p-3.5 cursor-pointer transition-all space-y-1.5 relative ${
                isSelected
                  ? 'bg-amber-500/10 border-l-[3.5px] border-amber-500 text-white ring-1 ring-white/5'
                  : 'hover:bg-stone-900/60 text-stone-300 border-l-[3.5px] border-transparent'
              }`}
            >
              <div className="flex items-start justify-between">
                <h4 className="text-xs font-semibold line-clamp-1 pr-6 flex items-center space-x-1.5">
                  {note.isLocked && (
                    <span
                      title={isLockedPin ? '비밀번호 잠금 보호' : '편집 보호 (Read-Only)'}
                      className="shrink-0"
                    >
                      {isLockedPin ? (
                        <Lock className="w-3 h-3 text-amber-400 inline" />
                      ) : (
                        <Shield className="w-3 h-3 text-sky-400 inline" />
                      )}
                    </span>
                  )}
                  <span className="truncate">{note.title || '제목 없음'}</span>
                </h4>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setNoteToDelete({ id: note.id, title: note.title || '제목 없음' });
                  }}
                  title="노트 삭제"
                  className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-1 rounded-md hover:bg-rose-950 text-stone-500 hover:text-rose-400 transition-all absolute right-2 top-2 shadow-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {isLockedPin && !isUnlocked ? (
                <p className="text-[11px] text-amber-500/80 italic flex items-center space-x-1 py-0.5">
                  <span>🔒 비밀번호로 보호된 노트</span>
                </p>
              ) : (
                <p className="text-[11px] text-stone-400 line-clamp-2 leading-relaxed">
                  {note.summary || note.content.slice(0, 90)}
                </p>
              )}

              <div className="flex items-center justify-between pt-1 text-[10px] text-stone-500">
                <span className="flex items-center space-x-1">
                  <Calendar className="w-3 h-3" />
                  <span>{note.date || note.createdAt?.split('T')[0]}</span>
                </span>
                {note.entities && note.entities.length > 0 && (
                  <span className="text-amber-400/90 line-clamp-1 max-w-[120px] font-mono">
                    #{note.entities[0]}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {filteredNotes.length === 0 && notes.length > 0 && (
          <div className="p-6 text-center text-xs text-stone-500">
            일치하는 노트가 없습니다.
          </div>
        )}
        {notes.length === 0 && (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-stone-900 border border-stone-800 flex items-center justify-center text-amber-400/80 shadow-lg shadow-black/40 ring-1 ring-white/5">
              <Edit3 className="w-5 h-5" />
            </div>
            <p className="text-xs text-stone-500 leading-relaxed">
              아직 노트가 없습니다. 첫 노트를 작성해보세요.
            </p>
            <button
              onClick={onNewNote}
              className="px-4 py-2 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-stone-950 text-xs font-bold shadow-md shadow-amber-950/40 active:scale-95 transition-all"
            >
              새 노트 작성하기
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div
      className={`flex-1 flex overflow-hidden bg-stone-950 text-stone-100 w-full h-full relative ${
        isDraggingLeft || isDraggingRight ? 'select-none' : ''
      }`}
    >
      {/* Left Sidebar: Note List (Desktop only, mobile -> drawer) */}
      <aside
        ref={leftAsideRef}
        style={leftWidth !== null ? { width: `${leftWidth}px` } : undefined}
        className={`hidden lg:flex border-r border-stone-800/80 bg-stone-950 flex-col h-full shrink-0 ${
          leftWidth === null
            ? 'w-72 sm:w-80 lg:w-[22%] xl:w-[23%] 2xl:w-[24%] min-w-[280px] max-w-[540px]'
            : 'min-w-[240px] max-w-[680px]'
        }`}
      >
        {renderSearchAndNotesList()}
      </aside>

      {/* Mobile List Screen: full-screen (not an overlay) — tapping a note or
          "새 노트" drills into the Note Screen below; hardware back returns here. */}
      <div
        className={`lg:hidden flex-col h-full w-full bg-stone-950 ${
          mobileScreen === 'list' ? 'flex' : 'hidden'
        }`}
      >
        {renderSearchAndNotesList()}
      </div>

      {/* Left-to-Center Resize Handle (Desktop only) */}
      <div
        onMouseDown={handleLeftResizeStart}
        onDoubleClick={handleResetWidths}
        title="마우스로 드래그하여 좌측 목록 너비를 조절할 수 있습니다 (더블클릭 시 전체화면 자동 반응형 복원)"
        className={`hidden lg:flex group relative w-1.5 hover:w-2 -mx-0.75 shrink-0 z-30 cursor-col-resize items-center justify-center transition-colors select-none ${
          isDraggingLeft ? 'bg-amber-500 shadow-md shadow-amber-500/50' : 'hover:bg-amber-500/70 bg-transparent'
        }`}
      >
        <div
          className={`w-0.5 h-10 rounded-full transition-colors ${
            isDraggingLeft ? 'bg-stone-950' : 'bg-stone-700/60 group-hover:bg-stone-950'
          }`}
        />
      </div>

      {/* Main Center Editor (Note Screen on mobile, always-on on desktop) */}
      <main
        className={`${
          mobileScreen === 'note' ? 'flex' : 'hidden'
        } lg:flex flex-1 min-w-0 flex-col h-full bg-stone-950 overflow-hidden`}
      >
        {currentNote ? (
          <>
            {/* Editor Toolbar */}
            <div className="border-b border-stone-800/80 px-3 lg:px-6 py-2 lg:h-14 lg:py-0 flex flex-wrap items-center gap-2 justify-between bg-stone-950">
              {/* Toolbar top-left */}
            <div className="flex items-center space-x-2 lg:space-x-3 min-w-0">
              {/* Mobile: back to note list screen */}
              <button
                onClick={onBackToList}
                className="lg:hidden p-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800 shadow-xs hover:border-stone-700 transition-all active:scale-95 shrink-0"
                title="노트 목록으로"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center space-x-1 bg-stone-950/90 p-1 rounded-xl border border-stone-800 shadow-inner shadow-black/40">
                  <button
                    id="btn-toggle-edit"
                    onClick={() => setIsPreview(false)}
                    className={`flex items-center space-x-1 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      !isPreview
                        ? 'bg-stone-800 text-amber-300 border border-stone-700/60'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>편집</span>
                  </button>
                  <button
                    id="btn-toggle-preview"
                    onClick={() => setIsPreview(true)}
                    className={`flex items-center space-x-1 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      isPreview
                        ? 'bg-stone-800 text-amber-300 border border-stone-700/60'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>미리보기</span>
                  </button>
                </div>

                <div className="flex items-center space-x-1 text-xs text-stone-400 pl-2 border-l border-stone-800">
                  <Clock className="w-3.5 h-3.5 text-stone-500" />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="bg-transparent text-stone-300 text-xs focus:outline-hidden cursor-pointer"
                    title="기록 일자 (시간에 따른 생각 변화 추적용)"
                  />
                </div>
              </div>

              {/* Right Action Buttons */}
              <div className="flex flex-wrap items-center gap-1.5 lg:gap-2 ml-auto">
                {saveSuccessMessage && (
                  <span className="hidden md:inline text-xs text-emerald-400 flex items-center space-x-1 animate-fade-in font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{saveSuccessMessage}</span>
                  </span>
                )}

                {/* Mobile: open AI copilot drawer */}
                <button
                  onClick={() => setIsAiDrawerOpen(true)}
                  className="lg:hidden p-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 hover:border-amber-500/60 transition-all active:scale-95"
                  title="AI 코파일럿 열기"
                >
                  <Sparkles className="w-4 h-4" />
                </button>

                <button
                  id="btn-voice-toolbar"
                  onClick={onOpenVoiceModal}
                  className="p-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800 shadow-xs hover:border-stone-700 hover:shadow-md transition-all active:scale-95"
                  title="음성 메모 캡처"
                >
                  <Mic className="w-4 h-4" />
                </button>

                <button
                  id="btn-image-toolbar"
                  onClick={onOpenImageModal}
                  className="p-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800 shadow-xs hover:border-stone-700 hover:shadow-md transition-all active:scale-95"
                  title="이미지/도표 지식 캡처"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>

                {/* Lock / Protect Button */}
                <button
                  id="btn-lock-note"
                  onClick={() => {
                    if (!currentNote.isLocked) {
                      setLockChoice('readonly');
                      setNewPin('');
                      setConfirmPin('');
                      setPinModalError(null);
                      setShowLockModal(true);
                    } else if (currentNote.lockType === 'readonly') {
                      handleUnlockReadonly();
                    } else {
                      // PIN locked
                      setCurrentPinVerify('');
                      setChangeNewPin('');
                      setChangeConfirmPin('');
                      setManageError(null);
                      setManageTab('info');
                      setShowManageLockModal(true);
                    }
                  }}
                  className={`p-2 rounded-xl border text-xs transition-all flex items-center space-x-1.5 shadow-xs hover:shadow-md active:scale-95 ${
                    isCurrentLocked
                      ? currentNote.lockType === 'pin'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 hover:bg-amber-500/30 ring-1 ring-amber-500/30'
                        : 'bg-sky-500/20 text-sky-300 border-sky-500/60 hover:bg-sky-500/30 ring-1 ring-sky-500/30'
                      : 'bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-stone-200 border-stone-800'
                  }`}
                  title={
                    !isCurrentLocked
                      ? '노트 잠금 / 보호 설정'
                      : currentNote.lockType === 'pin'
                      ? '비밀번호 잠금 관리 (클릭 시 잠금/해제/변경)'
                      : '편집 보호 중 (클릭 시 보호 해제)'
                  }
                >
                  {isCurrentLocked ? (
                    currentNote.lockType === 'pin' ? (
                      <Lock className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Shield className="w-4 h-4 text-sky-400" />
                    )
                  ) : (
                    <Unlock className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline text-[11px] font-medium">
                    {isCurrentLocked
                      ? currentNote.lockType === 'pin'
                        ? isCurrentUnlocked
                          ? 'PIN 잠김 (열림)'
                          : 'PIN 잠김'
                        : '편집 잠김'
                      : '잠금/보호'}
                  </span>
                </button>

                {(leftWidth !== null || rightWidth !== null) && (
                  <button
                    onClick={handleResetWidths}
                    className="p-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-amber-400/90 hover:text-amber-300 border border-stone-800 text-xs flex items-center space-x-1 transition-all shadow-xs"
                    title="전체화면 자동 반응형 비율로 복원 (더블클릭 시에도 복원)"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="hidden xl:inline text-[11px]">너비 초기화</span>
                  </button>
                )}

                <button
                  id="btn-delete-note"
                  onClick={() => {
                    setNoteToDelete({ id: currentNote.id, title: currentNote.title || '제목 없음' });
                  }}
                  className="p-2 rounded-xl bg-stone-900 hover:bg-rose-950 text-stone-400 hover:text-rose-400 border border-stone-800 text-xs transition-all"
                  title="노트 삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <button
                  id="btn-save-note"
                  onClick={handleSaveAndAnalyze}
                  disabled={isAnalyzing || isCurrentReadonly}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 disabled:opacity-50 disabled:hover:bg-amber-500 text-stone-950 text-xs font-semibold transition-all shadow-md shadow-amber-950/40 hover:shadow-amber-950/60 active:scale-95"
                  title={isCurrentReadonly ? '편집 보호 상태에서는 저장할 수 없습니다' : '저장 및 AI 분석'}
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span className="hidden sm:inline">AI 의미 파싱 중...</span>
                    </>
                  ) : isCurrentReadonly ? (
                    <>
                      <Shield className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">편집 보호 중</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">저장 & AI 분석</span>
                    </>
                  )}
                </button>
              </div>
            </div>


            {/* If PIN Locked & Not Unlocked: Confidential Unlock Screen */}
            {isCurrentPinLocked && !isCurrentUnlocked ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 bg-stone-950">
                <div className="max-w-md w-full p-8 bg-stone-900 border border-stone-800/90 rounded-2xl text-center space-y-6 shadow-2xl shadow-black/80 ring-1 ring-white/5 animate-fade-in">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <Lock className="w-8 h-8" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-white tracking-tight">비밀번호로 보호된 노트</h3>
                    <p className="text-xs text-stone-400 leading-relaxed">
                      <strong className="text-white">"{currentNote.title}"</strong> 노트는 비밀번호(PIN)로 안전하게 잠겨 있습니다. 내용을 열람하거나 수정하려면 설정된 비밀번호를 입력하세요.
                    </p>
                  </div>
                  <form onSubmit={handleUnlockWithPin} className="space-y-4">
                    <div className="space-y-1 text-left">
                      <input
                        id="input-unlock-pin"
                        type="password"
                        value={unlockPinInput}
                        onChange={(e) => setUnlockPinInput(e.target.value)}
                        placeholder="비밀번호(PIN) 입력"
                        autoFocus
                        className="w-full px-4 py-3 bg-stone-950 border border-stone-800 focus:border-amber-500 rounded-xl text-center text-base text-white tracking-widest outline-none font-mono transition-colors shadow-inner shadow-black/50"
                      />
                      {unlockPinError && (
                        <p className="text-xs text-rose-400 text-center animate-fade-in">{unlockPinError}</p>
                      )}
                    </div>
                    <button
                      type="submit"
                      id="btn-submit-unlock"
                      className="w-full py-3 bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-stone-950 font-bold rounded-xl text-xs transition-all shadow-md shadow-amber-950/40 active:scale-98 cursor-pointer"
                    >
                      잠금 해제하고 열람하기
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              /* Note Title & Content Body */
              <div className="flex-1 overflow-y-auto px-6 lg:px-10 xl:px-14 py-6 space-y-4 max-w-4xl xl:max-w-5xl 2xl:max-w-6xl w-full mx-auto">
                <input
                  id="input-note-title"
                  type="text"
                  placeholder="노트 제목을 입력하세요..."
                  value={title}
                  readOnly={isCurrentReadonly}
                  onChange={(e) => setTitle(e.target.value)}
                  className={`w-full text-2xl font-serif font-bold bg-transparent text-white placeholder-stone-600 focus:outline-hidden tracking-tight ${
                    isCurrentReadonly ? 'cursor-default opacity-90' : ''
                  }`}
                />

                {isPreview ? (
                  <div className="min-h-[500px] text-stone-200 leading-relaxed space-y-4">
                    <div className="prose prose-invert max-w-none text-stone-200 font-sans leading-relaxed text-sm">
                      <Markdown>{content || '*내용이 없습니다.*'}</Markdown>
                    </div>
                  </div>
                ) : (
                  <textarea
                    id="textarea-note-content"
                    placeholder="마크다운으로 생각을 자유롭게 기록하세요... (타이핑 시 우측 사이드바에 기존 지식이 실시간 제안됩니다)"
                    value={content}
                    readOnly={isCurrentReadonly}
                    onChange={(e) => setContent(e.target.value)}
                    className={`w-full min-h-[520px] bg-transparent text-stone-200 text-sm font-mono placeholder-stone-600 focus:outline-hidden resize-none leading-relaxed ${
                      isCurrentReadonly ? 'cursor-default opacity-90' : ''
                    }`}
                  />
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4 bg-stone-950">
            <div className="w-14 h-14 rounded-2xl bg-stone-900 border border-stone-800 flex items-center justify-center text-amber-400/80 shadow-lg shadow-black/40 ring-1 ring-white/5">
              <Edit3 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-stone-200 font-serif font-semibold text-base">선택된 노트가 없습니다</h3>
              <p className="text-xs text-stone-500 max-w-sm leading-relaxed">
                왼쪽 목록에서 노트를 선택하거나 새로운 노트를 작성하여 AI 의미 파싱과 실시간 RAG 제안을 경험해보세요.
              </p>
            </div>
            <button
              onClick={onNewNote}
              className="mt-2 px-5 py-2 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-stone-950 text-xs font-bold shadow-md shadow-amber-950/40 active:scale-95 transition-all"
            >
              새 노트 작성하기
            </button>
          </div>
        )}
      </main>

      {/* Center-to-Right Resize Handle */}
      {currentNote && isCurrentUnlocked && (
        <div
          onMouseDown={handleRightResizeStart}
          onDoubleClick={handleResetWidths}
          title="마우스로 드래그하여 우측 AI 코파일럿 너비를 조절할 수 있습니다 (더블클릭 시 전체화면 자동 반응형 복원)"
          className={`hidden lg:flex group relative w-1.5 hover:w-2 -mx-0.75 shrink-0 z-30 cursor-col-resize items-center justify-center transition-colors select-none ${
            isDraggingRight ? 'bg-amber-500 shadow-md shadow-amber-500/50' : 'hover:bg-amber-500/70 bg-transparent'
          }`}
        >
          <div
            className={`w-0.5 h-10 rounded-full transition-colors ${
              isDraggingRight ? 'bg-stone-950' : 'bg-stone-700/60 group-hover:bg-stone-950'
            }`}
          />
        </div>
      )}

      {/* Right Sidebar: Realtime RAG Copilot (Desktop only, mobile -> drawer) */}
      {currentNote && isCurrentUnlocked && (
        <div
          ref={rightAsideRef}
          style={rightWidth !== null ? { width: `${rightWidth}px` } : undefined}
          className={`hidden lg:flex shrink-0 flex-col h-full shadow-2xl shadow-black/50 ${
            rightWidth === null
              ? 'w-80 sm:w-96 lg:w-[26%] xl:w-[27%] 2xl:w-[28%] min-w-[340px] max-w-[640px]'
              : 'min-w-[280px] max-w-[760px]'
          }`}
        >
          <RealtimeSidebar
            currentNote={currentNote}
            relatedMatches={relatedMatches}
            onSelectNote={onSelectNote}
            onApproveRelation={handleApproveRelation}
            onRejectRelation={handleRejectRelation}
            onInsertMention={handleInsertMention}
            isAnalyzing={isAnalyzing}
            className="w-full flex-1"
          />
        </div>
      )}

      {/* Mobile AI Copilot Drawer */}
      {currentNote && isCurrentUnlocked && isAiDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setIsAiDrawerOpen(false)}
          />
          <div className="relative h-full w-[88%] max-w-[420px] bg-stone-950 border-l border-stone-800/80 shadow-2xl shadow-black/80 animate-slide-in-right flex flex-col z-10">
            <div className="px-4 py-3 border-b border-stone-800/80 flex items-center justify-between bg-stone-900/80">
              <span className="text-xs font-semibold text-stone-200">AI 코파일럿</span>
              <button
                onClick={() => setIsAiDrawerOpen(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
              >
                ✕
              </button>
            </div>
            <RealtimeSidebar
              currentNote={currentNote}
              relatedMatches={relatedMatches}
              onSelectNote={onSelectNote}
              onApproveRelation={handleApproveRelation}
              onRejectRelation={handleRejectRelation}
              onInsertMention={handleInsertMention}
              isAnalyzing={isAnalyzing}
              className="w-full flex-1"
            />
          </div>
        </div>
      )}

      {/* Lock Setup Modal */}
      {showLockModal && currentNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-stone-900 border border-stone-800/90 rounded-2xl max-w-md w-full p-6 text-stone-100 shadow-2xl shadow-black/90 ring-1 ring-white/10 space-y-5 animate-fade-in">
            <div className="flex items-center space-x-2.5 text-amber-400">
              <Lock className="w-5 h-5" />
              <h3 className="font-semibold text-base text-white">노트 잠금 및 보호 설정</h3>
            </div>
            <p className="text-xs text-stone-400 leading-relaxed">
              <strong className="text-stone-200">"{currentNote.title}"</strong> 노트를 보호할 방식을 선택하세요.
            </p>

            {/* Lock Mode Selection */}
            <div className="space-y-3">
              <label
                onClick={() => setLockChoice('readonly')}
                className={`flex items-start space-x-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  lockChoice === 'readonly'
                    ? 'bg-stone-800/90 border-sky-500/70 text-white shadow-md shadow-sky-950/20'
                    : 'bg-stone-950/60 border-stone-800 text-stone-300 hover:bg-stone-800/40'
                }`}
              >
                <input
                  type="radio"
                  name="lockChoice"
                  checked={lockChoice === 'readonly'}
                  onChange={() => setLockChoice('readonly')}
                  className="mt-0.5 text-sky-500 focus:ring-0"
                />
                <div className="space-y-1">
                  <div className="flex items-center space-x-1.5 text-xs font-semibold text-sky-400">
                    <Shield className="w-3.5 h-3.5" />
                    <span>편집 방지 (Read-Only 보호)</span>
                  </div>
                  <p className="text-[11px] text-stone-400 leading-relaxed">
                    실수로 내용을 수정하거나 삭제하지 않도록 읽기 전용으로 고정합니다. 비밀번호 없이 상단 버튼으로 언제든 해제할 수 있습니다.
                  </p>
                </div>
              </label>

              <label
                onClick={() => setLockChoice('pin')}
                className={`flex items-start space-x-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  lockChoice === 'pin'
                    ? 'bg-stone-800/90 border-amber-500/70 text-white shadow-md shadow-amber-950/20'
                    : 'bg-stone-950/60 border-stone-800 text-stone-300 hover:bg-stone-800/40'
                }`}
              >
                <input
                  type="radio"
                  name="lockChoice"
                  checked={lockChoice === 'pin'}
                  onChange={() => setLockChoice('pin')}
                  className="mt-0.5 text-amber-500 focus:ring-0"
                />
                <div className="space-y-1">
                  <div className="flex items-center space-x-1.5 text-xs font-semibold text-amber-400">
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>비밀번호(PIN) 보안 잠금</span>
                  </div>
                  <p className="text-[11px] text-stone-400 leading-relaxed">
                    민감한 개인 생각이나 일기를 비밀번호로 잠급니다. 비밀번호를 입력해야만 본문이 화면에 표시됩니다.
                  </p>
                </div>
              </label>
            </div>

            {/* PIN Inputs if PIN choice selected */}
            {lockChoice === 'pin' && (
              <div className="p-4 bg-stone-950/90 border border-stone-800 rounded-xl space-y-3 animate-fade-in shadow-inner shadow-black/50">
                <div className="space-y-1">
                  <label className="text-[11px] text-stone-400 font-medium">비밀번호 (PIN)</label>
                  <input
                    id="input-new-pin"
                    type="password"
                    placeholder="최소 4자리 이상 입력"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-900 border border-stone-800 focus:border-amber-500 rounded-lg text-xs text-white tracking-widest outline-none font-mono shadow-inner shadow-black/30"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-stone-400 font-medium">비밀번호 확인</label>
                  <input
                    id="input-confirm-pin"
                    type="password"
                    placeholder="비밀번호 다시 입력"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-900 border border-stone-800 focus:border-amber-500 rounded-lg text-xs text-white tracking-widest outline-none font-mono shadow-inner shadow-black/30"
                  />
                </div>
              </div>
            )}

            {pinModalError && (
              <p className="text-xs text-rose-400 animate-fade-in">{pinModalError}</p>
            )}

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-stone-800">
              <button
                id="btn-cancel-lock"
                onClick={() => setShowLockModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
              >
                취소
              </button>
              <button
                id="btn-confirm-lock"
                onClick={handleApplyLock}
                className="px-4 py-2 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-stone-950 text-xs font-bold shadow-md shadow-amber-950/40 transition-all active:scale-95 cursor-pointer"
              >
                보호 적용하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage/Change PIN Lock Modal */}
      {showManageLockModal && currentNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-stone-900 border border-stone-800/90 rounded-2xl max-w-md w-full p-6 text-stone-100 shadow-2xl shadow-black/90 ring-1 ring-white/10 space-y-5 animate-fade-in">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div className="flex items-center space-x-2 text-amber-400">
                <Lock className="w-5 h-5" />
                <h3 className="font-semibold text-base text-white">비밀번호 잠금 관리</h3>
              </div>
              <button
                onClick={() => setShowManageLockModal(false)}
                className="text-stone-500 hover:text-stone-300 text-xs p-1"
              >
                ✕
              </button>
            </div>

            {/* Sub-tabs */}
            <div className="flex space-x-1 p-1 bg-stone-950 rounded-xl border border-stone-800 text-xs shadow-inner shadow-black/40">
              <button
                onClick={() => { setManageTab('info'); setManageError(null); }}
                className={`flex-1 py-1.5 rounded-lg font-medium transition-colors ${
                  manageTab === 'info' ? 'bg-stone-800 text-white shadow-xs' : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                잠금 상태
              </button>
              <button
                onClick={() => { setManageTab('remove'); setManageError(null); }}
                className={`flex-1 py-1.5 rounded-lg font-medium transition-colors ${
                  manageTab === 'remove' ? 'bg-stone-800 text-rose-300 shadow-xs' : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                잠금 해제 (제거)
              </button>
              <button
                onClick={() => { setManageTab('change'); setManageError(null); }}
                className={`flex-1 py-1.5 rounded-lg font-medium transition-colors ${
                  manageTab === 'change' ? 'bg-stone-800 text-amber-300 shadow-xs' : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                비밀번호 변경
              </button>
            </div>

            {manageTab === 'info' && (
              <div className="space-y-4 py-1">
                <div className="p-4 rounded-xl bg-stone-950/80 border border-stone-800 text-xs space-y-2 text-stone-300 shadow-inner shadow-black/30">
                  <div className="flex items-center space-x-2 text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>현재 세션에서 잠금 해제되어 열람 가능합니다</span>
                  </div>
                  <p className="text-[11px] text-stone-400 leading-relaxed">
                    작업이 끝나면 바로 노트를 다시 잠그거나, 필요 시 비밀번호 보호를 완전히 제거할 수 있습니다.
                  </p>
                </div>
                <button
                  id="btn-relock-now"
                  onClick={handleRelockNow}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-stone-950 font-bold text-xs flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-amber-950/40 active:scale-98 cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>지금 즉시 다시 잠그기</span>
                </button>
              </div>
            )}

            {manageTab === 'remove' && (
              <div className="space-y-3 py-1">
                <p className="text-xs text-stone-400 leading-relaxed">
                  비밀번호 잠금을 완전히 제거하려면 현재 비밀번호를 입력하세요.
                </p>
                <input
                  id="input-remove-verify-pin"
                  type="password"
                  placeholder="현재 비밀번호(PIN) 입력"
                  value={currentPinVerify}
                  onChange={(e) => setCurrentPinVerify(e.target.value)}
                  className="w-full px-3 py-2.5 bg-stone-950 border border-stone-800 focus:border-rose-500 rounded-xl text-xs text-white tracking-widest outline-none font-mono shadow-inner shadow-black/40"
                />
                {manageError && (
                  <p className="text-xs text-rose-400 animate-fade-in">{manageError}</p>
                )}
                <button
                  id="btn-confirm-remove-lock"
                  onClick={handleRemovePinLock}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-b from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold text-xs transition-all shadow-md shadow-rose-950/40 active:scale-98 cursor-pointer"
                >
                  비밀번호 보호 완전 해제
                </button>
              </div>
            )}

            {manageTab === 'change' && (
              <div className="space-y-3 py-1">
                <div className="space-y-1">
                  <label className="text-[11px] text-stone-400">현재 비밀번호</label>
                  <input
                    type="password"
                    placeholder="현재 비밀번호 입력"
                    value={currentPinVerify}
                    onChange={(e) => setCurrentPinVerify(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 focus:border-amber-500 rounded-xl text-xs text-white tracking-widest outline-none font-mono shadow-inner shadow-black/40"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-stone-400">새 비밀번호 (최소 4자리)</label>
                  <input
                    type="password"
                    placeholder="새 비밀번호 입력"
                    value={changeNewPin}
                    onChange={(e) => setChangeNewPin(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 focus:border-amber-500 rounded-xl text-xs text-white tracking-widest outline-none font-mono shadow-inner shadow-black/40"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-stone-400">새 비밀번호 확인</label>
                  <input
                    type="password"
                    placeholder="새 비밀번호 다시 입력"
                    value={changeConfirmPin}
                    onChange={(e) => setChangeConfirmPin(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 focus:border-amber-500 rounded-xl text-xs text-white tracking-widest outline-none font-mono shadow-inner shadow-black/40"
                  />
                </div>
                {manageError && (
                  <p className="text-xs text-rose-400 animate-fade-in">{manageError}</p>
                )}
                <button
                  id="btn-confirm-change-pin"
                  onClick={handleChangePin}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-stone-950 font-bold text-xs transition-all shadow-md shadow-amber-950/40 active:scale-98 cursor-pointer"
                >
                  비밀번호 변경 완료
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* In-app Delete Confirmation Modal (Avoids iFrame window.confirm block) */}
      {noteToDelete && (() => {
        const targetNote = notes.find((n) => n.id === noteToDelete.id);
        const isTargetPinLocked = targetNote?.isLocked && targetNote?.lockType === 'pin' && !unlockedNoteIds.has(targetNote.id);
        const isTargetReadonly = targetNote?.isLocked && targetNote?.lockType === 'readonly';

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div className="bg-stone-900 border border-stone-800/90 rounded-2xl max-w-sm w-full p-5 text-stone-100 shadow-2xl shadow-black/90 ring-1 ring-white/10 space-y-4 animate-fade-in">
              <div className="flex items-center space-x-2 text-rose-400">
                <Trash2 className="w-5 h-5" />
                <h3 className="font-semibold text-base text-white">노트 삭제 확인</h3>
              </div>

              {isTargetPinLocked ? (
                <div className="space-y-3">
                  <div className="p-3 bg-amber-950/30 border border-amber-800/50 rounded-xl text-xs text-amber-300 space-y-1">
                    <div className="flex items-center space-x-1.5 font-semibold">
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      <span>비밀번호로 보호된 노트입니다</span>
                    </div>
                    <p className="text-[11px] text-amber-200/80">
                      실수 삭제 방지를 위해 먼저 노트를 열어 비밀번호(PIN)를 입력하고 잠금을 해제한 후 삭제할 수 있습니다.
                    </p>
                  </div>
                  <div className="flex items-center justify-end pt-2 border-t border-stone-800">
                    <button
                      onClick={() => setNoteToDelete(null)}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-stone-300 hover:text-white bg-stone-800 hover:bg-stone-700 transition-colors shadow-xs"
                    >
                      확인
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs text-stone-300 leading-relaxed">
                    <strong className="text-white">"{noteToDelete.title}"</strong> 노트를 정말 삭제하시겠습니까?
                    <br />
                    {isTargetReadonly ? (
                      <span className="text-amber-400 block mt-1">
                        ⚠️ 편집 보호(Read-only) 상태인 노트입니다. 삭제 시 보호가 무시되고 영구 삭제됩니다.
                      </span>
                    ) : (
                      <span className="text-stone-400">로컬 IndexedDB 보관소에서 영구적으로 제거됩니다.</span>
                    )}
                  </p>
                  <div className="flex items-center justify-end space-x-2 pt-3 border-t border-stone-800">
                    <button
                      id="btn-cancel-delete"
                      onClick={() => setNoteToDelete(null)}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
                    >
                      취소
                    </button>
                    <button
                      id="btn-confirm-delete"
                      onClick={() => {
                        onDeleteNote(noteToDelete.id);
                        setNoteToDelete(null);
                        setSaveSuccessMessage('노트가 삭제되었습니다');
                        setTimeout(() => setSaveSuccessMessage(null), 2500);
                      }}
                      className="px-4 py-1.5 rounded-xl bg-gradient-to-b from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white text-xs font-semibold shadow-md shadow-rose-950/40 active:scale-95 transition-all"
                    >
                      삭제하기
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
};
