import { useState, useEffect } from 'react';
import axios from 'axios';

interface AuditLog {
  id: number;
  action: string;
  result: string;
  createdAt: string;
  user: {
    username: string;
    role: string;
  };
  document: {
    originalName: string;
    fileHash?: string;
    chainHash?: string;
  } | null;
}

interface ChainVerifyResult {
  intact: boolean;
  totalDocs?: number;
  brokenDocId?: number;
  filename?: string;
  reason?: string;
  message: string;
}

function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingChain, setVerifyingChain] = useState(false);
  const [chainResult, setChainResult] = useState<ChainVerifyResult | null>(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const res = await axios.get('/api/audit');
      setLogs(res.data);
    } catch (error) {
      console.error('Error fetching audit logs', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyChain = async () => {
    setVerifyingChain(true);
    setChainResult(null);
    try {
      const res = await axios.get('/api/audit/verify-chain');
      setChainResult(res.data);
    } catch (error: any) {
      setChainResult({
        intact: false,
        message: error.response?.data?.message || 'Chain verification failed',
      });
    } finally {
      setVerifyingChain(false);
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'UPLOAD':
        return <span className="px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">UPLOAD</span>;
      case 'VERIFY_OK':
      case 'VERIFY_SUCCESS':
        return <span className="px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-emerald-100 text-emerald-800">VERIFY OK</span>;
      case 'TAMPERED':
      case 'VERIFY_FAIL':
        return <span className="px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-rose-100 text-rose-800">TAMPERED</span>;
      case 'NOT_FOUND':
        return <span className="px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-amber-100 text-amber-800">NOT FOUND</span>;
      default:
        return <span className="px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">{action}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            Global Audit Log
          </h1>
          <p className="text-gray-500 mt-1">
            Immutable record of all document uploads, verification attempts, and integrity checks across the system.
          </p>
        </div>
        <div>
          <button
            onClick={handleVerifyChain}
            disabled={verifyingChain}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg shadow hover:from-blue-700 hover:to-indigo-700 font-medium transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
            </svg>
            {verifyingChain ? 'Auditing Hash Chain...' : 'Verify Hash Chain Integrity'}
          </button>
        </div>
      </div>

      {chainResult && (
        <div
          className={`p-4 rounded-xl border flex items-start justify-between ${
            chainResult.intact ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              {chainResult.intact ? (
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
                </svg>
              ) : (
                <svg className="w-6 h-6 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                </svg>
              )}
            </div>
            <div>
              <h3 className="font-bold text-base">{chainResult.message}</h3>
              {chainResult.reason && <p className="text-sm mt-1 font-mono text-rose-800 bg-rose-100/70 p-2 rounded">{chainResult.reason}</p>}
            </div>
          </div>
          <button onClick={() => setChainResult(null)} className="text-gray-400 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading audit trail...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No audit logs found.</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Document
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{log.user.username}</div>
                    <div className="text-xs text-gray-500">{log.user.role}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">{getActionBadge(log.action)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {log.document?.originalName || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{log.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default AuditLogPage;
