import { Note } from '../types';

export async function embedText(text: string): Promise<number[]> {
  try {
    const res = await fetch('/api/gemini/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error('Failed to embed text');
    const data = await res.json();
    return data.embedding || [];
  } catch (err) {
    console.info('Embed API client fallback engaged');
    // Simple deterministic fallback vector
    const dim = 64;
    const vec = new Array(dim).fill(0);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      vec[i % dim] += (code * 19) % 100;
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }
}

export async function analyzeNoteWithAI(
  title: string,
  content: string,
  otherNotes: Note[]
): Promise<{
  summary: string;
  entities: string[];
  claims: string[];
  openQuestions: string[];
  intent: string;
  suggestedRelations: Array<{
    targetNoteId?: string;
    targetConcept: string;
    relationType: any;
    explanation: string;
  }>;
}> {
  const otherNotesSummary = otherNotes.map((n) => ({
    id: n.id,
    title: n.title,
    summary: n.summary || n.content.slice(0, 100),
  }));

  try {
    const res = await fetch('/api/gemini/analyze-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, otherNotesSummary }),
    });
    if (!res.ok) throw new Error('Failed to analyze note');
    return await res.json();
  } catch (err) {
    console.info('Analyze note API fallback engaged');
    const words = (title + ' ' + content)
      .replace(/[^a-zA-Z0-9가-힣\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const unique = Array.from(new Set(words)).slice(0, 5);

    return {
      summary: content.slice(0, 120) + (content.length > 120 ? '...' : ''),
      entities: unique.length ? unique : ['지식', '개념'],
      claims: [`${title}에 관한 핵심 논지와 분석 요약`],
      openQuestions: ['이 개념을 실무 환경에서 어떻게 지속 검증할 것인가?'],
      intent: 'conceptual_definition',
      suggestedRelations: otherNotes.slice(0, 2).map((other) => ({
        targetNoteId: other.id,
        targetConcept: other.title,
        relationType: 'EXTENSION',
        explanation: '두 노트의 아이디어 간 시맨틱 연결 제안',
      })),
    };
  }
}

export async function askChatRecall(
  query: string,
  contextNotes: Note[],
  conversationHistory: Array<{ role: string; content: string }>
): Promise<{
  answer: string;
  citations: Array<{ noteId: string; noteTitle: string; citationNumber?: number }>;
  temporalShiftDetected?: boolean;
}> {
  try {
    const res = await fetch('/api/gemini/chat-recall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        contextNotes: contextNotes.map((n) => ({
          id: n.id,
          title: n.title,
          date: n.date,
          claims: n.claims,
          openQuestions: n.openQuestions,
          content: n.content,
        })),
        conversationHistory,
      }),
    });
    if (!res.ok) throw new Error('Chat recall failed');
    return await res.json();
  } catch (err) {
    console.info('Chat recall fallback engaged');
    return {
      answer: `관련 메모 ${contextNotes.length}건을 바탕으로 요약합니다:\n` +
        contextNotes.map((n, i) => `[${i + 1}] **${n.title}** (${n.date})\n${n.claims?.join(', ') || n.content.slice(0, 100)}`).join('\n\n'),
      citations: contextNotes.map((n, i) => ({
        noteId: n.id,
        noteTitle: n.title,
        citationNumber: i + 1,
      })),
    };
  }
}

export async function runAgenticScan(notes: Note[]): Promise<{
  contradictions: any[];
  staleNotes: any[];
  synthesisProposals: any[];
}> {
  try {
    const res = await fetch('/api/gemini/agent-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
    if (!res.ok) throw new Error('Agent scan failed');
    return await res.json();
  } catch (err) {
    console.info('Agent scan fallback engaged');
    return {
      contradictions: [],
      staleNotes: notes.slice(0, 1).map((n) => ({
        noteId: n.id,
        noteTitle: n.title,
        reason: '작성 후 장시간 업데이트 없음',
        suggestedAction: '최근 변경점이나 실행 결과를 보강하세요.',
      })),
      synthesisProposals: [],
    };
  }
}

export async function transcribeAudioBlob(blob: Blob): Promise<string> {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onloadend = async () => {
      try {
        const base64data = (reader.result as string).split(',')[1];
        const res = await fetch('/api/gemini/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64: base64data,
            mimeType: blob.type || 'audio/webm',
          }),
        });
        if (!res.ok) throw new Error('Transcription failed');
        const data = await res.json();
        resolve(data.text || '');
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function analyzeImageFile(
  file: File,
  instruction?: string
): Promise<{ title: string; content: string }> {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onloadend = async () => {
      try {
        const base64data = (reader.result as string).split(',')[1];
        const res = await fetch('/api/gemini/analyze-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: base64data,
            mimeType: file.type || 'image/png',
            instruction,
          }),
        });
        if (!res.ok) throw new Error('Image analysis failed');
        const data = await res.json();
        resolve(data);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
