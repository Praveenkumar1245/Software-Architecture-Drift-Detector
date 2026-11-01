import {
  Project,
  ScanRun,
  User,
} from '../types';

export function isGitHubPagesHost(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.toLowerCase().endsWith('github.io');
}

const SHOWCASE_USER_KEY = 'drift_showcase_user';
const SHOWCASE_PROJECTS_KEY = 'drift_showcase_projects';
const SHOWCASE_SCANS_KEY = 'drift_showcase_scans';

export function handleStaticShowcaseRequest<T>(endpoint: string, options: RequestInit = {}): T {
  const method = (options.method || 'GET').toUpperCase();
  const cleanEndpoint = endpoint.split('?')[0];

  // Auth: Login
  if (cleanEndpoint === '/auth/login' && method === 'POST') {
    let email = 'pirajan20012009@gmail.com';
    try {
      if (options.body) {
        const parsed = JSON.parse(options.body as string);
        if (parsed.email) email = parsed.email;
      }
    } catch {}
    const demoUser: User = {
      id: 'usr-showcase-live',
      email,
      full_name: email.includes('@') ? email.split('@')[0] : email,
      is_verified: true,
      created_at: new Date().toISOString(),
    };
    const sessionToken = 'drift_session_' + Date.now();
    try {
      localStorage.setItem(SHOWCASE_USER_KEY, JSON.stringify(demoUser));
      localStorage.setItem('drift_session_token', sessionToken);
      sessionStorage.setItem('drift_session_token', sessionToken);
    } catch {}
    return {
      message: 'Signed in successfully',
      user: demoUser,
      session_token: sessionToken,
      expires_at: new Date(Date.now() + 86400000 * 30).toISOString(),
    } as unknown as T;
  }

  // Auth: Status
  if (cleanEndpoint === '/auth/status') {
    let storedUser: User | null = null;
    try {
      const u = localStorage.getItem(SHOWCASE_USER_KEY);
      if (u) storedUser = JSON.parse(u);
    } catch {}

    const token = typeof window !== 'undefined'
      ? sessionStorage.getItem('drift_session_token') || localStorage.getItem('drift_session_token')
      : null;

    if (token && storedUser) {
      return { authenticated: true, user: storedUser } as unknown as T;
    }
    return { authenticated: false, user: null } as unknown as T;
  }

  // Auth: Me
  if (cleanEndpoint === '/auth/me') {
    let storedUser: User = {
      id: 'usr-showcase-live',
      email: 'pirajan20012009@gmail.com',
      full_name: 'pirajan20012009',
      is_verified: true,
      created_at: new Date().toISOString(),
    };
    try {
      const u = localStorage.getItem(SHOWCASE_USER_KEY);
      if (u) storedUser = JSON.parse(u);
    } catch {}
    return storedUser as unknown as T;
  }

  // Auth: Logout
  if (cleanEndpoint === '/auth/logout') {
    try {
      localStorage.removeItem(SHOWCASE_USER_KEY);
      localStorage.removeItem('drift_session_token');
      sessionStorage.removeItem('drift_session_token');
    } catch {}
    return { message: 'Signed out successfully' } as unknown as T;
  }

  // Auth: Registration & Password resets
  if (cleanEndpoint === '/auth/register' || cleanEndpoint === '/auth/signup') {
    return {
      message: 'Account registered successfully! You may now sign in.',
      user_id: 'usr-new-001',
      email: 'pirajan20012009@gmail.com',
    } as unknown as T;
  }
  if (
    cleanEndpoint === '/auth/forgot-password' ||
    cleanEndpoint === '/auth/resend-verification' ||
    cleanEndpoint === '/auth/resend-signup-otp' ||
    cleanEndpoint === '/auth/resend-reset-otp'
  ) {
    return { message: 'Verification code dispatched successfully.' } as unknown as T;
  }
  if (
    cleanEndpoint === '/auth/verify-email' ||
    cleanEndpoint === '/auth/verify-signup-otp' ||
    cleanEndpoint === '/auth/verify-reset-otp' ||
    cleanEndpoint === '/auth/reset-password'
  ) {
    return { message: 'Action completed successfully.', email: 'pirajan20012009@gmail.com', reset_token: 'rst_token' } as unknown as T;
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

  // Project persistence helpers
  const getStoredProjects = (): Project[] => {
    try {
      const raw = localStorage.getItem(SHOWCASE_PROJECTS_KEY);
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
      },
    ];
    try {
      localStorage.setItem(SHOWCASE_PROJECTS_KEY, JSON.stringify(defaultList));
    } catch {}
    return defaultList;
  };

  const saveStoredProjects = (projectsList: Project[]): void => {
    try {
      localStorage.setItem(SHOWCASE_PROJECTS_KEY, JSON.stringify(projectsList));
    } catch {}
  };

  const getStoredScans = (projectId?: string): ScanRun[] => {
    try {
      const raw = localStorage.getItem(SHOWCASE_SCANS_KEY);
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
      localStorage.setItem(SHOWCASE_SCANS_KEY, JSON.stringify([defaultScan]));
    } catch {}

    if (projectId && projectId !== 'proj-ecommerce-drift') return [];
    return [defaultScan];
  };

  const saveStoredScan = (scan: ScanRun): void => {
    try {
      const current = getStoredScans();
      current.unshift(scan);
      localStorage.setItem(SHOWCASE_SCANS_KEY, JSON.stringify(current));

      const projects = getStoredProjects();
      const p = projects.find((proj) => proj.id === scan.project_id);
      if (p) {
        p.total_scans = (p.total_scans || 0) + 1;
        p.latest_scan_status = scan.status;
        p.latest_scan_timestamp = scan.completed_at || scan.started_at;
        p.latest_compliance_percentage = scan.compliance_percentage;
        p.open_findings_count = scan.total_findings;
        p.critical_findings_count = scan.critical_findings;
        saveStoredProjects(projects);
      }
    } catch {}
  };

  // Projects API
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
      const list = getStoredProjects();
      list.unshift(newProj);
      saveStoredProjects(list);
      return newProj as unknown as T;
    }
    return getStoredProjects() as unknown as T;
  }

  if (cleanEndpoint.startsWith('/projects/') && !cleanEndpoint.includes('/scans')) {
    const projId = cleanEndpoint.replace('/projects/', '');
    if (method === 'DELETE') {
      const list = getStoredProjects().filter((p) => p.id !== projId);
      saveStoredProjects(list);
      return {} as unknown as T;
    }
    if (method === 'PUT') {
      let body: any = {};
      try { body = JSON.parse(options.body as string); } catch {}
      const list = getStoredProjects();
      const idx = list.findIndex((p) => p.id === projId);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...body, updated_at: new Date().toISOString() };
        saveStoredProjects(list);
        return list[idx] as unknown as T;
      }
    }
    const found = getStoredProjects().find((p) => p.id === projId);
    if (found) return found as unknown as T;
    return getStoredProjects()[0] as unknown as T;
  }

  // Architecture templates
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
        ],
      },
    } as unknown as T;
  }

  // Project architectures
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
          ],
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
      },
    ] as unknown as T;
  }

  // Architecture validation
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
        ],
      },
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
      saveStoredScan(newScan);
      return newScan as unknown as T;
    }
    return getStoredScans(matchProjId) as unknown as T;
  }

  if (
    cleanEndpoint.startsWith('/scans/') &&
    !cleanEndpoint.includes('/findings') &&
    !cleanEndpoint.includes('/graph') &&
    !cleanEndpoint.includes('/report') &&
    !cleanEndpoint.includes('/compare')
  ) {
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
      },
    ] as unknown as T;
  }

  // Dependency graph
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

  // Overview metrics
  if (cleanEndpoint.startsWith('/overview')) {
    let targetProjId: string | null = null;
    try {
      const q = endpoint.includes('?') ? endpoint.split('?')[1] : '';
      const params = new URLSearchParams(q);
      targetProjId = params.get('project_id');
    } catch {}

    const allProjects = getStoredProjects();
    const targetProject = targetProjId
      ? allProjects.find((p) => p.id === targetProjId)
      : allProjects[0];

    const projectScans = getStoredScans(targetProject?.id);
    const latestScan = projectScans.length > 0 ? projectScans[0] : undefined;

    return {
      project_id: targetProject?.id || 'proj-ecommerce-drift',
      project_name: targetProject?.name || 'Software Architecture Drift Detector',
      total_projects: allProjects.length,
      total_scans: targetProject?.total_scans || projectScans.length,
      total_findings: latestScan ? latestScan.total_findings : 0,
      critical_findings: latestScan ? latestScan.critical_findings : 0,
      high_findings: latestScan ? latestScan.high_findings : 0,
      medium_findings: latestScan ? latestScan.medium_findings : 0,
      low_findings: latestScan ? latestScan.low_findings : 0,
      compliance_percentage: latestScan ? latestScan.compliance_percentage : 100,
      latest_scan: latestScan,
      severity_distribution: {
        critical: latestScan ? latestScan.critical_findings : 0,
        high: latestScan ? latestScan.high_findings : 0,
        medium: latestScan ? latestScan.medium_findings : 0,
        low: latestScan ? latestScan.low_findings : 0,
      },
      trends: [
        { timestamp: '2026-10-29', scan_id: 'scan-run-earliest', compliance_percentage: 71.4, total_findings: 4, critical_findings: 2, high_findings: 2 },
        { timestamp: '2026-10-30', scan_id: 'scan-run-mid-1', compliance_percentage: 78.5, total_findings: 3, critical_findings: 1, high_findings: 2 },
        { timestamp: '2026-10-31', scan_id: 'scan-run-mid-2', compliance_percentage: 85.7, total_findings: 2, critical_findings: 1, high_findings: 1 },
      ],
      top_violated_rules: [
        { rule_id: 'FORBIDDEN-DOMAIN-TO-PRESENTATION', rule_type: 'forbidden_dependency', severity: 'critical', count: 1, description: 'Domain layer must never import presentation concerns' },
        { rule_id: 'LAYER-DIRECTION-RULE', rule_type: 'layer_violation', severity: 'high', count: 1, description: 'Lower layers must not depend on higher layers' },
      ],
      component_stats: [
        { component: 'presentation', layer: 1, modules_count: 2, incoming_dependencies: 1, outgoing_dependencies: 1, violations_count: 0, is_compliant: true },
        { component: 'application', layer: 2, modules_count: 2, incoming_dependencies: 1, outgoing_dependencies: 2, violations_count: 0, is_compliant: true },
        { component: 'domain', layer: 3, modules_count: 2, incoming_dependencies: 1, outgoing_dependencies: 1, violations_count: 2, is_compliant: false },
        { component: 'infrastructure', layer: 4, modules_count: 2, incoming_dependencies: 1, outgoing_dependencies: 0, violations_count: 0, is_compliant: true },
      ],
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
      ],
    } as unknown as T;
  }

  // AI Assistance
  if (cleanEndpoint === '/ai/status') {
    return { ai_enabled: true, provider: 'heuristics', is_configured: true } as unknown as T;
  }
  if (cleanEndpoint === '/ai/explain-finding') {
    return {
      ai_explanation: 'Architectural analysis indicates an inverted dependency boundary violation. The Domain layer should embody pure business concepts and invariants. Coupled directly to Presentation route utilities, changes to transport logic risk destabilizing domain logic.',
      architectural_remediation: '1. Extract presentation formatting into a dedicated view-model assembler.\n2. Pass pure domain primitives to the route layer.\n3. Verify layer boundary compliance via automated scan.',
      source: 'Architecture AI Heuristic Engine',
    } as unknown as T;
  }

  return {} as unknown as T;
}

