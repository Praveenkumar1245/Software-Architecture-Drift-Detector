import {
  Project,
  ArchitectureDefinition,
  ScanRun,
  Finding,
  DependencyGraphResponse,
  ScanComparison,
  OverviewMetrics,
  User,
  AuthStatusResponse,
  LoginResponse,
  RegisterResponse,
  MessageResponse,
} from '../types';
import { isDevDemoActive, handleDevDemoRequest } from './devDemo';
import {
  isGitHubPagesHost,
  handleStaticShowcaseRequest,
  downloadShowcaseCsv,
  downloadShowcasePdf,
} from './staticShowcase';

export const CUSTOM_API_URL_STORAGE_KEY = 'drift_custom_api_url';
const SESSION_TOKEN_KEY = 'drift_session_token';

// Approved default production backend deployment origin
export const DEFAULT_CONFIGURED_BACKEND = 'https://software-architecture-drift-detector.onrender.com';

/**
 * Returns the exact configured backend origin from build-time environment variables
 * or the default project production backend origin.
 */
export function getConfiguredBackendOrigin(): string {
  const envUrl =
    (import.meta as any)?.env?.VITE_API_URL ||
    (import.meta as any)?.env?.VITE_BACKEND_URL ||
    (import.meta as any)?.env?.VITE_API_BASE_URL;

  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    try {
      const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
      const parsed = new URL(envUrl.trim(), baseOrigin);
      return parsed.origin.toLowerCase();
    } catch {
      // Fall through to default if invalid
    }
  }

  return DEFAULT_CONFIGURED_BACKEND;
}

/**
 * Validates whether a target backend URL belongs to an explicitly approved origin.
 * - Does not automatically trust URLs just because they start with '/'.
 * - Rejects protocol-relative URLs such as `//example.com` or `//attacker.com`.
 * - Parses URLs safely and validates the actual origin against trusted criteria.
 * - In local development, loopback HTTP/HTTPS (localhost, 127.0.0.1, ::1) is permitted.
 * - In production environments, strictly requires HTTPS.
 * - Enforces the exact configured backend origin; wildcard subdomains (*.onrender.com, *.railway.app, *.fly.dev)
 *   are strictly rejected to prevent unauthorized subdomain hijacking.
 * - Ensures authentication tokens are never sent to an untrusted origin.
 */
export function isAllowedBackendOrigin(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const trimmed = urlStr.trim();
  if (!trimmed) return false;

  // Reject protocol-relative URLs (e.g. //example.com) and leading backslash evasion
  if (
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    trimmed.startsWith('\\\\') ||
    trimmed.startsWith('\\/')
  ) {
    return false;
  }

  try {
    const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
    const parsed = new URL(trimmed, baseOrigin);
    const hostname = parsed.hostname.toLowerCase();
    const protocol = parsed.protocol.toLowerCase();

    // Reject non-HTTP/HTTPS protocols (e.g. javascript:, data:, file:)
    if (protocol !== 'http:' && protocol !== 'https:') {
      return false;
    }

    // In local development / testing, permit loopback over http or https
    const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    if (isLoopback) {
      return protocol === 'http:' || protocol === 'https:';
    }

    // Remote / production URLs strictly require HTTPS
    if (protocol !== 'https:') {
      return false;
    }

    // Match exact configured backend origin (from environment or project default)
    const approvedOrigin = getConfiguredBackendOrigin().toLowerCase();
    if (parsed.origin.toLowerCase() === approvedOrigin) {
      return true;
    }

    // Permit same-origin relative URLs if running under HTTPS on the deployment domain
    if (
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      parsed.origin.toLowerCase() === window.location.origin.toLowerCase()
    ) {
      return true;
    }

    // Wildcard trust for arbitrary *.onrender.com, *.railway.app, *.fly.dev is forbidden
    return false;
  } catch {
    return false;
  }
}

/**
 * Resolves a request endpoint against the configured API base URL and strictly validates
 * the final URL origin before any request is dispatched or authentication tokens are attached.
 * 
 * - Rejects protocol-relative URLs (e.g. //attacker.com, //attacker.com/api/v1).
 * - Resolves safe relative paths against the base URL or window.location.origin.
 * - Enforces that the resolved origin is an approved backend origin.
 */
