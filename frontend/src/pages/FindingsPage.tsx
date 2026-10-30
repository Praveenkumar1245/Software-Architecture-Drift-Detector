import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Search,
  CheckCircle2,
  FileCode2,
  Sparkles,
  X,
  History,
  ArrowRight,
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { api } from '../api/client';
import { Finding, FindingStatus } from '../types';

export const FindingsPage: React.FC = () => {
  const { latestScan, activeProject, refreshLatestScan } = useProject();

  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [ruleTypeFilter, setRuleTypeFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Selected Finding Drawer
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [exceptionReason, setExceptionReason] = useState('');
  const [showExceptionDialog, setShowExceptionDialog] = useState(false);

  // AI Advice State
  const [aiAdvice, setAiAdvice] = useState<{
    ai_explanation: string;
    architectural_remediation: string;
  } | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  useEffect(() => {
    if (activeProject && !latestScan) {
      refreshLatestScan(activeProject.id);
    }
  }, [activeProject?.id, latestScan, refreshLatestScan]);

  useEffect(() => {
    if (!latestScan) {
      setFindings([]);
      setLoading(false);
      return;
    }

    async function loadFindings() {
      setLoading(true);
      try {
        const data = await api.getScanFindings(latestScan!.id, {
          severity: severityFilter || undefined,
          status: statusFilter || undefined,
          rule_type: ruleTypeFilter || undefined,
          search: searchTerm.trim() || undefined,
        });
        setFindings(data);
      } catch (err) {
        console.error('Failed to load findings:', err);
      } finally {
        setLoading(false);
      }
    }
    loadFindings();
  }, [latestScan, severityFilter, statusFilter, ruleTypeFilter, searchTerm]);

  const handleOpenFinding = async (finding: Finding) => {
    setSelectedFinding(finding);
    setAiAdvice(null);
    try {
      const detailed = await api.getFindingDetails(finding.id);
      setSelectedFinding(detailed);
    } catch {
      // Keep existing
    }
  };

  const handleStatusChange = async (newStatus: FindingStatus, reason?: string) => {
    if (!selectedFinding) return;

    setIsUpdatingStatus(true);
    try {
      const updated = await api.updateFindingStatus(selectedFinding.id, newStatus, reason);
      setSelectedFinding(updated);
      setFindings((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setShowExceptionDialog(false);
      setExceptionReason('');
    } catch (err: any) {
      alert(`Failed to update status: ${err.message}`);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleRequestAiAdvice = async () => {
    if (!selectedFinding) return;
    setLoadingAi(true);
    try {
      const advice = await api.explainFinding({
        rule_type: selectedFinding.rule_type,
        title: selectedFinding.title,
        explanation: selectedFinding.explanation,
        source_component: selectedFinding.source_component,
        target_component: selectedFinding.target_component,
        evidence: selectedFinding.evidence,
      });
      setAiAdvice(advice);
    } catch (err: any) {
      alert(`Failed to retrieve advice: ${err.message}`);
    } finally {
      setLoadingAi(false);
    }
  };

  if (!latestScan) {
    return (
      <div className="max-w-xl mx-auto mt-12 p-8 bg-white border border-[#D8E2EE] rounded-[10px] text-center">
        <AlertTriangle className="h-10 w-10 text-[#475569] mx-auto mb-3" />
        <h2 className="text-[22px] font-semibold text-[#0F172A] mb-1">No Scans Recorded</h2>
        <p className="text-sm text-[#475569] mb-4">
          Execute a drift scan from the Analyze page to view architectural findings and violations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#D8E2EE]">
        <div>
          <h1 className="text-[32px] font-bold text-[#0F172A] tracking-tight">Architectural Drift Findings</h1>
          <p className="text-sm text-[#475569] mt-1">
            Traceable violations, forbidden imports, circular coupling, and layer transgressions.
          </p>
        </div>
        <div className="text-xs font-mono text-[#475569] bg-[#F8FAFC] border border-[#D8E2EE] px-3 py-1.5 rounded-lg">
          Showing {findings.length} findings for Scan #{latestScan.id.substring(0, 8)}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-[10px] border border-[#D8E2EE] flex flex-wrap items-center gap-3 text-sm">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 text-[#475569] absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by title, module, or statement..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[#F8FAFC] border border-[#D8E2EE] rounded-lg focus:outline-none focus:border-[#00D4C7] text-xs font-medium text-[#0F172A] placeholder:text-[#475569]"
          />
        </div>

        {/* Severity */}
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-3 py-2 bg-[#F8FAFC] border border-[#D8E2EE] rounded-lg text-xs font-semibold text-[#0F172A] focus:outline-none focus:border-[#00D4C7]"
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* Status */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-[#F8FAFC] border border-[#D8E2EE] rounded-lg text-xs font-semibold text-[#0F172A] focus:outline-none focus:border-[#00D4C7]"
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
          <option value="accepted_exception">Accepted Exception</option>
        </select>

        {/* Rule Type */}
        <select
          value={ruleTypeFilter}
          onChange={(e) => setRuleTypeFilter(e.target.value)}
          className="px-3 py-2 bg-[#F8FAFC] border border-[#D8E2EE] rounded-lg text-xs font-semibold text-[#0F172A] focus:outline-none focus:border-[#00D4C7]"
        >
          <option value="">All Rule Types</option>
          <option value="forbidden_import">Forbidden External Import</option>
          <option value="forbidden_dependency">Forbidden Dependency</option>
          <option value="layer_violation">Layer Violation</option>
          <option value="circular_dependency">Circular Dependency</option>
          <option value="unexpected_dependency">Unexpected Dependency</option>
          <option value="unmapped_module">Unmapped Module</option>
          <option value="missing_component">Missing Component</option>
          <option value="adr_violation">Architecture Decision (ADR)</option>
        </select>

        {(severityFilter || statusFilter || ruleTypeFilter || searchTerm) && (
          <button
            onClick={() => {
              setSeverityFilter('');
              setStatusFilter('');
              setRuleTypeFilter('');
              setSearchTerm('');
            }}
            className="px-3 py-2 text-xs font-semibold text-[#009F95] hover:text-[#0A2548] underline"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Findings List */}
      {loading ? (
        <div className="p-12 text-center text-[#475569] font-medium">Loading findings...</div>
      ) : findings.length === 0 ? (
        <div className="bg-white rounded-[10px] border border-[#D8E2EE] p-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-[#10B981] mx-auto mb-3" />
          <h3 className="text-[18px] font-semibold text-[#0F172A] mb-1">No Matching Drift Findings</h3>
          <p className="text-sm text-[#475569] max-w-sm mx-auto">
            The codebase matches all applicable architecture boundary rules for the selected filters.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {findings.map((f) => (
            <div
              key={f.id}
              onClick={() => handleOpenFinding(f)}
              className="bg-white p-6 rounded-[10px] border border-[#D8E2EE] hover:border-[#009F95] cursor-pointer transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
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

                  <span className="font-mono text-xs font-semibold text-[#0F172A] bg-[#F8FAFC] border border-[#D8E2EE] px-2 py-0.5 rounded">
                    {f.rule_id}
                  </span>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      f.status === 'open'
                        ? 'bg-[#F8FAFC] text-[#475569] border border-[#D8E2EE]'
                        : f.status === 'accepted_exception'
                        ? 'bg-[#EFF6FF] text-[#175CD3] border border-[#BFDBFE]'
                        : 'bg-[#E8F5E9] text-[#10B981] border border-[#C8E6C9]'
                    }`}
                  >
                    {f.status.replace('_', ' ')}
                  </span>
                </div>

                <h3 className="text-base font-semibold text-[#0F172A] leading-snug">{f.title}</h3>
                <p className="text-sm text-[#475569] leading-relaxed line-clamp-2">{f.explanation}</p>

                {/* File & Evidence Snippet */}
                {f.file_path && (
                  <div className="flex items-center gap-2 text-xs font-mono text-[#475569] pt-1">
                    <FileCode2 className="h-4 w-4 shrink-0 text-[#475569]" />
                    <span className="truncate bg-[#F8FAFC] border border-[#D8E2EE] px-2 py-0.5 rounded text-[#0F172A]">
                      {f.file_path}
                      {f.line_number ? `:${f.line_number}` : ''}
                    </span>
                    {f.evidence && (
                      <span className="text-[#475569] truncate">({f.evidence})</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                <span className="text-xs font-semibold text-[#009F95] flex items-center gap-1.5 px-3 py-1.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg transition-colors">
                  Inspect Details <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Finding Detail Modal / Drawer */}
      {selectedFinding && (
        <div className="fixed inset-0 z-50 bg-[#03162D]/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[10px] max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-xl border border-[#D8E2EE] space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-[#D8E2EE]">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`px-2.5 py-0.5 rounded text-xs font-semibold uppercase ${
                      selectedFinding.severity === 'critical'
                        ? 'bg-[#FEE2E2] text-[#B42318] border border-[#FECACA]'
                        : 'bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]'
                    }`}
                  >
                    {selectedFinding.severity}
                  </span>
                  <span className="font-mono text-xs font-semibold text-[#0F172A] bg-[#F8FAFC] border border-[#D8E2EE] px-2 py-0.5 rounded">{selectedFinding.rule_id}</span>
                </div>
                <h2 className="text-[18px] font-semibold text-[#0F172A]">{selectedFinding.title}</h2>
              </div>
              <button
                onClick={() => setSelectedFinding(null)}
                className="text-[#475569] hover:text-[#0F172A] p-1 rounded-lg hover:bg-[#F8FAFC] transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Explanation & Source Traceability */}
            <div className="space-y-4 text-xs">
              <div>
                <h4 className="font-semibold text-[#0F172A] mb-1">Architectural Explanation</h4>
                <p className="text-[#475569] leading-relaxed bg-[#F8FAFC] p-3.5 rounded-lg border border-[#D8E2EE]">
                  {selectedFinding.explanation}
                </p>
              </div>

              {/* Evidence & File Line */}
              {selectedFinding.evidence && (
                <div>
                  <h4 className="font-semibold text-[#0F172A] mb-1">Traceable Evidence</h4>
                  <div className="p-3.5 bg-[#03162D] text-[#F8FAFC] rounded-lg font-mono text-xs overflow-x-auto leading-relaxed border border-[#D8E2EE]">
                    {selectedFinding.file_path && (
                      <div className="text-[#CBD5E1] mb-1.5 font-medium">
                        File: {selectedFinding.file_path} (Line {selectedFinding.line_number})
                      </div>
                    )}
                    <div className="text-[#4ADE80] font-semibold">{selectedFinding.evidence}</div>
                  </div>
                </div>
              )}

              {/* Expected vs Actual */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-[#F8FAFC] rounded-lg border border-[#D8E2EE]">
                  <span className="font-semibold text-[#0F172A] block mb-1">Expected Behavior</span>
                  <p className="text-[#475569] text-xs leading-relaxed">
                    {selectedFinding.expected_behavior || 'Preserve defined architectural layer direction'}
                  </p>
                </div>
                <div className="p-3.5 bg-[#F8FAFC] rounded-lg border border-[#D8E2EE]">
                  <span className="font-semibold text-[#0F172A] block mb-1">Actual Behavior</span>
                  <p className="text-[#475569] text-xs leading-relaxed">
                    {selectedFinding.actual_behavior || 'Direct dependency detected'}
                  </p>
                </div>
              </div>

              {/* Remediation Strategy */}
              {selectedFinding.remediation && (
                <div className="p-3.5 bg-[#E8F5E9] border border-[#C8E6C9] text-[#10B981] rounded-lg">
                  <span className="font-semibold block mb-1 text-[#10B981]">Remediation Guidance</span>
                  <p className="text-xs leading-relaxed text-[#10B981]">{selectedFinding.remediation}</p>
                </div>
              )}

              {/* Optional AI Explanation */}
              <div className="pt-2">
                {!aiAdvice ? (
                  <button
                    onClick={handleRequestAiAdvice}
                    disabled={loadingAi}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-[#D8E2EE] bg-white text-[#0F172A] hover:bg-[#F8FAFC] transition-colors"
                  >
                    <Sparkles className="h-4 w-4 text-[#009F95]" />
                    <span>{loadingAi ? 'Analyzing...' : 'Generate Architectural Analysis & Advice'}</span>
                  </button>
                ) : (
                  <div className="p-4 bg-[#F8FAFC] border border-[#D8E2EE] rounded-lg space-y-2">
                    <div className="flex items-center gap-1.5 text-[#009F95] font-semibold">
                      <Sparkles className="h-4 w-4" />
                      <span>Architectural Expert Recommendation</span>
                    </div>
                    <p className="text-[#475569] text-xs leading-relaxed">
                      {aiAdvice.ai_explanation}
                    </p>
                    <div className="text-[#0F172A] font-semibold text-xs pt-1.5 border-t border-[#D8E2EE]">
                      Strategy: {aiAdvice.architectural_remediation}
                    </div>
                  </div>
                )}
              </div>

              {/* Audit History */}
              {selectedFinding.audit_logs && selectedFinding.audit_logs.length > 0 && (
                <div>
                  <h4 className="font-semibold text-[#0F172A] mb-1.5 flex items-center gap-1.5">
                    <History className="h-4 w-4 text-[#475569]" />
                    <span>Status Audit Trail</span>
                  </h4>
                  <div className="space-y-2">
                    {selectedFinding.audit_logs.map((log) => (
                      <div
                        key={log.id}
                        className="p-2.5 bg-[#F8FAFC] rounded-lg border border-[#D8E2EE] text-xs text-[#475569] flex justify-between"
                      >
                        <span>
                          Changed from <b className="text-[#0F172A]">{log.previous_status}</b> to <b className="text-[#0F172A]">{log.new_status}</b>
                          {log.reason && ` (Reason: "${log.reason}")`}
                        </span>
                        <span className="text-[#475569] font-mono text-xs">
                          {new Date(log.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Status Actions Footer */}
            <div className="pt-3 border-t border-[#D8E2EE] flex items-center justify-between">
              <span className="text-xs font-medium text-[#475569]">
                Current Status: <b className="text-[#0F172A]">{selectedFinding.status}</b>
              </span>

              <div className="flex items-center gap-2">
                {selectedFinding.status !== 'acknowledged' && (
                  <button
                    disabled={isUpdatingStatus}
                    onClick={() => handleStatusChange('acknowledged')}
                    className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-[#D8E2EE] bg-white text-[#0F172A] hover:bg-[#F8FAFC] transition-colors"
                  >
                    Acknowledge
                  </button>
                )}
                {selectedFinding.status !== 'resolved' && (
                  <button
                    disabled={isUpdatingStatus}
                    onClick={() => handleStatusChange('resolved')}
                    className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#10B981] hover:bg-[#126b4a] text-white transition-colors"
                  >
                    Mark Resolved
                  </button>
                )}
                {selectedFinding.status !== 'accepted_exception' && (
                  <button
                    disabled={isUpdatingStatus}
                    onClick={() => setShowExceptionDialog(true)}
                    className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#03162D] hover:bg-[#0A2548] text-white transition-colors"
                  >
                    Accept Exception
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Exception Reason Dialog */}
      {showExceptionDialog && (
        <div className="fixed inset-0 z-60 bg-[#03162D]/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[10px] max-w-md w-full p-6 shadow-xl border border-[#D8E2EE] space-y-4">
            <h3 className="text-sm font-semibold text-[#0F172A]">Document Accepted Architectural Exception</h3>
            <p className="text-xs text-[#475569]">
              A clear architectural justification is required to accept this violation into the audit log.
            </p>
            <textarea
              rows={3}
              required
              placeholder="e.g. Approved temporary exception pending Q3 domain service decoupling..."
              value={exceptionReason}
              onChange={(e) => setExceptionReason(e.target.value)}
              className="w-full p-2.5 text-xs bg-white border border-[#D8E2EE] rounded-lg text-[#0F172A] focus:border-[#00D4C7] focus:outline-none"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowExceptionDialog(false)}
                className="px-3.5 py-2 text-xs font-semibold text-[#0F172A] bg-white border border-[#D8E2EE] hover:bg-[#F8FAFC] rounded-lg"
              >
                Cancel
              </button>
              <button
                disabled={!exceptionReason.trim()}
                onClick={() => handleStatusChange('accepted_exception', exceptionReason)}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#03162D] hover:bg-[#0A2548] disabled:opacity-50 rounded-lg transition-colors"
              >
                Confirm Exception
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
