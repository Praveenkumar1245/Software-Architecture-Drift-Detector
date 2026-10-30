import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderGit2,
  PlayCircle,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  LogOut,
  Settings,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useAuth } from '../../context/AuthContext';

export const Topbar: React.FC = () => {
  const { projects, activeProject, setActiveProject, latestScan, refreshProjects } = useProject();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshProjects();
    setIsRefreshing(false);
  };

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login');
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getInitials = (name?: string | null, email?: string) => {
    if (name) {
      const parts = name.trim().split(' ');
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return name.slice(0, 2).toUpperCase();
    }
    if (email) return email.slice(0, 2).toUpperCase();
    return 'AR';
  };

  return (
    <header className="h-16 bg-white border-b border-[#D8E2EE] px-6 flex items-center justify-between shrink-0 shadow-xs z-20 font-sans">
      {/* Left: Active Project Selector */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <FolderGit2 className="h-4 w-4 text-[#475569]" />
          <span className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
            Project:
          </span>
        </div>

        {projects.length > 0 ? (
          <select
            aria-label="Select active software project"
            value={activeProject?.id || ''}
            onChange={(e) => {
              const selected = projects.find((p) => p.id === e.target.value);
              if (selected) setActiveProject(selected);
            }}
            className="text-sm font-semibold text-[#0F172A] bg-white border border-[#D8E2EE] rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#00D4C7] focus:ring-2 focus:ring-[#00D4C7]/20 cursor-pointer max-w-xs truncate shadow-xs"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-[#475569] italic">No projects registered</span>
        )}

        <button
          onClick={() => navigate('/projects?create=true')}
          className="p-1.5 text-[#0F172A] hover:bg-[#F8FAFC] rounded-lg transition-colors border border-[#D8E2EE]"
          title="Create New Project"
          aria-label="Create New Project"
        >
          <Plus className="h-4 w-4" />
        </button>

        <button
          onClick={handleRefresh}
          className={`p-1.5 text-[#0F172A] hover:bg-[#F8FAFC] rounded-lg transition-colors border border-[#D8E2EE] ${
            isRefreshing ? 'animate-spin text-[#009F95]' : ''
          }`}
          title="Refresh Data"
          aria-label="Refresh Data"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Right: Scan Status Indicator, Analyze Drift & User Account Menu */}
      <div className="flex items-center gap-3.5">
        {latestScan ? (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border bg-white border-[#D8E2EE]">
            {latestScan.status === 'completed' ? (
              latestScan.total_findings === 0 ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-[#10B981]" />
                  <span className="text-[#10B981] font-semibold">Architecture Compliant (100%)</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-[#B45309]" />
                  <span className="text-[#B45309] font-semibold">
                    {latestScan.total_findings} Drift Violations ({latestScan.compliance_percentage}%)
                  </span>
                </>
              )
            ) : latestScan.status === 'running' ? (
              <>
                <Clock className="h-4 w-4 text-[#009F95] animate-spin" />
                <span className="text-[#009F95] font-semibold">Analyzing Project...</span>
              </>
            ) : (
              <span className="text-[#0F172A] font-semibold">Scan Status: {latestScan.status}</span>
            )}
          </div>
        ) : (
          <span className="hidden sm:inline text-xs text-[#475569] font-medium">No scans executed</span>
        )}

        <button
          onClick={() => navigate('/analyze')}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg text-white bg-[#03162D] hover:bg-[#0A2548] transition-colors shadow-xs cursor-pointer"
        >
          <PlayCircle className="h-4 w-4 text-[#00D4C7]" />
          <span className="hidden md:inline">Analyze Drift</span>
        </button>

        {/* User Account Menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-[#F8FAFC] transition-colors cursor-pointer border border-transparent hover:border-[#D8E2EE]"
            title="User Profile Menu"
          >
            <div className="h-8 w-8 rounded-full bg-[#03162D] text-white flex items-center justify-center font-bold text-xs shadow-xs">
              {getInitials(user?.full_name, user?.email)}
            </div>
            <div className="hidden lg:flex flex-col text-left">
              <span className="text-xs font-semibold text-[#0F172A] leading-tight truncate max-w-[120px]">
                {user?.full_name || user?.email?.split('@')[0] || 'User'}
              </span>
              <span className="text-[10px] text-[#10B981] font-medium flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]"></span>
                Verified
              </span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-[#475569]" />
          </button>

          {/* Dropdown Menu */}
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-[10px] shadow-lg border border-[#D8E2EE] py-2 z-50 text-xs font-sans">
              <div className="px-4 py-2.5 border-b border-[#D8E2EE] space-y-1">
                <p className="font-semibold text-[#0F172A] text-sm truncate">
                  {user?.full_name || 'Enterprise Developer'}
                </p>
                <p className="text-[#475569] font-mono text-[11px] truncate">{user?.email}</p>
                <div className="pt-1 flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#E8F5E9] text-[#10B981] border border-[#10B981]/30 flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3 text-[#10B981]" />
                    Verified Email
                  </span>
                </div>
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/settings');
                  }}
                  className="w-full px-4 py-2 text-left text-[#0F172A] hover:bg-[#F8FAFC] flex items-center gap-2.5 font-medium transition-colors cursor-pointer"
                >
                  <Settings className="h-4 w-4 text-[#475569]" />
                  <span>Account & System Settings</span>
                </button>
              </div>

              <div className="pt-1 border-t border-[#D8E2EE]">
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-left text-[#B42318] hover:bg-[#FEE2E2]/30 flex items-center gap-2.5 font-medium transition-colors cursor-pointer"
                >
                  <LogOut className="h-4 w-4 text-[#B42318]" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
