
import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  // Countdown timer while account is locked
  useEffect(() => {
    if (!isLocked || !lockedUntil) return;

    const tick = () => {
      const diff = lockedUntil.getTime() - Date.now();

      if (diff <= 0) {
        setIsLocked(false);
        setLockedUntil(null);
        setCountdown('');
        setError('');
        return;
      }

      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);

      setCountdown(`${mins}m ${secs.toString().padStart(2, '0')}s`);
    };

    tick();

    const interval = setInterval(tick, 1000);

    return () => clearInterval(interval);
  }, [isLocked, lockedUntil]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (loading || isLocked) return;

    setError('');

    const cleanUsername = username.trim();

    if (!cleanUsername || !password) {
      setError('Please fill in both username and password.');
      return;
    }

    setLoading(true);

    try {
      const res = await axios.post('/api/auth/login', {
        username: cleanUsername,
        password,
      });

      login(res.data.access_token, res.data.user);
      navigate('/cases');
    } catch (err: any) {
      if (!err.response) {
        setError(
          'Unable to connect to server. Please verify the backend is running.',
        );
      } else if (err.response.status === 429) {
        const body = err.response.data;
        const until = body?.lockedUntil
          ? new Date(body.lockedUntil)
          : null;

        setIsLocked(true);
        setLockedUntil(until);
        setError(
          body?.message || 'Account locked. Please try again later.',
        );
      } else if (err.response.status === 401) {
        setError('Invalid username or password.');
      } else {
        setError(
          err.response.data?.message ||
            'Login failed. Please try again.',
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 absolute inset-0">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-2xl shadow-xl border border-gray-100">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>

          <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            NyayaChain
          </h2>

          <p className="mt-2 text-sm text-gray-500">
            Secure Document Management System
          </p>
        </div>

        <form
          className="mt-8 space-y-6"
          onSubmit={handleSubmit}
        >
          {isLocked ? (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-start gap-3">
              <svg
                className="w-5 h-5 text-amber-600 shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                  clipRule="evenodd"
                />
              </svg>

              <div>
                <p className="text-sm font-semibold text-amber-800">
                  Account Temporarily Locked
                </p>

                <p className="text-xs text-amber-700 mt-1">
                  {error}
                </p>

                {countdown && (
                  <p className="mt-2 text-xs font-mono font-bold text-amber-900">
                    Unlocks in:{' '}
                    <span className="text-base">
                      {countdown}
                    </span>
                  </p>
                )}
              </div>
            </div>
          ) : error ? (
            <div className="bg-red-50 text-red-600 p-3.5 rounded-lg text-sm border border-red-100 flex items-start gap-2.5">
              <svg
                className="w-5 h-5 shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414-1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>

              <span>{error}</span>
            </div>
          ) : null}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>

              <input
                id="username"
                type="text"
                required
                disabled={loading || isLocked}
                className="input disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>

              <input
                id="password"
                type="password"
                required
                disabled={loading || isLocked}
                className="input disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            id="login-submit"
            disabled={loading || isLocked}
            className="w-full flex items-center justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>

                Signing in...
              </span>
            ) : isLocked ? (
              <span className="flex items-center gap-2">
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                    clipRule="evenodd"
                  />
                </svg>

                Account Locked {countdown && `(${countdown})`}
              </span>
            ) : (
              'Sign in'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;

