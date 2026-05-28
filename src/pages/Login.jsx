import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MapPin, Eye, EyeOff, AlertCircle, Loader2, ServerCrash, RefreshCw } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverStatus, setServerStatus] = useState('checking'); // 'checking' | 'ready' | 'waking' | 'error'
  const [serverMessage, setServerMessage] = useState('Connecting to server...');
  const { login } = useAuth();
  const navigate = useNavigate();

  // Check backend health on mount
  useEffect(() => {
    let cancelled = false;
    checkServer(cancelled);
    return () => { cancelled = true; };
  }, []);

  async function checkServer(cancelled = false) {
    setServerStatus('checking');
    setServerMessage('Connecting to server...');

    const maxAttempts = 12; // ~60 seconds total
    for (let i = 1; i <= maxAttempts; i++) {
      if (cancelled) return;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        
        const res = await fetch(`${API_BASE}/api/health`, { signal: controller.signal });
        clearTimeout(timeout);
        const data = await res.json();
        
        if (data.database === 'connected') {
          if (!cancelled) {
            setServerStatus('ready');
            setServerMessage('');
          }
          return;
        } else {
          if (!cancelled) {
            setServerStatus('waking');
            setServerMessage(`Server is starting up... Database: ${data.database} (attempt ${i}/${maxAttempts})`);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setServerStatus('waking');
          setServerMessage(`Waking up server... This can take up to 60s on free tier (attempt ${i}/${maxAttempts})`);
        }
      }
      // Wait 5 seconds before retry
      await new Promise(r => setTimeout(r, 5000));
    }
    if (!cancelled) {
      setServerStatus('error');
      setServerMessage('Server could not be reached. Please try again.');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Failed to sign in');
    }
    setLoading(false);
  }

  const isServerReady = serverStatus === 'ready';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 transition-colors">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30 mb-4">
            <MapPin className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">SmartAttend AI</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Sign in to your account</p>
        </div>

        {/* Server Status Banner */}
        {serverStatus !== 'ready' && (
          <div className={`mb-4 p-4 rounded-2xl border flex items-center gap-3 ${
            serverStatus === 'error' 
              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50' 
              : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50'
          }`}>
            {serverStatus === 'error' ? (
              <ServerCrash className="w-5 h-5 text-red-500 shrink-0" />
            ) : (
              <Loader2 className="w-5 h-5 text-amber-500 shrink-0 animate-spin" />
            )}
            <div className="flex-1">
              <p className={`text-sm font-medium ${
                serverStatus === 'error' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'
              }`}>
                {serverStatus === 'error' ? '⚠️ Server Unavailable' : '☕ Waking up server...'}
              </p>
              <p className={`text-xs mt-0.5 ${
                serverStatus === 'error' ? 'text-red-600/70 dark:text-red-400/70' : 'text-amber-600/70 dark:text-amber-400/70'
              }`}>
                {serverMessage}
              </p>
            </div>
            {serverStatus === 'error' && (
              <button 
                onClick={() => checkServer(false)} 
                className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Card */}
        <div className="pro-card p-8">
          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl flex items-center gap-2 text-red-700 dark:text-red-300 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Email</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={!isServerReady}
                className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Password</label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={!isServerReady}
                  className="w-full px-4 py-2.5 pr-12 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !isServerReady}
              className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-medium rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {!isServerReady ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Waiting for server...
                </>
              ) : loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <p className="text-center mt-6 text-sm text-slate-500 dark:text-slate-400">
            Don't have an account?{' '}
            <Link to="/signup" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

