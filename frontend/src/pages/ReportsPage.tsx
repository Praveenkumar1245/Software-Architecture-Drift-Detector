import React from 'react';
import {
  FileText,
  Download,
  FileSpreadsheet,
  FileCode,
  CheckCircle2,
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { api } from '../api/client';

export const ReportsPage: React.FC = () => {
  const { activeProject, latestScan } = useProject();
  const [downloadingPdf, setDownloadingPdf] = React.useState(false);
  const [downloadingCsv, setDownloadingCsv] = React.useState(false);
  const [downloadingJson, setDownloadingJson] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);

  if (!activeProject || !latestScan) {
    return (
      <div className="max-w-xl mx-auto mt-12 p-8 bg-white border border-[#D8E2EE] rounded-[10px] text-center">
        <FileText className="h-12 w-12 text-[#475569] mx-auto mb-3" />
        <h2 className="text-[22px] font-semibold text-[#0F172A] mb-2">No Scan Reports Available</h2>
        <p className="text-sm text-[#475569] mb-4">
          Execute an architectural drift scan on your project to generate structured audit reports.
        </p>
      </div>
    );
  }

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    setDownloadError(null);
    try {
      await api.downloadPdfReport(latestScan.id, `drift_report_${latestScan.id.substring(0, 8)}.pdf`);
    } catch (err: any) {
      setDownloadError(err.message || 'Failed to download PDF report.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadCsv = async () => {
    setDownloadingCsv(true);
    setDownloadError(null);
    try {
      await api.downloadCsvReport(latestScan.id, `drift_report_${latestScan.id.substring(0, 8)}.csv`);
    } catch (err: any) {
      setDownloadError(err.message || 'Failed to download CSV report.');
    } finally {
      setDownloadingCsv(false);
    }
  };

  const handleDownloadJson = async () => {
    setDownloadingJson(true);
    setDownloadError(null);
    try {
      await api.downloadJsonReport(latestScan.id, `drift_report_${latestScan.id.substring(0, 8)}.json`);
    } catch (err: any) {
      setDownloadError(err.message || 'Failed to download JSON report.');
    } finally {
      setDownloadingJson(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="pb-4 border-b border-[#D8E2EE]">
        <h1 className="text-[32px] font-bold text-[#0F172A] tracking-tight">Architecture Drift Reports</h1>
        <p className="text-sm text-[#475569] mt-1">
          Export verified architectural drift findings, compliance scores, and remediation evidence in PDF, CSV, or JSON.
        </p>
      </div>

      {downloadError && (
        <div className="p-4 bg-[#FEE2E2] border border-[#FECACA] rounded-[10px] text-xs font-semibold text-[#B42318] flex items-center justify-between">
          <span>{downloadError}</span>
          <button onClick={() => setDownloadError(null)} className="underline font-bold ml-2 cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* Export Options Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* PDF Export Card */}
        <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE] flex flex-col justify-between space-y-4">
          <div className="space-y-2.5">
            <div className="h-12 w-12 bg-[#F8FAFC] text-[#009F95] rounded-lg flex items-center justify-center border border-[#D8E2EE]">
              <FileText className="h-6 w-6" />
            </div>
            <h2 className="text-[18px] font-semibold text-[#0F172A]">Executive PDF Report</h2>
            <p className="text-sm text-[#475569] leading-relaxed">
              Formatted document optimized for architecture review boards, compliance audits, and executive briefings with KPI scorecards and full finding evidence.
            </p>
          </div>

          <div className="pt-4 border-t border-[#D8E2EE] flex items-center justify-between">
            <span className="text-xs text-[#475569] font-mono font-medium">Format: .pdf (PDF/A)</span>
            <button
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg text-white bg-[#03162D] hover:bg-[#0A2548] disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>{downloadingPdf ? 'Preparing PDF...' : 'Export PDF'}</span>
            </button>
          </div>
        </div>

        {/* CSV Export Card */}
        <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE] flex flex-col justify-between space-y-4">
          <div className="space-y-2.5">
            <div className="h-12 w-12 bg-[#F8FAFC] text-[#009F95] rounded-lg flex items-center justify-center border border-[#D8E2EE]">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <h2 className="text-[18px] font-semibold text-[#0F172A]">CSV Spreadsheet Report</h2>
            <p className="text-sm text-[#475569] leading-relaxed">
              Tabular export optimized for engineering review in Excel, Google Sheets, or triage pipelines.
              Includes spreadsheet formula injection security escaping on all evidence fields.
            </p>
          </div>

          <div className="pt-4 border-t border-[#D8E2EE] flex items-center justify-between">
            <span className="text-xs text-[#475569] font-mono font-medium">Format: .csv (RFC 4180)</span>
            <button
              onClick={handleDownloadCsv}
              disabled={downloadingCsv}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg text-white bg-[#03162D] hover:bg-[#0A2548] disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>{downloadingCsv ? 'Preparing CSV...' : 'Export CSV'}</span>
            </button>
          </div>
        </div>

        {/* JSON Export Card */}
        <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE] flex flex-col justify-between space-y-4">
          <div className="space-y-2.5">
            <div className="h-12 w-12 bg-[#F8FAFC] text-[#009F95] rounded-lg flex items-center justify-center border border-[#D8E2EE]">
              <FileCode className="h-6 w-6" />
            </div>
            <h2 className="text-[18px] font-semibold text-[#0F172A]">Structured JSON Report</h2>
            <p className="text-sm text-[#475569] leading-relaxed">
              Complete machine-readable audit report containing project metadata, architecture schema version,
              discovered modules, full finding descriptions, and dependency trace data.
            </p>
          </div>

          <div className="pt-4 border-t border-[#D8E2EE] flex items-center justify-between">
            <span className="text-xs text-[#475569] font-mono font-medium">Format: .json (UTF-8)</span>
            <button
              onClick={handleDownloadJson}
              disabled={downloadingJson}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg text-[#0F172A] bg-white border border-[#D8E2EE] hover:bg-[#F8FAFC] disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>{downloadingJson ? 'Preparing JSON...' : 'Export JSON'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Report Summary Preview */}
      <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE] space-y-5">
        <h2 className="text-[18px] font-semibold text-[#0F172A] pb-3 border-b border-[#D8E2EE]">
          Report Metadata Preview: Scan #{latestScan.id.substring(0, 8)}
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-[#475569] text-xs uppercase font-semibold block">Target Project</span>
            <span className="font-semibold text-[#0F172A] text-base mt-0.5 block">{activeProject.name}</span>
          </div>
          <div>
            <span className="text-[#475569] text-xs uppercase font-semibold block">Scan Status</span>
            <span className="font-semibold text-[#10B981] text-base capitalize mt-0.5 inline-flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-[#10B981]" />
              {latestScan.status}
            </span>
          </div>
          <div>
            <span className="text-[#475569] text-xs uppercase font-semibold block">Compliance Score</span>
            <span className="font-bold text-[#0F172A] text-base mt-0.5 block">{latestScan.compliance_percentage}%</span>
          </div>
          <div>
            <span className="text-[#475569] text-xs uppercase font-semibold block">Drift Findings</span>
            <span className="font-bold text-[#0F172A] text-base mt-0.5 block">{latestScan.total_findings}</span>
          </div>
        </div>

        <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#D8E2EE] text-sm text-[#0F172A] space-y-1.5 font-mono">
          <p><span className="text-[#475569] font-sans font-semibold">Files Analyzed:</span> {latestScan.files_analyzed}</p>
          <p><span className="text-[#475569] font-sans font-semibold">Discovered Modules:</span> {latestScan.modules_discovered}</p>
          <p><span className="text-[#475569] font-sans font-semibold">Total Dependencies:</span> {latestScan.dependencies_discovered}</p>
          <p><span className="text-[#475569] font-sans font-semibold">Analysis Execution Duration:</span> {latestScan.duration_ms} ms</p>
          <p><span className="text-[#475569] font-sans font-semibold">Timestamp:</span> {new Date(latestScan.created_at).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
};
