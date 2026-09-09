import React, { useCallback, useRef, useState } from 'react';
import {
  Database,
  ShieldCheck,
  Download,
  Upload,
  RotateCcw,
  HardDrive,
  Cpu,
  Layers,
  Lock,
  CheckCircle,
  FileCode,
  RefreshCw,
  Wifi,
  WifiOff,
  Server,
} from 'lucide-react';
import { Note } from '../types';
import { seedInitialNotes, writeAllNotes } from '../lib/storage';
import { SyncStatus } from '../lib/sync';
import { getServerBaseUrl, setServerBaseUrl, getSyncToken, setSyncToken } from '../lib/config';
import { useBackHandler } from '../lib/backHandler';

interface VaultViewProps {
  notes: Note[];
  onReloadNotes: () => void;
  syncStatus: SyncStatus;
  onSyncNow: () => Promise<unknown> | void;
}

export const VaultView: React.FC<VaultViewProps> = ({ notes, onReloadNotes, syncStatus, onSyncNow }) => {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [serverUrl, setUrl] = useState(getServerBaseUrl());
  const [syncToken, setToken] = useState(getSyncToken());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Android hardware/gesture back button closes this modal instead of exiting the app.
  const closeResetModal = useCallback(() => setShowResetModal(false), []);
  useBackHandler(showResetModal, closeResetModal);

  const totalEntities = notes.reduce((sum, n) => sum + (n.entities?.length || 0), 0);
  const totalClaims = notes.reduce((sum, n) => sum + (n.claims?.length || 0), 0);
  const totalOpenQuestions = notes.reduce((sum, n) => sum + (n.openQuestions?.length || 0), 0);
  const totalApprovedEdges = notes.reduce((sum, n) => sum + (n.approvedRelations?.length || 0), 0);

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(notes, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `aethermind-vault-backup-${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    setSuccessMessage('보관소 백업 파일이 다운로드되었습니다.');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          await writeAllNotes(parsed);
          onReloadNotes();
          setSuccessMessage(`성공적으로 ${parsed.length}개 노트를 가져왔습니다.`);
          setTimeout(() => setSuccessMessage(null), 3000);
        } else {
          setErrorMessage('올바른 AetherMind 보관소 JSON 형식이 아닙니다.');
          setTimeout(() => setErrorMessage(null), 3500);
        }
      } catch (err) {
        console.error('Import error:', err);
        setErrorMessage('JSON 파싱 오류가 발생했습니다.');
        setTimeout(() => setErrorMessage(null), 3500);
      }
    };
    reader.readAsText(file);
  };

  const handleResetToInitial = async () => {
    setShowResetModal(false);
    await seedInitialNotes();
    onReloadNotes();
    setSuccessMessage('초기 데이터베이스로 복원되었습니다.');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleSaveServerUrl = () => {
    setServerBaseUrl(serverUrl);
    setSyncToken(syncToken);
    setSuccessMessage('동기화 서버 설정이 저장되었습니다.');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleSyncNow = async () => {
    setSuccessMessage('동기화를 시작합니다...');
    await onSyncNow();
    onReloadNotes();
    setSuccessMessage('동기화가 완료되었습니다.');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-stone-950 text-stone-100 overflow-y-auto">
      {/* Top Header */}
      <div className="h-14 border-b border-stone-800 px-3 sm:px-6 flex items-center justify-between bg-stone-900/30 sticky top-0 z-10 backdrop-blur-xs">
        <div className="flex items-center space-x-2 min-w-0">
          <Database className="w-4 h-4 text-amber-400 shrink-0" />
          <h3 className="text-xs sm:text-sm font-semibold text-white truncate">
            로컬 우선(Local-First) 보관소 & 프라이버시 아키텍처
          </h3>
        </div>

        {successMessage && (
          <span className="text-xs text-emerald-400 flex items-center space-x-1 animate-fade-in font-medium">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>{successMessage}</span>
          </span>
        )}
        {errorMessage && (
          <span className="text-xs text-rose-400 flex items-center space-x-1 animate-fade-in font-medium">
            <span>{errorMessage}</span>
          </span>
        )}
      </div>

      <div className="p-4 sm:p-6 max-w-5xl w-full mx-auto space-y-6 sm:space-y-8 pb-10">
        {/* Architecture Philosophy Card */}
        <div className="p-6 rounded-2xl bg-stone-900/90 border border-stone-800 space-y-4">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h4 className="font-semibold text-base text-white">
              데이터 주권 & 무(無)저장 AI 프록시 원칙
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-stone-950/70 border border-stone-800 space-y-2">
              <div className="flex items-center space-x-2 text-xs font-semibold text-amber-400">
                <HardDrive className="w-4 h-4" />
                <span>1. 클라이언트 원본 격리</span>
              </div>
              <p className="text-xs text-stone-400 leading-relaxed">
                모든 개인 노트와 벡터 캐시는 브라우저의 IndexedDB에 완벽히 격리 저장됩니다. 중앙 서버나 제3자 DB에 상시 저장되지 않습니다.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-stone-950/70 border border-stone-800 space-y-2">
              <div className="flex items-center space-x-2 text-xs font-semibold text-sky-400">
                <Cpu className="w-4 h-4" />
                <span>2. 필요 시점(Just-In-Time) 추론</span>
              </div>
              <p className="text-xs text-stone-400 leading-relaxed">
                Gemini API 호출은 메타데이터 파싱이나 대화형 회상 질의 시에만 필요한 최소 단위 청크를 전송하며, 세션 종료 즉시 소멸합니다.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-stone-950/70 border border-stone-800 space-y-2">
              <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-400">
                <Lock className="w-4 h-4" />
                <span>3. 오프라인 인메모리 검색</span>
              </div>
              <p className="text-xs text-stone-400 leading-relaxed">
                네트워크가 단절되어도 브라우저 메모리 상에서 코사인 유사도 벡터 검색 및 마크다운 전체 편집이 100% 정상 작동합니다.
              </p>
            </div>
          </div>
        </div>

        {/* Vault Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-stone-900/60 border border-stone-800 space-y-1">
            <span className="text-xs text-stone-500 font-medium">저장된 총 노트</span>
            <div className="text-2xl font-bold font-mono text-amber-400">{notes.length}개</div>
          </div>
          <div className="p-4 rounded-xl bg-stone-900/60 border border-stone-800 space-y-1">
            <span className="text-xs text-stone-500 font-medium">추출된 핵심 개념</span>
            <div className="text-2xl font-bold font-mono text-sky-400">{totalEntities}개</div>
          </div>
          <div className="p-4 rounded-xl bg-stone-900/60 border border-stone-800 space-y-1">
            <span className="text-xs text-stone-500 font-medium">승인된 관계 엣지</span>
            <div className="text-2xl font-bold font-mono text-emerald-400">{totalApprovedEdges}개</div>
          </div>
          <div className="p-4 rounded-xl bg-stone-900/60 border border-stone-800 space-y-1">
            <span className="text-xs text-stone-500 font-medium">미해결 질문(Open Qs)</span>
            <div className="text-2xl font-bold font-mono text-rose-400">{totalOpenQuestions}개</div>
          </div>
        </div>

        {/* Backup & Restore Controls */}
        <div className="p-6 rounded-2xl bg-stone-900/90 border border-stone-800 space-y-4">
          <h4 className="font-semibold text-sm text-white">보관소 백업 및 마이그레이션</h4>
          <p className="text-xs text-stone-400">
            Obsidian이나 로컬 파일 시스템, 향후 파이썬/SQLite 백엔드로 손쉽게 이전할 수 있도록 표준 JSON 포맷을 지원합니다.
          </p>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportJson}
            accept=".json"
            className="hidden"
          />

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              id="btn-export-vault"
              onClick={handleExportJson}
              className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 text-xs font-semibold flex items-center space-x-2 transition-colors"
            >
              <Download className="w-4 h-4 text-amber-400" />
              <span>보관소 JSON 내보내기 (Export)</span>
            </button>

            <button
              id="btn-import-vault"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 text-xs font-semibold flex items-center space-x-2 transition-colors"
            >
              <Upload className="w-4 h-4 text-sky-400" />
              <span>백업 파일 복원하기 (Import)</span>
            </button>

            <button
              id="btn-reset-vault"
              onClick={() => setShowResetModal(true)}
              className="px-4 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-rose-400 border border-stone-800 text-xs font-semibold flex items-center space-x-2 transition-colors ml-auto"
            >
              <RotateCcw className="w-4 h-4" />
              <span>샘플 데이터셋으로 리셋</span>
            </button>
          </div>
        </div>

        {/* Device Sync Settings */}
        <div className="p-6 rounded-2xl bg-stone-900/90 border border-stone-800 space-y-4">
          <div className="flex items-center space-x-2">
            <RefreshCw className="w-5 h-5 text-sky-400" />
            <h4 className="font-semibold text-sm text-white">기기 간 동기화 (PC ↔ 모바일)</h4>
          </div>
          <p className="text-xs text-stone-400 leading-relaxed">
            PC에서 실행 중인 AetherMind 서버가 병합 코디네이터 역할을 합니다. 노트는 저장 시 자동으로 백그라운드 동기화되고,
            충돌은 <span className="text-sky-300">최신 수정 시각(updatedAt) 기준</span>으로 자동 해결됩니다. 동기화 데이터는
            서버의 로컬 SQLite(<span className="font-mono text-stone-300">data/aethermind-sync.db</span>)에만 기록됩니다.
            요청에는 인증 토큰이 필요하며, 서버를 시작할 때 터미널에 출력됩니다.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <div className="flex-1">
              <label className="block text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">
                동기화 서버 주소 (모바일에서 필요 — 비우면 현재 서버와 동일)
              </label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="예: http://192.168.0.10:3000"
                className="w-full px-3 py-2 rounded-lg bg-stone-950/70 border border-stone-700/80 text-xs text-stone-200 placeholder-stone-600 focus:outline-none focus:ring-1 focus:ring-sky-500/60 focus:border-sky-500/60"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] uppercase tracking-wider text-stone-500 font-mono mb-1.5">
                인증 토큰 (서버 실행 시 터미널에 출력됨)
              </label>
              <input
                type="password"
                value={syncToken}
                onChange={(e) => setToken(e.target.value)}
                placeholder="서버 콘솔의 🔐 토큰을 붙여넣으세요"
                className="w-full px-3 py-2 rounded-lg bg-stone-950/70 border border-stone-700/80 text-xs text-stone-200 placeholder-stone-600 focus:outline-none focus:ring-1 focus:ring-sky-500/60 focus:border-sky-500/60 font-mono"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              id="btn-save-sync-server"
              onClick={handleSaveServerUrl}
              className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 text-xs font-semibold flex items-center space-x-2 transition-colors"
            >
              <Server className="w-4 h-4 text-sky-400" />
              <span>서버 설정 저장</span>
            </button>

            <button
              id="btn-sync-now"
              onClick={handleSyncNow}
              disabled={syncStatus.state === 'syncing'}
              className="px-4 py-2 rounded-lg bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-300 hover:to-sky-400 disabled:opacity-40 text-stone-950 text-xs font-semibold flex items-center space-x-2 shadow-md shadow-sky-950/40 transition-all active:scale-[0.98]"
            >
              <RefreshCw className={`w-4 h-4 ${syncStatus.state === 'syncing' ? 'animate-spin' : ''}`} />
              <span>{syncStatus.state === 'syncing' ? '동기화 중...' : '지금 동기화'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-400 pt-1 break-words">
            {syncStatus.state === 'synced' ? (
              <>
                <Wifi className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400 font-medium">동기화됨</span>
                {syncStatus.lastSyncAt && (
                  <span className="text-stone-500">
                    · {new Date(syncStatus.lastSyncAt).toLocaleString()}
                  </span>
                )}
              </>
            ) : syncStatus.state === 'offline' || syncStatus.state === 'error' ? (
              <>
                <WifiOff className="w-4 h-4 text-rose-400" />
                <span className="text-rose-400 font-medium">동기화 사용 불가</span>
                {syncStatus.message && (
                  <span className="text-stone-500">· {syncStatus.message}</span>
                )}
              </>
            ) : (
              <>
                <Wifi className="w-4 h-4 text-stone-500" />
                <span className="text-stone-500">
                  {syncStatus.state === 'syncing' ? '동기화 중...' : '대기 중'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Obsidian vs AetherMind Comparison Table */}
        <div className="p-6 rounded-2xl bg-stone-900/90 border border-stone-800 space-y-4">
          <h4 className="font-semibold text-sm text-white">
            Obsidian vs AetherMind 심층 아키텍처 비교표
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-stone-800 text-stone-400 font-mono">
                  <th className="py-2.5 px-3">비교 영역</th>
                  <th className="py-2.5 px-3">전통적 Obsidian 방식</th>
                  <th className="py-2.5 px-3 text-amber-400">AetherMind AI-Native 방식</th>
                  <th className="py-2.5 px-3">왜 더 나은가?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800/60 text-stone-300">
                <tr>
                  <td className="py-3 px-3 font-semibold text-stone-200">노트 캡처</td>
                  <td className="py-3 px-3 text-stone-400">수동 태그 및 [[링크]] 직접 작성</td>
                  <td className="py-3 px-3 text-amber-300">타이핑 중 실시간 RAG 연관 메모 & 링크 자동 제안</td>
                  <td className="py-3 px-3 text-stone-400">작성자의 인지 부하를 없애고 지식 고립 방지</td>
                </tr>
                <tr>
                  <td className="py-3 px-3 font-semibold text-stone-200">지식 그래프</td>
                  <td className="py-3 px-3 text-stone-400">단순 링크 유무에 따른 실선 그물망</td>
                  <td className="py-3 px-3 text-amber-300">관계 유형(인과·대조·확장·모순) 라벨링 엣지 + 시간 슬라이더</td>
                  <td className="py-3 px-3 text-stone-400">단순 시각화를 넘어 논리 구조와 시간적 진화를 통찰</td>
                </tr>
                <tr>
                  <td className="py-3 px-3 font-semibold text-stone-200">회상 & 검색</td>
                  <td className="py-3 px-3 text-stone-400">키워드/정규식 매칭, Dataview 쿼리</td>
                  <td className="py-3 px-3 text-amber-300">자연어 RAG 대화 + 시간에 따른 관점 변화 자동 추적</td>
                  <td className="py-3 px-3 text-stone-400">모호한 기억을 복원하고 내 사고의 진화 궤적을 확인</td>
                </tr>
                <tr>
                  <td className="py-3 px-3 font-semibold text-stone-200">지식 정리</td>
                  <td className="py-3 px-3 text-stone-400">수동 폴더 정리 (시간 지나면 버려짐)</td>
                  <td className="py-3 px-3 text-amber-300">에이전트가 생각 간 모순과 노후 노트를 찾아 종합 초안 제안</td>
                  <td className="py-3 px-3 text-stone-400">죽어가는 메모를 살려 자율적으로 지혜로 승화</td>
                </tr>
                <tr>
                  <td className="py-3 px-3 font-semibold text-stone-200">프라이버시</td>
                  <td className="py-3 px-3 text-stone-400">로컬 마크다운 파일</td>
                  <td className="py-3 px-3 text-amber-300">로컬 IndexedDB 저장 + Just-in-Time AI 파싱</td>
                  <td className="py-3 px-3 text-stone-400">데이터 주권을 완벽히 보호하면서 AI 인텔리전스 100% 향유</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-xl max-w-sm w-full p-5 text-stone-100 shadow-2xl space-y-4 animate-fade-in">
            <div className="flex items-center space-x-2 text-rose-400">
              <RotateCcw className="w-5 h-5" />
              <h3 className="font-semibold text-base text-white">초기 데이터 복원 확인</h3>
            </div>
            <p className="text-xs text-stone-300 leading-relaxed">
              보관소를 초기 샘플 데이터로 복원하시겠습니까?
              <br />
              <span className="text-stone-400">기존에 작성하거나 수정한 노트 변경사항이 덮어씌워집니다.</span>
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-stone-800">
              <button
                onClick={() => setShowResetModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
              >
                취소
              </button>
              <button
                id="btn-confirm-reset"
                onClick={handleResetToInitial}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-sm transition-colors"
              >
                복원하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
