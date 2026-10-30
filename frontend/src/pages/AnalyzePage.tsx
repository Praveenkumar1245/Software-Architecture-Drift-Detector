import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlayCircle,
  CheckCircle2,
  AlertTriangle,
  FolderGit2,
  Layers,
  ArrowRight,
  RefreshCw,
  FileCode2,
  Download,
  ShieldCheck,
  Clock,
} from 'lucide-react';

import { useProject } from '../context/ProjectContext';
import { api } from '../api/client';
import { ScanRun, Finding } from '../types';

export const AnalyzePage: React.FC = () => {
  const { activeProject, latestScan, refreshLatestScan, activeArchitecture, isArchLoading, refreshArchitectures } = useProject();
  const navigate = useNavigate();

  const [versionTag, setVersionTag] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  const [scanResult, setScanResult] = useState<ScanRun | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [isLoadingFindings, setIsLoadingFindings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [downloadingJson, setDownloadingJson] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownloadCsv = async () => {
    if (!activeDisplayScan) return;
    setDownloadingCsv(true);
    setDownloadError(null);
    try {
      await api.downloadCsvReport(activeDisplayScan.id, `drift_report_${activeDisplayScan.id.substring(0, 8)}.csv`);
    } catch (err: any) {
      setDownloadError(err.message || 'Failed to download CSV report.');
    } finally {
      setDownloadingCsv(false);
    }
  };

  const handleDownloadJson = async () => {
    if (!activeDisplayScan) return;
    setDownloadingJson(true);
    setDownloadError(null);
    try {
      await api.downloadJsonReport(activeDisplayScan.id, `drift_report_${activeDisplayScan.id.substring(0, 8)}.json`);
    } catch (err: any) {
      setDownloadError(err.message || 'Failed to download JSON report.');
    } finally {
      setDownloadingJson(false);
    }
  };

  // Automatically refresh latest scan and active architecture for current project on mount or project change
  useEffect(() => {
    if (activeProject) {
      refreshLatestScan(activeProject.id);
      refreshArchitectures(activeProject.id);
    }
  }, [activeProject?.id, refreshLatestScan, refreshArchitectures]);

  // Load findings whenever a scan result is set or updated
  const loadFindingsForScan = async (scanId: string) => {
    setIsLoadingFindings(true);
    try {
      const data = await api.getScanFindings(scanId);
      setFindings(data);
    } catch (err: any) {
      console.error('Failed to load scan findings:', err);
    } finally {
      setIsLoadingFindings(false);
    }
  };

  const activeDisplayScan = scanResult || (latestScan && latestScan.project_id === activeProject?.id ? latestScan : null);

  useEffect(() => {
    if (activeDisplayScan) {
      loadFindingsForScan(activeDisplayScan.id);
    } else {
      setFindings([]);
    }
  }, [activeDisplayScan?.id]);

  const handleApplyDefaultArchitecture = async () => {
    if (!activeProject) return;
    setIsApplyingTemplate(true);
    setError(null);
    try {
      const templates = await api.getArchitectureTemplates();
      const template = templates['layered'] || {
        name: 'Standard Layered Architecture',
        description: '4-layer clean architecture policy',
        components: [
          { name: 'presentation', layer: 1, allowed_dependencies: ['application', 'domain', 'service'] },
          { name: 'service', layer: 2, allowed_dependencies: ['repository', 'domain', 'shared'] },
          { name: 'repository', layer: 3, allowed_dependencies: ['shared', 'domain'] },
          { name: 'shared', layer: 4, allowed_dependencies: [] }
        ],
        rules: [
          { id: 'LAYER-DOWNWARD-001', type: 'layer_direction', severity: 'critical', layer_direction: 'downward_only', description: 'Dependencies flow downward' },
          { id: 'NO-CYCLIC-DEPENDENCIES', type: 'circular_dependency', severity: 'critical', description: 'No cyclic coupling' }
        ]
      };

      await api.createArchitecture({
        project_id: activeProject.id,
        name: template.name || 'Standard Layered Architecture',
        format: 'json',
        raw_content: JSON.stringify(template, null, 2),
      });

      await refreshArchitectures(activeProject.id);
    } catch (err: any) {
      setError(err.message || 'Failed to apply default architecture template');
    } finally {
      setIsApplyingTemplate(false);
    }
  };

  const isArchValid = Boolean(activeArchitecture && activeArchitecture.project_id === activeProject?.id);
  const isArchReady = !isArchLoading && isArchValid;
  const isCodeReady = Boolean(activeProject?.repository_path);
  const canStartScan = !isScanning && isCodeReady && isArchReady;

  const handleStartScan = async () => {
    if (!activeProject) return;

    if (!isArchReady || !activeArchitecture || activeArchitecture.project_id !== activeProject.id) {
      setError(`No architecture definition found for project '${activeProject.name}'. Please define or select an architecture definition before scanning.`);
      return;
    }

    if (!isCodeReady) {
      setError(`Project source code directory not found. Please upload project ZIP in Projects page first.`);
      return;
    }

    setIsScanning(true);
    setError(null);
    setScanResult(null);
    setFindings([]);

    try {
      const scan = await api.triggerScan({
        project_id: activeProject.id,
        architecture_id: activeArchitecture.id,
        source_version: versionTag.trim() || undefined,
      });
      setScanResult(scan);
      await refreshLatestScan(activeProject.id);
      await loadFindingsForScan(scan.id);
    } catch (err: any) {
      setError(err.message || 'Scan execution failed');
    } finally {
      setIsScanning(false);
    }
  };

  if (!activeProject) {
    return (
      <div className="max-w-xl mx-auto mt-12 p-8 bg-white border border-[#D8E2EE] rounded-[10px] text-center">
        <FolderGit2 className="h-12 w-12 text-[#475569] mx-auto mb-3" />
        <h2 className="text-[22px] font-semibold text-[#0F172A] mb-2">No Project Selected</h2>
        <p className="text-sm text-[#475569] mb-4">
          Select an active project from the top bar before initiating architectural drift analysis.
        </p>
      </div>
    );
  }

  // Calculate Finding Categories Counts
  const categoryCounts = {
    forbidden_import: findings.filter((f) => f.rule_type === 'forbidden_import').length,
    forbidden_dependency: findings.filter((f) => f.rule_type === 'forbidden_dependency').length,
    layer_violation: findings.filter((f) => f.rule_type === 'layer_violation' || f.rule_type === 'layer_direction').length,
    unexpected_dependency: findings.filter((f) => f.rule_type === 'unexpected_dependency').length,
    circular_dependency: findings.filter((f) => f.rule_type === 'circular_dependency').length,
    adr_violation: findings.filter((f) => f.rule_type === 'adr_violation').length,
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#D8E2EE]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[32px] font-bold text-[#0F172A] tracking-tight">Analyze Architectural Drift</h1>
            <span className="text-xs px-3 py-1 rounded-full font-semibold bg-[#EFF6FF] text-[#175CD3] border border-[#BFDBFE]">
              Project: {activeProject.name}
            </span>
          </div>
          <p className="text-sm text-[#475569] mt-1">
            Execute deterministic AST static analysis, extract module dependencies, and compare against the intended architecture.
          </p>
        </div>
        <button
          onClick={() => {
            refreshLatestScan(activeProject.id);
            refreshArchitectures(activeProject.id);
            if (activeDisplayScan) loadFindingsForScan(activeDisplayScan.id);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg text-[#0F172A] bg-white border border-[#D8E2EE] hover:bg-[#F8FAFC] transition-colors"
          title="Refresh Pre-flight State"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh Status</span>
        </button>
      </div>

      {/* Pre-flight Scope Verification */}
      <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE] space-y-4">
        <h2 className="text-[18px] font-semibold text-[#0F172A] pb-2 border-b border-[#D8E2EE]">Analysis Pre-flight Checklist</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
          {/* Target Codebase */}
          <div className="p-5 rounded-[10px] bg-[#F8FAFC] border border-[#D8E2EE] flex items-start gap-3.5">
            <div className="p-2.5 bg-white border border-[#D8E2EE] text-[#009F95] rounded-lg shrink-0">
              <FolderGit2 className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-[#0F172A] block text-base truncate">{activeProject.name}</span>
              <p className="text-[#475569] text-xs mt-1 truncate font-mono">
                {activeProject.repository_path || 'No source files uploaded yet'}
              </p>
              <div className="flex items-center gap-2 mt-2.5">
                {isCodeReady ? (
                  <span className="inline-flex items-center gap-1.5 text-[#10B981] font-semibold text-xs bg-[#E8F5E9] px-2.5 py-1 rounded-md border border-[#C8E6C9]">
                    <CheckCircle2 className="h-4 w-4 text-[#10B981]" /> Source Code Ready
                  </span>
                ) : (
                  <div className="space-y-1.5">
                    <span className="inline-flex items-center gap-1.5 text-[#B45309] font-semibold text-xs bg-[#FEF3C7] px-2.5 py-1 rounded-md border border-[#FDE68A]">
                      <AlertTriangle className="h-4 w-4 text-[#B45309]" /> Upload ZIP in Projects page first
                    </span>
                    <button
                      onClick={() => navigate('/projects')}
                      className="block text-[#009F95] hover:text-[#0A2548] text-xs font-semibold underline"
                    >
                      Go to Projects & Upload Code →
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Architecture Definition */}
          <div className="p-5 rounded-[10px] bg-[#F8FAFC] border border-[#D8E2EE] flex items-start gap-3.5">
            <div className="p-2.5 bg-white border border-[#D8E2EE] text-[#009F95] rounded-lg shrink-0">
              <Layers className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-[#0F172A] block text-base">Active Architecture Policy</span>
              {isArchLoading ? (
                <p className="text-[#475569] text-xs mt-1 flex items-center gap-1.5 font-medium">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#475569]" /> Verifying policy definition...
                </p>
              ) : isArchReady && activeArchitecture ? (
                <div>
                  <p className="text-[#0F172A] text-xs mt-1 font-semibold">
                    {activeArchitecture.name} (v{activeArchitecture.version})
                  </p>
                  <p className="text-[#475569] text-xs font-medium">
                    {activeArchitecture.components?.length || 0} Components &middot; {activeArchitecture.rules?.length || 0} Drift Rules
                  </p>
                  <div className="flex items-center justify-between gap-2 mt-2.5">
                    <span className="inline-flex items-center gap-1.5 text-[#10B981] font-semibold text-xs bg-[#E8F5E9] px-2.5 py-1 rounded-md border border-[#C8E6C9]">
                      <CheckCircle2 className="h-4 w-4 text-[#10B981]" /> Policy Ready for Evaluation
                    </span>
                    <button
                      onClick={() => navigate('/architecture')}
                      className="text-[#0F172A] hover:text-[#009F95] text-xs font-semibold underline"
                    >
                      Manage Policy →
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 mt-1">
                  <div className="flex items-start gap-1.5 text-[#B45309] font-semibold text-xs">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-[#B45309] mt-0.5" />
                    <span>No architecture policy saved for '{activeProject.name}'</span>
                  </div>
                  <p className="text-[#475569] text-xs">
                    An architecture policy must be saved before scanning for structural drift.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      onClick={() => navigate('/architecture')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#03162D] text-white hover:bg-[#0A2548] transition-colors"
                    >
                      <span>Define Architecture</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={handleApplyDefaultArchitecture}
                      disabled={isApplyingTemplate}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-[#D8E2EE] text-[#0F172A] hover:bg-[#F8FAFC] transition-colors disabled:opacity-50"
                    >
                      {isApplyingTemplate ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          <span>Applying...</span>
                        </>
                      ) : (
                        <span>Apply Default Layered Policy</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scan Options */}
        <div className="pt-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-[#0F172A] mb-1.5">
            Source Version / Git Tag (Optional)
          </label>
          <input
            type="text"
            placeholder="e.g. v2.1.0 or commit sha"
            value={versionTag}
            onChange={(e) => setVersionTag(e.target.value)}
            disabled={isScanning}
            className="w-full max-w-sm px-3.5 py-2 bg-white border border-[#D8E2EE] rounded-lg text-sm text-[#0F172A] font-medium focus:border-[#00D4C7] focus:outline-none disabled:bg-[#F8FAFC]"
          />
        </div>

        {/* Trigger Button & Prevention of Duplicate Submissions */}
        <div className="pt-4 border-t border-[#D8E2EE] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[#475569] font-medium">
              Analysis runs safely via AST without executing or importing target source modules.
            </p>
            {!isArchReady && (
              <p className="text-xs text-[#B45309] font-semibold mt-1">
                Architecture policy definition required before scanning can proceed.
              </p>
            )}
            {!isCodeReady && (
              <p className="text-xs text-[#B45309] font-semibold mt-1">
                Source code directory required before scanning can proceed.
              </p>
            )}
          </div>

          <button
            onClick={handleStartScan}
            disabled={!canStartScan}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-lg text-white bg-[#03162D] hover:bg-[#0A2548] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isScanning ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Executing Static Analysis...</span>
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4" />
                <span>Start Architecture Scan</span>
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-[#FEE2E2] border border-[#FECACA] text-[#B42318] rounded-[10px] text-sm font-medium flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 text-[#B42318] shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Scan Failed:</span>
              <span>{error}</span>
            </div>
          </div>
          {error.toLowerCase().includes('architecture') && (
            <button
              onClick={() => navigate('/architecture')}
              className="px-3.5 py-1.5 bg-white hover:bg-[#FEE2E2] text-[#B42318] font-semibold rounded-lg text-xs shrink-0 transition-colors border border-[#FECACA]"
            >
              Open Architecture Policy →
            </button>
          )}
        </div>
      )}

      {/* Real Scan Results Display */}
      {activeDisplayScan && (
        <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE] space-y-6">
          {/* Header & Telemetry */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-[#D8E2EE] gap-2">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-6 w-6 text-[#10B981]" />
              <h3 className="text-[18px] font-semibold text-[#0F172A]">
                {scanResult ? 'Analysis Completed Successfully' : 'Latest Scan Results'}
              </h3>
              <span className="px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider rounded-full bg-[#E8F5E9] text-[#10B981] border border-[#C8E6C9]">
                Status: {activeDisplayScan.status}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono font-medium text-[#475569]">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-[#475569]" />
                {activeDisplayScan.completed_at
                  ? new Date(activeDisplayScan.completed_at).toLocaleString()
                  : new Date(activeDisplayScan.created_at).toLocaleString()}
              </span>
              <span>&middot;</span>
              <span>{activeDisplayScan.duration_ms}ms</span>
              {activeDisplayScan.source_version && (
                <>
                  <span>&middot;</span>
                  <span className="bg-[#F8FAFC] px-2 py-0.5 rounded text-[#0F172A] border border-[#D8E2EE]">
                    Version: {activeDisplayScan.source_version}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Compliance Score & Exact Calculation Explanation */}
          <div className="bg-[#F8FAFC] border border-[#D8E2EE] rounded-[10px] p-5 flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-[#0F172A]">
                <ShieldCheck className="h-6 w-6 text-[#009F95]" />
                <h4 className="text-base font-semibold text-[#0F172A]">Architectural Compliance Score</h4>
              </div>
              <p className="text-xs text-[#475569] leading-relaxed">
                Calculation: <strong className="text-[#0F172A]">{activeDisplayScan.compliance_percentage}%</strong> adherence derived from{' '}
                <code className="bg-white px-2 py-0.5 rounded border border-[#D8E2EE] font-mono text-xs font-semibold text-[#0F172A]">
                  100 &times; (1 &minus; Violated Rules / Total Applicable Rules)
                </code>
                .
              </p>
            </div>
            <div className="flex items-baseline gap-2.5 shrink-0">
              <span
                className={`text-4xl font-extrabold ${
                  activeDisplayScan.compliance_percentage >= 90
                    ? 'text-[#10B981]'
                    : activeDisplayScan.compliance_percentage >= 70
                    ? 'text-[#B45309]'
                    : 'text-[#B42318]'
                }`}
              >
                {activeDisplayScan.compliance_percentage}%
              </span>
              <span className="text-xs font-semibold text-[#475569]">
                ({activeDisplayScan.total_findings === 0 ? 'Full Conformance' : `${activeDisplayScan.total_findings} Drift Issues`})
              </span>
            </div>
          </div>

          {/* Core Telemetry Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div className="p-4 bg-[#F8FAFC] rounded-[10px] border border-[#D8E2EE]">
              <span className="text-xs uppercase font-semibold text-[#475569] tracking-wider block">Files Analyzed</span>
              <span className="text-2xl font-bold text-[#0F172A]">{activeDisplayScan.files_analyzed}</span>
            </div>
            <div className="p-4 bg-[#F8FAFC] rounded-[10px] border border-[#D8E2EE]">
              <span className="text-xs uppercase font-semibold text-[#475569] tracking-wider block">Modules Discovered</span>
              <span className="text-2xl font-bold text-[#0F172A]">{activeDisplayScan.modules_discovered}</span>
            </div>
            <div className="p-4 bg-[#F8FAFC] rounded-[10px] border border-[#D8E2EE]">
              <span className="text-xs uppercase font-semibold text-[#475569] tracking-wider block">Dependencies</span>
              <span className="text-2xl font-bold text-[#0F172A]">{activeDisplayScan.dependencies_discovered}</span>
            </div>
            <div className="p-4 bg-[#F8FAFC] rounded-[10px] border border-[#D8E2EE]">
              <span className="text-xs uppercase font-semibold text-[#475569] tracking-wider block">Total Drift Findings</span>
              <span className="text-2xl font-bold text-[#0F172A]">{activeDisplayScan.total_findings}</span>
            </div>
          </div>

          {/* Severity Breakdown Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-[10px] border border-[#FECACA] bg-[#FEE2E2] text-[#B42318] flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold block uppercase tracking-wider text-[#B42318]">Critical</span>
                <span className="text-xl font-bold">{activeDisplayScan.critical_findings}</span>
              </div>
              <span className="text-xs bg-white px-2.5 py-0.5 rounded-full font-semibold border border-[#FECACA]">Blocker</span>
            </div>
            <div className="p-3.5 rounded-[10px] border border-[#FED7AA] bg-[#FFEDD5] text-[#C2410C] flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold block uppercase tracking-wider text-[#C2410C]">High</span>
                <span className="text-xl font-bold">{activeDisplayScan.high_findings}</span>
              </div>
              <span className="text-xs bg-white px-2.5 py-0.5 rounded-full font-semibold border border-[#FED7AA]">Policy Drift</span>
            </div>
            <div className="p-3.5 rounded-[10px] border border-[#FDE68A] bg-[#FEF3C7] text-[#B45309] flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold block uppercase tracking-wider text-[#B45309]">Medium</span>
                <span className="text-xl font-bold">{activeDisplayScan.medium_findings}</span>
              </div>
              <span className="text-xs bg-white px-2.5 py-0.5 rounded-full font-semibold border border-[#FDE68A]">Coupling</span>
            </div>
            <div className="p-3.5 rounded-[10px] border border-[#D8E2EE] bg-[#F8FAFC] text-[#0F172A] flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold block uppercase tracking-wider text-[#475569]">Low</span>
                <span className="text-xl font-bold">{activeDisplayScan.low_findings}</span>
              </div>
              <span className="text-xs bg-white px-2.5 py-0.5 rounded-full font-semibold border border-[#D8E2EE]">Notice</span>
            </div>
          </div>

          {/* Finding Categories Breakdown */}
          <div className="space-y-2.5 pt-1">
            <h4 className="text-xs font-semibold text-[#0F172A] uppercase tracking-wider">
              Finding Categories Breakdown
            </h4>
            <div className="flex flex-wrap gap-2.5 text-xs">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#D8E2EE] text-[#0F172A] font-medium">
                <span className="font-bold text-[#B42318] bg-[#FEE2E2] px-1.5 py-0.5 rounded">{categoryCounts.forbidden_import}</span>
                <span>Forbidden Imports</span>
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#D8E2EE] text-[#0F172A] font-medium">
                <span className="font-bold text-[#B42318] bg-[#FEE2E2] px-1.5 py-0.5 rounded">{categoryCounts.forbidden_dependency}</span>
                <span>Forbidden Dependencies</span>
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#D8E2EE] text-[#0F172A] font-medium">
                <span className="font-bold text-[#C2410C] bg-[#FFEDD5] px-1.5 py-0.5 rounded">{categoryCounts.layer_violation}</span>
                <span>Layer Violations</span>
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#D8E2EE] text-[#0F172A] font-medium">
                <span className="font-bold text-[#B45309] bg-[#FEF3C7] px-1.5 py-0.5 rounded">{categoryCounts.unexpected_dependency}</span>
                <span>Unexpected Dependencies</span>
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#D8E2EE] text-[#0F172A] font-medium">
                <span className="font-bold text-[#009F95] bg-[#EFF6FF] px-1.5 py-0.5 rounded">{categoryCounts.circular_dependency}</span>
                <span>Circular Dependencies</span>
              </span>
              {categoryCounts.adr_violation > 0 && (
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#D8E2EE] text-[#0F172A] font-medium">
                  <span className="font-bold text-[#175CD3] bg-[#EFF6FF] px-1.5 py-0.5 rounded">{categoryCounts.adr_violation}</span>
                  <span>ADR Violations</span>
                </span>
              )}
            </div>
          </div>

          {/* Detailed Findings Table */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between pb-2 border-b border-[#D8E2EE]">
              <h4 className="text-[18px] font-semibold text-[#0F172A]">
                Detailed Findings & Traceable Evidence ({findings.length})
              </h4>
              <button
                onClick={() => navigate('/findings')}
                className="text-xs font-semibold text-[#009F95] hover:text-[#0A2548] underline flex items-center gap-1"
              >
                <span>Full Triage Drawer</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {isLoadingFindings ? (
              <div className="p-8 text-center text-sm text-[#475569] font-medium">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-[#009F95]" />
                <span>Loading finding records from database...</span>
              </div>
            ) : findings.length === 0 ? (
              <div className="p-6 rounded-[10px] bg-[#E8F5E9] border border-[#C8E6C9] text-center text-sm text-[#10B981]">
                <CheckCircle2 className="h-7 w-7 text-[#10B981] mx-auto mb-1.5" />
                <span className="font-bold block text-base">Zero Architectural Drift Detected!</span>
                <span>All examined source files adhere to declared component boundaries and dependency directions.</span>
              </div>
            ) : (
              <div className="border border-[#D8E2EE] rounded-[10px] overflow-hidden overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#F8FAFC] border-b border-[#D8E2EE] text-xs font-semibold text-[#475569] uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-3.5">Severity</th>
                      <th className="py-3 px-3.5">Rule</th>
                      <th className="py-3 px-3.5">Source File & Line</th>
                      <th className="py-3 px-3.5">Evidence</th>
                      <th className="py-3 px-3.5">Recommended Correction</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D8E2EE] bg-white text-[#0F172A]">
                    {findings.map((f) => (
                      <tr key={f.id} className="hover:bg-[#F8FAFC] transition-colors">
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-1 rounded text-xs font-semibold uppercase tracking-wider ${
                              f.severity === 'critical'
                                ? 'bg-[#FEE2E2] text-[#B42318] border border-[#FECACA]'
                                : f.severity === 'high'
                                ? 'bg-[#FFEDD5] text-[#C2410C] border border-[#FED7AA]'
                                : 'bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]'
                            }`}
                          >
                            {f.severity}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span className="font-mono text-xs font-bold text-[#0F172A] block">
                            {f.rule_id}
                          </span>
                          <span className="text-xs text-[#475569] font-medium">{f.rule_type.replace('_', ' ')}</span>
                        </td>
                        <td className="py-3 px-3.5">
                          {f.file_path ? (
                            <span className="font-mono text-xs font-medium text-[#0F172A] flex items-center gap-1.5">
                              <FileCode2 className="h-4 w-4 shrink-0 text-[#475569]" />
                              <span className="truncate max-w-[220px]" title={f.file_path}>
                                {f.file_path}
                              </span>
                              {f.line_number && <span className="text-[#475569]">:{f.line_number}</span>}
                            </span>
                          ) : (
                            <span className="text-xs text-[#475569] italic">Global Graph Cycle</span>
                          )}
                        </td>
                        <td className="py-3 px-3.5">
                          <div className="font-mono text-xs bg-[#F8FAFC] px-2.5 py-1.5 rounded-lg text-[#0F172A] border border-[#D8E2EE] max-w-xs truncate" title={f.evidence || f.title}>
                            {f.evidence || f.title}
                          </div>
                        </td>
                        <td className="py-3 px-3.5 text-[#475569] text-xs max-w-sm">
                          <span className="line-clamp-2 leading-relaxed" title={f.remediation || f.explanation}>
                            {f.remediation || f.explanation}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quick Navigation & Download Actions */}
          <div className="pt-4 border-t border-[#D8E2EE] flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => navigate('/findings')}
                className="inline-flex items-center gap-2 px-4 py-2 font-semibold rounded-lg bg-[#03162D] text-white hover:bg-[#0A2548] transition-colors"
              >
                <span>Triage Findings</span>
                <ArrowRight className="h-4 w-4" />
              </button>

              <button
                onClick={() => navigate('/graph')}
                className="inline-flex items-center gap-2 px-4 py-2 font-semibold rounded-lg bg-white border border-[#D8E2EE] text-[#0F172A] hover:bg-[#F8FAFC] transition-colors"
              >
                <span>Interactive Dependency Graph</span>
                <ArrowRight className="h-4 w-4" />
              </button>

              <button
                onClick={() => navigate('/history')}
                className="inline-flex items-center gap-2 px-4 py-2 font-semibold rounded-lg bg-white border border-[#D8E2EE] text-[#0F172A] hover:bg-[#F8FAFC] transition-colors"
              >
                <span>View Scan History</span>
              </button>
            </div>

            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleDownloadJson}
                  disabled={downloadingJson}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#D8E2EE] bg-white hover:bg-[#F8FAFC] text-[#0F172A] font-semibold transition-colors text-xs cursor-pointer disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  <span>{downloadingJson ? 'Downloading...' : 'Export JSON'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  disabled={downloadingCsv}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#D8E2EE] bg-white hover:bg-[#F8FAFC] text-[#0F172A] font-semibold transition-colors text-xs cursor-pointer disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  <span>{downloadingCsv ? 'Downloading...' : 'Export CSV'}</span>
                </button>
              </div>
              {downloadError && (
                <div className="text-xs text-[#B42318] bg-[#FEE2E2] border border-[#FECACA] px-2.5 py-1 rounded-lg">
                  <span>{downloadError}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
