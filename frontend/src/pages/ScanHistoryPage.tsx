import React, { useState, useEffect } from 'react';
import {
  History,
  GitCompare,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { api } from '../api/client';
import { ScanRun, ScanComparison } from '../types';

export const ScanHistoryPage: React.FC = () => {
  const { activeProject } = useProject();

  const [scans, setScans] = useState<ScanRun[]>([]);
  const [loading, setLoading] = useState(true);

  // Comparison selection
  const [selectedScanA, setSelectedScanA] = useState<string>('');
  const [selectedScanB, setSelectedScanB] = useState<string>('');
  const [comparison, setComparison] = useState<ScanComparison | null>(null);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    if (!activeProject) {
      setScans([]);
      setLoading(false);
      return;
    }

    async function loadScans() {
      setLoading(true);
      try {
        const list = await api.getProjectScans(activeProject!.id);
        setScans(list);
        if (list.length >= 2) {
          setSelectedScanA(list[1].id);
          setSelectedScanB(list[0].id);
        } else if (list.length === 1) {
          setSelectedScanB(list[0].id);
        }
      } catch (err) {
        console.error('Failed to load scan history:', err);
      } finally {
        setLoading(false);
      }
    }
    loadScans();
  }, [activeProject]);

  const handleCompare = async () => {
    if (!selectedScanA || !selectedScanB) return;
    setComparing(true);
    try {
      const data = await api.compareScans(selectedScanA, selectedScanB);
      setComparison(data);
    } catch (err: any) {
      alert(`Comparison failed: ${err.message}`);
    } finally {
      setComparing(false);
    }
  };

  if (!activeProject) {
    return (
      <div className="max-w-xl mx-auto mt-12 p-8 bg-white border border-[#D8E2EE] rounded-[10px] text-center">
        <History className="h-10 w-10 text-[#475569] mx-auto mb-3" />
        <h2 className="text-[22px] font-semibold text-[#0F172A] mb-1">No Project Selected</h2>
        <p className="text-sm text-[#475569] mb-4">
          Select a project from the top bar to inspect scan telemetry and historical comparisons.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#D8E2EE]">
        <div>
          <h1 className="text-[32px] font-bold text-[#0F172A] tracking-tight">Scan History & Drift Comparison</h1>
          <p className="text-sm text-[#475569] mt-1">
            Audit historical analysis runs and compare delta changes between any two scans.
          </p>
        </div>
      </div>

      {/* Comparison Tool Bar */}
      {scans.length >= 2 && (
        <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE] space-y-4">
          <div className="flex items-center gap-2 text-base font-semibold text-[#0F172A]">
            <GitCompare className="h-4 w-4 text-[#009F95]" />
            <span>Compare Two Scans</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[#475569] font-medium">Base Scan (Earlier):</span>
              <select
                value={selectedScanA}
                onChange={(e) => setSelectedScanA(e.target.value)}
                className="px-3 py-1.5 bg-white border border-[#D8E2EE] rounded-lg text-[#0F172A] font-medium focus:border-[#00D4C7] focus:outline-none"
              >
                {scans.map((s) => (
                  <option key={s.id} value={s.id}>
                    {new Date(s.created_at).toLocaleString()} ({s.source_version || s.id.substring(0, 6)})
                  </option>
                ))}
              </select>
            </div>

            <ArrowRight className="h-4 w-4 text-[#475569] hidden sm:block" />

            <div className="flex items-center gap-2">
              <span className="text-[#475569] font-medium">Target Scan (Later):</span>
              <select
                value={selectedScanB}
                onChange={(e) => setSelectedScanB(e.target.value)}
                className="px-3 py-1.5 bg-white border border-[#D8E2EE] rounded-lg text-[#0F172A] font-medium focus:border-[#00D4C7] focus:outline-none"
              >
                {scans.map((s) => (
                  <option key={s.id} value={s.id}>
                    {new Date(s.created_at).toLocaleString()} ({s.source_version || s.id.substring(0, 6)})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleCompare}
              disabled={comparing || selectedScanA === selectedScanB}
              className="px-4 py-2 text-xs font-semibold rounded-lg text-white bg-[#03162D] hover:bg-[#0A2548] disabled:opacity-50 transition-colors"
            >
              {comparing ? 'Comparing...' : 'Run Comparison'}
            </button>
          </div>

          {/* Comparison Results Card */}
          {comparison && (
            <div className="p-5 bg-[#F8FAFC] rounded-[10px] border border-[#D8E2EE] space-y-4 text-xs mt-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 bg-white rounded-lg border border-[#D8E2EE]">
                  <span className="text-xs uppercase font-semibold text-[#475569] block">
                    Compliance Delta
                  </span>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    {comparison.compliance_delta >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-[#10B981]" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-[#B42318]" />
                    )}
                    <span
                      className={`text-lg font-bold ${
                        comparison.compliance_delta >= 0 ? 'text-[#10B981]' : 'text-[#B42318]'
                      }`}
                    >
                      {comparison.compliance_delta > 0 ? `+${comparison.compliance_delta}%` : `${comparison.compliance_delta}%`}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-lg border border-[#D8E2EE]">
                  <span className="text-xs uppercase font-semibold text-[#B42318] block">
                    New Violations
                  </span>
                  <span className="text-lg font-bold text-[#B42318] mt-1 block">
                    +{comparison.new_findings.length}
                  </span>
                </div>

                <div className="p-3 bg-white rounded-lg border border-[#D8E2EE]">
                  <span className="text-xs uppercase font-semibold text-[#10B981] block">
                    Resolved Findings
                  </span>
                  <span className="text-lg font-bold text-[#10B981] mt-1 block">
                    -{comparison.resolved_findings.length}
                  </span>
                </div>

                <div className="p-3 bg-white rounded-lg border border-[#D8E2EE]">
                  <span className="text-xs uppercase font-semibold text-[#475569] block">
                    Persistent Findings
                  </span>
                  <span className="text-lg font-bold text-[#0F172A] mt-1 block">
                    {comparison.persistent_findings.length}
                  </span>
                </div>
              </div>

              {/* Breakdown lists */}
              {comparison.new_findings.length > 0 && (
                <div className="bg-[#FEE2E2] p-4 rounded-lg border border-[#FECACA]">
                  <span className="font-semibold text-[#B42318] block mb-1">
                    Newly Introduced Drift Findings:
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-[#B42318] text-xs font-medium">
                    {comparison.new_findings.map((f) => (
                      <li key={f.id}>
                        <b>[{f.rule_id}]</b> {f.title} ({f.file_path || f.source_module})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {comparison.resolved_findings.length > 0 && (
                <div className="bg-[#E8F5E9] p-4 rounded-lg border border-[#C8E6C9]">
                  <span className="font-semibold text-[#10B981] block mb-1">
                    Resolved Architectural Drift:
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-[#10B981] text-xs font-medium">
                    {comparison.resolved_findings.map((f) => (
                      <li key={f.id}>
                        <b>[{f.rule_id}]</b> {f.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Historical Scans Table */}
      <div className="bg-white rounded-[10px] border border-[#D8E2EE] overflow-hidden">
        <div className="p-5 border-b border-[#D8E2EE] bg-[#F8FAFC]">
          <h3 className="text-base font-semibold text-[#0F172A]">Analysis Runs Log</h3>
        </div>

        {loading ? (
          <div className="p-8 text-center text-[#475569] text-xs font-medium">Loading scan history...</div>
        ) : scans.length === 0 ? (
          <div className="p-8 text-center text-[#475569] text-xs">No scans found for this project.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-[#0F172A]">
              <thead>
                <tr className="border-b border-[#D8E2EE] text-[#475569] bg-[#F8FAFC] text-xs font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Scan ID / Tag</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Files / Modules</th>
                  <th className="py-3 px-4">Dependencies</th>
                  <th className="py-3 px-4">Violations</th>
                  <th className="py-3 px-4">Compliance</th>
                  <th className="py-3 px-4 text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D8E2EE]">
                {scans.map((s) => (
                  <tr key={s.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-[#0F172A]">
                      {s.source_version || s.id.substring(0, 8)}
                    </td>
                    <td className="py-3 px-4 text-[#475569] font-medium text-xs">
                      {new Date(s.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded text-xs font-semibold uppercase ${
                          s.status === 'completed'
                            ? 'bg-[#E8F5E9] text-[#10B981] border border-[#C8E6C9]'
                            : s.status === 'running'
                            ? 'bg-[#EFF6FF] text-[#175CD3] border border-[#BFDBFE]'
                            : 'bg-[#FEE2E2] text-[#B42318] border border-[#FECACA]'
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[#475569] font-medium text-xs">
                      {s.files_analyzed} files / {s.modules_discovered} mods
                    </td>
                    <td className="py-3 px-4 text-[#475569] font-mono font-medium text-xs">
                      {s.dependencies_discovered}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      {s.total_findings === 0 ? (
                        <span className="text-[#10B981] font-semibold flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4 text-[#10B981]" /> 0
                        </span>
                      ) : (
                        <span className="text-[#B45309] font-semibold">
                          {s.total_findings} ({s.critical_findings} crit)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-bold text-[#0F172A]">
                      {s.compliance_percentage}%
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[#475569] font-medium text-xs">
                      {s.duration_ms}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
