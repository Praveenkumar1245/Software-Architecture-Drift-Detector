import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProjectProvider } from './context/ProjectContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';

import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';

// Lazy-loaded workspace pages for optimized bundle size & faster initial load
const OverviewPage = lazy(() => import('./pages/OverviewPage').then(m => ({ default: m.OverviewPage })));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then(m => ({ default: m.ProjectsPage })));
const ArchitecturePage = lazy(() => import('./pages/ArchitecturePage').then(m => ({ default: m.ArchitecturePage })));
const AnalyzePage = lazy(() => import('./pages/AnalyzePage').then(m => ({ default: m.AnalyzePage })));
const FindingsPage = lazy(() => import('./pages/FindingsPage').then(m => ({ default: m.FindingsPage })));
const DependencyGraphPage = lazy(() => import('./pages/DependencyGraphPage').then(m => ({ default: m.DependencyGraphPage })));
const ScanHistoryPage = lazy(() => import('./pages/ScanHistoryPage').then(m => ({ default: m.ScanHistoryPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));

const PageLoader = () => (
  <div className="flex h-64 w-full items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#009F95] border-t-transparent" />
      <span className="text-xs font-medium text-slate-400">Loading workspace...</span>
    </div>
  </div>
);

export function App() {
  return (
    <AuthProvider>
      <ProjectProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public Authentication Routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              {/* Protected Enterprise SaaS Application */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<OverviewPage />} />
                <Route path="projects" element={<ProjectsPage />} />
                <Route path="architecture" element={<ArchitecturePage />} />
                <Route path="analyze" element={<AnalyzePage />} />
                <Route path="findings" element={<FindingsPage />} />
                <Route path="graph" element={<DependencyGraphPage />} />
                <Route path="history" element={<ScanHistoryPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>

              {/* Catch-all redirect */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ProjectProvider>
    </AuthProvider>
  );
}

export default App;