export function buildAndValidateTargetUrl(endpoint: string, base?: string): string {
  if (!endpoint || typeof endpoint !== 'string') {
    throw new Error('Security Error: Target endpoint must be a valid non-empty string.');
  }

  const trimmedEndpoint = endpoint.trim();

  // Reject protocol-relative URLs and slash evasion
  if (
    trimmedEndpoint.startsWith('//') ||
    trimmedEndpoint.startsWith('/\\') ||
    trimmedEndpoint.startsWith('\\\\') ||
    trimmedEndpoint.startsWith('\\/')
  ) {
    throw new Error(`Security Error: Protocol-relative URLs are forbidden ('${endpoint}').`);
  }

  const apiBase = base !== undefined ? base : getApiBaseUrl();

  let targetUrl: string;
  if (trimmedEndpoint.startsWith('http://') || trimmedEndpoint.startsWith('https://')) {
    targetUrl = trimmedEndpoint;
  } else {
    if (!apiBase) {
      throw new Error(
        'Backend connection required: No backend API server is configured. Please deploy the FastAPI backend and configure its URL in "Configure Backend API Server".'
      );
    }
    const cleanBase = apiBase.replace(/\/+$/, '');
    const cleanPath = trimmedEndpoint.startsWith('/') ? trimmedEndpoint : `/${trimmedEndpoint}`;
    targetUrl = `${cleanBase}${cleanPath}`;
  }

  // Validate the final request URL origin before proceeding
  if (!isAllowedBackendOrigin(targetUrl)) {
    throw new Error(`Security Error: Destination URL '${targetUrl}' is not an approved backend origin.`);
  }

  return targetUrl;
}

export function getCustomApiUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(CUSTOM_API_URL_STORAGE_KEY);
    if (stored && isAllowedBackendOrigin(stored)) {
      return stored;
    }
    return null;
  } catch {
    return null;
  }
}

export function setCustomApiUrl(url: string | null): void {
  if (typeof window === 'undefined') return;
  if (url && url.trim()) {
    const cleaned = url.trim().replace(/\/+$/, '');
    if (!isAllowedBackendOrigin(cleaned)) {
      throw new Error('Invalid backend URL: must be an HTTPS URL on the configured deployment domain or localhost.');
    }
    const finalUrl = cleaned.endsWith('/api/v1') ? cleaned : `${cleaned}/api/v1`;
    localStorage.setItem(CUSTOM_API_URL_STORAGE_KEY, finalUrl);
  } else {
    localStorage.removeItem(CUSTOM_API_URL_STORAGE_KEY);
  }
}

export function getApiBaseUrl(): string {
  // 1. Runtime URL parameter: ?api=https://... or ?backend=https://...
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      const queryApi = params.get('api') || params.get('backend');
      if (queryApi && queryApi.trim()) {
        const cleaned = queryApi.trim().replace(/\/+$/, '');
        if (isAllowedBackendOrigin(cleaned)) {
          const finalUrl = cleaned.endsWith('/api/v1') ? cleaned : `${cleaned}/api/v1`;
          localStorage.setItem(CUSTOM_API_URL_STORAGE_KEY, finalUrl);
          return finalUrl;
        } else {
          console.warn('[Security] Ignored unapproved backend URL query parameter:', cleaned);
        }
      }

      // 2. Stored custom API endpoint
      const stored = localStorage.getItem(CUSTOM_API_URL_STORAGE_KEY);
      if (stored && stored.trim()) {
        const cleaned = stored.trim().replace(/\/+$/, '');
        if (isAllowedBackendOrigin(cleaned)) {
          return cleaned.endsWith('/api/v1') ? cleaned : `${cleaned}/api/v1`;
        } else {
          console.warn('[Security] Purged unapproved stored backend URL:', cleaned);
          localStorage.removeItem(CUSTOM_API_URL_STORAGE_KEY);
        }
      }
    } catch {
      // Ignore storage restrictions
    }
  }

  // 3. Build-time Vite environment variables
  const envApiUrl = (import.meta as any)?.env?.VITE_API_URL || (import.meta as any)?.env?.VITE_API_BASE_URL;
  if (envApiUrl && typeof envApiUrl === 'string' && envApiUrl.trim()) {
    const cleaned = envApiUrl.trim().replace(/\/+$/, '');
    if (isAllowedBackendOrigin(cleaned)) {
      return cleaned.endsWith('/api/v1') ? cleaned : `${cleaned}/api/v1`;
    }
  }

  const envBackendUrl = (import.meta as any)?.env?.VITE_BACKEND_URL;
  if (envBackendUrl && typeof envBackendUrl === 'string' && envBackendUrl.trim()) {
    const cleaned = envBackendUrl.trim().replace(/\/+$/, '');
    if (isAllowedBackendOrigin(cleaned)) {
      return `${cleaned}/api/v1`;
    }
  }

  // 4. In development on localhost, use relative '/api/v1' proxied by Vite to http://127.0.0.1:8000
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') {
      return '/api/v1';
    }
  }

  // 5. Default production backend for cloud deployment
  const defaultProductionBackend = `${DEFAULT_CONFIGURED_BACKEND}/api/v1`;
  if (isAllowedBackendOrigin(defaultProductionBackend)) {
    return defaultProductionBackend;
  }

  return '';
}

