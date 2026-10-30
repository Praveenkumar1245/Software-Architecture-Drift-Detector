import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck } from 'lucide-react';

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#F8FAFC] font-sans text-[#0F172A]">
        <div className="h-12 w-12 rounded-xl bg-[#03162D] border border-[#123047] flex items-center justify-center text-[#00D4C7] shadow-xs animate-pulse mb-4">
          <ShieldCheck className="h-6 w-6 text-[#00D4C7]" />
        </div>
        <p className="text-sm font-semibold text-[#0F172A]">Verifying session...</p>
        <p className="text-xs text-[#475569] mt-1">Software Architecture Drift Detector</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
