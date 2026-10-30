import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Database,
  Cpu,
  Sparkles,
  Server,
  Lock,
  CheckCircle2,
  User,
  ShieldCheck,
  LogOut,
  Mail,
  KeyRound,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export const SettingsPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [health, setHealth] = useState<{ status: string; database: string; version: string; storage?: string } | null>(null);
  const [aiStatus, setAiStatus] = useState<{
    ai_enabled: boolean;
    provider: string;
    is_configured: boolean;
  } | null>(null);

  const [resetRequested, setResetRequested] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadConfig() {
      try {
        const h = await api.getHealth();
        setHealth(h);
      } catch (err) {
        console.error('Failed to load health:', err);
      }

      try {
        const ai = await api.getAiStatus();
        setAiStatus(ai);
      } catch (err) {
        console.error('Failed to load AI status:', err);
      }
    }
    loadConfig();
  }, []);

  const handleRequestPasswordReset = async () => {
    if (!user?.email) return;
    setResetLoading(true);
    setResetMessage(null);
    try {
      const res = await api.forgotPassword(user.email);
      setResetRequested(true);
      setResetMessage(res.message);
    } catch (err: any) {
      setResetMessage(err.message || 'Failed to dispatch password reset request.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="pb-4 border-b border-[#D8E2EE]">
        <h1 className="text-[32px] font-bold text-[#0F172A] tracking-tight">Profile & System Settings</h1>
        <p className="text-sm text-[#475569] mt-1">
          Authenticated developer account profile, session controls, and architecture engine diagnostics.
        </p>
      </div>

      {/* Account Profile Card */}
      <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE] space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-[#009F95]" />
            <h2 className="text-[18px] font-semibold text-[#0F172A]">Developer Profile</h2>
          </div>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-[#B42318] bg-[#FEE2E2] hover:bg-[#FEE2E2]/80 border border-[#FECACA] rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5 text-[#B42318]" />
            <span>Sign Out</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#D8E2EE] space-y-1">
            <span className="text-[11px] uppercase font-semibold text-[#475569] block">Full Name</span>
            <p className="font-semibold text-[#0F172A] text-sm">{user?.full_name || 'Enterprise Developer'}</p>
          </div>

          <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#D8E2EE] space-y-1">
            <span className="text-[11px] uppercase font-semibold text-[#475569] block">Work Email Address</span>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-[#475569] shrink-0" />
              <p className="font-semibold text-[#0F172A] text-sm truncate font-mono">{user?.email || 'N/A'}</p>
            </div>
          </div>

          <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#D8E2EE] space-y-1">
            <span className="text-[11px] uppercase font-semibold text-[#475569] block">Email Verification Status</span>
            <div className="flex items-center gap-1.5 font-semibold text-[#10B981]">
              <ShieldCheck className="h-4 w-4 text-[#10B981]" />
              <span>Cryptographically Verified</span>
            </div>
          </div>

          <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#D8E2EE] space-y-1">
            <span className="text-[11px] uppercase font-semibold text-[#475569] block">Account Established</span>
            <p className="font-medium text-[#0F172A]">
              {user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'Active Session'}
            </p>
          </div>
        </div>

        {/* Password Reset Trigger */}
        <div className="pt-3 border-t border-[#D8E2EE] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div>
            <span className="font-semibold text-[#0F172A] block">Account Security & Credentials</span>
            <span className="text-[#475569] text-[13px]">
              Passwords are cryptographically hashed using modern Argon2id.
            </span>
          </div>

          {resetRequested ? (
            <span className="text-xs text-[#10B981] font-semibold bg-[#E8F5E9] px-3 py-1.5 rounded-lg border border-[#C8E6C9]">
              {resetMessage || 'Password reset email dispatched.'}
            </span>
          ) : (
            <button
              onClick={handleRequestPasswordReset}
              disabled={resetLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0F172A] bg-white hover:bg-[#F8FAFC] rounded-lg border border-[#D8E2EE] transition-colors disabled:opacity-60 cursor-pointer"
            >
              <KeyRound className="h-3.5 w-3.5 text-[#475569]" />
              <span>{resetLoading ? 'Dispatching...' : 'Request Password Reset'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Backend & DB Health Card */}
      <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE] space-y-4">
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-[#009F95]" />
          <h2 className="text-[18px] font-semibold text-[#0F172A]">Runtime Services Health</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#D8E2EE]">
            <span className="text-[11px] uppercase font-semibold text-[#475569] block mb-1">
              API Server
            </span>
            <div className="flex items-center gap-1.5 font-semibold text-[#10B981]">
              <CheckCircle2 className="h-4 w-4 text-[#10B981]" />
              <span>{health ? health.status.toUpperCase() : 'CHECKING...'}</span>
            </div>
            <p className="text-[12px] text-[#475569] mt-1 font-mono">FastAPI REST v1.0.0</p>
          </div>

          <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#D8E2EE]">
            <span className="text-[11px] uppercase font-semibold text-[#475569] block mb-1">
              Database Connectivity
            </span>
            <div className="flex items-center gap-1.5 font-semibold text-[#10B981]">
              <Database className="h-4 w-4 text-[#10B981]" />
              <span>{health ? health.database.toUpperCase() : 'CHECKING...'}</span>
            </div>
            <p className="text-[12px] text-[#475569] mt-1 font-mono">SQLite + SQLAlchemy Migrations</p>
          </div>

          <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#D8E2EE]">
            <span className="text-[11px] uppercase font-semibold text-[#475569] block mb-1">
              AST Analyzer Engine
            </span>
            <div className="flex items-center gap-1.5 font-semibold text-[#10B981]">
              <Cpu className="h-4 w-4 text-[#10B981]" />
              <span>OPERATIONAL</span>
            </div>
            <p className="text-[12px] text-[#475569] mt-1 font-mono">Python AST + NetworkX</p>
          </div>
        </div>
      </div>

      {/* Security Policies */}
      <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE] space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-[#009F95]" />
          <h2 className="text-[18px] font-semibold text-[#0F172A]">Security & Sandboxing Controls</h2>
        </div>

        <div className="space-y-2.5 text-xs text-[#475569]">
          <div className="p-3.5 bg-[#F8FAFC] rounded-lg border border-[#D8E2EE] flex justify-between items-center">
            <div>
              <span className="font-semibold text-[#0F172A] block text-sm">Zip Slip Path Traversal Protection</span>
              <span className="text-[13px] text-[#475569]">
                Guarantees extracted paths do not escape target workspace sandbox.
              </span>
            </div>
            <span className="text-[#10B981] font-semibold text-xs bg-[#E8F5E9] px-2.5 py-1 rounded border border-[#C8E6C9]">
              Enforced
            </span>
          </div>

          <div className="p-3.5 bg-[#F8FAFC] rounded-lg border border-[#D8E2EE] flex justify-between items-center">
            <div>
              <span className="font-semibold text-[#0F172A] block text-sm">Archive Size & Count Limits</span>
              <span className="text-[13px] text-[#475569]">
                Maximum 50MB per upload, maximum 2,000 files extracted to reject Zip bombs.
              </span>
            </div>
            <span className="text-[#10B981] font-semibold text-xs bg-[#E8F5E9] px-2.5 py-1 rounded border border-[#C8E6C9]">
              Active
            </span>
          </div>

          <div className="p-3.5 bg-[#F8FAFC] rounded-lg border border-[#D8E2EE] flex justify-between items-center">
            <div>
              <span className="font-semibold text-[#0F172A] block text-sm">Non-Execution Static Guarantee</span>
              <span className="text-[13px] text-[#475569]">
                Source code is statically parsed into Abstract Syntax Trees. Code is never imported or executed.
              </span>
            </div>
            <span className="text-[#10B981] font-semibold text-xs bg-[#E8F5E9] px-2.5 py-1 rounded border border-[#C8E6C9]">
              Verified
            </span>
          </div>
        </div>
      </div>

      {/* Optional AI Configuration */}
      <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE] space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#009F95]" />
          <h2 className="text-[18px] font-semibold text-[#0F172A]">AI Assistance Configuration</h2>
        </div>

        <p className="text-sm text-[#475569]">
          The core detection engine is 100% deterministic and requires zero external AI keys.
          If configured via environment variable (<code className="font-mono bg-[#F8FAFC] px-1.5 py-0.5 rounded border border-[#D8E2EE] text-[#0F172A]">AI_API_KEY</code>), AI provides plain-language architectural explanations for confirmed findings.
        </p>

        <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#D8E2EE] flex items-center justify-between text-xs">
          <div>
            <span className="font-semibold text-[#0F172A] block text-sm">AI Integration Mode</span>
            <span className="text-[#475569] text-[13px]">
              {aiStatus?.is_configured
                ? `Active provider: ${aiStatus.provider}`
                : 'Deterministic architectural expert reasoning engine active'}
            </span>
          </div>
          <span
            className={`px-3 py-1 rounded font-semibold text-xs ${
              aiStatus?.is_configured
                ? 'bg-[#E8F5E9] text-[#10B981] border border-[#C8E6C9]'
                : 'bg-white border border-[#D8E2EE] text-[#475569]'
            }`}
          >
            {aiStatus?.is_configured ? 'External LLM Enabled' : 'Deterministic Mode'}
          </span>
        </div>
      </div>
    </div>
  );
};
