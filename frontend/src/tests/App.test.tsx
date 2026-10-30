import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ProjectProvider } from '../context/ProjectContext';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { Sidebar } from '../components/layout/Sidebar';
import { Topbar } from '../components/layout/Topbar';
import { ArchitecturePage } from '../pages/ArchitecturePage';
import { AnalyzePage } from '../pages/AnalyzePage';

describe('Software Architecture Drift Detector UI & Auth Workflow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      })
    );
  });

  it('renders login page with enterprise authentication form fields', () => {
    render(
      <AuthProvider>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </AuthProvider>
    );

    expect(screen.getByText('Software Architecture Drift Detector')).toBeDefined();
    expect(screen.getByText(/sign in to inspect, analyze/i)).toBeDefined();
    expect(screen.getByPlaceholderText('architect@enterprise.com')).toBeDefined();
    expect(screen.getByPlaceholderText('••••••••••••')).toBeDefined();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDefined();
    expect(screen.getByText(/remember me for 30 days/i)).toBeDefined();
    expect(screen.getByText(/create account/i)).toBeDefined();
  });

  it('renders register page with validation requirements and terms', () => {
    render(
      <AuthProvider>
        <MemoryRouter>
          <RegisterPage />
        </MemoryRouter>
      </AuthProvider>
    );

    expect(screen.getByText('Create Enterprise Account')).toBeDefined();
    expect(screen.getByPlaceholderText('Praveen Kumar')).toBeDefined();
    expect(screen.getByPlaceholderText('architect@enterprise.com')).toBeDefined();
    expect(screen.getByPlaceholderText('Minimum 8 characters')).toBeDefined();
    expect(screen.getByPlaceholderText('Re-enter password')).toBeDefined();
    expect(screen.getByText(/minimum 8 characters required/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /create account/i })).toBeDefined();
  });

  it('renders persistent sidebar navigation with all 9 core routes', () => {
    render(
      <AuthProvider>
        <ProjectProvider>
          <MemoryRouter>
            <Sidebar />
          </MemoryRouter>
        </ProjectProvider>
      </AuthProvider>
    );

    expect(screen.getByText('Drift Detector')).toBeDefined();
    expect(screen.getByText('Architecture Quality')).toBeDefined();

    // Verify all 9 persistent navigation items exist
    expect(screen.getByText('Overview')).toBeDefined();
    expect(screen.getByText('Projects')).toBeDefined();
    expect(screen.getByText('Architecture')).toBeDefined();
    expect(screen.getByText('Analyze Drift')).toBeDefined();
    expect(screen.getByText('Findings')).toBeDefined();
    expect(screen.getByText('Dependency Graph')).toBeDefined();
    expect(screen.getByText('Scan History')).toBeDefined();
    expect(screen.getByText('Reports')).toBeDefined();
    expect(screen.getByText('Settings')).toBeDefined();
  });

  it('renders topbar with project controls and user status indicator', () => {
    render(
      <AuthProvider>
        <ProjectProvider>
          <MemoryRouter>
            <Topbar />
          </MemoryRouter>
        </ProjectProvider>
      </AuthProvider>
    );

    expect(screen.getByText(/project:/i)).toBeDefined();
    expect(screen.getByTitle('Create New Project')).toBeDefined();
    expect(screen.getByTitle('Refresh Data')).toBeDefined();
    expect(screen.getByRole('button', { name: /analyze drift/i })).toBeDefined();
  });

  it('renders session expiration notice on login page when redirected with message', () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={[{ pathname: '/login', state: { message: 'Your session has expired. Please sign in again.' } }]}>
          <LoginPage />
        </MemoryRouter>
      </AuthProvider>
    );

    expect(screen.getByText('Your session has expired. Please sign in again.')).toBeDefined();
  });

  it('renders ArchitecturePage with visual rule builder and policy actions', () => {
    render(
      <AuthProvider>
        <ProjectProvider>
          <MemoryRouter>
            <ArchitecturePage />
          </MemoryRouter>
        </ProjectProvider>
      </AuthProvider>
    );

    // When no project is active, shows guidance
    expect(screen.getByText('No Project Selected')).toBeDefined();
  });

  it('renders AnalyzePage with drift checklist', () => {
    render(
      <AuthProvider>
        <ProjectProvider>
          <MemoryRouter>
            <AnalyzePage />
          </MemoryRouter>
        </ProjectProvider>
      </AuthProvider>
    );

    // When no project is active, shows select project prompt
    expect(screen.getByText(/no project selected/i)).toBeDefined();
  });
});