export function downloadShowcaseCsv(scanId: string, customFilename?: string): void {
  const sampleCsv = 'Rule ID,Severity,Source Component,Target Component,File Path,Line Number,Explanation\nFORBIDDEN-DOMAIN-TO-PRESENTATION,critical,domain,presentation,app/domain/order.py,11,"Domain layer violates architecture: Direct dependency on presentation layer"\nLAYER-DIRECTION-RULE,high,domain,presentation,app/domain/order.py,11,"Layer direction violation: Upward dependency from Layer 3 to Layer 1"';
  const formattedData = '\uFEFF' + sampleCsv;
  const blob = new Blob([formattedData], { type: 'text/csv;charset=utf-8;' });
  const objectUrl = window.URL.createObjectURL(blob);
  const filename = customFilename || ('drift_report_' + scanId.substring(0, 8) + '.csv');
  const link = document.createElement('a');
  link.href = objectUrl;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (link.parentNode) link.parentNode.removeChild(link);
    window.URL.revokeObjectURL(objectUrl);
  }, 150);
}

export function downloadShowcasePdf(scanId: string, customFilename?: string): void {
  const dummyPdf = new Blob(['%PDF-1.4 Architectural Drift Audit Report'], { type: 'application/pdf' });
  const objectUrl = window.URL.createObjectURL(dummyPdf);
  const filename = customFilename || ('drift_report_' + scanId.substring(0, 8) + '.pdf');
  const link = document.createElement('a');
  link.href = objectUrl;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (link.parentNode) link.parentNode.removeChild(link);
    window.URL.revokeObjectURL(objectUrl);
  }, 150);
}
