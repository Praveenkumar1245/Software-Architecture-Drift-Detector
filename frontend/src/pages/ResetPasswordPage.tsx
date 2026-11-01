import React, { useState } from 'react';
import { useSearchParams, useLocation, Link } from 'react-router-dom';
import { ShieldCheck, Lock, Eye, EyeOff, CheckCircle2, AlertCircle, RefreshCw, ArrowRight, KeyRound } from 'lucide-react';
import { api } from '../api/client';

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const tokenFromUrl = searchParams.get('token') || (location.state as any)?.token || (location.state as any)?.reset_token || '';
  const emailFromUrl = searchParams.get('email') || (location.state as any)?.email || '';

  const [token, setToken] = useState(tokenFromUrl);
  const [email] = useState(emailFromUrl);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token.trim()) {
      setError('A valid single-use reset token is required. Please request a new verification code.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must contain at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter your new password.');
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword({
        token: token.trim(),
        reset_token: token.trim(),
        email: email.trim() || undefined,
        new_password: newPassword,
      });
      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. The reset session may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#F5F7FA] p-4 font-sans text-[#172B4D]">
      <div className="w-full max-w-md bg-white rounded-[12px] border border-[#D8E2EE] shadow-sm p-8 space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-12 w-12 rounded-xl bg-[#071D3A] flex items-center justify-center text-white">
            <ShieldCheck className="h-6 w-6 text-[#155EEF]" />
          </div>
          <div className="text-xs font-bold tracking-wider text-[#155EEF] uppercase">Drift Detector – Architecture Quality</div>
          <h1 className="text-[28px] font-bold text-[#071D3A] tracking-tight">
            {isSuccess ? 'Password Updated Successfully!' : 'Set New Password'}
          </h1>
          <p className="text-[15px] text-[#526078]">
            {isSuccess
              ? 'Your password has been changed. You can now log in using your new password.'
              : 'Update credentials for your developer account'}
          </p>
        </div>

        {isSuccess ? (
          <div className="space-y-5 text-center">
            <div className="p-6 rounded-[12px] bg-[#E8F5E9] border border-[#C8E6C9] space-y-3">
              <CheckCircle2 className="h-12 w-12 text-[#16845B] mx-auto" />
              <h2 className="text-lg font-bold text-[#16845B]">Password Updated Successfully!</h2>
              <p className="text-sm text-[#16845B] leading-relaxed">
                Your password has been changed. You can now log in using your new password.
              </p>
            </div>

            <Link
              to="/login"
              className="w-full py-2.5 px-4 rounded-lg bg-[#071D3A] hover:bg-[#10356D] text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              <span>Go to Login</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="p-3.5 rounded-lg bg-[#FEE2E2] border border-[#FECACA] text-sm text-[#B42318] flex items-start gap-2.5 font-medium">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-[#B42318]" />
                <div className="flex-1 text-xs leading-relaxed">{error}</div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {!tokenFromUrl && (
                <div>
                  <label className="block text-[15px] font-medium text-[#172B4D] mb-1.5" htmlFor="token">
                    Reset Token / Code
                  </label>
                  <div className="relative">
                    <KeyRound className="h-4 w-4 absolute left-3 top-3 text-[#526078]" />
                    <input
                      id="token"
                      type="text"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="Paste your reset authorization token"
                      required
                      className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#D8E2EE] rounded-lg text-[#172B4D] focus:outline-none focus:border-[#155EEF] transition-colors"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[15px] font-medium text-[#172B4D] mb-1.5" htmlFor="newPassword">
                  New Password <span className="text-[#B42318]">*</span>
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 absolute left-3 top-3 text-[#526078]" />
                  <input
                    id="newPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full pl-9 pr-10 py-2 text-sm bg-white border border-[#D8E2EE] rounded-lg text-[#172B4D] focus:outline-none focus:border-[#155EEF] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-[#526078] hover:text-[#172B4D] cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[15px] font-medium text-[#172B4D] mb-1.5" htmlFor="confirmPassword">
                  Confirm New Password <span className="text-[#B42318]">*</span>
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 absolute left-3 top-3 text-[#526078]" />
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    required
                    autoComplete="new-password"
                    className="w-full pl-9 pr-10 py-2 text-sm bg-white border border-[#D8E2EE] rounded-lg text-[#172B4D] focus:outline-none focus:border-[#155EEF] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-2.5 text-[#526078] hover:text-[#172B4D] cursor-pointer"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Password Requirements Checklist */}
              <div className="p-3 rounded-lg bg-[#F5F7FA] border border-[#D8E2EE] space-y-1.5 text-xs text-[#526078]">
                <div className="font-semibold text-[#071D3A]">Password Requirements:</div>
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${newPassword.length >= 8 ? 'bg-[#16845B]' : 'bg-[#D8E2EE]'}`}></span>
                  <span>Minimum 8 characters</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      newPassword && confirmPassword && newPassword === confirmPassword ? 'bg-[#16845B]' : 'bg-[#D8E2EE]'
                    }`}
                  ></span>
                  <span>Passwords match</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || newPassword.length < 8 || newPassword !== confirmPassword}
                className="w-full py-2.5 px-4 rounded-lg bg-[#155EEF] hover:bg-[#1247C7] text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer shadow-sm"
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Resetting Password...</span>
                  </>
                ) : (
                  <>
                    <span>Reset Password</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              <div className="pt-2 text-center text-xs text-[#526078]">
                <Link to="/forgot-password" className="text-[#155EEF] hover:underline">
                  Need a new OTP code? Restart recovery
                </Link>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
