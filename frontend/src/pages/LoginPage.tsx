import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, getApiBaseUrl, setCustomApiUrl, getCustomApiUrl, isStaticProductionHost } from '../api/client';

export const LoginPage: React.FC = () => {
  const { login, sessionExpiredNotice, clearSessionExpiredNotice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const isStaticHostWithoutBackend = isStaticProductionHost() && !getApiBaseUrl();
  const [showApiConfig, setShowApiConfig] = useState(isStaticHostWithoutBackend);
  const [customApiInput, setCustomApiInput] = useState(() => getCustomApiUrl() || '');
  const [apiSaveSuccess, setApiSaveSuccess] = useState(false);

  const handleSaveApiUrl = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomApiUrl(customApiInput.trim() || null);
    setApiSaveSuccess(true);
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  // Check if redirected from a protected page
  const from = (location.state as any)?.from?.pathname || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResendStatus(null);
    clearSessionExpiredNotice();

    if (!email.trim() || !password) {
      setError('Please provide both your email address and password.');
      return;
    }

    setLoading(true);
    try {
      await login({ email: email.trim(), password, remember_me: rememberMe });
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email.trim()) {
      setError('Please enter your email address to resend verification.');
      return;
    }
    setResending(true);
    setResendStatus(null);
    try {
      const res = await api.resendVerification(email.trim());
      setResendStatus(res.message);
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification link.');
    } finally {
      setResending(false);
    }
  };

  const isUnverifiedError = error && error.toLowerCase().includes('not verified');

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#F8FAFC] p-4 font-sans text-[#0F172A]">
      <div className="w-full max-w-md bg-white rounded-[10px] border border-[#D8E2EE] shadow-sm p-8 space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-12 w-12 rounded-xl bg-[#03162D] border border-[#123047] flex items-center justify-center text-[#00D4C7] shadow-xs">
            <ShieldCheck className="h-6 w-6 text-[#00D4C7]" />
          </div>
          <h1 className="text-xl font-bold text-[#0F172A] tracking-tight">Software Architecture Drift Detector</h1>
          <p className="text-xs text-[#475569]">Sign in to inspect, analyze, and enforce architecture boundaries</p>
        </div>

        {/* Static Host Backend Alert */}
        {isStaticHostWithoutBackend && (
          <div className="p-3.5 rounded-lg bg-[#EFF6FF] border border-[#155EEF]/30 text-xs text-[#1E40AF] flex items-start gap-2.5 shadow-xs">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#155EEF]" />
            <div className="space-y-1">
              <p className="font-semibold text-[#1E3A8A]">Backend Connection Required</p>
              <p className="text-[#3B82F6] leading-relaxed">
                This site is hosted statically on GitHub Pages. To sign in and run scans, connect your deployed FastAPI backend below or run locally using <code className="bg-white px-1 py-0.5 rounded border border-[#BFDBFE]">start_servers.bat</code>.
              </p>
            </div>
          </div>
        )}

        {/* Session Notice */}
        {(sessionExpiredNotice || (location.state as any)?.message) && (
          <div className="p-3.5 rounded-lg bg-[#FEF3C7] border border-[#B45309]/30 text-sm text-[#B45309] flex items-start gap-2.5 shadow-xs">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-[#B45309]" />
            <div className="space-y-1 flex-1">
              <p className="font-semibold">{sessionExpiredNotice || (location.state as any)?.message}</p>
            </div>
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div className="p-3.5 rounded-lg bg-[#FEE2E2] border border-[#B42318]/30 text-xs text-[#B42318] flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#B42318]" />
            <div className="space-y-1 flex-1">
              <p className="font-semibold">{error}</p>
              {isUnverifiedError && (
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resending}
                  className="inline-flex items-center gap-1 font-semibold text-[#B42318] underline hover:text-[#7A1910] mt-1 cursor-pointer"
                >
                  {resending ? 'Sending...' : 'Resend verification email'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Resend success notification */}
        {resendStatus && (
          <div className="p-3.5 rounded-lg bg-[#E8F5E9] border border-[#10B981]/30 text-xs text-[#10B981] flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-[#10B981]" />
            <p>{resendStatus}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[15px] font-medium text-[#0F172A] mb-1.5" htmlFor="email">
              Work Email Address
            </label>
            <div className="relative">
              <Mail className="h-4 w-4 absolute left-3 top-3.5 text-[#475569]" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="architect@enterprise.com"
                required
                autoComplete="email"
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-[#D8E2EE] rounded-lg focus:outline-none focus:border-[#00D4C7] focus:ring-2 focus:ring-[#00D4C7]/20 text-[#0F172A] placeholder-[#94A3B8] transition-colors"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[15px] font-medium text-[#0F172A]" htmlFor="password">
                Password
              </label>
              <Link
                to="/forgot-password"
                className="text-xs font-semibold text-[#009F95] hover:text-[#007D75] transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="h-4 w-4 absolute left-3 top-3.5 text-[#475569]" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                autoComplete="current-password"
                className="w-full pl-9 pr-10 py-2.5 text-sm bg-white border border-[#D8E2EE] rounded-lg focus:outline-none focus:border-[#00D4C7] focus:ring-2 focus:ring-[#00D4C7]/20 text-[#0F172A] placeholder-[#94A3B8] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-[#475569] hover:text-[#0F172A] cursor-pointer"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-[#D8E2EE] text-[#009F95] focus:ring-[#00D4C7] h-4 w-4 cursor-pointer"
              />
              <span className="text-[#475569] text-sm">Remember me for 30 days</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-[#03162D] text-white font-semibold text-sm hover:bg-[#0A2548] transition-colors shadow-xs flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin text-[#00D4C7]" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="h-4 w-4 text-[#00D4C7]" />
              </>
            )}
          </button>
        </form>

        {/* Footer Links */}
        <div className="pt-4 border-t border-[#D8E2EE] flex flex-col items-center gap-2 text-xs text-[#475569]">
          <div>
            Don't have an enterprise account?{' '}
            <Link to="/register" className="font-semibold text-[#009F95] hover:underline">
              Create account
            </Link>
          </div>
          <div>
            Need email verification?{' '}
            <Link to="/verify-email" className="text-[#475569] hover:text-[#0F172A] hover:underline">
              Verify token manually
            </Link>
          </div>

          {/* Optional Backend API Endpoint Configuration for Static Hosting */}
          <div className="w-full pt-1 text-center">
            <button
              type="button"
              onClick={() => setShowApiConfig(!showApiConfig)}
              className="text-[11px] text-[#526078] hover:text-[#172B4D] hover:underline cursor-pointer"
            >
              {showApiConfig ? 'Hide API Connection Settings' : 'Configure Backend API Server'}
            </button>
            {showApiConfig && (
              <div className="mt-2.5 p-3 rounded-lg bg-[#F5F7FA] border border-[#D8E2EE] text-left space-y-2">
                <div className="text-[11px] text-[#475569]">
                  <span className="font-semibold text-[#0F172A]">Current Endpoint:</span>{' '}
                  <code className="text-[#0A2548] font-mono break-all">{getApiBaseUrl()}</code>
                </div>
                <div className="text-[11px] text-[#64748B]">
                  For static hosts like GitHub Pages, enter your deployed FastAPI URL (or tunnel URL) to communicate with your backend.
                </div>
                <form onSubmit={handleSaveApiUrl} className="flex gap-2">
                  <input
                    type="url"
                    value={customApiInput}
                    onChange={(e) => setCustomApiInput(e.target.value)}
                    placeholder="https://api.yourdomain.com"
                    className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-[#D8E2EE] rounded focus:outline-none focus:border-[#00D4C7] font-mono"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-semibold bg-[#03162D] text-white rounded hover:bg-[#0A2548] transition-colors cursor-pointer"
                  >
                    {apiSaveSuccess ? 'Saved!' : 'Save & Reload'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
