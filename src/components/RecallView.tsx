import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  Bot,
  User,
  ExternalLink,
  Loader2,
  Clock,
  History,
  CheckCircle,
  HelpCircle,
} from 'lucide-react';
import Markdown from 'react-markdown';
import { Note, ChatMessage, ChatCitation } from '../types';
import { askChatRecall } from '../lib/geminiClient';
import { searchNotesHybrid } from '../lib/storage';

interface RecallViewProps {
  notes: Note[];
  onSelectNote: (noteId: string) => void;
}

export const RecallView: React.FC<RecallViewProps> = ({ notes, onSelectNote }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      content: `안녕하세요! 당신의 개인 지식 베이스를 상시 이해하고 있는 **AetherMind 회상 어시스턴트**입니다.

기억이 가물가물한 과거의 메모, 모호한 질문, 혹은 시간에 따른 당신의 생각 변화까지 자연어로 질문해보세요.

**추천 질문 예시:**
- *"지난달에 알고리즘 트레이딩 리스크 관리에 대해 뭐라고 메모했었지?"*
- *"내가 리스크 관리나 레버리지에 대해 생각이 바뀐 지점이 있어?"*
- *"내 노트베이스에서 아직 해결되지 않은 질문들(Open Questions)을 정리해줘."*`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async (queryText?: string) => {
    const query = (queryText || inputQuery).trim();
    if (!query || isLoading) return;

    setInputQuery('');

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      // 1. Retrieve top-k relevant context notes from in-memory vault (filter out confidential PIN-locked notes)
      const searchableNotes = notes.filter((n) => !(n.isLocked && n.lockType === 'pin'));
      const searchResults = searchNotesHybrid(query, searchableNotes, undefined, 5);
      const contextNotes = searchResults.length > 0 ? searchResults.map((r) => r.note) : searchableNotes.slice(0, 4);

      // 2. Call server-side Gemini RAG with notes & history
      const history = messages.slice(-4).map((m) => ({
        role: m.sender === 'user' ? 'user' : 'model',
        content: m.content,
      }));

      const aiResponse = await askChatRecall(query, contextNotes, history);

      const assistantMsg: ChatMessage = {
        id: `asst-${Date.now()}`,
        sender: 'assistant',
        content: aiResponse.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        citations: aiResponse.citations,
        temporalShiftDetected: aiResponse.temporalShiftDetected,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('Chat error:', err);
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        content: '죄송합니다. 지식 회상 처리 중 일시적인 오류가 발생했습니다.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const samplePrompts = [
    '지난달 알고리즘 트레이딩 리스크 관리에 대해 뭐라고 메모했었지?',
    '내가 이 주제에 대해 생각이 바뀐 지점이 있어?',
    '해결되지 않은 열린 질문들(Open Questions) 모아줘',
    '알고리즘 트레이딩과 LLM 에이전트 메모리의 공통 원리는?',
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-stone-950 text-stone-100 overflow-hidden">
      {/* Top Bar with Obsidian Comparison */}
      <div className="h-14 border-b border-stone-800 px-6 flex items-center justify-between bg-stone-900/30">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-white">대화형 회상 & 관점 변화 추적</h3>
        </div>

        <div className="hidden sm:flex items-center space-x-2 text-[11px] text-stone-400 bg-stone-950/80 px-3 py-1 rounded-full border border-stone-800">
          <span className="text-amber-400 font-semibold">✦ Obsidian 대비 차별점:</span>
          <span>키워드 일치가 아닌 자연어 RAG로 회상하며, 시간에 따른 생각의 변화 궤적을 스스로 추적합니다.</span>
        </div>
      </div>

      {/* Chat Messages Log */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 max-w-4xl w-full mx-auto">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start space-x-3 ${
              msg.sender === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {msg.sender === 'assistant' && (
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 mt-1">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-2xl rounded-2xl p-4 text-sm leading-relaxed space-y-3 ${
                msg.sender === 'user'
                  ? 'bg-amber-500 text-stone-950 font-medium rounded-tr-none'
                  : 'bg-stone-900/90 text-stone-200 border border-stone-800 rounded-tl-none shadow-md'
              }`}
            >
              {/* Temporal Shift Banner if Detected */}
              {msg.temporalShiftDetected && (
                <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs flex items-center space-x-2">
                  <History className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong>관점 변화 감지</strong>: 사용자의 과거 기록과 최근 기록 간의 생각 변화 추적이 감지되었습니다.
                  </span>
                </div>
              )}

              <div className="prose prose-invert max-w-none text-sm font-sans leading-relaxed">
                <Markdown>{msg.content}</Markdown>
              </div>

              {/* Citations list */}
              {msg.citations && msg.citations.length > 0 && (
                <div className="pt-3 border-t border-stone-800 space-y-1.5">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-stone-400 block">
                    인용된 출처 노트 ({msg.citations.length}건):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {msg.citations.map((cite, idx) => (
                      <button
                        key={idx}
                        onClick={() => onSelectNote(cite.noteId)}
                        className="px-2.5 py-1 rounded-md bg-stone-950 hover:bg-stone-800 text-amber-400 text-xs font-mono border border-stone-800 flex items-center space-x-1.5 transition-colors group"
                      >
                        <span>[{cite.citationNumber || idx + 1}]</span>
                        <span className="max-w-[200px] truncate font-sans text-stone-200 group-hover:text-amber-300">
                          {cite.noteTitle}
                        </span>
                        <ExternalLink className="w-3 h-3 text-stone-500 group-hover:text-amber-400" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-[10px] text-stone-500 text-right">
                {msg.timestamp}
              </div>
            </div>

            {msg.sender === 'user' && (
              <div className="w-8 h-8 rounded-lg bg-stone-800 border border-stone-700 flex items-center justify-center text-stone-300 shrink-0 mt-1">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="p-4 rounded-2xl rounded-tl-none bg-stone-900 border border-stone-800 text-stone-400 text-xs flex items-center space-x-2">
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              <span>전체 노트베이스에서 맥락을 회상하고 인용을 구성하는 중입니다...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompt Chips */}
      <div className="px-6 py-2 bg-stone-900/40 border-t border-stone-800/80">
        <div className="max-w-4xl mx-auto flex items-center space-x-2 overflow-x-auto pb-1 text-xs">
          <span className="text-stone-500 text-[11px] shrink-0">빠른 질의:</span>
          {samplePrompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(prompt)}
              className="px-2.5 py-1 rounded-full bg-stone-900 hover:bg-stone-800 text-stone-300 hover:text-amber-300 border border-stone-800 shrink-0 transition-colors text-[11px]"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Query Input Box */}
      <div className="p-3 sm:p-4 bg-stone-900 border-t border-stone-800 pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.75rem))]">
        <div className="max-w-4xl mx-auto flex items-center space-x-2 sm:space-x-3">
          <input
            id="input-recall-query"
            type="text"
            placeholder="과거 메모나 관점 변화에 대해 질문하세요... (예: '내가 리스크 관리에 대해 생각이 바뀐 지점이 있어?')"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="flex-1 px-4 py-2.5 bg-stone-950 border border-stone-800 rounded-xl text-sm text-stone-100 placeholder-stone-500 focus:outline-hidden focus:border-amber-500"
          />
          <button
            id="btn-send-recall"
            onClick={() => handleSend()}
            disabled={!inputQuery.trim() || isLoading}
            className="px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 font-semibold text-sm flex items-center space-x-1.5 transition-colors shadow-sm shrink-0"
          >
            <span className="hidden sm:inline">질문</span>
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
