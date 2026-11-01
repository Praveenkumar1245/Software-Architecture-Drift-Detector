import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  api,
  isAllowedBackendOrigin,
  setCustomApiUrl,
  getApiBaseUrl,
  getStoredSessionToken,
  setStoredSessionToken,
  CUSTOM_API_URL_STORAGE_KEY,
} from '../api/client';

describe('Production Readiness & Security Hardening Audit', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  describe('1. Fake Login Prevention in Production', () => {
    it('strictly fails and throws when backend is offline, never authenticating locally', async () => {
      // Mock fetch to simulate network failure (backend unreachable)
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(
        api.login({ email: 'architect@enterprise.com', password: 'AnyPassword123!' })
      ).rejects.toThrow(/Unable to reach backend service/i);

      // Verify NO session token or fake demo user was created
      expect(getStoredSessionToken()).toBeNull();
      expect(localStorage.getItem('drift_session_token')).toBeNull();
      expect(sessionStorage.getItem('drift_session_token')).toBeNull();
      expect(localStorage.getItem('drift_demo_user')).toBeNull();
    });

    it('rejects login when backend returns 502 Bad Gateway and preserves the error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: () => Promise.resolve({}),
      });

      await expect(
        api.login({ email: 'architect@enterprise.com', password: 'AnyPassword123!' })
      ).rejects.toThrow(/502 Bad Gateway/i);

      expect(getStoredSessionToken()).toBeNull();
    });

    it('rejects login on invalid credentials and returns backend error detail', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ detail: 'Invalid email or password.' }),
      });

      await expect(
        api.login({ email: 'user@test.com', password: 'WrongPassword' })
      ).rejects.toThrow('Invalid email or password.');

      expect(getStoredSessionToken()).toBeNull();
    });
  });

  describe('2. Backend Unavailable Scenarios & Elimination of Fake Data', () => {
    it('throws when getting projects with backend offline, never returning hardcoded sample project', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Network Error'));

      await expect(api.getProjects()).rejects.toThrow(/Unable to reach backend service/i);

      // Verify no fake project exists in storage
      expect(localStorage.getItem('drift_offline_projects')).toBeNull();
    });

    it('throws when getting overview metrics with backend offline, never returning fake compliance scores', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Network Error'));

      await expect(api.getOverview()).rejects.toThrow(/Unable to reach backend service/i);
    });

    it('refuses to upload archives when backend is unavailable, never faking extraction', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Network Error'));
      const dummyFile = new File(['dummy content'], 'project.zip', { type: 'application/zip' });

      await expect(
        api.uploadProjectZip('proj-test-123', dummyFile)
      ).rejects.toThrow();
    });

    it('refuses to download CSV or PDF reports when backend returns 404 or 500', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ detail: 'Scan report not found.' }),
      });

      await expect(api.downloadCsvReport('scan-missing')).rejects.toThrow(/Scan report not found/i);
      await expect(api.downloadPdfReport('scan-missing')).rejects.toThrow(/Scan report not found/i);
    });
  });

  describe('3. API URL Security & Origin Whitelist Validation (CRITICAL 1 & 3)', () => {
    it('strictly rejects protocol-relative URLs: //example.com and //attacker.com/api/v1', () => {
      // Direct requirement: test //example.com and //attacker.com/api/v1
      expect(isAllowedBackendOrigin('//example.com')).toBe(false);
      expect(isAllowedBackendOrigin('//attacker.com/api/v1')).toBe(false);
      expect(isAllowedBackendOrigin('//example.com/api/v1')).toBe(false);
      expect(isAllowedBackendOrigin('//evil.com')).toBe(false);
      expect(isAllowedBackendOrigin('//software-architecture-drift-detector.onrender.com')).toBe(false);

      // Backslash evasion attempts
      expect(isAllowedBackendOrigin('/\\example.com')).toBe(false);
      expect(isAllowedBackendOrigin('\\\\example.com')).toBe(false);
      expect(isAllowedBackendOrigin('\\/example.com')).toBe(false);
    });

    it('strictly rejects unapproved domains: https://unapproved-domain.com and http://unapproved-domain.com', () => {
      // Direct requirement: test https://unapproved-domain.com and http://unapproved-domain.com
      expect(isAllowedBackendOrigin('https://unapproved-domain.com')).toBe(false);
      expect(isAllowedBackendOrigin('http://unapproved-domain.com')).toBe(false);
      expect(isAllowedBackendOrigin('https://example.com')).toBe(false);
      expect(isAllowedBackendOrigin('http://example.com')).toBe(false);
      expect(isAllowedBackendOrigin('https://attacker.com')).toBe(false);
      expect(isAllowedBackendOrigin('https://evil-onrender.com')).toBe(false);
      expect(isAllowedBackendOrigin('https://onrender.com.attacker.com')).toBe(false);
    });

    it('strictly rejects insecure plain HTTP URLs on non-localhost hosts', () => {
      expect(isAllowedBackendOrigin('http://software-architecture-drift-detector.onrender.com')).toBe(false);
      expect(isAllowedBackendOrigin('http://api-service.railway.app')).toBe(false);
      expect(isAllowedBackendOrigin('http://api-service.fly.dev')).toBe(false);
    });

    it('strictly rejects malicious schemes, null, and empty inputs', () => {
      expect(isAllowedBackendOrigin('javascript:alert(1)')).toBe(false);
      expect(isAllowedBackendOrigin('data:text/html,<script>steal()</script>')).toBe(false);
      expect(isAllowedBackendOrigin('file:///etc/passwd')).toBe(false);
      expect(isAllowedBackendOrigin('')).toBe(false);
      expect(isAllowedBackendOrigin('   ')).toBe(false);
      expect(isAllowedBackendOrigin(null as any)).toBe(false);
      expect(isAllowedBackendOrigin(undefined as any)).toBe(false);
    });

    it('approves legitimate HTTPS cloud deployment platforms (approved HTTPS backend URLs)', () => {
      // Direct requirement: approved HTTPS backend URLs
      expect(isAllowedBackendOrigin('https://software-architecture-drift-detector.onrender.com')).toBe(true);
      expect(isAllowedBackendOrigin('https://onrender.com')).toBe(true);
      expect(isAllowedBackendOrigin('https://api-service.railway.app')).toBe(true);
      expect(isAllowedBackendOrigin('https://railway.app')).toBe(true);
      expect(isAllowedBackendOrigin('https://api-service.fly.dev')).toBe(true);
      expect(isAllowedBackendOrigin('https://fly.dev')).toBe(true);
    });

    it('allows safe same-origin relative paths (safe same-origin relative paths)', () => {
      // Direct requirement: safe same-origin relative paths
      // In local development / jsdom loopback environment, relative paths resolve to localhost loopback
      expect(isAllowedBackendOrigin('/api/v1')).toBe(true);
      expect(isAllowedBackendOrigin('/api/v1/auth/login')).toBe(true);
      expect(isAllowedBackendOrigin('/api/v1/projects')).toBe(true);
      expect(isAllowedBackendOrigin('/health')).toBe(true);
    });

    it('approves local development loopback origins', () => {
      expect(isAllowedBackendOrigin('http://localhost:8000')).toBe(true);
      expect(isAllowedBackendOrigin('http://127.0.0.1:8000')).toBe(true);
      expect(isAllowedBackendOrigin('https://localhost:8000')).toBe(true);
    });

    it('setCustomApiUrl rejects protocol-relative and malicious URLs with security error', () => {
      // Protocol-relative
      expect(() => setCustomApiUrl('//example.com')).toThrow(/Invalid backend URL/i);
      expect(() => setCustomApiUrl('//attacker.com/api/v1')).toThrow(/Invalid backend URL/i);
      expect(localStorage.getItem(CUSTOM_API_URL_STORAGE_KEY)).toBeNull();

      // Unapproved HTTPS domain
      expect(() => setCustomApiUrl('https://unapproved-domain.com')).toThrow(/Invalid backend URL/i);
      expect(() => setCustomApiUrl('https://evil-phishing.com')).toThrow(/Invalid backend URL/i);
      expect(localStorage.getItem(CUSTOM_API_URL_STORAGE_KEY)).toBeNull();

      // Insecure plain HTTP on external host
      expect(() => setCustomApiUrl('http://unapproved-domain.com')).toThrow(/Invalid backend URL/i);
      expect(() => setCustomApiUrl('http://insecure-domain.org')).toThrow(/Invalid backend URL/i);
      expect(localStorage.getItem(CUSTOM_API_URL_STORAGE_KEY)).toBeNull();

      // Valid HTTPS approved host passes
      setCustomApiUrl('https://software-architecture-drift-detector.onrender.com');
      expect(localStorage.getItem(CUSTOM_API_URL_STORAGE_KEY)).toBe(
        'https://software-architecture-drift-detector.onrender.com/api/v1'
      );
    });

    it('purges unapproved custom backend URLs stored in localStorage', () => {
      localStorage.setItem(CUSTOM_API_URL_STORAGE_KEY, '//example.com/api/v1');
      let base = getApiBaseUrl();
      expect(base).not.toContain('example.com');
      expect(localStorage.getItem(CUSTOM_API_URL_STORAGE_KEY)).toBeNull();

      localStorage.setItem(CUSTOM_API_URL_STORAGE_KEY, 'https://unapproved-domain.com/api/v1');
      base = getApiBaseUrl();
      expect(base).not.toContain('unapproved-domain.com');
      expect(localStorage.getItem(CUSTOM_API_URL_STORAGE_KEY)).toBeNull();
    });
  });

  describe('4. Authentication Bearer Token Isolation (ensuring tokens are never sent to an untrusted origin)', () => {
    it('attaches authorization headers only to approved backend origins', async () => {
      setStoredSessionToken('valid-production-jwt-token-999');

      let capturedHeaders: Record<string, string> = {};
      globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = init?.headers || {};
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: 'ok' }),
        });
      });

      await api.getMe();

      expect(capturedHeaders['Authorization']).toBe('Bearer valid-production-jwt-token-999');
      expect(capturedHeaders['X-Session-Token']).toBe('valid-production-jwt-token-999');
    });

    it('never sends tokens or cookies to untrusted destinations during downloads or uploads', () => {
      setStoredSessionToken('secret-session-token');

      // 1. Verify origin validation rejects untrusted URLs across all endpoints
      const untrustedOrigins = [
        '//example.com',
        '//attacker.com/api/v1',
        'https://unapproved-domain.com',
        'http://unapproved-domain.com',
      ];
      for (const origin of untrustedOrigins) {
        expect(isAllowedBackendOrigin(origin)).toBe(false);
        expect(isAllowedBackendOrigin(`${origin}/scans/scan-123/report/csv`)).toBe(false);
        expect(isAllowedBackendOrigin(`${origin}/projects/proj-123/upload`)).toBe(false);
      }

      // 2. Verify setting custom API URL to untrusted destination throws and stores nothing
      expect(() => setCustomApiUrl('https://unapproved-domain.com')).toThrow(/Invalid backend URL/i);
      expect(() => setCustomApiUrl('//attacker.com/api/v1')).toThrow(/Invalid backend URL/i);
      expect(localStorage.getItem(CUSTOM_API_URL_STORAGE_KEY)).toBeNull();

      // 3. Verify that if stored in localStorage by an attacker, it is immediately purged
      localStorage.setItem(CUSTOM_API_URL_STORAGE_KEY, 'https://unapproved-domain.com/api/v1');
      const base = getApiBaseUrl();
      expect(base).not.toContain('unapproved-domain.com');
      expect(localStorage.getItem(CUSTOM_API_URL_STORAGE_KEY)).toBeNull();
    });

    it('clears session token on 401 Unauthorized API responses', async () => {
      setStoredSessionToken('stale-jwt-token');

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ detail: 'Token expired' }),
      });

      await expect(api.getProjects()).rejects.toThrow('Token expired');
      expect(getStoredSessionToken()).toBeNull();
    });
  });

  describe('5. Fake Findings Never Appear in Production', () => {
    it('returns empty array when backend has zero findings, never injecting hardcoded violations', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      });

      const findings = await api.getScanFindings('scan-test-empty');
      expect(findings).toEqual([]);
      expect(findings.some((f) => f.rule_id === 'FORBIDDEN-DOMAIN-TO-PRESENTATION')).toBe(false);
      expect(findings.some((f) => f.rule_id === 'LAYER-DIRECTION-RULE')).toBe(false);
    });

    it('throws error when findings endpoint fails, never falling back to mock findings', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ detail: 'Failed to query findings table' }),
      });

      await expect(api.getScanFindings('scan-err')).rejects.toThrow('Failed to query findings table');
    });
  });
});
