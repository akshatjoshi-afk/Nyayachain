import { useState } from 'react';
import axios from 'axios';

interface Source {
  text: string;
  doc_name: string;
  score: number;
}

interface AskAIPanelProps {
  caseId: string;
}

function AskAIPanel({ caseId }: AskAIPanelProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAsk = async () => {
    if (!question.trim()) return;

    setLoading(true);
    setError(null);
    setAnswer(null);
    setSources([]);

    try {
      const res = await axios.post('/api/documents/ask', {
        caseId,
        question,
      });
      setAnswer(res.data.answer);
      setSources(res.data.sources || []);
    } catch (err: any) {
      if (err.response?.status === 403) {
        setError(err.response?.data?.message || 'Access Denied: You do not have permission to query this case.');
      } else {
        setError(err.response?.data?.message || 'Something went wrong asking the AI.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAsk();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <h3 className="text-lg font-bold text-gray-900">Ask AI About This Case</h3>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. What time did the incident occur?"
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <button
          onClick={handleAsk}
          disabled={loading || !question.trim()}
          className="btn bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Thinking...' : 'Ask'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {answer && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-blue-700 mb-1">
              AI Answer
            </div>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{answer}</p>
          </div>

          {sources.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                Sources ({sources.length})
              </div>
              <div className="space-y-2">
                {sources.map((src, i) => (
                  <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-semibold text-gray-700">{src.doc_name}</span>
                      <span className="text-gray-400">relevance: {src.score}</span>
                    </div>
                    <p className="text-gray-600 line-clamp-2">{src.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AskAIPanel;