import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ShieldCheck, CheckCircle2, AlertCircle, RefreshCw, Mail, ArrowRight, KeyRound } from 'lucide-react';
import { api } from '../api/client';

export const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token');

  const [tokenInput, setTokenInput] = useState(tokenFromUrl || '');
  const [resendEmail, setResendEmail] = useState('');

  const [verifying, setVerifying] = useState(false);
  const [verifiedSuccess, setVerifiedSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const executeVerification = async (tok: string) => {
    if (!tok.trim()) {
      setError('Please provide a valid verification token.');
      return;
    }
    setVerifying(true);
    setError(null);
    setVerifiedSuccess(null);
    try {
      const res = await api.verifyEmail(tok.trim());
      setVerifiedSuccess(res.message);
    } catch (err: any) {
      setError(err.message || 'Verification failed. The link may have expired or been used already.');
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (tokenFromUrl) {
      executeVerification(tokenFromUrl);
    }
  }, [tokenFromUrl]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeVerification(tokenInput);
  };

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) return;
    setResending(true);
    setResendMessage(null);
    setError(null);
    try {
      const res = await api.resendVerification(resendEmail.trim());
      setResendMessage(res.message);
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification email.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#F8FAFC] p-4 font-sans text-[#0F172A]">
      <div className="w-full max-w-md bg-white rounded-[10px] border border-[#D8E2EE] p-8 space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-12 w-12 rounded-xl bg-[#03162D] flex items-center justify-center text-white">
            <ShieldCheck className="h-6 w-6 text-[#009F95]" />
          </div>
          <h1 className="text-[22px] font-semibold text-[#0F172A] tracking-tight">Email Ownership Verification</h1>
          <p className="text-sm text-[#475569]">Cryptographically authenticating developer identity</p>
        </div>

        {/* Verifying Spinner */}
        {verifying && (
          <div className="py-8 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="h-8 w-8 text-[#009F95] animate-spin" />
            <p className="text-sm font-semibold text-[#0F172A]">Validating single-use token...</p>
            <p className="text-xs text-[#475569]">Communicating with verification authority</p>
          </div>
        )}

        {/* Success State */}
        {verifiedSuccess && (
          <div className="space-y-5">
            <div className="p-4 rounded-[10px] bg-[#E8F5E9] border border-[#C8E6C9] text-[#10B981] space-y-2 text-center">
              <CheckCircle2 className="h-8 w-8 text-[#10B981] mx-auto" />
              <h2 className="font-semibold text-base text-[#10B981]">Email Successfully Verified!</h2>
              <p className="text-xs text-[#10B981] leading-relaxed">{verifiedSuccess}</p>
            </div>
            <Link
              to="/login"
              className="w-full py-2.5 px-4 rounded-lg bg-[#03162D] hover:bg-[#0A2548] text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              <span>Sign In to Dashboard</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {/* Error State */}
        {error && !verifying && (
          <div className="p-3.5 rounded-lg bg-[#FEE2E2] border border-[#FECACA] text-xs text-[#B42318] flex items-start gap-2.5 font-medium">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#B42318]" />
            <div className="space-y-1">
              <p className="font-semibold">{error}</p>
            </div>
          </div>
        )}

        {/* Resend success notice */}
        {resendMessage && (
          <div className="p-3.5 rounded-lg bg-[#E8F5E9] border border-[#C8E6C9] text-xs text-[#10B981] flex items-start gap-2.5 font-semibold">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-[#10B981]" />
            <p>{resendMessage}</p>
          </div>
        )}

        {/* Manual Token Verification Form (if URL had no token or error occurred) */}
        {!verifiedSuccess && !verifying && (
          <div className="space-y-6 pt-2">
            {!tokenFromUrl && (
              <form onSubmit={handleManualSubmit} className="space-y-3">
                <label className="block text-[15px] font-medium text-[#0F172A]" htmlFor="token">
                  Enter Verification Token Manually
                </label>
                <div className="relative">
                  <KeyRound className="h-4 w-4 absolute left-3 top-3 text-[#475569]" />
                  <input
                    id="token"
                    type="text"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Paste secure token"
                    required
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#D8E2EE] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#00D4C7] transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 px-4 rounded-lg bg-[#03162D] hover:bg-[#0A2548] text-white font-semibold text-xs transition-colors"
                >
                  Verify Token
                </button>
              </form>
            )}

            {/* Resend Form */}
            <div className="pt-4 border-t border-[#D8E2EE] space-y-3">
              <h2 className="text-[15px] font-medium text-[#0F172A]">Need a fresh verification link?</h2>
              <form onSubmit={handleResend} className="space-y-2">
                <div className="relative">
                  <Mail className="h-4 w-4 absolute left-3 top-2.5 text-[#475569]" />
                  <input
                    type="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder="Enter registered email"
                    required
                    className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#D8E2EE] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#00D4C7] transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={resending}
                  className="w-full py-2 px-3 rounded-lg bg-white border border-[#D8E2EE] text-[#0F172A] hover:bg-[#F8FAFC] font-semibold text-xs transition-colors disabled:opacity-60"
                >
                  {resending ? 'Sending...' : 'Request New Verification Email'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Return to Sign in */}
        <div className="pt-4 border-t border-[#D8E2EE] text-center text-xs text-[#475569]">
          Already verified?{' '}
          <Link to="/login" className="font-semibold text-[#009F95] hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};
