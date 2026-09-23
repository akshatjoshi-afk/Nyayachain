import { useState, useEffect, useMemo, ReactNode } from 'react';
import axios from 'axios';

interface DocumentTextPanelProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: number | null;
  documentName: string | null;
}

export default function DocumentTextPanel({
  isOpen,
  onClose,
  documentId,
  documentName,
}: DocumentTextPanelProps) {
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && documentId) {
      fetchDocumentText(documentId);
    } else {
      setExtractedText(null);
      setSearchQuery('');
      setError(null);
    }
  }, [isOpen, documentId]);

  const fetchDocumentText = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get<{ id: number; originalName: string; extractedText: string | null }>(
        `/api/documents/${id}/text`
      );
      setExtractedText(res.data.extractedText);
    } catch (err: any) {
      setError(
        err.response?.data?.message || 'Failed to fetch extracted OCR text. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!extractedText) return;
    navigator.clipboard.writeText(extractedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper to split and highlight search query matches in text
  const { highlightedNodes, matchCount } = useMemo(() => {
    if (!extractedText || !searchQuery.trim()) {
      return { highlightedNodes: [extractedText || ''], matchCount: 0 };
    }

    const q = searchQuery.trim();
    const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    const parts = extractedText.split(regex);
    let count = 0;

    const nodes: ReactNode[] = parts.map((part, index) => {
      if (part.toLowerCase() === q.toLowerCase()) {
        count++;
        return (
          <mark key={index} className="bg-amber-200 text-amber-900 font-bold px-0.5 rounded">
            {part}
          </mark>
        );
      }
      return part;
    });

    return { highlightedNodes: nodes, matchCount: count };
  }, [extractedText, searchQuery]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Slide-out Panel */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-label="Extracted Document Text Panel"
      >
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 flex-shrink-0">
          <div className="min-w-0 pr-2">
            <h2 className="text-sm font-bold tracking-wide flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Extracted OCR Text
            </h2>
            <p className="text-xs text-slate-300 truncate mt-0.5" title={documentName || ''}>
              {documentName || 'Document Text'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            title="Close panel"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Toolbar: Search & Copy Controls */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-shrink-0">
          {/* Search Box */}
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search in text..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={loading || !extractedText}
              className="w-full pl-8 pr-16 py-1.5 bg-white border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
            />
            {searchQuery.trim() !== '' && (
              <span className="absolute inset-y-0 right-2 flex items-center text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded my-auto h-5">
                {matchCount} {matchCount === 1 ? 'match' : 'matches'}
              </span>
            )}
          </div>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            disabled={loading || !extractedText}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg shadow-sm transition-all inline-flex items-center gap-1.5 flex-shrink-0 ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none'
            }`}
            title="Copy entire OCR text to clipboard"
          >
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                Copy Text
              </>
            )}
          </button>
        </div>

        {/* Extracted Text Content Area */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 py-12">
              <svg className="w-8 h-8 text-blue-600 animate-spin mb-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-xs font-medium text-gray-600">Fetching extracted OCR text...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start gap-2">
              <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-semibold mb-0.5">Error Loading Text</p>
                <p>{error}</p>
              </div>
            </div>
          ) : !extractedText || extractedText.trim() === '' ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-white rounded-xl border border-dashed border-gray-300">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-800 mb-1">No OCR Text Available</h3>
              <p className="text-xs text-gray-500 max-w-xs">
                This document has not been processed by the OCR engine yet, or contains no readable text.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
              <div className="text-[11px] text-gray-400 font-sans border-b border-gray-100 pb-2 mb-3 flex justify-between items-center">
                <span>{extractedText.length} characters</span>
                <span className="font-mono text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">OCR Engine Extract</span>
              </div>
              <pre className="font-mono text-xs text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
                {highlightedNodes}
              </pre>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
