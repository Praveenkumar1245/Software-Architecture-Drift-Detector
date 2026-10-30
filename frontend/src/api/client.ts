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

const API_BASE = '/api/v1';
const SESSION_TOKEN_KEY = 'drift_session_token';

export function getStoredSessionToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_TOKEN_KEY) || localStorage.getItem(SESSION_TOKEN_KEY);
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

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  // Assemble headers with dual authentication: HttpOnly cookie + Bearer token
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const token = getStoredSessionToken();
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['X-Session-Token'] = token;
  }

  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
    if (response.status === 502) {
      errorMessage = 'Backend service is unavailable (502 Bad Gateway). Please verify that the server is running on http://127.0.0.1:8000.';
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
        } else if (errorJson.detail.errors) {
          errorMessage = errorJson.detail.errors.join(', ');
        } else {
          errorMessage = JSON.stringify(errorJson.detail);
        }
      }
    } catch {
      // Ignore JSON parse error and retain user-friendly error message
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
    const formData = new FormData();
    formData.append('file', file);

    const headers: Record<string, string> = {};
    const token = getStoredSessionToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-Session-Token'] = token;
    }

    const res = await fetch(`${API_BASE}/projects/${projectId}/upload`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Upload failed');
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
  getJsonReportUrl: (scanId: string) => `${API_BASE}/scans/${scanId}/report/json`,
  getCsvReportUrl: (scanId: string) => `${API_BASE}/scans/${scanId}/report/csv`,
  getPdfReportUrl: (scanId: string) => `${API_BASE}/scans/${scanId}/report/pdf`,
  downloadCsvReport: async (scanId: string, customFilename?: string): Promise<void> => {
    const url = `${API_BASE}/scans/${scanId}/report/csv`;
    const token = getStoredSessionToken();
    const headers: Record<string, string> = {
      'Accept': 'text/csv',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-Session-Token'] = token;
    }

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers,
    });

    if (!response.ok) {
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
    const url = `${API_BASE}/scans/${scanId}/report/pdf`;
    const token = getStoredSessionToken();
    const headers: Record<string, string> = {
      'Accept': 'application/pdf',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-Session-Token'] = token;
    }

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers,
    });

    if (!response.ok) {
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
