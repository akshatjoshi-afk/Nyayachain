import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface Certificate {
  id: number;
  documentId: number;
  deviceDescription: string;
  deviceOperator: string;
  recordDescription: string;
  fileHashAtCertification: string;
  declarationText: string;
  signatory1Name: string;
  signatory1Designation: string;
  signatory1SignedAt: string;
  signatory2Name: string;
  signatory2Designation: string;
  signatory2SignedAt: string;
  generatedAt: string;
}

interface Document {
  id: number;
  filename: string;
  originalName: string;
  fileHash?: string;
  chainHash?: string;
  previousHash?: string;
  extractedText?: string | null;
  evidenceType: 'PRIMARY' | 'SECONDARY';
  certificateGenerated: boolean;
  certificate?: Certificate | null;
  uploadedAt: string;
  uploader: {
    username: string;
    role: string;
  };
}

interface CaseDetails {
  id: number;
  caseNumber: string;
  title: string;
}

interface UploadOrVerifyResult {
  status: 'new' | 'duplicate' | 'tampered' | 'verified' | 'not_found';
  accepted?: boolean;
  verified?: boolean;
  filename?: string;
  message: string;
  storedFileHash?: string;
  attemptedFileHash?: string;
  recomputedFileHash?: string;
  chainHash?: string;
  previousHash?: string;
  forensics?: {
    uploaderUsername: string;
    uploadedAt: string;
    attemptedAt?: string;
    verifiedAt?: string;
  };
}

function DocumentsPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [caseDetails, setCaseDetails] = useState<CaseDetails | null>(null);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);

  const [documents, setDocuments] = useState<Document[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // Upload Form State
  const [selectedEvidenceType, setSelectedEvidenceType] = useState<'PRIMARY' | 'SECONDARY'>('SECONDARY');
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const verifyInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [actionResult, setActionResult] = useState<UploadOrVerifyResult | null>(null);

  // Certificate Modal State
  const [selectedDocForCert, setSelectedDocForCert] = useState<Document | null>(null);
  const [certForm, setCertForm] = useState({
    deviceDescription: '',
    deviceOperator: '',
    recordDescription: '',
    signatory1Name: '',
    signatory1Designation: '',
    signatory2Name: '',
    signatory2Designation: '',
  });
  const [submittingCert, setSubmittingCert] = useState(false);
  const [certError, setCertError] = useState<string | null>(null);

  useEffect(() => {
    if (!caseId) return;
    fetchCaseDetails();
  }, [caseId]);

  // Debounced search / document fetch effect
  useEffect(() => {
    if (!caseId) return;
    const timer = setTimeout(() => {
      fetchDocuments(searchQuery);
    }, 350);

    return () => clearTimeout(timer);
  }, [caseId, searchQuery]);

  const fetchCaseDetails = async () => {
    setAccessDenied(null);
    try {
      const caseRes = await axios.get(`/api/cases/${caseId}`);
      setCaseDetails(caseRes.data);
    } catch (err: any) {
      if (err.response?.status === 403) {
        setAccessDenied(
          err.response?.data?.message || `Access Denied: You do not have permission to access Case #${caseId}.`,
        );
      } else {
        console.error('Error loading case details', err);
      }
    }
  };

  const fetchDocuments = async (query = '') => {
    setLoading(true);
    try {
      const qParam = query.trim() ? `&q=${encodeURIComponent(query.trim())}` : '';
      const docsRes = await axios.get(`/api/documents?caseId=${caseId}${qParam}`);
      setDocuments(docsRes.data);
    } catch (err: any) {
      console.error('Error fetching documents', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !caseId) return;

    setUploading(true);
    setActionResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('caseId', caseId);
    formData.append('evidenceType', selectedEvidenceType);

    try {
      const res = await axios.post('/api/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setActionResult(res.data);
      if (res.data.accepted) {
        fetchDocuments(searchQuery);
      }
    } catch (error: any) {
      setActionResult({
        status: 'tampered',
        accepted: false,
        message: error.response?.data?.message || 'Upload failed',
      });
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  };

  const handleVerify = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !caseId) return;

    setVerifying(true);
    setActionResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('caseId', caseId);

    try {
      const res = await axios.post('/api/documents/verify', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setActionResult(res.data);
    } catch (error: any) {
      setActionResult({
        status: 'not_found',
        verified: false,
        message: error.response?.data?.message || 'Verification failed',
      });
    } finally {
      setVerifying(false);
      if (verifyInputRef.current) verifyInputRef.current.value = '';
    }
  };

  const openCertModal = (doc: Document) => {
    setSelectedDocForCert(doc);
    setCertForm({
      deviceDescription: '',
      deviceOperator: doc.uploader.username,
      recordDescription: `Electronic file copy of "${doc.originalName}"`,
      signatory1Name: doc.uploader.username,
      signatory1Designation: `${doc.uploader.role} / Device Operator`,
      signatory2Name: user?.username || 'Admin / Officer in Charge',
      signatory2Designation: `${user?.role || 'ADMIN'} / In-Charge Officer`,
    });
    setCertError(null);
  };

  const handleCreateCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocForCert) return;

    setSubmittingCert(true);
    setCertError(null);

    try {
      await axios.post(`/api/documents/${selectedDocForCert.id}/certificate`, certForm);
      setSelectedDocForCert(null);
      fetchDocuments(searchQuery);
    } catch (err: any) {
      setCertError(err.response?.data?.message || 'Failed to generate Section 63(4) Certificate.');
    } finally {
      setSubmittingCert(false);
    }
  };

  const handleDownloadPdf = (docId: number, originalName: string) => {
    const pdfUrl = `/api/documents/${docId}/certificate/pdf`;
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `Section_63_4_Certificate_${originalName}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(key);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const formatHashTruncated = (hash?: string) => {
    if (!hash) return '-';
    if (hash.length <= 12) return hash;
    return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`;
  };

  const getSearchSnippet = (extractedText?: string | null, query?: string) => {
    if (!extractedText || !query || !query.trim()) return null;
    const cleanQuery = query.trim().toLowerCase();
    const textLower = extractedText.toLowerCase();
    const matchIndex = textLower.indexOf(cleanQuery);

    if (matchIndex === -1) return null;

    const start = Math.max(0, matchIndex - 40);
    const end = Math.min(extractedText.length, matchIndex + cleanQuery.length + 60);

    const beforeMatch = extractedText.substring(start, matchIndex);
    const matchText = extractedText.substring(matchIndex, matchIndex + cleanQuery.length);
    const afterMatch = extractedText.substring(matchIndex + cleanQuery.length, end);

    return (
      <div className="mt-1 text-xs text-gray-600 bg-amber-50/80 border border-amber-200/80 rounded px-2.5 py-1 max-w-xl">
        <span className="font-semibold text-amber-900 mr-1">Match snippet:</span>
        {start > 0 && '...'}
        <span>{beforeMatch}</span>
        <mark className="bg-amber-200 text-amber-950 font-semibold px-0.5 rounded">{matchText}</mark>
        <span>{afterMatch}</span>
        {end < extractedText.length && '...'}
      </div>
    );
  };

  if (accessDenied) {
    return (
      <div className="max-w-2xl mx-auto my-12 bg-white rounded-xl shadow-md border border-red-200 p-8 text-center space-y-4">
        <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-600">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">403 Forbidden — Access Restricted</h2>
        <p className="text-red-700 font-medium bg-red-50 p-4 rounded-lg border border-red-100">{accessDenied}</p>
        <p className="text-sm text-gray-500">
          Case access is restricted to assigned investigators and system administrators. Contact your administrator if you require access.
        </p>
        <div className="pt-2">
          <Link to="/cases" className="btn bg-gray-800 hover:bg-gray-900 text-white inline-block">
            ← Return to Accessible Cases
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner & Evidence Type Upload Selector */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/cases" className="text-xs text-blue-600 hover:underline font-semibold">
              ← Cases
            </Link>
            <span className="text-gray-300">/</span>
            <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 font-mono text-xs font-bold rounded border border-blue-100">
              {caseDetails?.caseNumber || `Case #${caseId}`}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{caseDetails?.title || 'Case Files'}</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {isAdmin
              ? 'Administrator View: Full access to documents, Section 63(4) BSA 2023 certificates & hash chain.'
              : 'Investigator View: Access to document evidence in assigned case.'}
          </p>
        </div>

        {/* Upload & Verification Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
          <div className="flex flex-col text-xs space-y-1">
            <span className="font-semibold text-gray-700">Evidence Classification:</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="evidenceType"
                  value="SECONDARY"
                  checked={selectedEvidenceType === 'SECONDARY'}
                  onChange={() => setSelectedEvidenceType('SECONDARY')}
                  className="text-amber-600 focus:ring-amber-500"
                />
                <span className="font-medium text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded text-[11px]">Secondary (Requires Sec 63(4))</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="evidenceType"
                  value="PRIMARY"
                  checked={selectedEvidenceType === 'PRIMARY'}
                  onChange={() => setSelectedEvidenceType('PRIMARY')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="font-medium text-blue-900 bg-blue-100 px-1.5 py-0.5 rounded text-[11px]">Primary (Original Device)</span>
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 sm:pt-0 sm:border-l sm:border-gray-300 sm:pl-3">
            <input type="file" ref={verifyInputRef} onChange={handleVerify} className="hidden" />
            <button
              onClick={() => verifyInputRef.current?.click()}
              disabled={verifying}
              className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg shadow-sm hover:bg-gray-50 font-medium transition-colors text-xs flex items-center gap-1.5"
            >
              {verifying ? 'Verifying...' : 'Verify File'}
            </button>

            <input type="file" ref={uploadInputRef} onChange={handleUpload} className="hidden" />
            <button
              onClick={() => uploadInputRef.current?.click()}
              disabled={uploading}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
              </svg>
              {uploading ? 'Uploading...' : 'Upload Document'}
            </button>
          </div>
        </div>
      </div>

      {/* Upload & Verify Response Banners */}
      {actionResult && (
        <div
          className={`p-5 rounded-xl border shadow-sm transition-all ${
            actionResult.status === 'new' || actionResult.status === 'verified'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : actionResult.status === 'duplicate'
              ? 'bg-gray-100 border-gray-300 text-gray-800'
              : actionResult.status === 'not_found'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-full mt-0.5 ${
                  actionResult.status === 'new' || actionResult.status === 'verified'
                    ? 'bg-emerald-100 text-emerald-700'
                    : actionResult.status === 'duplicate'
                    ? 'bg-gray-200 text-gray-700'
                    : actionResult.status === 'not_found'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                {actionResult.status === 'new' || actionResult.status === 'verified' ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                ) : actionResult.status === 'duplicate' ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                  </svg>
                ) : actionResult.status === 'not_found' ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                  </svg>
                )}
              </div>
              <div>
                <h3 className="text-lg font-bold">
                  {actionResult.status === 'new'
                    ? '✅ Document Uploaded Successfully'
                    : actionResult.status === 'verified'
                    ? '✅ Document Integrity Verified'
                    : actionResult.status === 'duplicate'
                    ? 'ℹ️ Duplicate Document Detected'
                    : actionResult.status === 'not_found'
                    ? '🔍 Document Record Not Found'
                    : '⚠️ Tampering Detected at Upload Time!'}
                </h3>
                <p className="text-sm mt-0.5 font-medium opacity-90">{actionResult.message}</p>
              </div>
            </div>
            <button
              onClick={() => setActionResult(null)}
              className="text-gray-400 hover:text-gray-700 p-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          {/* Forensic Comparison Panel for Tamper Attempts */}
          {actionResult.status === 'tampered' && actionResult.forensics && (
            <div className="mt-4 pt-4 border-t border-rose-200 bg-white/80 backdrop-blur p-4 rounded-lg">
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-800 mb-3 flex items-center gap-1.5">
                <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
                Forensic Analysis Details
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs mb-3">
                <div className="bg-rose-100/50 p-2.5 rounded border border-rose-200">
                  <span className="text-gray-500 font-semibold block mb-0.5">Original Uploader</span>
                  <span className="font-bold text-gray-900">{actionResult.forensics.uploaderUsername}</span>
                </div>
                <div className="bg-rose-100/50 p-2.5 rounded border border-rose-200">
                  <span className="text-gray-500 font-semibold block mb-0.5">Original Upload Timestamp</span>
                  <span className="font-mono text-gray-900">
                    {new Date(actionResult.forensics.uploadedAt).toLocaleString()}
                  </span>
                </div>
                <div className="bg-rose-100/50 p-2.5 rounded border border-rose-200">
                  <span className="text-gray-500 font-semibold block mb-0.5">Attempted Tamper Timestamp</span>
                  <span className="font-mono text-gray-900">
                    {new Date(actionResult.forensics.attemptedAt || actionResult.forensics.verifiedAt || Date.now()).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Hashes for Admin */}
              {isAdmin && (actionResult.storedFileHash || actionResult.recomputedFileHash || actionResult.attemptedFileHash) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                  <div className="bg-gray-100 p-2 rounded">
                    <span className="text-gray-500 font-sans font-semibold block">Stored Original Hash:</span>
                    <span className="text-gray-800 break-all">{actionResult.storedFileHash}</span>
                  </div>
                  <div className="bg-rose-100 p-2 rounded text-rose-900">
                    <span className="text-rose-700 font-sans font-semibold block">Attempted Upload Hash:</span>
                    <span className="break-all">{actionResult.attemptedFileHash || actionResult.recomputedFileHash}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents by filename or OCR extracted text..."
            className="w-full pl-10 pr-10 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading case documents...</div>
        ) : documents.length === 0 ? (
          <div className="p-12 text-center text-gray-500 space-y-2">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            <p className="font-semibold text-gray-700">No documents found</p>
            <p className="text-xs text-gray-400">
              {searchQuery ? `No matches for "${searchQuery}". Try a different keyword.` : 'Upload a document to get started.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Document Name
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Evidence Type
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sec 63(4) Certificate Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    OCR Status
                  </th>
                  {isAdmin && (
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      SHA-256 Hash Chain Ledger (Admin Only)
                    </th>
                  )}
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Uploader
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Upload Date
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {documents.map((doc) => {
                  const snippet = getSearchSnippet(doc.extractedText, searchQuery);
                  return (
                    <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-start">
                          <svg className="w-5 h-5 text-gray-400 mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
                          </svg>
                          <div>
                            <span className="font-medium text-gray-900 block">{doc.originalName}</span>
                            {snippet}
                          </div>
                        </div>
                      </td>

                      {/* Evidence Type Badge */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {doc.evidenceType === 'SECONDARY' ? (
                          <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-amber-100 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                            SECONDARY
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-blue-100 text-blue-800 border border-blue-200 inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                            PRIMARY
                          </span>
                        )}
                      </td>

                      {/* Section 63(4) Certificate Status & Actions */}
                      <td className="px-6 py-4 whitespace-nowrap text-xs">
                        {doc.evidenceType === 'PRIMARY' ? (
                          <span className="text-gray-400 italic">
                            Primary evidence — Section 63(4) certificate not required.
                          </span>
                        ) : doc.certificateGenerated || doc.certificate ? (
                          <button
                            onClick={() => handleDownloadPdf(doc.id, doc.originalName)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md shadow-sm transition-colors inline-flex items-center gap-1.5"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                            </svg>
                            Download Certificate PDF
                          </button>
                        ) : (
                          <button
                            onClick={() => openCertModal(doc)}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-md shadow-sm transition-colors inline-flex items-center gap-1.5"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                            </svg>
                            Generate Section 63(4) Certificate
                          </button>
                        )}
                      </td>

                      {/* OCR Status Badge */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {doc.extractedText ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200"
                            title="OCR text extracted & searchable"
                          >
                            <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            Searchable
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200"
                            title="No OCR text available for search"
                          >
                            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path>
                            </svg>
                            No OCR Text
                          </span>
                        )}
                      </td>

                      {isAdmin && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-400 font-semibold uppercase">File:</span>
                              <span className="text-xs font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded border border-gray-200">
                                {formatHashTruncated(doc.fileHash)}
                              </span>
                              {doc.fileHash && (
                                <button
                                  onClick={() => copyToClipboard(doc.fileHash!, `file-${doc.id}`)}
                                  className="text-[11px] text-blue-600 hover:text-blue-800 font-sans hover:underline"
                                  title="Copy full file hash"
                                >
                                  {copiedHash === `file-${doc.id}` ? 'Copied! ✓' : 'Copy'}
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-blue-500 font-semibold uppercase">Chain:</span>
                              <span className="text-xs font-mono bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-100">
                                {formatHashTruncated(doc.chainHash)}
                              </span>
                              {doc.chainHash && (
                                <button
                                  onClick={() => copyToClipboard(doc.chainHash!, `chain-${doc.id}`)}
                                  className="text-[11px] text-blue-600 hover:text-blue-800 font-sans hover:underline"
                                  title="Copy full chain hash"
                                >
                                  {copiedHash === `chain-${doc.id}` ? 'Copied! ✓' : 'Copy'}
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      )}

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 font-medium">{doc.uploader.username}</div>
                        <div className="text-xs text-gray-500">{doc.uploader.role}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(doc.uploadedAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Certificate Generation Modal */}
      {selectedDocForCert && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-2xl overflow-hidden my-8">
            <div className="bg-blue-900 text-white p-5 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold">Generate Section 63(4) BSA 2023 Certificate</h3>
                <p className="text-xs text-blue-200 mt-0.5">
                  Electronic Evidence Certificate for "{selectedDocForCert.originalName}"
                </p>
              </div>
              <button
                onClick={() => setSelectedDocForCert(null)}
                className="text-blue-200 hover:text-white p-1 rounded-lg"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateCertificate} className="p-6 space-y-4">
              {certError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-lg">
                  {certError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Device Particulars (Model / Serial No.) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dell Latitude 5420, SN: DL-883921"
                    value={certForm.deviceDescription}
                    onChange={(e) => setCertForm({ ...certForm, deviceDescription: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Device Operator / Controller Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Officer R. Sharma"
                    value={certForm.deviceOperator}
                    onChange={(e) => setCertForm({ ...certForm, deviceOperator: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Electronic Record Brief Description *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Extracted PDF copy of bank transaction ledger"
                  value={certForm.recordDescription}
                  onChange={(e) => setCertForm({ ...certForm, recordDescription: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                ></textarea>
              </div>

              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
                <span className="text-xs font-bold text-gray-800 block border-b border-gray-200 pb-1">
                  Dual Signatory Statutory Authentication (BSA 2023)
                </span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Signatory 1 */}
                  <div className="space-y-2">
                    <span className="font-semibold text-blue-900 block text-[11px]">Primary Signatory (Device Operator)</span>
                    <input
                      type="text"
                      required
                      placeholder="Name"
                      value={certForm.signatory1Name}
                      onChange={(e) => setCertForm({ ...certForm, signatory1Name: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-xs"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Designation"
                      value={certForm.signatory1Designation}
                      onChange={(e) => setCertForm({ ...certForm, signatory1Designation: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-xs"
                    />
                  </div>

                  {/* Signatory 2 */}
                  <div className="space-y-2">
                    <span className="font-semibold text-blue-900 block text-[11px]">Secondary Signatory (In-Charge Officer)</span>
                    <input
                      type="text"
                      required
                      placeholder="Name"
                      value={certForm.signatory2Name}
                      onChange={(e) => setCertForm({ ...certForm, signatory2Name: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-xs"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Designation"
                      value={certForm.signatory2Designation}
                      onChange={(e) => setCertForm({ ...certForm, signatory2Designation: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setSelectedDocForCert(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCert}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm"
                >
                  {submittingCert ? 'Generating...' : 'Generate & Store Certificate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default DocumentsPage;