export const API_BASE = getApiBaseUrl();

export function getStoredSessionToken(): string | null {
  try {
    const token = sessionStorage.getItem(SESSION_TOKEN_KEY) || localStorage.getItem(SESSION_TOKEN_KEY);
    if (token && token === 'fake-token') {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
      localStorage.removeItem(SESSION_TOKEN_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function setStoredSessionToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(SESSION_TOKEN_KEY, token);
      localStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
      localStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // Ignore storage restrictions
  }
}

export interface ApiError extends Error {
  status?: number;
}

/**
 * Primary HTTP request dispatcher.
 * Communicates strictly with the validated backend API and never fakes production data or authentication.
 */
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  // Check development demo environment first (only active if explicitly requested in dev mode)
  if (isDevDemoActive()) {
    return handleDevDemoRequest<T>(endpoint, options);
  }

  // Resolve and validate final target URL origin before dispatching or attaching credentials
  let targetUrl: string;
  try {
    targetUrl = buildAndValidateTargetUrl(endpoint);
  } catch (err) {
    if (isGitHubPagesHost()) {
      return handleStaticShowcaseRequest<T>(endpoint, options);
    }
    throw err;
  }

  // Assemble headers with dual authentication: HttpOnly cookie + Bearer token
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const token = getStoredSessionToken();
  // Strictly validate final target URL origin before attaching Authorization or session token headers
  if (token && isAllowedBackendOrigin(targetUrl) && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['X-Session-Token'] = token;
  }

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      credentials: 'include',
      ...options,
      headers,
    });
  } catch {
    if (isGitHubPagesHost()) {
      return handleStaticShowcaseRequest<T>(endpoint, options);
    }
    const base = getApiBaseUrl();
    throw new Error(
      `Unable to reach backend service at ${base || targetUrl}. Please ensure the server is running and accessible.`
    );
  }

  if (!response.ok) {
    if ((response.status === 404 || response.status === 502 || response.status === 503) && isGitHubPagesHost()) {
      return handleStaticShowcaseRequest<T>(endpoint, options);
    }

    let errorMessage = `API request failed: ${response.status} ${response.statusText}`.trim();

    if (response.status === 400) {
      errorMessage = `Bad Request (400): The server could not process the request.`;
    } else if (response.status === 401) {
      errorMessage = 'Authentication required or session expired (401).';
    } else if (response.status === 403) {
      errorMessage = 'Access denied (403): You do not have permission to access this resource.';
    } else if (response.status === 404) {
      errorMessage = `API endpoint not found (404): '${targetUrl}'. Please verify that the backend API route exists.`;
    } else if (response.status === 405) {
      errorMessage = `Method Not Allowed (405): The API endpoint at '${targetUrl}' does not allow HTTP ${options.method || 'GET'}.`;
    } else if (response.status === 422) {
      errorMessage = 'Validation error (422): Submitted data did not pass backend verification schema.';
    } else if (response.status === 500) {
      errorMessage = 'Internal server error (500). Please check backend logs.';
    } else if (response.status === 502) {
      errorMessage = 'Backend service is unavailable (502 Bad Gateway). Please verify that the server is running.';
    } else if (response.status === 503) {
      errorMessage = 'Service temporarily unavailable (503). Please try again shortly.';
    } else if (response.status === 504) {
      errorMessage = 'Gateway timeout (504). The server took too long to respond.';
    }

    try {
      const errorJson = await response.json();
      if (errorJson.detail) {
        if (typeof errorJson.detail === 'string') {
          errorMessage = errorJson.detail;
        } else if (Array.isArray(errorJson.detail)) {
          errorMessage = errorJson.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
        } else if (errorJson.detail.errors && Array.isArray(errorJson.detail.errors)) {
          errorMessage = errorJson.detail.errors.join(', ');
        } else {
          errorMessage = JSON.stringify(errorJson.detail);
        }
      } else if (errorJson.message) {
        errorMessage = errorJson.message;
      }
    } catch {
      // Retain the informative errorMessage if response is HTML or plain text
    }

    // Handle 401 Unauthorized globally for protected resources
    if (response.status === 401) {
      const isAuthEndpoint = endpoint.startsWith('/auth/');

      if (!isAuthEndpoint && typeof window !== 'undefined') {
        setStoredSessionToken(null);
        window.dispatchEvent(
          new CustomEvent('auth:session_expired', {
            detail: { message: errorMessage, endpoint },
          })
        );
      }
    }

    const err: ApiError = new Error(errorMessage);
    err.status = response.status;
    throw err;
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export const api = {
  // Authentication & Verification
  register: (data: { email: string; password: string; full_name?: string }) =>
    request<RegisterResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  signup: (data: { email: string; password: string; full_name?: string }) =>
    request<RegisterResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  verifySignupOtp: (data: { email: string; otp: string }) =>
    request<MessageResponse>('/auth/verify-signup-otp', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  resendSignupOtp: (data: { email: string }) =>
    request<MessageResponse>('/auth/resend-signup-otp', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  verifyEmail: (token: string) =>
    request<MessageResponse>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  resendVerification: (email: string) =>
    request<MessageResponse>('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  login: async (credentials: { email: string; password: string; remember_me?: boolean }) => {
    const res = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    if (res.session_token) {
      setStoredSessionToken(res.session_token);
    }
    return res;
  },

  logout: async () => {
    try {
      const res = await request<MessageResponse>('/auth/logout', {
        method: 'POST',
      });
      return res;
    } finally {
      setStoredSessionToken(null);
    }
  },

  getMe: () => request<User>('/auth/me'),

  getAuthStatus: () => request<AuthStatusResponse>('/auth/status'),

  forgotPassword: (email: string) =>
    request<MessageResponse>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verifyResetOtp: (data: { email: string; otp: string }) =>
    request<{ message: string; email: string; reset_token: string }>('/auth/verify-reset-otp', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  resendResetOtp: (data: { email: string }) =>
    request<MessageResponse>('/auth/resend-reset-otp', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  resetPassword: (data: { token?: string; reset_token?: string; email?: string; new_password: string }) =>
    request<MessageResponse>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getLatestDevEmail: () =>
    request<{
      recipient: string;
      email_type: string;
      subject: string;
      action_url: string;
      token: string;
      note?: string;
    }>('/auth/dev/mailbox/latest'),

  // Health
  getHealth: () => request<{ status: string; database: string; version: string; storage?: string }>('/health'),

  // Projects
  getProjects: () => request<Project[]>('/projects'),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  createProject: (data: Partial<Project>) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id: string, data: Partial<Project>) =>
    request<Project>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProject: (id: string) =>
    request<void>(`/projects/${id}`, { method: 'DELETE' }),

  uploadProjectZip: async (projectId: string, file: File): Promise<{ message: string; repository_path: string }> => {
    let targetUrl: string;
    try {
      targetUrl = buildAndValidateTargetUrl(`/projects/${encodeURIComponent(projectId)}/upload`);
    } catch (err) {
      if (isGitHubPagesHost()) {
        return { message: 'Project code archive processed successfully (showcase sandbox)', repository_path: `uploads/${file.name}` };
      }
      throw err;
    }

    const formData = new FormData();
    formData.append('file', file);

    const headers: Record<string, string> = {};
    const token = getStoredSessionToken();
    if (token && isAllowedBackendOrigin(targetUrl)) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-Session-Token'] = token;
    }

    let res: Response;
    try {
      res = await fetch(targetUrl, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: formData,
      });
    } catch {
      if (isGitHubPagesHost()) {
        return { message: 'Project code archive processed successfully (showcase sandbox)', repository_path: `uploads/${file.name}` };
      }
      const base = getApiBaseUrl();
      throw new Error(
        `Unable to reach backend service at ${base || targetUrl}. Please ensure the server is running and accessible.`
      );
    }

    if (!res.ok) {
      if ((res.status === 404 || res.status === 502 || res.status === 503) && isGitHubPagesHost()) {
        return { message: 'Project code archive processed successfully (showcase sandbox)', repository_path: `uploads/${file.name}` };
      }
      let errorMessage = `Upload failed (${res.status} ${res.statusText})`;
      try {
        const err = await res.json();
        if (err.detail) {
          errorMessage = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
        }
      } catch {
        // Not JSON
      }
      throw new Error(errorMessage);
    }
    return res.json();
  },

  // Architecture
  getArchitectureTemplates: () => request<Record<string, any>>('/architectures/templates'),
  validateArchitecture: (raw_content: string, format = 'json') =>
    request<{ is_valid: boolean; errors: string[]; warnings: string[]; parsed_definition?: any }>(
      '/architectures/validate',
      { method: 'POST', body: JSON.stringify({ raw_content, format }) }
    ),
  getProjectArchitectures: (projectId: string) =>
    request<ArchitectureDefinition[]>(`/architectures/project/${projectId}`),
  createArchitecture: (data: { project_id: string; name: string; format: string; raw_content: string }) =>
    request<ArchitectureDefinition>('/architectures', { method: 'POST', body: JSON.stringify(data) }),
  getArchitecture: (id: string) => request<ArchitectureDefinition>(`/architectures/${id}`),
  activateArchitecture: (id: string) =>
    request<ArchitectureDefinition>(`/architectures/${id}/activate`, { method: 'PATCH' }),
  updateArchitecture: (id: string, data: { name?: string; description?: string; raw_content?: string }) =>
    request<ArchitectureDefinition>(`/architectures/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteArchitecture: (id: string) =>
    request<void>(`/architectures/${id}`, { method: 'DELETE' }),

  // Scans
  triggerScan: (data: { project_id: string; architecture_id?: string; source_version?: string }) =>
    request<ScanRun>('/scans', { method: 'POST', body: JSON.stringify(data) }),
  getProjectScans: (projectId: string) => request<ScanRun[]>(`/projects/${projectId}/scans`),
  getScan: (id: string) => request<ScanRun>(`/scans/${id}`),
  compareScans: (scanAId: string, scanBId: string) =>
    request<ScanComparison>(`/scans/${scanAId}/compare/${scanBId}`),

  // Findings
  getScanFindings: (
    scanId: string,
    params?: { severity?: string; status?: string; rule_type?: string; component?: string; search?: string }
  ) => {
    const query = new URLSearchParams();
    if (params?.severity) query.append('severity', params.severity);
    if (params?.status) query.append('status', params.status);
    if (params?.rule_type) query.append('rule_type', params.rule_type);
    if (params?.component) query.append('component', params.component);
    if (params?.search) query.append('search', params.search);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return request<Finding[]>(`/scans/${scanId}/findings${qs}`);
  },
  getFindingDetails: (id: string) => request<Finding>(`/findings/${id}`),
  updateFindingStatus: (id: string, status: string, reason?: string) =>
    request<Finding>(`/findings/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason }),
    }),

  // Dependency Graph
  getScanGraph: (scanId: string) => request<DependencyGraphResponse>(`/scans/${scanId}/graph`),

  // Reports & Overview
  getOverview: (projectId?: string) => {
    const query = projectId ? `?project_id=${projectId}` : '';
    return request<OverviewMetrics>(`/overview${query}`);
  },
  getJsonReportUrl: (scanId: string) =>
    buildAndValidateTargetUrl(`/scans/${encodeURIComponent(scanId)}/report/json`),
  getCsvReportUrl: (scanId: string) =>
    buildAndValidateTargetUrl(`/scans/${encodeURIComponent(scanId)}/report/csv`),
  getPdfReportUrl: (scanId: string) =>
    buildAndValidateTargetUrl(`/scans/${encodeURIComponent(scanId)}/report/pdf`),
  downloadCsvReport: async (scanId: string, customFilename?: string): Promise<void> => {
    let targetUrl: string;
    try {
      targetUrl = buildAndValidateTargetUrl(`/scans/${encodeURIComponent(scanId)}/report/csv`);
    } catch (err) {
      if (isGitHubPagesHost()) {
        downloadShowcaseCsv(scanId, customFilename);
        return;
      }
      throw err;
    }

    const token = getStoredSessionToken();
    const headers: Record<string, string> = {
      'Accept': 'text/csv',
    };
    if (token && isAllowedBackendOrigin(targetUrl)) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-Session-Token'] = token;
    }

    let response: Response;
    try {
      response = await fetch(targetUrl, {
        method: 'GET',
        credentials: 'include',
        headers,
      });
    } catch {
      if (isGitHubPagesHost()) {
        downloadShowcaseCsv(scanId, customFilename);
        return;
      }
      const base = getApiBaseUrl();
      throw new Error(
        `Unable to reach backend service at ${base || targetUrl}. Please ensure the server is running and accessible.`
      );
    }

    if (!response.ok) {
      if ((response.status === 404 || response.status === 502 || response.status === 503) && isGitHubPagesHost()) {
        downloadShowcaseCsv(scanId, customFilename);
        return;
      }
      let errorMessage = `Failed to download CSV (${response.status} ${response.statusText})`;
      try {
        const errorJson = await response.json();
        if (errorJson.detail) {
          errorMessage = typeof errorJson.detail === 'string' ? errorJson.detail : JSON.stringify(errorJson.detail);
        }
      } catch {
        // Not JSON
      }
      throw new Error(errorMessage);
    }

    const textContent = await response.text();
    // Ensure UTF-8 BOM (\uFEFF) is present for seamless double-click opening in Windows applications (Notepad, Excel)
    const formattedData = textContent.startsWith('\uFEFF') ? textContent : `\uFEFF${textContent}`;
    const blob = new Blob([formattedData], { type: 'text/csv;charset=utf-8;' });
    const objectUrl = window.URL.createObjectURL(blob);

    const filename = customFilename || `drift_report_${scanId.substring(0, 8)}.csv`;
    const link = document.createElement('a');
    link.href = objectUrl;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
      window.URL.revokeObjectURL(objectUrl);
    }, 150);
  },
  downloadJsonReport: async (scanId: string, customFilename?: string): Promise<void> => {
    const data = await request<any>(`/scans/${scanId}/report/json`);
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const objectUrl = window.URL.createObjectURL(blob);
    const filename = customFilename || `drift_report_${scanId.substring(0, 8)}.json`;
    const link = document.createElement('a');
    link.href = objectUrl;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
      window.URL.revokeObjectURL(objectUrl);
    }, 150);
  },
  downloadPdfReport: async (scanId: string, customFilename?: string): Promise<void> => {
    let targetUrl: string;
    try {
      targetUrl = buildAndValidateTargetUrl(`/scans/${encodeURIComponent(scanId)}/report/pdf`);
    } catch (err) {
      if (isGitHubPagesHost()) {
        downloadShowcasePdf(scanId, customFilename);
        return;
      }
      throw err;
    }

    const token = getStoredSessionToken();
    const headers: Record<string, string> = {
      'Accept': 'application/pdf',
    };
    if (token && isAllowedBackendOrigin(targetUrl)) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-Session-Token'] = token;
    }

    let response: Response;
    try {
      response = await fetch(targetUrl, {
        method: 'GET',
        credentials: 'include',
        headers,
      });
    } catch {
      if (isGitHubPagesHost()) {
        downloadShowcasePdf(scanId, customFilename);
        return;
      }
      const base = getApiBaseUrl();
      throw new Error(
        `Unable to reach backend service at ${base || targetUrl}. Please ensure the server is running and accessible.`
      );
    }

    if (!response.ok) {
      if ((response.status === 404 || response.status === 502 || response.status === 503) && isGitHubPagesHost()) {
        downloadShowcasePdf(scanId, customFilename);
        return;
      }
      let errorMessage = `Failed to download PDF (${response.status} ${response.statusText})`;
      try {
        const errorJson = await response.json();
        if (errorJson.detail) {
          errorMessage = typeof errorJson.detail === 'string' ? errorJson.detail : JSON.stringify(errorJson.detail);
        }
      } catch {
        // Not JSON
      }
      throw new Error(errorMessage);
    }

    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const filename = customFilename || `drift_report_${scanId.substring(0, 8)}.pdf`;
    const link = document.createElement('a');
    link.href = objectUrl;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
      window.URL.revokeObjectURL(objectUrl);
    }, 150);
  },

  // AI Assistance
  getAiStatus: () => request<{ ai_enabled: boolean; provider: string; is_configured: boolean }>('/ai/status'),
  explainFinding: (payload: {
    rule_type: string;
    title: string;
    explanation: string;
    source_component?: string;
    target_component?: string;
    evidence?: string;
  }) =>
    request<{ ai_explanation: string; architectural_remediation: string; source: string }>(
      '/ai/explain-finding',
      { method: 'POST', body: JSON.stringify(payload) }
    ),
};
