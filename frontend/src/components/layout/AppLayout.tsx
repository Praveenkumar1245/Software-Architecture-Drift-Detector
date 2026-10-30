import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useProject } from '../../context/ProjectContext';
import { AlertCircle, X } from 'lucide-react';

export const AppLayout: React.FC = () => {
  const { error, clearError } = useProject();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F8FAFC] font-sans text-[#0F172A]">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar />

        {error && (
          <div className="bg-[#FEE2E2] border-b border-[#B42318]/30 px-6 py-2.5 flex items-center justify-between gap-2 text-sm text-[#B42318] shadow-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#B42318]" />
              <span className="font-semibold">{error}</span>
            </div>
            <button
              onClick={clearError}
              aria-label="Dismiss notification"
              className="p-1 hover:bg-[#FEE2E2]/80 rounded text-[#B42318] transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-[#F8FAFC]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
