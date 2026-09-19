import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface User {
  id: number;
  username: string;
  role: string;
}

interface Case {
  id: number;
  caseNumber: string;
  title: string;
  createdAt: string;
  assignments: {
    user: User;
  }[];
  _count: {
    documents: number;
  };
}

function CasesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const navigate = useNavigate();

  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);

  // All system users (for assign modal) — fetched from API
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Modals / Toast state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCaseNumber, setNewCaseNumber] = useState('');
  const [newCaseTitle, setNewCaseTitle] = useState('');
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const [assigningCaseId, setAssigningCaseId] = useState<number | null>(null);
  const [assignUserId, setAssignUserId] = useState<number | ''>('');
  const [assignLoading, setAssignLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchCases = async () => {
    try {
      const res = await axios.get('/api/cases');
      setCases(res.data);
    } catch (error) {
      console.error('Failed to fetch cases', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    if (!isAdmin) return;
    try {
      const res = await axios.get('/api/auth/users');
      // Only show investigators in the assign dropdown (not admin accounts)
      const investigators = res.data.filter((u: User) => u.role === 'INVESTIGATOR');
      setAllUsers(investigators);
      if (investigators.length > 0) {
        setAssignUserId(investigators[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch users', error);
    }
  };

  useEffect(() => {
    fetchCases();
    fetchUsers();
  }, []);

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');

    const trimmedNumber = newCaseNumber.trim();
    const trimmedTitle = newCaseTitle.trim();

    if (!trimmedNumber || !trimmedTitle) {
      setCreateError('Both Case Number and Title are required.');
      return;
    }

    setCreateLoading(true);
    try {
      await axios.post('/api/cases', {
        caseNumber: trimmedNumber,
        title: trimmedTitle,
      });
      setShowCreateModal(false);
      setNewCaseNumber('');
      setNewCaseTitle('');
      showToast(`✅ Case "${trimmedTitle}" created successfully!`);
      fetchCases();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to create case. Please try again.';
      setCreateError(typeof msg === 'object' ? JSON.stringify(msg) : msg);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleAssignUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningCaseId || !assignUserId) return;
    setAssignLoading(true);
    try {
      await axios.post(`/api/cases/${assigningCaseId}/assign`, {
        userId: Number(assignUserId),
      });
      showToast('✅ Investigator assigned successfully!');
      setAssigningCaseId(null);
      fetchCases();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Assignment failed', 'error');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleRevokeUser = async (caseId: number, targetUserId: number, username: string) => {
    if (!window.confirm(`Revoke ${username}'s access to this case?`)) return;

    try {
      await axios.delete(`/api/cases/${caseId}/assign/${targetUserId}`);
      showToast(`✅ Revoked ${username}'s access successfully!`);
      fetchCases();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to revoke assignment', 'error');
    }
  };

  const openAssignModal = (caseId: number) => {
    setAssigningCaseId(caseId);
    // Reset to first investigator
    if (allUsers.length > 0) setAssignUserId(allUsers[0].id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
            </svg>
            Investigation Cases
          </h1>
          <p className="text-gray-500 mt-1">
            {isAdmin
              ? 'Administrator View: Access and manage all investigation case files.'
              : 'Investigator View: Access your assigned investigation case files.'}
          </p>
        </div>
        {isAdmin && (
          <button
            id="create-case-btn"
            onClick={() => { setCreateError(''); setShowCreateModal(true); }}
            className="btn flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path>
            </svg>
            Create New Case
          </button>
        )}
      </div>

      {toastMessage && (
        <div
          className={`p-4 rounded-lg font-medium border text-sm transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {toastMessage.text}
        </div>
      )}

      {/* Case List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {loading ? (
          <div className="col-span-2 p-8 text-center text-gray-500 bg-white rounded-xl">Loading cases...</div>
        ) : cases.length === 0 ? (
          <div className="col-span-2 p-12 text-center text-gray-500 bg-white rounded-xl">
            No cases available. {isAdmin && 'Click "Create New Case" above to start one.'}
          </div>
        ) : (
          cases.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 hover:border-blue-300 transition-all p-6 flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <span className="px-3 py-1 bg-blue-50 text-blue-700 font-mono text-xs font-bold rounded-md border border-blue-100">
                    {c.caseNumber}
                  </span>
                  <span className="text-xs text-gray-400 font-medium">
                    {c._count.documents} Document{c._count.documents === 1 ? '' : 's'}
                  </span>
                </div>
                <h3
                  onClick={() => navigate(`/cases/${c.id}/documents`)}
                  className="text-lg font-bold text-gray-900 hover:text-blue-600 cursor-pointer transition-colors"
                >
                  {c.title}
                </h3>
                <p className="text-xs text-gray-400 mt-1">Created: {new Date(c.createdAt).toLocaleDateString()}</p>

                {/* Assigned Users list */}
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                  <span className="text-gray-500 font-medium">Assigned Investigators:</span>
                  <div className="flex flex-wrap gap-1">
                    {c.assignments.length === 0 ? (
                      <span className="text-gray-400 italic">None</span>
                    ) : (
                      c.assignments.map((a) => (
                        <span
                          key={a.user.id}
                          className="bg-gray-100 text-gray-800 font-medium px-2.5 py-1 rounded text-[11px] flex items-center gap-1.5 border border-gray-200"
                        >
                          {a.user.username}
                          {isAdmin && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRevokeUser(c.id, a.user.id, a.user.username);
                              }}
                              className="text-gray-400 hover:text-red-600 font-bold ml-0.5 transition-colors"
                              title={`Revoke access for ${a.user.username}`}
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-3">
                <button
                  onClick={() => navigate(`/cases/${c.id}/documents`)}
                  className="flex-1 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold rounded-lg text-sm text-center transition-colors"
                >
                  Open Case Files →
                </button>
                {isAdmin && (
                  <button
                    onClick={() => openAssignModal(c.id)}
                    className="px-3 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium rounded-lg text-xs transition-colors"
                  >
                    Assign Investigator
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Case Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Create New Case</h3>
            {createError && (
              <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm font-medium border border-red-200 flex items-start gap-2">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {createError}
              </div>
            )}
            <form onSubmit={handleCreateCase} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Case Number / FIR</label>
                <input
                  type="text"
                  required
                  disabled={createLoading}
                  placeholder="e.g. FIR-2026-047"
                  className="input text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                  value={newCaseNumber}
                  onChange={(e) => setNewCaseNumber(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Case Title</label>
                <input
                  type="text"
                  required
                  disabled={createLoading}
                  placeholder="e.g. Financial Misconduct Investigation"
                  className="input text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                  value={newCaseTitle}
                  onChange={(e) => setNewCaseTitle(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={createLoading}
                  onClick={() => { setShowCreateModal(false); setCreateError(''); }}
                  className="px-4 py-2 border text-gray-600 rounded-lg text-sm hover:bg-gray-50 font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="submit-create-case"
                  disabled={createLoading}
                  className="btn text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {createLoading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Creating...
                    </>
                  ) : 'Create Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign User Modal */}
      {assigningCaseId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Assign Investigator to Case</h3>
            {allUsers.length === 0 ? (
              <p className="text-sm text-gray-500 mb-4">No investigators found in the system.</p>
            ) : (
              <form onSubmit={handleAssignUser} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Select Investigator</label>
                  <select
                    value={assignUserId}
                    onChange={(e) => setAssignUserId(parseInt(e.target.value, 10))}
                    className="input text-sm"
                  >
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.username} (ID: {u.id})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setAssigningCaseId(null)}
                    className="px-4 py-2 border text-gray-600 rounded-lg text-sm hover:bg-gray-50 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={assignLoading || !assignUserId}
                    className="btn text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                  >
                    {assignLoading ? 'Assigning...' : 'Assign'}
                  </button>
                </div>
              </form>
            )}
            {allUsers.length === 0 && (
              <div className="flex justify-end">
                <button
                  onClick={() => setAssigningCaseId(null)}
                  className="px-4 py-2 border text-gray-600 rounded-lg text-sm hover:bg-gray-50 font-medium"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CasesPage;
