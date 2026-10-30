import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderGit2,
  Layers,
  PlayCircle,
  AlertTriangle,
  Network,
  History,
  FileText,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';

const navItems = [
  { name: 'Overview', path: '/', icon: LayoutDashboard },
  { name: 'Projects', path: '/projects', icon: FolderGit2 },
  { name: 'Architecture', path: '/architecture', icon: Layers },
  { name: 'Analyze Drift', path: '/analyze', icon: PlayCircle },
  { name: 'Findings', path: '/findings', icon: AlertTriangle },
  { name: 'Dependency Graph', path: '/graph', icon: Network },
  { name: 'Scan History', path: '/history', icon: History },
  { name: 'Reports', path: '/reports', icon: FileText },
  { name: 'Settings', path: '/settings', icon: Settings },
];

export const Sidebar: React.FC = () => {
  const { activeProject, latestScan } = useProject();

  return (
    <aside className="w-64 bg-[#03162D] text-[#F8FAFC] flex flex-col shrink-0 border-r border-[#123047] select-none font-sans">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-5 gap-3 border-b border-[#123047] bg-[#03162D]">
        <div className="h-10 w-10 rounded-lg bg-[#03162D] border border-[#123047] flex items-center justify-center text-[#00D4C7] shadow-xs shrink-0">
          <ShieldCheck className="h-6 w-6 text-[#00D4C7]" />
        </div>
        <div>
          <h1 className="text-base font-bold text-[#F8FAFC] tracking-tight leading-none">
            Drift Detector
          </h1>
          <p className="text-xs text-[#94A3B8] mt-1 font-mono font-medium">Architecture Quality</p>
        </div>
      </div>

      {/* Navigation items */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">
          Platform Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 text-[15px] rounded-lg transition-colors ${
                  isActive
                    ? 'bg-[#005B60] text-white font-semibold border-l-4 border-[#00D4C7]'
                    : 'text-[#CBD5E1] hover:text-white hover:bg-white/10 font-normal'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-[#CBD5E1]'}`} />
                  <span>{item.name}</span>
                  {item.name === 'Findings' && latestScan && latestScan.total_findings > 0 && (
                    <span className="ml-auto px-2 py-0.5 text-xs font-bold rounded-full bg-[#422B1B] text-[#FFB454] border border-[#8A4B12]">
                      {latestScan.total_findings}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Active Project Scope Footer */}
      <div className="p-3 border-t border-[#123047] bg-[#03162D]">
        <div className="px-3 py-3 rounded-[10px] bg-[#03162D] border border-[#123047] text-xs">
          <p className="text-[#94A3B8] text-[11px] uppercase font-bold tracking-wider">
            Active Scope
          </p>
          <p className="text-[#F8FAFC] font-bold text-sm truncate mt-1" title={activeProject?.name || 'No project selected'}>
            {activeProject ? activeProject.name : 'Select a Project'}
          </p>
          {latestScan && (
            <div className="flex items-center gap-2 mt-2 text-xs text-[#10B981] font-medium">
              <span className="h-2 w-2 rounded-full bg-[#10B981] inline-block"></span>
              <span>Compliance: {latestScan.compliance_percentage}%</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
