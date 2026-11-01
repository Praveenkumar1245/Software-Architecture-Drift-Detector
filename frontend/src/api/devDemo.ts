import { User } from '../types';

/**
 * Checks whether development-only demo mode is explicitly enabled.
 * Demo mode is strictly isolated to development (import.meta.env.DEV) and requires an explicit query parameter.
 * It is unconditionally disabled in production builds (import.meta.env.PROD).
 */
export function isDevDemoActive(): boolean {
  if (typeof window === 'undefined') return false;
  // Strictly disabled in production builds
  if (!(import.meta as any)?.env?.DEV) return false;

  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('demo') === 'true' || params.get('env') === 'demo';
  } catch {
    return false;
  }
}

/**
 * Isolated development-only demo dispatcher.
 * Strictly throws if called in production.
 */
export function handleDevDemoRequest<T>(endpoint: string, options: RequestInit = {}): T {
  if (!isDevDemoActive()) {
    throw new Error('Development demo mode is strictly disabled in production environments.');
  }

  const method = (options.method || 'GET').toUpperCase();
  const cleanEndpoint = endpoint.split('?')[0];

  if (cleanEndpoint === '/auth/login' && method === 'POST') {
    const demoUser: User = {
      id: 'usr-dev-demo',
      email: 'demo@architecture-drift.dev',
      full_name: '[Demo] Development Architect',
      is_verified: true,
      created_at: new Date().toISOString(),
    };
    return {
      message: 'Signed in to Development Demo environment',
      user: demoUser,
      session_token: 'drift_dev_demo_token_authenticated',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    } as unknown as T;
  }

  if (cleanEndpoint === '/auth/status') {
    return { authenticated: false, user: null } as unknown as T;
  }

  if (cleanEndpoint === '/projects') {
    return [] as unknown as T;
  }

  if (cleanEndpoint === '/health') {
    return {
      status: 'healthy',
      database: 'dev-demo',
      storage: 'dev-demo',
      version: '1.0.0-dev-demo',
      project: 'Software Architecture Drift Detector [DEV DEMO]',
    } as unknown as T;
  }

  return {} as unknown as T;
}

