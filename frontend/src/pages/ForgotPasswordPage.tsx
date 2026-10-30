import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, Mail, Lock, Eye, EyeOff, ArrowRight, CheckCircle2, AlertCircle, RefreshCw, Clock } from 'lucide-react';
import { api } from '../api/client';

export const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();

  // Workflow steps: 'request_otp' | 'verify_otp' | 'set_new_password' | 'success'
  const [step, setStep] = useState<'request_otp' | 'verify_otp' | 'set_new_password' | 'success'>('request_otp');

  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState('');

  // 6-digit OTP state
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Password fields
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Timers: 5-minute expiration (300s), 60-second cooldown
  const [otpExpirySeconds, setOtpExpirySeconds] = useState(300);
  const [resendCooldown, setResendCooldown] = useState(60);

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // 5-minute OTP countdown timer
  useEffect(() => {
    let timer: any = null;
    if (step === 'verify_otp' && otpExpirySeconds > 0) {
      timer = setInterval(() => {
        setOtpExpirySeconds((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [step, otpExpirySeconds]);

  // 60-second Resend cooldown timer
  useEffect(() => {
    let timer: any = null;
    if (step === 'verify_otp' && resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [step, resendCooldown]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Step 1: Send OTP to email
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter your registered email address.');
      return;
    }

    setLoading(true);
    setError(null);
    setInfoMessage(null);

    try {
      const res = await api.forgotPassword(trimmedEmail);
      setInfoMessage(res.message || 'A 6-digit verification code has been dispatched to your email.');
      setStep('verify_otp');
      setOtpDigits(['', '', '', '', '', '']);
      setOtpExpirySeconds(300);
      setResendCooldown(60);

      setTimeout(() => {
        otpInputsRef.current[0]?.focus();
      }, 100);
    } catch (err: any) {
      if (err.status === 429 || (err.message && err.message.toLowerCase().includes('wait'))) {
        const match = err.message && err.message.match(/(\d+)\s*seconds?/i);
        const secs = match ? parseInt(match[1], 10) : 45;
        setResendCooldown(secs);
        setStep('verify_otp');
        setOtpDigits(['', '', '', '', '', '']);
        setInfoMessage('A 6-digit verification code was recently sent to your email. Please enter it below:');
        setError(null);
        setTimeout(() => {
          otpInputsRef.current[0]?.focus();
        }, 100);
      } else {
        setError(err.message || 'Failed to dispatch password recovery code.');
      }
    } finally {
      setLoading(false);
    }
  };

  // OTP inputs handler
  const handleOtpChange = (index: number, value: string) => {
    const val = value.replace(/\D/g, '');
    const newDigits = [...otpDigits];

    if (!val) {
      newDigits[index] = '';
      setOtpDigits(newDigits);
      return;
    }

    newDigits[index] = val.slice(-1);
    setOtpDigits(newDigits);

    if (index < 5 && val) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newDigits = [...otpDigits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || '';
    }
    setOtpDigits(newDigits);

    const nextIdx = Math.min(pasted.length, 5);
    otpInputsRef.current[nextIdx]?.focus();
  };

  // Step 2: Verify 6-digit OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullOtp = otpDigits.join('');

    if (fullOtp.length !== 6) {
      setError('Please enter all 6 digits of the verification code.');
      return;
    }

    if (otpExpirySeconds <= 0) {
      setError('Verification code has expired. Please click "Resend Code" to obtain a new code.');
      return;
    }

    setLoading(true);
    setError(null);
    setInfoMessage(null);

    try {
      const res = await api.verifyResetOtp({
        email: email.trim(),
        otp: fullOtp,
      });

      setResetToken(res.reset_token);
      setStep('set_new_password');
    } catch (err: any) {
      setError(err.message || 'Invalid or expired verification code.');
    } finally {
      setLoading(false);
    }
  };

  // Resend Reset OTP
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || resending) return;

    setResending(true);
    setError(null);
    setInfoMessage(null);

    try {
      const res = await api.resendResetOtp({ email: email.trim() });
      setInfoMessage(res.message || 'A fresh 6-digit verification code has been dispatched to your email.');
      setOtpDigits(['', '', '', '', '', '']);
      setOtpExpirySeconds(300);
      setResendCooldown(60);
      otpInputsRef.current[0]?.focus();
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification code.');
    } finally {
      setResending(false);
    }
  };

  // Step 3: Set New Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

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
        email: email.trim(),
        reset_token: resetToken,
        new_password: newPassword,
      });

      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Failed to update password. Your reset session may have expired.');
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
            {step === 'request_otp' && 'Password Recovery'}
            {step === 'verify_otp' && 'Verify Your Email'}
            {step === 'set_new_password' && 'Set New Password'}
            {step === 'success' && 'Password Updated Successfully!'}
          </h1>
          <p className="text-[15px] text-[#526078]">
            {step === 'request_otp' && 'Enter your registered email to receive a 6-digit OTP code'}
            {step === 'verify_otp' && 'A 6-digit verification code has been sent to your email.'}
            {step === 'set_new_password' && 'Create a strong, secure password for your account'}
            {step === 'success' && 'Your password has been changed. You can now log in using your new password.'}
          </p>
        </div>

        {/* Global Error Notice */}
        {error && (
          <div className="p-3.5 rounded-lg bg-[#FEE2E2] border border-[#FECACA] text-sm text-[#B42318] flex items-start gap-2.5 font-medium">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-[#B42318]" />
            <div className="flex-1 text-xs leading-relaxed">{error}</div>
          </div>
        )}

        {/* Global Info / Status Notice */}
        {infoMessage && (
          <div className="p-3.5 rounded-lg bg-[#E8F5E9] border border-[#C8E6C9] text-xs text-[#16845B] flex items-start gap-2.5 font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-[#16845B]" />
            <p className="flex-1">{infoMessage}</p>
          </div>
        )}

        {/* ================= STEP 1: Request OTP ================= */}
        {step === 'request_otp' && (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <div>
              <label className="block text-[15px] font-medium text-[#172B4D] mb-1.5" htmlFor="email">
                Registered Email Address <span className="text-[#B42318]">*</span>
              </label>
              <div className="relative">
                <Mail className="h-4 w-4 absolute left-3 top-3 text-[#526078]" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="architect@enterprise.com"
                  required
                  autoComplete="email"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#D8E2EE] rounded-lg text-[#172B4D] focus:outline-none focus:border-[#155EEF] transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-[#071D3A] hover:bg-[#10356D] text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer shadow-sm"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Sending Verification Code...</span>
                </>
              ) : (
                <>
                  <span>Send OTP</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <div className="pt-4 border-t border-[#D8E2EE] text-center text-xs text-[#526078]">
              Remembered your credentials?{' '}
              <Link to="/login" className="font-semibold text-[#155EEF] hover:underline">
                Sign in
              </Link>
            </div>
          </form>
        )}

        {/* ================= STEP 2: Verify 6-digit OTP ================= */}
        {step === 'verify_otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-6">
            <div className="p-3.5 rounded-lg bg-[#F5F7FA] border border-[#D8E2EE] text-center space-y-1">
              <p className="text-xs text-[#526078]">Verification code sent to:</p>
              <p className="text-sm font-semibold text-[#071D3A] break-all">{email}</p>
            </div>

            {/* 6-digit OTP Input Boxes */}
            <div className="space-y-2">
              <label className="block text-center text-xs font-semibold uppercase tracking-wider text-[#526078]">
                Enter 6-Digit Verification Code
              </label>
              <div className="flex justify-center items-center gap-2 sm:gap-3" onPaste={handleOtpPaste}>
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      otpInputsRef.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    pattern="\d*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    className="w-11 h-13 sm:w-12 sm:h-14 text-center text-2xl font-bold font-mono text-[#071D3A] bg-white border-2 border-[#D8E2EE] rounded-lg focus:outline-none focus:border-[#155EEF] focus:ring-2 focus:ring-[#155EEF]/20 transition-all"
                  />
                ))}
              </div>
            </div>

            {/* Expiration countdown and Resend Cooldown */}
            <div className="flex items-center justify-between text-xs text-[#526078] px-1">
              <div className="flex items-center gap-1.5 font-medium">
                <Clock className="h-4 w-4 text-[#526078]" />
                {otpExpirySeconds > 0 ? (
                  <span>
                    Expires in:{' '}
                    <strong className={otpExpirySeconds < 60 ? 'text-[#B42318]' : 'text-[#071D3A]'}>
                      {formatTime(otpExpirySeconds)}
                    </strong>
                  </span>
                ) : (
                  <span className="text-[#B42318] font-semibold">Code expired</span>
                )}
              </div>

              <div>
                {resendCooldown > 0 ? (
                  <span className="text-[#526078]">
                    Resend in <strong className="text-[#071D3A]">{resendCooldown}s</strong>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resending}
                    className="font-semibold text-[#155EEF] hover:text-[#10356D] underline cursor-pointer disabled:opacity-50 flex items-center gap-1"
                  >
                    {resending ? <RefreshCw className="h-3 w-3 animate-spin" /> : null}
                    <span>Resend OTP</span>
                  </button>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || otpDigits.join('').length !== 6 || otpExpirySeconds <= 0}
              className="w-full py-2.5 px-4 rounded-lg bg-[#155EEF] hover:bg-[#1247C7] text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Verifying Code...</span>
                </>
              ) : (
                <>
                  <span>Verify OTP</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setStep('request_otp');
                  setError(null);
                  setInfoMessage(null);
                }}
                className="text-xs text-[#526078] hover:text-[#172B4D] underline cursor-pointer"
              >
                Change email address
              </button>
            </div>
          </form>
        )}

        {/* ================= STEP 3: Set New Password ================= */}
        {step === 'set_new_password' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
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
                  <span>Updating Password...</span>
                </>
              ) : (
                <>
                  <span>Reset Password</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* ================= STEP 4: Success Confirmation ================= */}
        {step === 'success' && (
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
        )}
      </div>
    </div>
  );
};
