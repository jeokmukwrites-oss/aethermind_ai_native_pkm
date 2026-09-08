import React, { useState, useRef } from 'react';
import { Image as ImageIcon, Upload, Loader2, X, Check, FileText } from 'lucide-react';
import { analyzeImageFile } from '../lib/geminiClient';

interface ImageCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaptureComplete: (noteData: { title: string; content: string }) => void;
}

export const ImageCaptureModal: React.FC<ImageCaptureModalProps> = ({
  isOpen,
  onClose,
  onCaptureComplete,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [extractedResult, setExtractedResult] = useState<{ title: string; content: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setExtractedResult(null);
      setErrorMessage(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setExtractedResult(null);
      setErrorMessage(null);
    }
  };

  const handleExtract = async () => {
    if (!selectedFile) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await analyzeImageFile(selectedFile);
      setExtractedResult(result);
    } catch (err) {
      console.error('Image extraction error:', err);
      setErrorMessage('이미지 분석 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = () => {
    if (extractedResult) {
      onCaptureComplete(extractedResult);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-stone-900 border border-stone-800 rounded-xl max-w-xl w-full p-6 text-stone-100 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-stone-800">
          <div className="flex items-center space-x-2">
            <ImageIcon className="w-5 h-5 text-amber-400" />
            <h3 className="font-semibold text-lg">이미지/도표 지능형 캡처</h3>
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

        <div className="py-4 space-y-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />

          {!previewUrl ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-stone-700 hover:border-amber-500/50 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors bg-stone-950/40"
            >
              <Upload className="w-8 h-8 text-stone-400 mb-2" />
              <p className="text-sm font-medium text-stone-200">
                이미지를 드래그하거나 클릭하여 업로드하세요
              </p>
              <p className="text-xs text-stone-500 mt-1">
                화이트보드, 손글씨 노트, 책 구절, 다이어그램을 구조화된 마크다운으로 변환합니다.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden border border-stone-800 bg-stone-950 max-h-48 flex items-center justify-center">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-h-48 object-contain"
                />
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setPreviewUrl(null);
                    setExtractedResult(null);
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-md bg-stone-900/80 text-stone-300 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {!extractedResult && (
                <button
                  id="btn-extract-image"
                  onClick={handleExtract}
                  disabled={isLoading}
                  className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold text-sm flex items-center justify-center space-x-2 transition-colors"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Gemini가 이미지 개념 및 텍스트 추출 중...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4" />
                      <span>지식 추출 및 구조화 실행</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {extractedResult && (
            <div className="p-4 bg-stone-950 border border-stone-800 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-400 flex items-center space-x-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>추출 완료</span>
                </span>
                <span className="text-xs text-stone-400">제목: {extractedResult.title}</span>
              </div>
              <div className="text-xs text-stone-300 font-mono bg-stone-900 p-2.5 rounded border border-stone-800 max-h-40 overflow-y-auto whitespace-pre-wrap">
                {extractedResult.content}
              </div>
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
            disabled={!extractedResult}
            className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-stone-950 font-medium text-sm"
          >
            새 노트로 추가
          </button>
        </div>
      </div>
    </div>
  );
};
