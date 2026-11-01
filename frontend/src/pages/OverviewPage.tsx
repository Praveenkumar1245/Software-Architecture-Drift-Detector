import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  History,
  CheckCircle2,
  FolderGit2,
  ArrowRight,
  TrendingUp,
  Info,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
  Cell,
} from 'recharts';
import { useProject } from '../context/ProjectContext';
import { api } from '../api/client';
import { OverviewMetrics } from '../types';

export const OverviewPage: React.FC = () => {
  const { activeProject, projects } = useProject();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadMetrics() {
      setLoading(true);
      try {
        const data = await api.getOverview(activeProject?.id);
        if (isMounted) setMetrics(data);
      } catch (err) {
        console.error('Failed to load overview metrics:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadMetrics();
    return () => {
      isMounted = false;
    };
  }, [activeProject]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-[#475569]">
        <div className="animate-spin h-9 w-9 border-3 border-[#D8E2EE] border-t-[#009F95] rounded-full mb-3.5"></div>
        <p className="text-base font-medium">Loading architectural compliance metrics...</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="max-w-2xl mx-auto mt-12 p-8 bg-white border border-[#D8E2EE] rounded-[10px] text-center">
        <div className="h-14 w-14 bg-[#F8FAFC] border border-[#D8E2EE] rounded-full flex items-center justify-center mx-auto text-[#0F172A] mb-4">
          <FolderGit2 className="h-7 w-7 text-[#009F95]" />
        </div>
        <h2 className="text-[22px] font-semibold text-[#0F172A] mb-2">No Projects Registered</h2>
        <p className="text-base text-[#475569] mb-6 max-w-md mx-auto">
          Get started by registering a project or uploading a source code repository archive to begin detecting architectural drift.
        </p>
        <button
          onClick={() => navigate('/projects?create=true')}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-base font-semibold rounded-lg text-white bg-[#03162D] hover:bg-[#0A2548] transition-colors"
        >
          <span>Create First Project</span>
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    );
  }

  const severityData = metrics
    ? [
        { name: 'Critical', count: metrics.critical_findings, color: '#B42318' },
        { name: 'High', count: metrics.high_findings, color: '#C2410C' },
        { name: 'Medium', count: metrics.medium_findings, color: '#B45309' },
        { name: 'Low', count: metrics.low_findings, color: '#475569' },
      ]
    : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title & Scope Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#D8E2EE]">
        <div>
          <h1 className="text-[32px] font-bold text-[#0F172A] tracking-tight">Architecture Overview</h1>
          <p className="text-sm text-[#475569] mt-1">
            Real-time compliance, boundary violations, and drift telemetry for{' '}
            <span className="font-semibold text-[#0F172A]">
              {activeProject ? activeProject.name : 'All Projects'}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/analyze')}
            className="px-4 py-2 text-sm font-semibold rounded-lg text-white bg-[#03162D] hover:bg-[#0A2548] transition-colors"
          >
            Run New Scan
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Compliance */}
        <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE]">
          <div className="flex items-center justify-between text-[#475569] mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#475569]">Compliance Rate</span>
            <ShieldCheck
              className={`h-5 w-5 ${
                (metrics?.compliance_percentage ?? 100) >= 90
                  ? 'text-[#10B981]'
                  : (metrics?.compliance_percentage ?? 100) >= 70
                  ? 'text-[#B45309]'
                  : 'text-[#B42318]'
              }`}
            />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[32px] font-bold text-[#0F172A]">
              {metrics ? `${metrics.compliance_percentage}%` : '100%'}
            </span>
            <span className="text-xs font-semibold text-[#475569]">rule adherence</span>
          </div>
          <p className="text-xs text-[#475569] mt-2">
            Formula: 100 × (1 − violated rules / total rules)
          </p>
        </div>

        {/* Total Findings */}
        <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE]">
          <div className="flex items-center justify-between text-[#475569] mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#475569]">Total Drift Findings</span>
            <AlertTriangle className="h-5 w-5 text-[#B45309]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[32px] font-bold text-[#0F172A]">
              {metrics?.total_findings ?? 0}
            </span>
            <span className="text-xs font-semibold text-[#475569]">active violations</span>
          </div>
          <p className="text-xs text-[#475569] mt-2">
            Across components & layer boundaries
          </p>
        </div>

        {/* Critical & High */}
        <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE]">
          <div className="flex items-center justify-between text-[#475569] mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#475569]">Critical / High Severity</span>
            <AlertOctagon className="h-5 w-5 text-[#B42318]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[32px] font-bold text-[#B42318]">
              {(metrics?.critical_findings ?? 0) + (metrics?.high_findings ?? 0)}
            </span>
            <span className="text-xs font-medium text-[#475569]">
              ({metrics?.critical_findings ?? 0} crit, {metrics?.high_findings ?? 0} high)
            </span>
          </div>
          <p className="text-xs text-[#475569] mt-2">
            Immediate remediation recommended
          </p>
        </div>

        {/* Total Scans & Duration */}
        <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE]">
          <div className="flex items-center justify-between text-[#475569] mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#475569]">Completed Scans</span>
            <History className="h-5 w-5 text-[#0F172A]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[32px] font-bold text-[#0F172A]">
              {metrics?.total_scans ?? 0}
            </span>
            <span className="text-xs font-semibold text-[#475569]">
              {metrics?.latest_scan ? `${metrics.latest_scan.duration_ms}ms last run` : 'no runs'}
            </span>
          </div>
          <p className="text-xs text-[#475569] mt-2">
            {metrics?.latest_scan?.completed_at
              ? `Last scan: ${new Date(metrics.latest_scan.completed_at).toLocaleTimeString()}`
              : 'Awaiting first analysis'}
          </p>
        </div>
      </div>

      {/* Compliance Formula Explanation Alert */}
      <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-[10px] p-4 flex items-start gap-3 text-sm text-[#0F172A]">
        <Info className="h-5 w-5 text-[#175CD3] shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-[#0F172A]">Compliance Calculation Policy:</span>{' '}
          Compliance percentage is deterministically calculated as{' '}
          <code className="bg-white px-2 py-0.5 rounded border border-[#BFDBFE] font-mono text-xs font-semibold text-[#0F172A]">
            100 × (1 − violated applicable rules / total applicable rules)
          </code>
          . This measures rule compliance against approved policies, not complete architectural correctness.
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Severity Distribution */}
        <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE] flex flex-col">
          <h2 className="text-[18px] font-semibold text-[#0F172A] mb-1">Findings by Severity</h2>
          <p className="text-sm text-[#475569] mb-4">Distribution of active architectural drift issues</p>
          <div className="h-64 w-full">
            {metrics && metrics.total_findings > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={severityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#D8E2EE" />
                  <XAxis dataKey="name" tick={{ fontSize: 13, fill: '#475569', fontWeight: 600 }} />
                  <YAxis tick={{ fontSize: 13, fill: '#475569', fontWeight: 600 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#D8E2EE',
                      borderRadius: '8px',
                      fontSize: '13px',
                      color: '#0F172A',
                      fontWeight: 600,
                    }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {severityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-[#475569]">
                <CheckCircle2 className="h-8 w-8 text-[#10B981] mb-2" />
                <p className="text-sm font-semibold text-[#0F172A]">Zero Architecture Drift Violations</p>
                <p className="text-xs text-[#475569]">All modules conform to declared component boundaries.</p>
              </div>
            )}
          </div>
        </div>

        {/* Drift Trends Over Time */}
        <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE] flex flex-col">
          <h2 className="text-[18px] font-semibold text-[#0F172A] mb-1">Compliance Trend</h2>
          <p className="text-sm text-[#475569] mb-4">Historical rule compliance over previous scans</p>
          <div className="h-64 w-full">
            {metrics && (metrics.trends?.length ?? 0) > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics.trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#D8E2EE" />
                  <XAxis dataKey="timestamp" tick={{ fontSize: 12, fill: '#475569', fontWeight: 600 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#475569', fontWeight: 600 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#D8E2EE',
                      borderRadius: '8px',
                      fontSize: '13px',
                      color: '#0F172A',
                      fontWeight: 600,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="compliance_percentage"
                    stroke="#009F95"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#009F95' }}
                    activeDot={{ r: 6 }}
                    name="Compliance %"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-[#475569]">
                <TrendingUp className="h-8 w-8 text-[#475569] opacity-50 mb-2" />
                <p className="text-sm font-semibold text-[#0F172A]">Trend History Unavailable</p>
                <p className="text-xs text-[#475569]">Run multiple scans over time to see trends.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tables: Top Violated Rules & Component Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Frequently Violated Architecture Rules */}
        <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE]">
          <h2 className="text-[18px] font-semibold text-[#0F172A] mb-1">
            Most Frequently Violated Rules
          </h2>
          <p className="text-sm text-[#475569] mb-4">Top rules triggering architectural drift</p>
          {metrics && (metrics.top_violated_rules?.length ?? 0) > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-[#0F172A]">
                <caption className="sr-only">Top violated architectural rules</caption>
                <thead>
                  <tr className="border-b border-[#D8E2EE] text-xs font-semibold text-[#475569] uppercase">
                    <th scope="col" className="pb-3">Rule</th>
                    <th scope="col" className="pb-3">Type</th>
                    <th scope="col" className="pb-3">Severity</th>
                    <th scope="col" className="pb-3 text-right">Violations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D8E2EE]">
                  {metrics.top_violated_rules.map((rule, idx) => (
                    <tr key={`${rule.rule_id}-${idx}`} className="hover:bg-[#F8FAFC]">
                      <td className="py-3 font-semibold text-[#0F172A]">
                        {rule.description || rule.rule_id}
                      </td>
                      <td className="py-3 text-[#475569] font-mono text-xs">
                        {rule.rule_type}
                      </td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                            rule.severity === 'critical'
                              ? 'bg-[#FEE2E2] text-[#B42318] border border-[#FECACA]'
                              : rule.severity === 'high'
                              ? 'bg-[#FFEDD5] text-[#C2410C] border border-[#FED7AA]'
                              : 'bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]'
                          }`}
                        >
                          {rule.severity}
                        </span>
                      </td>
                      <td className="py-3 text-right font-bold text-[#0F172A]">
                        {rule.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-[#475569] italic py-6 text-center">
              No rule violations recorded.
            </p>
          )}
        </div>

        {/* Component Health & Compliance */}
        <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE]">
          <h2 className="text-[18px] font-semibold text-[#0F172A] mb-1">
            Component Boundaries & Status
          </h2>
          <p className="text-sm text-[#475569] mb-4">Modules and dependency distribution per component</p>
          {metrics && (metrics.component_stats?.length ?? 0) > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-[#0F172A]">
                <caption className="sr-only">Component compliance status and dependency counts</caption>
                <thead>
                  <tr className="border-b border-[#D8E2EE] text-xs font-semibold text-[#475569] uppercase">
                    <th scope="col" className="pb-3">Component</th>
                    <th scope="col" className="pb-3">Modules</th>
                    <th scope="col" className="pb-3">In/Out Deps</th>
                    <th scope="col" className="pb-3">Violations</th>
                    <th scope="col" className="pb-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D8E2EE]">
                  {metrics.component_stats.map((comp, idx) => (
                    <tr key={`${comp.component || 'unmapped'}-${idx}`} className="hover:bg-[#F8FAFC]">
                      <td className="py-3 font-semibold text-[#0F172A] capitalize">
                        {comp.component}
                      </td>
                      <td className="py-3 text-[#475569] font-medium">{comp.modules_count}</td>
                      <td className="py-3 text-[#475569] font-mono text-xs">
                        {comp.incoming_dependencies} / {comp.outgoing_dependencies}
                      </td>
                      <td className="py-3 font-bold text-[#0F172A]">
                        {comp.violations_count}
                      </td>
                      <td className="py-3 text-right">
                        {comp.is_compliant ? (
                          <span className="inline-flex items-center gap-1 text-[#10B981] font-semibold text-xs bg-[#E8F5E9] px-2 py-0.5 rounded border border-[#C8E6C9]">
                            <CheckCircle2 className="h-3.5 w-3.5 text-[#10B981]" /> Compliant
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[#B45309] font-semibold text-xs bg-[#FEF3C7] px-2 py-0.5 rounded border border-[#FDE68A]">
                            <AlertTriangle className="h-3.5 w-3.5 text-[#B45309]" /> Drifted
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-[#475569] italic py-6 text-center">
              No component data available. Run an architecture scan to populate.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
