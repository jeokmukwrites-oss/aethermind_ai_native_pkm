export type RelationType =
  | 'CAUSATION'      // 인과
  | 'CONTRAST'       // 대조 / 반론
  | 'EXTENSION'      // 확장 / 심화
  | 'CONTRADICTION'  // 모순 / 충돌
  | 'PREREQUISITE';  // 선행조건

export interface NoteRelation {
  id: string;
  sourceNoteId: string;
  targetNoteId: string;
  targetTitle: string;
  relationType: RelationType;
  explanation: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  date: string; // YYYY-MM-DD
  summary?: string;
  entities: string[];
  claims: string[];
  openQuestions: string[];
  intent?: string;
  embedding?: number[];
  approvedRelations: NoteRelation[];
  suggestedRelations: NoteRelation[];
  isLocked?: boolean;
  lockType?: 'readonly' | 'pin';
  lockPin?: string;
}

export interface ChatCitation {
  noteId: string;
  noteTitle: string;
  citationNumber?: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citations?: ChatCitation[];
  temporalShiftDetected?: boolean;
}

export interface ContradictionIssue {
  id: string;
  noteIdA: string;
  noteTitleA: string;
  noteIdB: string;
  noteTitleB: string;
  explanation: string;
  suggestedResolution: string;
  resolved: boolean;
}

export interface StaleNoteIssue {
  id: string;
  noteId: string;
  noteTitle: string;
  reason: string;
  suggestedAction: string;
  resolved: boolean;
}

export interface SynthesisProposal {
  id: string;
  title: string;
  sourceNoteIds: string[];
  sourceNoteTitles: string[];
  synthesisSummary: string;
  draftContent: string;
  status: 'pending' | 'applied' | 'dismissed';
}

export interface AgentReport {
  lastScannedAt: string | null;
  isScanning: boolean;
  contradictions: ContradictionIssue[];
  staleNotes: StaleNoteIssue[];
  synthesisProposals: SynthesisProposal[];
}

export interface GraphNode {
  id: string;
  title: string;
  date: string;
  entitiesCount: number;
  claimsCount: number;
  openQuestionsCount: number;
  group?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  relationType: RelationType;
  explanation: string;
}
