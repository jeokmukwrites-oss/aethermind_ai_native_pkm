import React, { useState, useRef } from 'react';
import { Mic, Square, Loader2, X, Sparkles, Check } from 'lucide-react';
import { transcribeAudioBlob } from '../lib/geminiClient';

interface VoiceCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTranscribeComplete: (text: string) => void;
}

export const VoiceCaptureModal: React.FC<VoiceCaptureModalProps> = ({
  isOpen,
  onClose,
  onTranscribeComplete,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcribedText, setTranscribedText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  if (!isOpen) return null;

  const startRecording = async () => {
    try {
      setErrorMessage(null);
      audioChunksRef.current = [];
      setTranscribedText('');
      setAudioBlob(null);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const fullBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(fullBlob);
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timerRef.current);
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied:', err);
      setErrorMessage('마이크 접근 권한이 허용되지 않았거나 마이크 장치를 찾을 수 없습니다.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleTranscribe = async () => {
    if (!audioBlob) return;
    setIsLoading(true);
    try {
      const text = await transcribeAudioBlob(audioBlob);
      setTranscribedText(text);
    } catch (err: any) {
      console.error('Transcription error:', err);
      setTranscribedText('음성 텍스트 변환 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = () => {
    if (transcribedText) {
      onTranscribeComplete(transcribedText);
      onClose();
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-stone-900 border border-stone-800 rounded-xl max-w-lg w-full p-6 text-stone-100 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-stone-800">
          <div className="flex items-center space-x-2">
            <Mic className="w-5 h-5 text-amber-400" />
            <h3 className="font-semibold text-lg">음성 지능형 캡처</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-stone-400 hover:text-white hover:bg-stone-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mt-3 p-3 bg-rose-950/60 border border-rose-800/80 rounded-lg text-rose-300 text-xs">
            {errorMessage}
          </div>
        )}

        <div className="py-6 flex flex-col items-center justify-center space-y-4">
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
              isRecording
                ? 'bg-rose-500/20 text-rose-400 ring-4 ring-rose-500/40 animate-pulse'
                : 'bg-stone-800 text-stone-300 border border-stone-700'
            }`}
          >
            <Mic className="w-8 h-8" />
          </div>

          <div className="text-center">
            {isRecording ? (
              <div className="space-y-1">
                <span className="text-xl font-mono text-rose-400">
                  {formatTime(recordingSeconds)}
                </span>
                <p className="text-xs text-stone-400">생각을 자유롭게 말하세요. 음성이 실시간 텍스트로 변환됩니다.</p>
              </div>
            ) : audioBlob ? (
              <p className="text-xs text-stone-400">녹음이 완료되었습니다. 텍스트 변환을 실행하세요.</p>
            ) : (
              <p className="text-xs text-stone-400">
                마이크 버튼을 눌러 생각을 음성으로 기록하세요.
              </p>
            )}
          </div>

          <div className="flex space-x-3">
            {!isRecording ? (
              <button
                id="btn-start-record"
                onClick={startRecording}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium text-sm flex items-center space-x-2"
              >
                <Mic className="w-4 h-4" />
                <span>{audioBlob ? '다시 녹음하기' : '녹음 시작'}</span>
              </button>
            ) : (
              <button
                id="btn-stop-record"
                onClick={stopRecording}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium text-sm flex items-center space-x-2"
              >
                <Square className="w-4 h-4" />
                <span>녹음 완료</span>
              </button>
            )}

            {audioBlob && !isRecording && (
              <button
                id="btn-transcribe"
                onClick={handleTranscribe}
                disabled={isLoading}
                className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-amber-400 font-medium text-sm flex items-center space-x-2 border border-stone-700"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>AI 텍스트 변환</span>
              </button>
            )}
          </div>

          {transcribedText && (
            <div className="w-full mt-4 p-3 bg-stone-950 border border-stone-800 rounded-lg space-y-2">
              <span className="text-xs font-semibold text-amber-400 flex items-center space-x-1">
                <Check className="w-3.5 h-3.5" />
                <span>변환된 텍스트</span>
              </span>
              <p className="text-sm text-stone-200 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {transcribedText}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-2 pt-4 border-t border-stone-800">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm text-stone-400 hover:text-white"
          >
            취소
          </button>
          <button
            onClick={handleApply}
            disabled={!transcribedText}
            className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 font-medium text-sm"
          >
            노트에 반영하기
          </button>
        </div>
      </div>
    </div>
  );
};
