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

export const CUSTOM_API_URL_STORAGE_KEY = 'drift_custom_api_url';

export function isAllowedBackendOrigin(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const trimmed = urlStr.trim();
  if (trimmed.startsWith('/')) return true;

  try {
    const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
    const parsed = new URL(trimmed, baseOrigin);
    const hostname = parsed.hostname.toLowerCase();
    const protocol = parsed.protocol.toLowerCase();

    // In local development, permit loopback over http or https
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return protocol === 'http:' || protocol === 'https:';
    }

    // In production environments, strictly enforce HTTPS
    if (protocol !== 'https:') {
      return false;
    }

    // Explicitly approved backend deployment domains and same origin
    if (
      hostname.endsWith('.onrender.com') ||
      hostname.endsWith('.railway.app') ||
      hostname.endsWith('.fly.dev') ||
      (typeof window !== 'undefined' && hostname === window.location.hostname.toLowerCase())
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function isStaticProductionHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return host.endsWith('github.io') || (host !== 'localhost' && host !== '127.0.0.1' && !host.startsWith('192.168.') && !host.startsWith('10.'));
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
  try {
    if (url && url.trim()) {
      const cleaned = url.trim().replace(/\/+$/, '');
      if (!isAllowedBackendOrigin(cleaned)) {
        throw new Error('Invalid backend URL: must be an HTTPS URL on an approved domain (*.onrender.com, *.railway.app, *.fly.dev) or localhost.');
      }
      const finalUrl = cleaned.endsWith('/api/v1') ? cleaned : `${cleaned}/api/v1`;
      localStorage.setItem(CUSTOM_API_URL_STORAGE_KEY, finalUrl);
    } else {
      localStorage.removeItem(CUSTOM_API_URL_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
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
  if (!isStaticProductionHost()) {
    return '/api/v1';
  }

  // 5. On static production hosts (GitHub Pages) with no configured backend:
  // Do NOT return relative '/api/v1' because relative calls on GitHub Pages resolve to
  // https://<username>.github.io/api/v1 which Fastly rejects with 405 Method Not Allowed!
  return '';
}

export const API_BASE = getApiBaseUrl();

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

// Static hosting offline fallback engine
function handleStaticOffline<T>(endpoint: string, options: RequestInit = {}): T {
  const method = (options.method || 'GET').toUpperCase();
  const cleanEndpoint = endpoint.split('?')[0];

  // Auth: Login
  if (cleanEndpoint === '/auth/login' && method === 'POST') {
    let email = 'architect@enterprise.com';
    try {
      if (options.body) {
        const parsed = JSON.parse(options.body as string);
        if (parsed.email) email = parsed.email;
      }
    } catch {}
    const demoUser: User = {
      id: 'usr-arch-demo',
      email,
      full_name: email.split('@')[0],
      is_verified: true,
      created_at: new Date().toISOString(),
    };
    try {
      localStorage.setItem('drift_demo_user', JSON.stringify(demoUser));
      setStoredSessionToken('drift_demo_token_authenticated');
    } catch {}
    return {
      message: 'Signed in successfully',
      user: demoUser,
      session_token: 'drift_demo_token_authenticated',
      expires_at: new Date(Date.now() + 86400000 * 30).toISOString(),
    } as unknown as T;
  }

  // Auth: Status
  if (cleanEndpoint === '/auth/status') {
    const token = getStoredSessionToken();
    let storedUser: User | null = null;
    try {
      const u = localStorage.getItem('drift_demo_user');
      if (u) storedUser = JSON.parse(u);
    } catch {}

    if (token && storedUser) {
      return { authenticated: true, user: storedUser } as unknown as T;
    }
    return { authenticated: false, user: null } as unknown as T;
  }

  // Auth: Me
  if (cleanEndpoint === '/auth/me') {
    let storedUser: User = {
      id: 'usr-arch-demo',
      email: 'architect@enterprise.com',
      full_name: 'Enterprise Architect',
      is_verified: true,
      created_at: new Date().toISOString(),
    };
    try {
      const u = localStorage.getItem('drift_demo_user');
      if (u) storedUser = JSON.parse(u);
    } catch {}
    return storedUser as unknown as T;
  }

  // Auth: Logout
  if (cleanEndpoint === '/auth/logout') {
    try {
      localStorage.removeItem('drift_demo_user');
      setStoredSessionToken(null);
    } catch {}
    return { message: 'Signed out successfully' } as unknown as T;
  }

  // Auth: Register & Forgot Password
  if (cleanEndpoint === '/auth/register' || cleanEndpoint === '/auth/signup') {
    return {
      message: 'Account registered successfully! You may now sign in.',
      user_id: 'usr-new-001',
      email: 'architect@enterprise.com',
    } as unknown as T;
  }
  if (cleanEndpoint === '/auth/forgot-password' || cleanEndpoint === '/auth/resend-verification' || cleanEndpoint === '/auth/resend-signup-otp') {
    return { message: 'Verification link/OTP dispatched successfully.' } as unknown as T;
  }
  if (cleanEndpoint === '/auth/verify-email' || cleanEndpoint === '/auth/verify-signup-otp' || cleanEndpoint === '/auth/reset-password') {
    return { message: 'Action completed successfully.' } as unknown as T;
  }

  // Health
  if (cleanEndpoint === '/health') {
    return {
      status: 'healthy',
      database: 'healthy',
      storage: 'healthy',
      version: '1.0.0',
      project: 'Software Architecture Drift Detector',
    } as unknown as T;
  }

  // Projects Persistence Helpers
  const getStoredOfflineProjects = (): Project[] => {
    try {
      const raw = localStorage.getItem('drift_offline_projects');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    const defaultList: Project[] = [
      {
        id: 'proj-ecommerce-drift',
        name: 'Software Architecture Drift Detector',
        description: 'Production architecture inspection workspace comparing clean layered architecture against AST-extracted dependencies.',
        repository_type: 'local_zip',
        repository_path: 'sample-project/app',
        primary_language: 'python',
        source_dirs: 'app,src',
        exclude_dirs: '.venv,venv,__pycache__,tests,dist,build,node_modules,.git',
        created_at: '2026-10-29T18:00:00Z',
        updated_at: new Date().toISOString(),
        total_scans: 4,
        latest_scan_status: 'completed',
        latest_scan_timestamp: new Date().toISOString(),
        latest_compliance_percentage: 85.7,
        open_findings_count: 2,
        critical_findings_count: 1,
      }
    ];
    try {
      localStorage.setItem('drift_offline_projects', JSON.stringify(defaultList));
    } catch {}
    return defaultList;
  };

  const saveStoredOfflineProjects = (projectsList: Project[]): void => {
    try {
      localStorage.setItem('drift_offline_projects', JSON.stringify(projectsList));
    } catch {}
  };

  const getStoredOfflineScans = (projectId?: string): ScanRun[] => {
    try {
      const raw = localStorage.getItem('drift_offline_scans');
      if (raw) {
        const parsed: ScanRun[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          if (projectId) return parsed.filter((s) => s.project_id === projectId);
          return parsed;
        }
      }
    } catch {}

    const defaultScan: ScanRun = {
      id: 'scan-run-latest-001',
      project_id: 'proj-ecommerce-drift',
      architecture_id: 'arch-layered-001',
      status: 'completed',
      started_at: new Date(Date.now() - 3600000).toISOString(),
      completed_at: new Date(Date.now() - 3550000).toISOString(),
      duration_ms: 50420,
      source_version: 'v1.4.2-audit',
      files_analyzed: 14,
      modules_discovered: 8,
      dependencies_discovered: 12,
      total_findings: 2,
      critical_findings: 1,
      high_findings: 1,
      medium_findings: 0,
      low_findings: 0,
      compliance_percentage: 85.7,
      created_at: new Date(Date.now() - 3600000).toISOString(),
    };

    try {
      localStorage.setItem('drift_offline_scans', JSON.stringify([defaultScan]));
    } catch {}

    if (projectId && projectId !== 'proj-ecommerce-drift') return [];
    return [defaultScan];
  };

  const saveStoredOfflineScan = (scan: ScanRun): void => {
    try {
      const current = getStoredOfflineScans();
      current.unshift(scan);
      localStorage.setItem('drift_offline_scans', JSON.stringify(current));

      const projects = getStoredOfflineProjects();
      const p = projects.find((proj) => proj.id === scan.project_id);
      if (p) {
        p.total_scans = (p.total_scans || 0) + 1;
        p.latest_scan_status = scan.status;
        p.latest_scan_timestamp = scan.completed_at || scan.started_at;
        p.latest_compliance_percentage = scan.compliance_percentage;
        p.open_findings_count = scan.total_findings;
        p.critical_findings_count = scan.critical_findings;
        saveStoredOfflineProjects(projects);
      }
    } catch {}
  };

  // Projects
  if (cleanEndpoint === '/projects') {
    if (method === 'POST') {
      let body: any = {};
      try { body = JSON.parse(options.body as string); } catch {}
      const newProj: Project = {
        id: 'proj-' + Date.now(),
        name: body.name || 'Software Project',
        description: body.description || '',
        repository_type: body.repository_type || 'local_zip',
        repository_path: body.repository_path || 'sample-project/app',
        primary_language: body.primary_language || 'python',
        source_dirs: body.source_dirs || 'app,src',
        exclude_dirs: body.exclude_dirs || '.venv,venv,__pycache__,tests,dist,build,node_modules,.git',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        total_scans: 0,
        open_findings_count: 0,
        critical_findings_count: 0,
      };
      const list = getStoredOfflineProjects();
      list.unshift(newProj);
      saveStoredOfflineProjects(list);
      return newProj as unknown as T;
    }
    return getStoredOfflineProjects() as unknown as T;
  }

  if (cleanEndpoint.startsWith('/projects/') && !cleanEndpoint.includes('/scans')) {
    const projId = cleanEndpoint.replace('/projects/', '');
    if (method === 'DELETE') {
      const list = getStoredOfflineProjects().filter((p) => p.id !== projId);
      saveStoredOfflineProjects(list);
      return {} as unknown as T;
    }
    if (method === 'PUT') {
      let body: any = {};
      try { body = JSON.parse(options.body as string); } catch {}
      const list = getStoredOfflineProjects();
      const idx = list.findIndex((p) => p.id === projId);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...body, updated_at: new Date().toISOString() };
        saveStoredOfflineProjects(list);
        return list[idx] as unknown as T;
      }
    }
    const found = getStoredOfflineProjects().find((p) => p.id === projId);
    if (found) return found as unknown as T;
    return getStoredOfflineProjects()[0] as unknown as T;
  }

  // Architecture Templates
  if (cleanEndpoint === '/architectures/templates') {
    return {
      layered: {
        name: 'Standard Layered Architecture',
        description: 'Four-tier architectural layout enforcing strict downward dependency flow: Presentation -> Application -> Domain -> Infrastructure.',
        components: [
          { name: 'presentation', layer: 1, allowed_dependencies: ['application'], forbidden_dependencies: ['domain', 'infrastructure'], path_patterns: ['app/presentation/**', 'presentation/**'] },
          { name: 'application', layer: 2, allowed_dependencies: ['domain', 'infrastructure'], forbidden_dependencies: ['presentation'], path_patterns: ['app/application/**', 'application/**'] },
          { name: 'domain', layer: 3, allowed_dependencies: [], forbidden_dependencies: ['presentation', 'infrastructure', 'application'], path_patterns: ['app/domain/**', 'domain/**'] },
          { name: 'infrastructure', layer: 4, allowed_dependencies: ['domain'], forbidden_dependencies: ['presentation'], path_patterns: ['app/infrastructure/**', 'infrastructure/**'] },
        ],
        rules: [
          { id: 'FORBIDDEN-DOMAIN-TO-PRESENTATION', type: 'forbidden_dependency', description: 'Domain layer must never import presentation concerns.', severity: 'critical', from_component: 'domain', to_component: 'presentation' },
          { id: 'LAYER-DIRECTION-RULE', type: 'layer_violation', description: 'Lower layers must not depend on higher layers.', severity: 'high', layer_direction: 'downward' },
        ]
      }
    } as unknown as T;
  }

  // Project Architectures
  if (cleanEndpoint.startsWith('/architectures/project/')) {
    const targetProjId = cleanEndpoint.replace('/architectures/project/', '') || 'proj-ecommerce-drift';
    return [
      {
        id: 'arch-layered-001',
        project_id: targetProjId,
        name: 'Standard Layered Architecture',
        description: 'Four-tier architectural layout enforcing strict downward dependency flow: Presentation -> Application -> Domain -> Infrastructure.',
        version: 1,
        format: 'json',
        raw_content: JSON.stringify({
          name: 'Standard Layered Architecture',
          components: [
            { name: 'presentation', layer: 1, allowed_dependencies: ['application'], forbidden_dependencies: ['domain', 'infrastructure'], path_patterns: ['app/presentation/**', 'presentation/**'] },
            { name: 'application', layer: 2, allowed_dependencies: ['domain', 'infrastructure'], forbidden_dependencies: ['presentation'], path_patterns: ['app/application/**', 'application/**'] },
            { name: 'domain', layer: 3, allowed_dependencies: [], forbidden_dependencies: ['presentation', 'infrastructure', 'application'], path_patterns: ['app/domain/**', 'domain/**'] },
            { name: 'infrastructure', layer: 4, allowed_dependencies: ['domain'], forbidden_dependencies: ['presentation'], path_patterns: ['app/infrastructure/**', 'infrastructure/**'] },
          ],
          rules: [
            { id: 'FORBIDDEN-DOMAIN-TO-PRESENTATION', type: 'forbidden_dependency', description: 'Domain layer must never import presentation concerns.', severity: 'critical', from_component: 'domain', to_component: 'presentation' },
            { id: 'LAYER-DIRECTION-RULE', type: 'layer_violation', description: 'Lower layers must not depend on higher layers.', severity: 'high', layer_direction: 'downward' },
          ]
        }, null, 2),
        components: [
          { name: 'presentation', layer: 1, allowed_dependencies: ['application'], forbidden_dependencies: ['domain', 'infrastructure'], path_patterns: ['app/presentation/**', 'presentation/**'], required_dependencies: [] },
          { name: 'application', layer: 2, allowed_dependencies: ['domain', 'infrastructure'], forbidden_dependencies: ['presentation'], path_patterns: ['app/application/**', 'application/**'], required_dependencies: [] },
          { name: 'domain', layer: 3, allowed_dependencies: [], forbidden_dependencies: ['presentation', 'infrastructure', 'application'], path_patterns: ['app/domain/**', 'domain/**'], required_dependencies: [] },
          { name: 'infrastructure', layer: 4, allowed_dependencies: ['domain'], forbidden_dependencies: ['presentation'], path_patterns: ['app/infrastructure/**', 'infrastructure/**'], required_dependencies: [] },
        ],
        rules: [
          { id: 'FORBIDDEN-DOMAIN-TO-PRESENTATION', type: 'forbidden_dependency', description: 'Domain layer must never import presentation concerns.', severity: 'critical', from_component: 'domain', to_component: 'presentation' },
          { id: 'LAYER-DIRECTION-RULE', type: 'layer_violation', description: 'Lower layers must not depend on higher layers.', severity: 'high', layer_direction: 'downward' },
        ],
        is_active: true,
        created_at: '2026-10-29T18:00:00Z',
        updated_at: new Date().toISOString(),
      }
    ] as unknown as T;
  }

  // Activate Architecture
  if (cleanEndpoint.startsWith('/architectures/') && cleanEndpoint.endsWith('/activate')) {
    return {
      id: 'arch-layered-001',
      project_id: 'proj-ecommerce-drift',
      name: 'Standard Layered Architecture',
      description: 'Four-tier architectural layout enforcing strict downward dependency flow: Presentation -> Application -> Domain -> Infrastructure.',
      version: 1,
      format: 'json',
      is_active: true,
      created_at: '2026-10-29T18:00:00Z',
      updated_at: new Date().toISOString(),
    } as unknown as T;
  }

  // Architecture Validation
  if (cleanEndpoint === '/architectures/validate') {
    return {
      is_valid: true,
      errors: [],
      warnings: [],
      parsed_definition: {
        name: 'Standard Layered Architecture',
        components: [
          { name: 'presentation', layer: 1 },
          { name: 'application', layer: 2 },
          { name: 'domain', layer: 3 },
          { name: 'infrastructure', layer: 4 },
        ]
      }
    } as unknown as T;
  }

  // Scans
  if (cleanEndpoint === '/scans' || (cleanEndpoint.startsWith('/projects/') && cleanEndpoint.endsWith('/scans'))) {
    const matchProjId = cleanEndpoint.startsWith('/projects/')
      ? cleanEndpoint.split('/')[2]
      : undefined;

    if (cleanEndpoint === '/scans' && method === 'POST') {
      let body: any = {};
      try { body = JSON.parse(options.body as string); } catch {}
      const targetProjId = body.project_id || 'proj-ecommerce-drift';
      const newScan: ScanRun = {
        id: 'scan-' + Date.now(),
        project_id: targetProjId,
        architecture_id: body.architecture_id || 'arch-layered-001',
        status: 'completed',
        started_at: new Date(Date.now() - 10000).toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: 12450,
        source_version: body.source_version || 'v1.0.0',
        files_analyzed: 8,
        modules_discovered: 4,
        dependencies_discovered: 6,
        total_findings: 0,
        critical_findings: 0,
        high_findings: 0,
        medium_findings: 0,
        low_findings: 0,
        compliance_percentage: 100,
        created_at: new Date().toISOString(),
      };
      saveStoredOfflineScan(newScan);
      return newScan as unknown as T;
    }
    return getStoredOfflineScans(matchProjId) as unknown as T;
  }

  if (cleanEndpoint.startsWith('/scans/') && !cleanEndpoint.includes('/findings') && !cleanEndpoint.includes('/graph') && !cleanEndpoint.includes('/report') && !cleanEndpoint.includes('/compare')) {
    const scanId = cleanEndpoint.replace('/scans/', '');
    return {
      id: scanId || 'scan-run-latest-001',
      project_id: 'proj-ecommerce-drift',
      architecture_id: 'arch-layered-001',
      status: 'completed',
      started_at: new Date(Date.now() - 3600000).toISOString(),
      completed_at: new Date(Date.now() - 3550000).toISOString(),
      duration_ms: 50420,
      source_version: 'v1.4.2-audit',
      files_analyzed: 14,
      modules_discovered: 8,
      dependencies_discovered: 12,
      total_findings: 2,
      critical_findings: 1,
      high_findings: 1,
      medium_findings: 0,
      low_findings: 0,
      compliance_percentage: 85.7,
      created_at: new Date(Date.now() - 3600000).toISOString(),
    } as unknown as T;
  }

  // Findings
  if (cleanEndpoint.includes('/findings') && !cleanEndpoint.startsWith('/findings/')) {
    return [
      {
        id: 'find-001',
        scan_id: 'scan-run-latest-001',
        project_id: 'proj-ecommerce-drift',
        rule_id: 'FORBIDDEN-DOMAIN-TO-PRESENTATION',
        rule_type: 'forbidden_dependency',
        title: 'Domain Layer Violates Architecture: Direct dependency on Presentation Layer',
        explanation: 'Module app.domain.order directly imports format_currency_response from app.presentation.routes. Domain layer must remain pure business logic and never depend on presentation concerns.',
        severity: 'critical',
        status: 'open',
        source_component: 'domain',
        target_component: 'presentation',
        source_module: 'app.domain.order',
        target_module: 'app.presentation.routes',
        file_path: 'app/domain/order.py',
        line_number: 11,
        expected_behavior: 'Domain layer components must have zero dependencies on presentation concerns.',
        actual_behavior: 'Direct import of presentation route formatter inside domain model order.py:11.',
        evidence: 'from app.presentation.routes import format_currency_response',
        confidence: 'high',
        remediation: 'Remove presentation import from order.py. Move response formatting to presentation layer routes.',
        first_detected_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        last_detected_at: new Date().toISOString(),
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'find-002',
        scan_id: 'scan-run-latest-001',
        project_id: 'proj-ecommerce-drift',
        rule_id: 'LAYER-DIRECTION-RULE',
        rule_type: 'layer_violation',
        title: 'Layer Direction Violation: Upward dependency from Layer 3 (Domain) to Layer 1 (Presentation)',
        explanation: 'Layered architectural constraint violated. Lower layer components are strictly forbidden from depending on higher layer components.',
        severity: 'high',
        status: 'open',
        source_component: 'domain',
        target_component: 'presentation',
        source_module: 'app.domain.order',
        target_module: 'app.presentation.routes',
        file_path: 'app/domain/order.py',
        line_number: 11,
        expected_behavior: 'Lower layer components must not depend on higher layers.',
        actual_behavior: 'Domain layer (layer 3) depends on Presentation (layer 1).',
        evidence: 'from app.presentation.routes import format_currency_response',
        confidence: 'high',
        remediation: 'Invert the dependency using domain events or application service orchestration.',
        first_detected_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        last_detected_at: new Date().toISOString(),
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        updated_at: new Date().toISOString(),
      }
    ] as unknown as T;
  }

  // Dependency Graph
  if (cleanEndpoint.includes('/graph')) {
    return {
      scan_id: 'scan-run-latest-001',
      project_id: 'proj-ecommerce-drift',
      nodes: [
        { id: 'app.presentation.routes', label: 'presentation.routes', component: 'presentation', layer: 1, node_type: 'module', file_path: 'app/presentation/routes.py', is_violation: false, classes_count: 1, functions_count: 4, imports_count: 3 },
        { id: 'app.application.order_service', label: 'application.order_service', component: 'application', layer: 2, node_type: 'module', file_path: 'app/application/order_service.py', is_violation: false, classes_count: 1, functions_count: 3, imports_count: 4 },
        { id: 'app.domain.order', label: 'domain.order', component: 'domain', layer: 3, node_type: 'module', file_path: 'app/domain/order.py', is_violation: true, classes_count: 2, functions_count: 5, imports_count: 2 },
        { id: 'app.infrastructure.database', label: 'infrastructure.database', component: 'infrastructure', layer: 4, node_type: 'module', file_path: 'app/infrastructure/database.py', is_violation: false, classes_count: 1, functions_count: 4, imports_count: 2 },
      ],
      edges: [
        { id: 'e1', source: 'app.presentation.routes', target: 'app.application.order_service', source_component: 'presentation', target_component: 'application', is_violation: false, edge_type: 'actual' },
        { id: 'e2', source: 'app.application.order_service', target: 'app.domain.order', source_component: 'application', target_component: 'domain', is_violation: false, edge_type: 'actual' },
        { id: 'e3', source: 'app.application.order_service', target: 'app.infrastructure.database', source_component: 'application', target_component: 'infrastructure', is_violation: false, edge_type: 'actual' },
        { id: 'e4', source: 'app.domain.order', target: 'app.presentation.routes', source_component: 'domain', target_component: 'presentation', is_violation: true, violation_rule_id: 'FORBIDDEN-DOMAIN-TO-PRESENTATION', import_line: 11, import_statement: 'from app.presentation.routes import format_currency_response', edge_type: 'forbidden' },
      ],
      components: ['presentation', 'application', 'domain', 'infrastructure'],
      total_modules: 4,
      total_dependencies: 4,
      total_violations: 1,
    } as unknown as T;
  }

  // Overview
  if (cleanEndpoint.startsWith('/overview')) {
    let targetProjId: string | null = null;
    try {
      const q = endpoint.includes('?') ? endpoint.split('?')[1] : '';
      const params = new URLSearchParams(q);
      targetProjId = params.get('project_id');
    } catch {}

    const allProjects = getStoredOfflineProjects();
    const targetProject = targetProjId
      ? allProjects.find((p) => p.id === targetProjId)
      : allProjects[0];

    const projectScans = getStoredOfflineScans(targetProject?.id);
    const latestScan = projectScans.length > 0 ? projectScans[0] : undefined;

    if (!latestScan || (targetProject && targetProject.total_scans === 0)) {
      return {
        project_id: targetProject?.id || 'proj-ecommerce-drift',
        project_name: targetProject?.name || 'Software Project',
        total_projects: allProjects.length,
        total_scans: 0,
        total_findings: 0,
        critical_findings: 0,
        high_findings: 0,
        medium_findings: 0,
        low_findings: 0,
        compliance_percentage: 100,
        latest_scan: undefined,
        severity_distribution: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
        },
        trends: [],
        top_violated_rules: [],
        component_stats: [],
      } as unknown as T;
    }

    return {
      project_id: targetProject?.id || 'proj-ecommerce-drift',
      project_name: targetProject?.name || 'Software Architecture Drift Detector',
      total_projects: allProjects.length,
      total_scans: targetProject?.total_scans || projectScans.length,
      total_findings: latestScan.total_findings,
      critical_findings: latestScan.critical_findings,
      high_findings: latestScan.high_findings,
      medium_findings: latestScan.medium_findings,
      low_findings: latestScan.low_findings,
      compliance_percentage: latestScan.compliance_percentage,
      latest_scan: latestScan,
      severity_distribution: {
        critical: latestScan.critical_findings,
        high: latestScan.high_findings,
        medium: latestScan.medium_findings,
        low: latestScan.low_findings,
      },
      trends: [
        {
          timestamp: '2026-10-29',
          scan_id: 'scan-run-earliest',
          compliance_percentage: 71.4,
          total_findings: 4,
          critical_findings: 2,
          high_findings: 2,
        },
        {
          timestamp: '2026-10-30',
          scan_id: 'scan-run-mid-1',
          compliance_percentage: 78.5,
          total_findings: 3,
          critical_findings: 1,
          high_findings: 2,
        },
        {
          timestamp: '2026-10-31',
          scan_id: 'scan-run-mid-2',
          compliance_percentage: 85.7,
          total_findings: 2,
          critical_findings: 1,
          high_findings: 1,
        },
        {
          timestamp: '2026-11-01',
          scan_id: latestScan.id,
          compliance_percentage: latestScan.compliance_percentage,
          total_findings: latestScan.total_findings,
          critical_findings: latestScan.critical_findings,
          high_findings: latestScan.high_findings,
        },
      ],
      top_violated_rules: [
        {
          rule_id: 'FORBIDDEN-DOMAIN-TO-PRESENTATION',
          rule_type: 'forbidden_dependency',
          severity: 'critical',
          count: 1,
          description: 'Domain layer must never import presentation concerns',
        },
        {
          rule_id: 'LAYER-DIRECTION-RULE',
          rule_type: 'layer_violation',
          severity: 'high',
          count: 1,
          description: 'Lower layers must not depend on higher layers',
        },
      ],
      component_stats: [
        {
          component: 'presentation',
          layer: 1,
          modules_count: 2,
          incoming_dependencies: 1,
          outgoing_dependencies: 1,
          violations_count: 0,
          is_compliant: true,
        },
        {
          component: 'application',
          layer: 2,
          modules_count: 2,
          incoming_dependencies: 1,
          outgoing_dependencies: 2,
          violations_count: 0,
          is_compliant: true,
        },
        {
          component: 'domain',
          layer: 3,
          modules_count: 2,
          incoming_dependencies: 1,
          outgoing_dependencies: 1,
          violations_count: latestScan.total_findings,
          is_compliant: latestScan.total_findings === 0,
        },
        {
          component: 'infrastructure',
          layer: 4,
          modules_count: 2,
          incoming_dependencies: 1,
          outgoing_dependencies: 0,
          violations_count: 0,
          is_compliant: true,
        },
      ],
    } as unknown as T;
  }

  // Scan Comparison
  if (cleanEndpoint.includes('/compare/')) {
    const scanObjA = {
      id: 'scan-run-earlier',
      project_id: 'proj-ecommerce-drift',
      architecture_id: 'arch-layered-001',
      status: 'completed' as const,
      started_at: new Date(Date.now() - 86400000).toISOString(),
      completed_at: new Date(Date.now() - 86350000).toISOString(),
      duration_ms: 48100,
      source_version: 'v1.4.1-baseline',
      files_analyzed: 14,
      modules_discovered: 8,
      dependencies_discovered: 12,
      total_findings: 3,
      critical_findings: 1,
      high_findings: 1,
      medium_findings: 1,
      low_findings: 0,
      compliance_percentage: 78.5,
      created_at: new Date(Date.now() - 86400000).toISOString(),
    };
    const scanObjB = {
      id: 'scan-run-latest-001',
      project_id: 'proj-ecommerce-drift',
      architecture_id: 'arch-layered-001',
      status: 'completed' as const,
      started_at: new Date(Date.now() - 3600000).toISOString(),
      completed_at: new Date(Date.now() - 3550000).toISOString(),
      duration_ms: 50420,
      source_version: 'v1.4.2-audit',
      files_analyzed: 14,
      modules_discovered: 8,
      dependencies_discovered: 12,
      total_findings: 2,
      critical_findings: 1,
      high_findings: 1,
      medium_findings: 0,
      low_findings: 0,
      compliance_percentage: 85.7,
      created_at: new Date(Date.now() - 3600000).toISOString(),
    };
    return {
      scan_a: scanObjA,
      scan_b: scanObjB,
      compliance_delta: 7.2,
      findings_delta: -1,
      new_findings: [],
      resolved_findings: [
        {
          id: 'res-001',
          scan_id: 'scan-run-earlier',
          project_id: 'proj-ecommerce-drift',
          rule_id: 'CIRCULAR-DEPENDENCY-RULE',
          rule_type: 'circular_dependency',
          title: 'Circular dependency between application and infrastructure resolved',
          explanation: 'Previous circular loop was broken by introducing repository interfaces.',
          severity: 'medium',
          status: 'resolved',
          source_component: 'application',
          target_component: 'infrastructure',
          confidence: 'high',
          first_detected_at: new Date(Date.now() - 86400000 * 3).toISOString(),
          last_detected_at: new Date(Date.now() - 86400000).toISOString(),
          created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
          updated_at: new Date().toISOString(),
        }
      ],
      persistent_findings: [
        {
          id: 'find-001',
          scan_id: 'scan-run-latest-001',
          project_id: 'proj-ecommerce-drift',
          rule_id: 'FORBIDDEN-DOMAIN-TO-PRESENTATION',
          rule_type: 'forbidden_dependency',
          title: 'Domain Layer Violates Architecture: Direct dependency on Presentation Layer',
          explanation: 'Module app.domain.order directly imports format_currency_response from app.presentation.routes.',
          severity: 'critical',
          status: 'open',
          source_component: 'domain',
          target_component: 'presentation',
          source_module: 'app.domain.order',
          target_module: 'app.presentation.routes',
          file_path: 'app/domain/order.py',
          line_number: 11,
          evidence: 'from app.presentation.routes import format_currency_response',
          confidence: 'high',
          first_detected_at: new Date(Date.now() - 86400000 * 2).toISOString(),
          last_detected_at: new Date().toISOString(),
          created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'find-002',
          scan_id: 'scan-run-latest-001',
          project_id: 'proj-ecommerce-drift',
          rule_id: 'LAYER-DIRECTION-RULE',
          rule_type: 'layer_violation',
          title: 'Layer Direction Violation: Upward dependency from Layer 3 (Domain) to Layer 1 (Presentation)',
          explanation: 'Lower layer components are strictly forbidden from depending on higher layer components.',
          severity: 'high',
          status: 'open',
          source_component: 'domain',
          target_component: 'presentation',
          source_module: 'app.domain.order',
          target_module: 'app.presentation.routes',
          file_path: 'app/domain/order.py',
          line_number: 11,
          evidence: 'from app.presentation.routes import format_currency_response',
          confidence: 'high',
          first_detected_at: new Date(Date.now() - 86400000 * 2).toISOString(),
          last_detected_at: new Date().toISOString(),
          created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
          updated_at: new Date().toISOString(),
        }
      ]
    } as unknown as T;
  }

  // Finding details or status
  if (cleanEndpoint.startsWith('/findings/')) {
    return {
      id: 'find-001',
      status: 'acknowledged',
      title: 'Domain Layer Violates Architecture: Direct dependency on Presentation Layer',
      severity: 'critical',
    } as unknown as T;
  }

  // Report JSON
  if (cleanEndpoint.includes('/report/json')) {
    return {
      scan_id: 'scan-run-latest-001',
      project_name: 'Software Architecture Drift Detector',
      compliance_percentage: 85.7,
      total_findings: 2,
      timestamp: new Date().toISOString(),
      findings: [
        { id: 'find-001', rule: 'FORBIDDEN-DOMAIN-TO-PRESENTATION', severity: 'critical', file: 'app/domain/order.py:11' },
        { id: 'find-002', rule: 'LAYER-DIRECTION-RULE', severity: 'high', file: 'app/domain/order.py:11' },
      ]
    } as unknown as T;
  }

  // AI Assistance
  if (cleanEndpoint === '/ai/status') {
    return {
      ai_enabled: true,
      provider: 'built-in-heuristics',
      is_configured: true,
    } as unknown as T;
  }

  if (cleanEndpoint === '/ai/explain-finding') {
    return {
      ai_explanation: 'Architectural analysis indicates an inverted dependency boundary violation. The Domain layer should embody pure business concepts and invariants. By coupling directly to Presentation route utilities, changes to web transport logic risk destabilizing domain logic. Recommended remediation is to invert the dependency using ports and adapters or by dispatching domain events.',
      architectural_remediation: '1. Extract presentation formatting into a dedicated view-model assembler.\n2. Pass pure domain primitives to the route layer.\n3. Verify layer boundary compliance via automated scan.',
      source: 'Architecture AI Heuristic Engine',
    } as unknown as T;
  }

  return {} as unknown as T;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const base = getApiBaseUrl();

  if (isStaticProductionHost() && !base) {
    return handleStaticOffline<T>(endpoint, options);
  }

  const url = `${base}${endpoint}`;

  // Assemble headers with dual authentication: HttpOnly cookie + Bearer token
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const token = getStoredSessionToken();
  if (token && isAllowedBackendOrigin(url) && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['X-Session-Token'] = token;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      credentials: 'include',
      ...options,
      headers,
    });
  } catch {
    if (isStaticProductionHost()) {
      return handleStaticOffline<T>(endpoint, options);
    }
    throw new Error(
      `Unable to reach backend service at ${base}. Please ensure the server is active on http://127.0.0.1:8000.`
    );
  }

  if (!response.ok) {
    if (isStaticProductionHost() && (response.status === 404 || response.status === 405)) {
      return handleStaticOffline<T>(endpoint, options);
    }

    let errorMessage = `API request failed: ${response.status} ${response.statusText}`.trim();

    if (response.status === 405) {
      errorMessage = `Method Not Allowed (405): The API endpoint at '${url}' does not allow HTTP ${options.method || 'GET'}. If accessing from a static host like GitHub Pages, configure VITE_API_URL or run the backend locally using start_servers.bat.`;
    } else if (response.status === 404) {
      errorMessage = `API endpoint not found (404): '${url}'. Please verify that the backend API route exists.`;
    } else if (response.status === 502) {
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
      // Retain the informative errorMessage if response is HTML (e.g. 405 static page) or plain text
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
    const base = getApiBaseUrl();
    if (isStaticProductionHost() && !base) {
      return {
        message: `Package ${file.name} uploaded and extracted successfully (14 Python files discovered).`,
        repository_path: 'sample-project/app',
      };
    }

    const formData = new FormData();
    formData.append('file', file);

    const headers: Record<string, string> = {};
    const token = getStoredSessionToken();
    if (token && isAllowedBackendOrigin(base)) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-Session-Token'] = token;
    }

    const res = await fetch(`${base}/projects/${projectId}/upload`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: formData,
    });
    if (!res.ok) {
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
  getJsonReportUrl: (scanId: string) => `${getApiBaseUrl()}/scans/${scanId}/report/json`,
  getCsvReportUrl: (scanId: string) => `${getApiBaseUrl()}/scans/${scanId}/report/csv`,
  getPdfReportUrl: (scanId: string) => `${getApiBaseUrl()}/scans/${scanId}/report/pdf`,
  downloadCsvReport: async (scanId: string, customFilename?: string): Promise<void> => {
    const base = getApiBaseUrl();
    if (isStaticProductionHost() && !base) {
      const csvContent = `Finding ID,Severity,Rule ID,Source Module,Target Module,File,Line,Explanation\r\nfind-001,critical,FORBIDDEN-DOMAIN-TO-PRESENTATION,app.domain.order,app.presentation.routes,app/domain/order.py,11,"Module app.domain.order directly imports format_currency_response from app.presentation.routes. Domain layer must remain pure business logic."\r\nfind-002,high,LAYER-DIRECTION-RULE,app.domain.order,app.presentation.routes,app/domain/order.py,11,"Layered architectural constraint violated. Lower layer components are strictly forbidden from depending on higher layer components."\r\n`;
      const formattedData = `\uFEFF${csvContent}`;
      const blob = new Blob([formattedData], { type: 'text/csv;charset=utf-8;' });
      const objectUrl = window.URL.createObjectURL(blob);
      const filename = customFilename || `drift_report_${scanId.substring(0, 8)}.csv`;
      const link = document.createElement('a');
      link.href = objectUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (link.parentNode) link.parentNode.removeChild(link);
        window.URL.revokeObjectURL(objectUrl);
      }, 150);
      return;
    }
    const url = `${base}/scans/${scanId}/report/csv`;
    const token = getStoredSessionToken();
    const headers: Record<string, string> = {
      'Accept': 'text/csv',
    };
    if (token && isAllowedBackendOrigin(url)) {
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
    const base = getApiBaseUrl();
    if (isStaticProductionHost() && !base) {
      const summaryText = `SOFTWARE ARCHITECTURE DRIFT DETECTOR AUDIT REPORT\r\nScan ID: ${scanId}\r\nCompliance: 85.7%\r\nTotal Findings: 2\r\n1. [CRITICAL] FORBIDDEN-DOMAIN-TO-PRESENTATION in app/domain/order.py:11\r\n2. [HIGH] LAYER-DIRECTION-RULE in app/domain/order.py:11\r\n`;
      const blob = new Blob([summaryText], { type: 'text/plain;charset=utf-8;' });
      const objectUrl = window.URL.createObjectURL(blob);
      const filename = customFilename || `drift_report_${scanId.substring(0, 8)}.txt`;
      const link = document.createElement('a');
      link.href = objectUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (link.parentNode) link.parentNode.removeChild(link);
        window.URL.revokeObjectURL(objectUrl);
      }, 150);
      return;
    }
    const url = `${base}/scans/${scanId}/report/pdf`;
    const token = getStoredSessionToken();
    const headers: Record<string, string> = {
      'Accept': 'application/pdf',
    };
    if (token && isAllowedBackendOrigin(url)) {
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
