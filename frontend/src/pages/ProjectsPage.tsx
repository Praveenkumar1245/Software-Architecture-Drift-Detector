import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  FolderGit2,
  Plus,
  CheckCircle2,
  Trash2,
  Upload,
  PlayCircle,
  X,
  FileArchive,
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { api } from '../api/client';

export const ProjectsPage: React.FC = () => {
  const { projects, activeProject, setActiveProject, refreshProjects } = useProject();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [showCreateModal, setShowCreateModal] = useState(searchParams.get('create') === 'true');
  const [uploadingProjectId, setUploadingProjectId] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    primary_language: 'python',
    source_dirs: 'app,src',
    exclude_dirs: '.venv,venv,__pycache__,tests,dist,build,node_modules,.git',
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const newProj = await api.createProject(formData);
      await refreshProjects();
      setActiveProject(newProj);
      setShowCreateModal(false);
      setFormData({
        name: '',
        description: '',
        primary_language: 'python',
        source_dirs: 'app,src',
        exclude_dirs: '.venv,venv,__pycache__,tests,dist,build,node_modules,.git',
      });
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete project "${name}"? This will permanently delete its scans and findings.`)) {
      return;
    }

    try {
      await api.deleteProject(id);
      await refreshProjects();
    } catch (err: any) {
      alert(`Failed to delete project: ${err.message}`);
    }
  };

  const handleUploadZip = async (projectId: string) => {
    if (!uploadFile) return;

    setIsSubmitting(true);
    setUploadStatus('Uploading & validating archive...');
    setError(null);

    try {
      await api.uploadProjectZip(projectId, uploadFile);
      setUploadStatus('Extracted and configured successfully!');
      await refreshProjects();
      setTimeout(() => {
        setUploadingProjectId(null);
        setUploadFile(null);
        setUploadStatus(null);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
      setUploadStatus(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#D8E2EE]">
        <div>
          <h1 className="text-[32px] font-bold text-[#0F172A] tracking-tight">Project Management</h1>
          <p className="text-sm text-[#475569] mt-1">
            Register codebases, upload source code archives, and configure analysis scopes.
          </p>
        </div>
        <button
          onClick={() => {
            setError(null);
            setShowCreateModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg text-white bg-[#03162D] hover:bg-[#0A2548] transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>New Project</span>
        </button>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((p) => {
          const isActive = activeProject?.id === p.id;
          return (
            <div
              key={p.id}
              onClick={() => setActiveProject(p)}
              className={`rounded-[12px] border-2 p-6 flex flex-col justify-between transition-all duration-200 cursor-pointer select-none ${
                isActive
                  ? 'bg-gradient-to-b from-[#F0FDF9] to-white border-[#009F95] shadow-md ring-2 ring-[#009F95]/30'
                  : 'bg-white border-[#D8E2EE] hover:border-[#009F95]/60 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99]'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-[#F8FAFC] border border-[#D8E2EE] text-[#009F95]">
                      <FolderGit2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-[18px] font-semibold text-[#0F172A] leading-snug">{p.name}</h3>
                      <span className="text-xs font-mono text-[#475569] capitalize font-medium">
                        {p.primary_language}
                      </span>
                    </div>
                  </div>
                  {isActive ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#009F95] text-white shadow-xs">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Active
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded text-xs font-semibold text-[#475569] bg-[#F8FAFC] border border-[#D8E2EE]">
                      Tap to Select
                    </span>
                  )}
                </div>

                <p className="text-sm text-[#475569] mb-4 line-clamp-2 leading-relaxed">
                  {p.description || 'No description provided.'}
                </p>

                {/* Metrics pill summary */}
                <div className="grid grid-cols-3 gap-2 py-3 px-3 bg-[#F8FAFC] rounded-lg border border-[#D8E2EE] text-center mb-4 text-xs">
                  <div>
                    <span className="text-xs uppercase font-semibold text-[#475569] block">Scans</span>
                    <span className="font-bold text-[#0F172A] text-sm">{p.total_scans ?? 0}</span>
                  </div>
                  <div>
                    <span className="text-xs uppercase font-semibold text-[#475569] block">Compliance</span>
                    <span
                      className={`font-bold text-sm ${
                        (p.latest_compliance_percentage ?? 100) >= 90
                          ? 'text-[#10B981]'
                          : 'text-[#B45309]'
                      }`}
                    >
                      {p.latest_compliance_percentage !== undefined && p.latest_compliance_percentage !== null
                        ? `${p.latest_compliance_percentage}%`
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs uppercase font-semibold text-[#475569] block">Violations</span>
                    <span
                      className={`font-bold text-sm ${
                        (p.open_findings_count ?? 0) > 0 ? 'text-[#B42318]' : 'text-[#0F172A]'
                      }`}
                    >
                      {p.open_findings_count ?? 0}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-[#475569] space-y-1 mb-4">
                  <p className="truncate">
                    <span className="font-semibold text-[#0F172A]">Source:</span>{' '}
                    {p.repository_path ? p.repository_path : 'No source code uploaded'}
                  </p>
                  <p className="truncate">
                    <span className="font-semibold text-[#0F172A]">Dirs:</span> {p.source_dirs}
                  </p>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="pt-4 border-t border-[#D8E2EE] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveProject(p);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      isActive
                        ? 'bg-[#009F95] text-white shadow-xs border border-[#009F95]'
                        : 'bg-white border border-[#D8E2EE] text-[#0F172A] hover:bg-[#F0FDF9] hover:border-[#009F95] hover:text-[#009F95]'
                    }`}
                  >
                    {isActive ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Selected
                      </>
                    ) : (
                      'Select'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setUploadingProjectId(p.id);
                      setError(null);
                    }}
                    className="p-1.5 text-[#475569] hover:text-[#0F172A] hover:bg-[#F8FAFC] rounded-lg border border-transparent hover:border-[#D8E2EE] transition-colors"
                    title="Upload Source ZIP"
                  >
                    <Upload className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveProject(p);
                      navigate('/analyze');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-white bg-[#03162D] hover:bg-[#0A2548] transition-colors"
                  >
                    <PlayCircle className="h-4 w-4" />
                    <span>Scan</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(p.id, p.name);
                    }}
                    className="p-1.5 text-[#475569] hover:text-[#B42318] hover:bg-[#FEE2E2]/50 rounded-lg transition-colors"
                    title="Delete Project"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ZIP Upload Modal */}
      {uploadingProjectId && (
        <div className="fixed inset-0 z-50 bg-[#03162D]/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[10px] max-w-md w-full p-6 shadow-xl border border-[#D8E2EE]">
            <div className="flex items-center justify-between pb-3 border-b border-[#D8E2EE] mb-4">
              <h3 className="text-[18px] font-semibold text-[#0F172A]">Upload Source Code ZIP</h3>
              <button
                onClick={() => setUploadingProjectId(null)}
                className="text-[#475569] hover:text-[#0F172A]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="p-3 bg-[#FEE2E2] text-[#B42318] border border-[#FECACA] rounded-lg text-xs mb-4">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <p className="text-xs text-[#475569]">
                Upload a project ZIP archive. Unsafe path traversals and build folders will be safely filtered. Source code is analyzed statically and never executed.
              </p>

              <div className="border-2 border-dashed border-[#D8E2EE] rounded-[10px] p-6 text-center hover:border-[#009F95] transition-colors bg-[#F8FAFC]">
                <FileArchive className="h-8 w-8 text-[#475569] mx-auto mb-2" />
                <input
                  type="file"
                  id="zip-file"
                  accept=".zip"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <label
                  htmlFor="zip-file"
                  className="cursor-pointer text-xs font-semibold text-[#0F172A] hover:text-[#009F95]"
                >
                  {uploadFile ? uploadFile.name : 'Click to select ZIP archive'}
                </label>
                {uploadFile && (
                  <p className="text-xs text-[#475569] font-medium mt-1">
                    {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                )}
              </div>

              {uploadStatus && (
                <p className="text-xs text-[#10B981] font-semibold text-center">{uploadStatus}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUploadingProjectId(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-[#0F172A] bg-white border border-[#D8E2EE] hover:bg-[#F8FAFC] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!uploadFile || isSubmitting}
                  onClick={() => handleUploadZip(uploadingProjectId)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#03162D] hover:bg-[#0A2548] disabled:opacity-50 rounded-lg transition-colors"
                >
                  {isSubmitting ? 'Uploading...' : 'Confirm Upload'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-[#03162D]/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[10px] max-w-lg w-full p-6 shadow-xl border border-[#D8E2EE]">
            <div className="flex items-center justify-between pb-3 border-b border-[#D8E2EE] mb-4">
              <h3 className="text-[18px] font-semibold text-[#0F172A]">Register New Project</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-[#475569] hover:text-[#0F172A]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="p-3 bg-[#FEE2E2] text-[#B42318] border border-[#FECACA] rounded-lg text-xs mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div>
                <label className="block text-[15px] font-medium text-[#0F172A] mb-1">
                  Project Name <span className="text-[#B42318]">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Payments Gateway Microservice"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-[#D8E2EE] rounded-lg text-sm text-[#0F172A] focus:border-[#00D4C7] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[15px] font-medium text-[#0F172A] mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Brief summary of codebase domain and purpose..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-[#D8E2EE] rounded-lg text-sm text-[#0F172A] focus:border-[#00D4C7] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[15px] font-medium text-[#0F172A] mb-1">
                    Primary Language
                  </label>
                  <select
                    value={formData.primary_language}
                    onChange={(e) =>
                      setFormData({ ...formData, primary_language: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-white border border-[#D8E2EE] rounded-lg text-sm text-[#0F172A] focus:border-[#00D4C7] focus:outline-none"
                  >
                    <option value="python">Python (AST Supported)</option>
                    <option value="typescript">TypeScript (Conservative)</option>
                    <option value="javascript">JavaScript (Conservative)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[15px] font-medium text-[#0F172A] mb-1">Source Folders</label>
                  <input
                    type="text"
                    placeholder="app,src"
                    value={formData.source_dirs}
                    onChange={(e) => setFormData({ ...formData, source_dirs: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-[#D8E2EE] rounded-lg text-sm text-[#0F172A] focus:border-[#00D4C7] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[15px] font-medium text-[#0F172A] mb-1">
                  Excluded Directories
                </label>
                <input
                  type="text"
                  value={formData.exclude_dirs}
                  onChange={(e) => setFormData({ ...formData, exclude_dirs: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-[#D8E2EE] rounded-lg font-mono text-xs text-[#0F172A] focus:border-[#00D4C7] focus:outline-none"
                />
                <p className="text-[13px] text-[#475569] mt-1">
                  Comma-separated list of build, virtual environment, and test folders to skip.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#D8E2EE]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-[#0F172A] bg-white border border-[#D8E2EE] hover:bg-[#F8FAFC] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#03162D] hover:bg-[#0A2548] disabled:opacity-50 rounded-lg transition-colors"
                >
                  {isSubmitting ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
