export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type FindingStatus = 'open' | 'acknowledged' | 'resolved' | 'accepted_exception';
export type ScanStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface User {
  id: string;
  email: string;
  full_name?: string | null;
  is_verified: boolean;
  created_at: string;
}

export interface AuthStatusResponse {
  authenticated: boolean;
  user: User | null;
}

export interface LoginResponse {
  message: string;
  user: User;
  session_token: string;
  expires_at: string;
}

export interface RegisterResponse {
  message: string;
  user_id: string;
  email: string;
  email_delivery?: string;
  dev_verification_url?: string | null;
}

export interface MessageResponse {
  message: string;
  detail?: string;
  email_sent?: boolean;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  repository_type: string;
  repository_path?: string;
  primary_language: string;
  source_dirs: string;
  exclude_dirs: string;
  created_at: string;
  updated_at: string;
  total_scans?: number;
  latest_scan_status?: ScanStatus;
  latest_scan_timestamp?: string;
  latest_compliance_percentage?: number;
  open_findings_count?: number;
  critical_findings_count?: number;
}

export interface ComponentDef {
  name: string;
  layer?: number;
  description?: string;
  path_patterns: string[];
  allowed_dependencies: string[];
  forbidden_dependencies: string[];
  required_dependencies: string[];
}

export interface RuleDef {
  id: string;
  type: string;
  description: string;
  severity: Severity;
  from_component?: string;
  to_component?: string;
  target_module?: string;
  layer_direction?: string;
  config?: Record<string, any>;
}

export interface ArchitectureDefinition {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  version: number;
  format: 'json' | 'yaml';
  raw_content: string;
  components: ComponentDef[];
  rules: RuleDef[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScanRun {
  id: string;
  project_id: string;
  architecture_id?: string;
  status: ScanStatus;
  error_message?: string;
  files_analyzed: number;
  modules_discovered: number;
  dependencies_discovered: number;
  total_findings: number;
  critical_findings: number;
  high_findings: number;
  medium_findings: number;
  low_findings: number;
  compliance_percentage: number;
  source_version?: string;
  duration_ms: number;
  started_at: string;
  completed_at?: string;
  created_at: string;
}

export interface FindingAuditLog {
  id: string;
  finding_id: string;
  previous_status: string;
  new_status: string;
  reason?: string;
  created_at: string;
}

export interface Finding {
  id: string;
  scan_id: string;
  project_id: string;
  rule_id: string;
  rule_type: string;
  title: string;
  explanation: string;
  severity: Severity;
  source_module?: string;
  target_module?: string;
  source_component?: string;
  target_component?: string;
  file_path?: string;
  line_number?: number;
  expected_behavior?: string;
  actual_behavior?: string;
  evidence?: string;
  confidence: string;
  remediation?: string;
  status: FindingStatus;
  exception_reason?: string;
  first_detected_at: string;
  last_detected_at: string;
  created_at: string;
  updated_at: string;
  audit_logs?: FindingAuditLog[];
}

export interface GraphNode {
  id: string;
  label: string;
  component?: string;
  layer?: number;
  node_type: string;
  file_path?: string;
  is_violation: boolean;
  classes_count: number;
  functions_count: number;
  imports_count: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  source_component?: string;
  target_component?: string;
  is_violation: boolean;
  violation_rule_id?: string;
  import_line?: number;
  import_statement?: string;
  edge_type: 'actual' | 'intended' | 'forbidden';
}

export interface DependencyGraphResponse {
  scan_id: string;
  project_id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  components: string[];
  total_modules: number;
  total_dependencies: number;
  total_violations: number;
}

export interface ScanComparison {
  scan_a: ScanRun;
  scan_b: ScanRun;
  new_findings: Finding[];
  resolved_findings: Finding[];
  persistent_findings: Finding[];
  compliance_delta: number;
  findings_delta: number;
}

export interface TrendPoint {
  timestamp: string;
  scan_id: string;
  compliance_percentage: number;
  total_findings: number;
  critical_findings: number;
  high_findings: number;
}

export interface ViolatedRuleStat {
  rule_id: string;
  rule_type: string;
  severity: string;
  count: number;
  description: string;
}

export interface ComponentComplianceStat {
  component: string;
  layer?: number;
  modules_count: number;
  incoming_dependencies: number;
  outgoing_dependencies: number;
  violations_count: number;
  is_compliant: boolean;
}

export interface OverviewMetrics {
  project_id?: string;
  project_name?: string;
  total_projects: number;
  total_scans: number;
  total_findings: number;
  critical_findings: number;
  high_findings: number;
  medium_findings: number;
  low_findings: number;
  compliance_percentage: number;
  latest_scan?: ScanRun;
  severity_distribution: Record<string, number>;
  trends: TrendPoint[];
  top_violated_rules: ViolatedRuleStat[];
  component_stats: ComponentComplianceStat[];
}
