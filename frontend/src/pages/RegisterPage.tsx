import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, Mail, Lock, User, Eye, EyeOff, AlertCircle, ArrowRight, CheckCircle2, RefreshCw, Clock } from 'lucide-react';
import { api } from '../api/client';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();

  // Registration form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  // Workflow steps: 'form' | 'verify_otp' | 'success'
  const [step, setStep] = useState<'form' | 'verify_otp' | 'success'>('form');

  // OTP state
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Timers: 5-minute OTP expiration countdown, 60-second resend cooldown
  const [otpExpirySeconds, setOtpExpirySeconds] = useState(300); // 5 minutes = 300s
  const [resendCooldown, setResendCooldown] = useState(60); // 60s cooldown

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Expiration timer (5 minutes)
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

  // Resend cooldown timer (60 seconds)
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

  // Format MM:SS for countdown
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Step 1: Submit Registration Form
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Please fill in all required fields.');
      return;
    }

    if (password.length < 8) {
      setError('Password must contain at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter your password.');
      return;
    }

    if (!agreeTerms) {
      setError('Please acknowledge the terms of architecture inspection.');
      return;
    }

    setLoading(true);
    try {
      await api.register({
        email: trimmedEmail,
        password,
        full_name: fullName.trim() || undefined,
      });

      // Switch to OTP verification step
      setStep('verify_otp');
      setOtpDigits(['', '', '', '', '', '']);
      setOtpExpirySeconds(300); // 5-minute countdown
      setResendCooldown(60); // 60s cooldown
      setError(null);

      // Focus first OTP input
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
        setInfoMessage('A verification code was recently sent to your email. Please enter it below:');
        setError(null);
        setTimeout(() => {
          otpInputsRef.current[0]?.focus();
        }, 100);
      } else {
        setError(err.message || 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle 6-digit OTP input change
  const handleOtpChange = (index: number, value: string) => {
    const val = value.replace(/\D/g, ''); // numeric only
    const newDigits = [...otpDigits];

    if (!val) {
      newDigits[index] = '';
      setOtpDigits(newDigits);
      return;
    }

    // Single digit input
    newDigits[index] = val.slice(-1);
    setOtpDigits(newDigits);

    // Auto-advance to next input
    if (index < 5 && val) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  // Handle backspace key on OTP inputs
  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        otpInputsRef.current[index - 1]?.focus();
      }
    }
  };

  // Handle paste in OTP inputs
  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newDigits = [...otpDigits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || '';
    }
    setOtpDigits(newDigits);

    // Focus appropriate box
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
      await api.verifySignupOtp({
        email: email.trim(),
        otp: fullOtp,
      });

      // Switch to success state
      setStep('success');

      // Auto redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login', {
          replace: true,
          state: { message: 'Email verified successfully! Your account has been created. Please sign in.' },
        });
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Invalid or expired verification code.');
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || resending) return;

    setResending(true);
    setError(null);
    setInfoMessage(null);

    try {
      const res = await api.resendSignupOtp({ email: email.trim() });
      setInfoMessage(res.message || 'A fresh 6-digit verification code has been dispatched to your email.');
      setOtpDigits(['', '', '', '', '', '']);
      setOtpExpirySeconds(300); // Reset 5-minute countdown
      setResendCooldown(60); // Reset 60s cooldown
      otpInputsRef.current[0]?.focus();
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification code. Please try again.');
    } finally {
      setResending(false);
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
            {step === 'verify_otp' ? 'Verify Your Email' : step === 'success' ? 'Account Activated' : 'Create Enterprise Account'}
          </h1>
          <p className="text-[15px] text-[#526078]">
            {step === 'verify_otp'
              ? 'A 6-digit verification code has been sent to your email.'
              : step === 'success'
              ? 'Email verification complete'
              : 'Register to inspect and establish architecture baselines'}
          </p>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="p-3.5 rounded-lg bg-[#FEE2E2] border border-[#FECACA] text-sm text-[#B42318] flex items-start gap-2.5 font-medium">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-[#B42318]" />
            <div className="flex-1 text-xs leading-relaxed">{error}</div>
          </div>
        )}

        {/* Global Info / Resend Success Banner */}
        {infoMessage && (
          <div className="p-3.5 rounded-lg bg-[#E8F5E9] border border-[#C8E6C9] text-xs text-[#16845B] flex items-start gap-2.5 font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-[#16845B]" />
            <p className="flex-1">{infoMessage}</p>
          </div>
        )}

        {/* ================= STEP 1: Registration Form ================= */}
        {step === 'form' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-4">
            <div>
              <label className="block text-[15px] font-medium text-[#172B4D] mb-1.5" htmlFor="fullName">
                Full Name
              </label>
              <div className="relative">
                <User className="h-4 w-4 absolute left-3 top-3 text-[#526078]" />
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Praveen Kumar"
                  autoComplete="name"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#D8E2EE] rounded-lg text-[#172B4D] focus:outline-none focus:border-[#155EEF] transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-[15px] font-medium text-[#172B4D] mb-1.5" htmlFor="email">
                Email Address <span className="text-[#B42318]">*</span>
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

            <div>
              <label className="block text-[15px] font-medium text-[#172B4D] mb-1.5" htmlFor="password">
                Password <span className="text-[#B42318]">*</span>
              </label>
              <div className="relative">
                <Lock className="h-4 w-4 absolute left-3 top-3 text-[#526078]" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                Confirm Password <span className="text-[#B42318]">*</span>
              </label>
              <div className="relative">
                <Lock className="h-4 w-4 absolute left-3 top-3 text-[#526078]" />
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
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

            {/* Password requirement badge */}
            <div className="text-[13px] text-[#526078] flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${password.length >= 8 ? 'bg-[#16845B]' : 'bg-[#D8E2EE]'}`}></span>
              <span>Minimum 8 characters required</span>
            </div>

            {/* Terms acknowledgement */}
            <div className="pt-1">
              <label className="flex items-start gap-2 cursor-pointer text-xs select-none">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  required
                  className="rounded border-[#D8E2EE] text-[#155EEF] focus:ring-[#155EEF] h-4 w-4 mt-0.5 cursor-pointer"
                />
                <span className="text-[#526078] leading-normal text-xs">
                  I agree to the architecture inspection terms and acknowledge that code is analyzed statically in isolation.
                </span>
              </label>
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
                  <span>Create Account</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <div className="pt-4 border-t border-[#D8E2EE] text-center text-xs text-[#526078]">
              Already have an enterprise account?{' '}
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
              <p className="text-xs text-[#526078]">Verification code dispatched to:</p>
              <p className="text-sm font-semibold text-[#071D3A] break-all">{email}</p>
            </div>

            {/* 6-digit OTP input boxes */}
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

            {/* Timer and Expiration Display */}
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

              {/* Resend button with cooldown */}
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

            {/* Verify OTP Button */}
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

            {/* Change email or back to registration option */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setStep('form');
                  setError(null);
                  setInfoMessage(null);
                }}
                className="text-xs text-[#526078] hover:text-[#172B4D] underline cursor-pointer"
              >
                Incorrect email? Edit registration details
              </button>
            </div>
          </form>
        )}

        {/* ================= STEP 3: Success State ================= */}
        {step === 'success' && (
          <div className="space-y-5 text-center">
            <div className="p-6 rounded-[12px] bg-[#E8F5E9] border border-[#C8E6C9] space-y-3">
              <CheckCircle2 className="h-12 w-12 text-[#16845B] mx-auto" />
              <h2 className="text-lg font-bold text-[#16845B]">Email verified successfully!</h2>
              <p className="text-sm text-[#16845B] leading-relaxed">
                Your account has been created and verified.
              </p>
              <p className="text-xs text-[#526078] pt-1">
                Redirecting you to the sign-in page...
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
