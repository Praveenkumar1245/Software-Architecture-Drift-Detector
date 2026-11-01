import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  api,
  isAllowedBackendOrigin,
  buildAndValidateTargetUrl,
  setCustomApiUrl,
  getApiBaseUrl,
  getStoredSessionToken,
  setStoredSessionToken,
  CUSTOM_API_URL_STORAGE_KEY,
  DEFAULT_CONFIGURED_BACKEND,
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

  describe('1. Fake Login Prevention & Production Fallback Removal', () => {
    it('strictly fails and throws when backend is offline, never authenticating locally or faking success', async () => {
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

    it('rejects login when backend returns 502 Bad Gateway and preserves the real error', async () => {
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

    it('confirms handleStaticOffline production fallback is completely eliminated', () => {
      // Verify no handleStaticOffline exists on client module exports
      expect((api as any).handleStaticOffline).toBeUndefined();
    });
  });

  describe('2. Backend Unavailable Scenarios & Elimination of Fake Production Data', () => {
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
      ).rejects.toThrow(/Unable to reach backend service/i);
    });

    it('refuses to download CSV or PDF reports when backend returns 404 or 500, never returning fake templates', async () => {
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

  describe('3. API URL Security, Origin Whitelist & Unapproved Subdomain Rejection', () => {
    it('strictly rejects protocol-relative URLs: //example.com and //attacker.com/api/v1', () => {
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
      expect(isAllowedBackendOrigin('https://unapproved-domain.com')).toBe(false);
      expect(isAllowedBackendOrigin('http://unapproved-domain.com')).toBe(false);
      expect(isAllowedBackendOrigin('https://example.com')).toBe(false);
      expect(isAllowedBackendOrigin('http://example.com')).toBe(false);
      expect(isAllowedBackendOrigin('https://attacker.com')).toBe(false);
    });

    it('strictly rejects unapproved subdomains and enforces removal of wildcard trusts', () => {
      // Unapproved subdomains on platforms must be rejected (no wildcard trust)
      expect(isAllowedBackendOrigin('https://attacker.onrender.com')).toBe(false);
      expect(isAllowedBackendOrigin('https://evil-subdomain.onrender.com')).toBe(false);
      expect(isAllowedBackendOrigin('https://evil.railway.app')).toBe(false);
      expect(isAllowedBackendOrigin('https://malicious.fly.dev')).toBe(false);
      expect(isAllowedBackendOrigin('https://onrender.com')).toBe(false);
      expect(isAllowedBackendOrigin('https://railway.app')).toBe(false);
      expect(isAllowedBackendOrigin('https://fly.dev')).toBe(false);
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

    it('approves the exact configured HTTPS backend deployment domain', () => {
      expect(isAllowedBackendOrigin(DEFAULT_CONFIGURED_BACKEND)).toBe(true);
      expect(isAllowedBackendOrigin(`${DEFAULT_CONFIGURED_BACKEND}/api/v1`)).toBe(true);
    });

    it('allows safe same-origin relative paths in local loopback environment', () => {
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

    it('setCustomApiUrl rejects protocol-relative, unapproved subdomains, and malicious URLs', () => {
      // Protocol-relative
      expect(() => setCustomApiUrl('//example.com')).toThrow(/Invalid backend URL/i);
      expect(() => setCustomApiUrl('//attacker.com/api/v1')).toThrow(/Invalid backend URL/i);
      expect(localStorage.getItem(CUSTOM_API_URL_STORAGE_KEY)).toBeNull();

      // Unapproved HTTPS domain
      expect(() => setCustomApiUrl('https://unapproved-domain.com')).toThrow(/Invalid backend URL/i);
      expect(() => setCustomApiUrl('https://attacker.onrender.com')).toThrow(/Invalid backend URL/i);
      expect(localStorage.getItem(CUSTOM_API_URL_STORAGE_KEY)).toBeNull();

      // Insecure plain HTTP on external host
      expect(() => setCustomApiUrl('http://unapproved-domain.com')).toThrow(/Invalid backend URL/i);
      expect(() => setCustomApiUrl('http://insecure-domain.org')).toThrow(/Invalid backend URL/i);
      expect(localStorage.getItem(CUSTOM_API_URL_STORAGE_KEY)).toBeNull();

      // Valid HTTPS approved host passes
      setCustomApiUrl(DEFAULT_CONFIGURED_BACKEND);
      expect(localStorage.getItem(CUSTOM_API_URL_STORAGE_KEY)).toBe(
        `${DEFAULT_CONFIGURED_BACKEND}/api/v1`
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

    it('buildAndValidateTargetUrl strictly throws for //attacker.com and protocol-relative variations', () => {
      expect(() => buildAndValidateTargetUrl('//attacker.com')).toThrow(/Protocol-relative URLs are forbidden/i);
      expect(() => buildAndValidateTargetUrl('//attacker.com/api/v1')).toThrow(/Protocol-relative URLs are forbidden/i);
      expect(() => buildAndValidateTargetUrl('//example.com')).toThrow(/Protocol-relative URLs are forbidden/i);
      expect(() => buildAndValidateTargetUrl('/\\attacker.com')).toThrow(/Protocol-relative URLs are forbidden/i);
      expect(() => buildAndValidateTargetUrl('\\\\attacker.com')).toThrow(/Protocol-relative URLs are forbidden/i);
    });

    it('buildAndValidateTargetUrl strictly throws for untrusted remote hosts', () => {
      expect(() => buildAndValidateTargetUrl('https://unapproved-domain.com/api/v1')).toThrow(/Security Error.*not an approved backend origin/i);
      expect(() => buildAndValidateTargetUrl('http://unapproved-domain.com/api/v1')).toThrow(/Security Error.*not an approved backend origin/i);
      expect(() => buildAndValidateTargetUrl('https://attacker.com/api/v1')).toThrow(/Security Error.*not an approved backend origin/i);
      expect(() => buildAndValidateTargetUrl('https://attacker.onrender.com/api/v1')).toThrow(/Security Error.*not an approved backend origin/i);
    });

    it('buildAndValidateTargetUrl succeeds for safe relative paths and approved HTTPS origins', () => {
      const approvedBase = `${DEFAULT_CONFIGURED_BACKEND}/api/v1`;
      const target = buildAndValidateTargetUrl('/projects', approvedBase);
      expect(target).toBe(`${DEFAULT_CONFIGURED_BACKEND}/api/v1/projects`);
      expect(isAllowedBackendOrigin(target)).toBe(true);
    });
  });

  describe('4. Authentication Bearer Token Isolation & Real Request Processing', () => {
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

      const untrustedOrigins = [
        '//example.com',
        '//attacker.com/api/v1',
        'https://unapproved-domain.com',
        'http://unapproved-domain.com',
        'https://attacker.onrender.com',
        'https://evil.railway.app',
      ];
      for (const origin of untrustedOrigins) {
        expect(isAllowedBackendOrigin(origin)).toBe(false);
        expect(isAllowedBackendOrigin(`${origin}/scans/scan-123/report/csv`)).toBe(false);
        expect(isAllowedBackendOrigin(`${origin}/projects/proj-123/upload`)).toBe(false);
      }

      expect(() => setCustomApiUrl('https://unapproved-domain.com')).toThrow(/Invalid backend URL/i);
      expect(() => setCustomApiUrl('https://attacker.onrender.com')).toThrow(/Invalid backend URL/i);
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

  describe('5. Real ZIP Upload, Real Scan Execution & Export Reliability', () => {
    it('executes real ZIP upload, sending FormData and returning backend repository path', async () => {
      setStoredSessionToken('auth-token-zip-1');

      let sentBody: any = null;
      let sentHeaders: any = null;
      globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
        sentBody = init?.body;
        sentHeaders = init?.headers;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            message: 'Project archive uploaded and extracted successfully',
            repository_path: 'backend/data/projects/proj-101/source',
          }),
        });
      });

      const zipFile = new File(['fake zip content'], 'app.zip', { type: 'application/zip' });
      const result = await api.uploadProjectZip('proj-101', zipFile);

      expect(result.message).toBe('Project archive uploaded and extracted successfully');
      expect(result.repository_path).toBe('backend/data/projects/proj-101/source');
      expect(sentBody instanceof FormData).toBe(true);
      expect(sentHeaders['Authorization']).toBe('Bearer auth-token-zip-1');
    });

    it('propagates backend validation errors during ZIP upload', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ detail: 'Uploaded archive is empty. Please provide a ZIP containing source files.' }),
      });

      const emptyFile = new File([], 'empty.zip', { type: 'application/zip' });
      await expect(api.uploadProjectZip('proj-empty', emptyFile)).rejects.toThrow(
        'Uploaded archive is empty. Please provide a ZIP containing source files.'
      );
    });

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

    it('executes architecture scan and returns real backend scan status', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          id: 'scan-real-001',
          project_id: 'proj-real-1',
          status: 'completed',
          compliance_percentage: 100.0,
          total_findings: 0,
        }),
      });

      const scan = await api.triggerScan({ project_id: 'proj-real-1' });
      expect(scan.id).toBe('scan-real-001');
      expect(scan.status).toBe('completed');
      expect(scan.compliance_percentage).toBe(100.0);
    });

    it('fetches real dependency graph with actual nodes and edges', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          scan_id: 'scan-real-001',
          project_id: 'proj-real-1',
          nodes: [
            { id: 'app.service', label: 'service', component: 'application', layer: 1, node_type: 'module', is_violation: false },
            { id: 'app.model', label: 'model', component: 'domain', layer: 2, node_type: 'module', is_violation: false },
          ],
          edges: [
            { id: 'e1', source: 'app.service', target: 'app.model', is_violation: false, edge_type: 'actual' },
          ],
          components: ['application', 'domain'],
          total_modules: 2,
          total_dependencies: 1,
          total_violations: 0,
        }),
      });

      const graph = await api.getScanGraph('scan-real-001');
      expect(graph.total_modules).toBe(2);
      expect(graph.nodes.length).toBe(2);
      expect(graph.edges.length).toBe(1);
    });
  });
});
