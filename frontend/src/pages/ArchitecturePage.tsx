import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers,
  Save,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Check,
  ArrowRight,
  RefreshCw,
  FileCode,
  Shield,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useProject } from '../context/ProjectContext';
import { api } from '../api/client';
import { ArchitectureDefinition, ComponentDef, RuleDef } from '../types';

export const ArchitecturePage: React.FC = () => {
  const navigate = useNavigate();
  const {
    activeProject,
    activeArchitecture,
    architectureList,
    refreshArchitectures,
    activateProjectArchitecture,
    isArchLoading,
  } = useProject();

  const [activeTab, setActiveTab] = useState<'visual' | 'code'>('visual');
  const [format, setFormat] = useState<'json' | 'yaml'>('json');
  const [rawContent, setRawContent] = useState('');
  const [selectedArchId, setSelectedArchId] = useState<string | null>(null);

  // Visual Form State
  const [archName, setArchName] = useState('Standard Layered Architecture');
  const [archDescription, setArchDescription] = useState('Enforce strict separation between presentation, service, and repository layers');
  const [components, setComponents] = useState<ComponentDef[]>([]);
  const [rules, setRules] = useState<RuleDef[]>([]);

  const [validationResult, setValidationResult] = useState<{
    is_valid: boolean;
    errors: string[];
    warnings: string[];
  } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper to load template into state
  const loadTemplate = async (templateKey: string) => {
    try {
      setError(null);
      const templates = await api.getArchitectureTemplates();
      const tmpl = templates[templateKey];
      if (tmpl) {
        setArchName(tmpl.name);
        setArchDescription(tmpl.description || '');
        setComponents(tmpl.components || []);
        setRules(tmpl.rules || []);
        setRawContent(JSON.stringify(tmpl, null, 2));
        setValidationResult({ is_valid: true, errors: [], warnings: [] });
      }
    } catch (err: any) {
      console.error('Failed to load template:', err);
      setError(err.message || 'Failed to load template');
    }
  };

  // Populate form from an architecture definition
  const populateFromDefinition = useCallback((arch: ArchitectureDefinition) => {
    setSelectedArchId(arch.id);
    setArchName(arch.name);
    setArchDescription(arch.description || '');
    setFormat(arch.format || 'json');
    setRawContent(arch.raw_content);
    setComponents(arch.components || []);
    setRules(arch.rules || []);
    setValidationResult(null);
    setError(null);
  }, []);

  // Synchronize when project or architecture list changes
  useEffect(() => {
    if (!activeProject) {
      setSelectedArchId(null);
      return;
    }

    if (architectureList.length > 0) {
      const current = architectureList.find((a) => a.id === selectedArchId)
        || activeArchitecture
        || architectureList[0];
      if (current) {
        populateFromDefinition(current);
      }
    } else if (!isArchLoading) {
      setSelectedArchId(null);
      loadTemplate('layered');
    }
  }, [activeProject?.id, architectureList, activeArchitecture?.id]);

  const handleSelectDefinition = (id: string) => {
    const found = architectureList.find((a) => a.id === id);
    if (found) {
      populateFromDefinition(found);
    }
  };

  const handleNewDefinition = () => {
    setSelectedArchId(null);
    setArchName(`${activeProject?.name || 'Project'} Architecture Policy`);
    setArchDescription('Approved architectural boundaries and drift rules');
    loadTemplate('layered');
  };

  const handleActivate = async () => {
    if (!selectedArchId) return;
    setIsActivating(true);
    setError(null);
    try {
      await activateProjectArchitecture(selectedArchId);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to activate architecture');
    } finally {
      setIsActivating(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedArchId) return;
    const confirmed = window.confirm('Are you sure you want to delete this architecture definition?');
    if (!confirmed) return;

    setIsDeleting(true);
    setError(null);
    try {
      await api.deleteArchitecture(selectedArchId);
      if (activeProject) {
        const remaining = await refreshArchitectures(activeProject.id);
        if (remaining.length > 0) {
          populateFromDefinition(remaining[0]);
        } else {
          setSelectedArchId(null);
          loadTemplate('layered');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete architecture');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleValidate = async (contentToValidate?: string) => {
    try {
      setError(null);
      const text = contentToValidate || rawContent;
      const res = await api.validateArchitecture(text, format);
      setValidationResult(res);
      return res.is_valid;
    } catch (err: any) {
      setValidationResult({
        is_valid: false,
        errors: [err.message || 'Validation request failed'],
        warnings: [],
      });
      return false;
    }
  };

  const handleSwitchTab = (tab: 'visual' | 'code') => {
    if (tab === 'code' && activeTab === 'visual') {
      const fullObj = {
        name: archName,
        description: archDescription,
        components: components.map((c) => ({
          name: c.name,
          layer: c.layer,
          description: c.description || undefined,
          path_patterns: c.path_patterns,
          allowed_dependencies: c.allowed_dependencies || [],
          forbidden_dependencies: c.forbidden_dependencies || [],
          required_dependencies: c.required_dependencies || [],
        })),
        rules: rules.map((r) => ({
          id: r.id,
          type: r.type,
          description: r.description,
          severity: r.severity,
          from_component: r.from_component || undefined,
          to_component: r.to_component || undefined,
          target_module: r.target_module || undefined,
        })),
      };
      setRawContent(JSON.stringify(fullObj, null, 2));
    } else if (tab === 'visual' && activeTab === 'code') {
      try {
        const parsed = JSON.parse(rawContent);
        if (parsed.name) setArchName(parsed.name);
        if (parsed.description !== undefined) setArchDescription(parsed.description);
        if (Array.isArray(parsed.components)) setComponents(parsed.components);
        if (Array.isArray(parsed.rules)) setRules(parsed.rules);
      } catch {
        // Keep visual if parse fails
      }
    }
    setActiveTab(tab);
  };

  const handleSave = async () => {
    if (!activeProject) {
      setError('Please select or create a project first.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      let finalContent = rawContent;
      if (activeTab === 'visual') {
        const fullObj = {
          name: archName,
          description: archDescription,
          components: components.map((c) => ({
            name: c.name,
            layer: c.layer,
            description: c.description || undefined,
            path_patterns: c.path_patterns,
            allowed_dependencies: c.allowed_dependencies || [],
            forbidden_dependencies: c.forbidden_dependencies || [],
            required_dependencies: c.required_dependencies || [],
          })),
          rules: rules.map((r) => ({
            id: r.id,
            type: r.type,
            description: r.description,
            severity: r.severity,
            from_component: r.from_component || undefined,
            to_component: r.to_component || undefined,
            target_module: r.target_module || undefined,
          })),
        };
        finalContent = JSON.stringify(fullObj, null, 2);
      }

      const isValid = await handleValidate(finalContent);
      if (!isValid) {
        setIsSaving(false);
        return;
      }

      const created = await api.createArchitecture({
        project_id: activeProject.id,
        name: archName,
        format,
        raw_content: finalContent,
      });

      const updatedList = await refreshArchitectures(activeProject.id);
      const activeMatch = updatedList.find((a) => a.id === created.id) || created;
      populateFromDefinition(activeMatch);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to save architecture definition');
    } finally {
      setIsSaving(false);
    }
  };

  // Visual Component Helpers
  const addComponent = () => {
    const newComp: ComponentDef = {
      name: `component_${components.length + 1}`,
      layer: components.length + 1,
      description: '',
      path_patterns: [],
      allowed_dependencies: [],
      forbidden_dependencies: [],
      required_dependencies: [],
    };
    setComponents([...components, newComp]);
  };

  const removeComponent = (idx: number) => {
    setComponents(components.filter((_, i) => i !== idx));
  };

  const addRule = () => {
    const newRule: RuleDef = {
      id: `RULE-${rules.length + 1}`,
      type: 'forbidden_dependency',
      description: 'Forbidden dependency rule',
      severity: 'high',
      from_component: components[0]?.name || '',
      to_component: components[1]?.name || '',
    };
    setRules([...rules, newRule]);
  };

  const removeRule = (idx: number) => {
    setRules(rules.filter((_, i) => i !== idx));
  };

  if (!activeProject) {
    return (
      <div className="max-w-xl mx-auto mt-12 p-8 bg-white border border-[#D8E2EE] rounded-[10px] text-center">
        <Layers className="h-12 w-12 text-[#475569] mx-auto mb-3" />
        <h2 className="text-[22px] font-semibold text-[#0F172A] mb-2">No Project Selected</h2>
        <p className="text-sm text-[#475569] mb-4">
          Please select or register a project from the top bar before configuring architecture definitions.
        </p>
      </div>
    );
  }

  const selectedArch = architectureList.find((a) => a.id === selectedArchId);
  const isSelectedActive = selectedArch?.is_active || (activeArchitecture?.id === selectedArchId);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#D8E2EE]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[32px] font-bold text-[#0F172A] tracking-tight">Architecture Definition</h1>
            <span className="text-xs px-3 py-1 rounded-full font-semibold bg-[#EFF6FF] text-[#175CD3] border border-[#BFDBFE]">
              Project: {activeProject.name}
            </span>
          </div>
          <p className="text-sm text-[#475569] mt-1">
            Define approved component boundaries, layer directions, and forbidden dependency policies.
          </p>
        </div>

        {/* Global Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-[#F8FAFC] p-1.5 rounded-lg border border-[#D8E2EE] text-xs">
            <span className="text-[#475569] font-semibold px-2 uppercase tracking-wide">Templates:</span>
            <button
              onClick={() => loadTemplate('layered')}
              className="px-3 py-1.5 bg-white hover:bg-[#F8FAFC] text-[#0F172A] font-semibold rounded-lg border border-[#D8E2EE] transition-colors"
            >
              Layered
            </button>
            <button
              onClick={() => loadTemplate('clean')}
              className="px-3 py-1.5 bg-white hover:bg-[#F8FAFC] text-[#0F172A] font-semibold rounded-lg border border-[#D8E2EE] transition-colors"
            >
              Clean / Hex
            </button>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg text-white bg-[#03162D] hover:bg-[#0A2548] disabled:opacity-50 transition-colors"
          >
            <Save className="h-4 w-4" />
            <span>{isSaving ? 'Saving Policy...' : 'Save Definition'}</span>
          </button>
        </div>
      </div>

      {/* Version & Policy Management Bar */}
      <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-[#475569]">
            <Shield className="h-5 w-5 text-[#009F95]" />
            <span className="text-sm font-semibold text-[#0F172A]">Policy Version:</span>
          </div>

          {architectureList.length > 0 ? (
            <select
              value={selectedArchId || ''}
              onChange={(e) => handleSelectDefinition(e.target.value)}
              className="px-3.5 py-2 bg-white border border-[#D8E2EE] rounded-lg text-sm font-semibold text-[#0F172A] focus:border-[#00D4C7] focus:outline-none cursor-pointer"
            >
              {architectureList.map((arch) => (
                <option key={arch.id} value={arch.id}>
                  v{arch.version} — {arch.name} {arch.is_active ? '★ (Active)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-[#B45309] font-semibold bg-[#FEF3C7] px-3 py-1.5 rounded-lg border border-[#FDE68A]">
              No saved definitions yet for {activeProject.name}
            </span>
          )}

          {selectedArch && (
            <div className="flex items-center gap-2">
              {isSelectedActive ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#E8F5E9] text-[#10B981] border border-[#C8E6C9]">
                  <Check className="h-3.5 w-3.5" /> Active Policy
                </span>
              ) : (
                <button
                  onClick={handleActivate}
                  disabled={isActivating}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-[#0F172A] bg-[#F8FAFC] hover:bg-[#D8E2EE] border border-[#D8E2EE] transition-colors"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isActivating ? 'animate-spin' : ''}`} />
                  <span>Set as Active Policy</span>
                </button>
              )}

              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="p-2 text-[#475569] hover:text-[#B42318] hover:bg-[#FEE2E2]/50 rounded-lg transition-colors border border-transparent hover:border-[#FECACA]"
                title="Delete definition"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleNewDefinition}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-[#0F172A] bg-white hover:bg-[#F8FAFC] border border-[#D8E2EE] transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>New Version</span>
          </button>

          {activeArchitecture && (
            <button
              onClick={() => navigate('/analyze')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#03162D] hover:bg-[#0A2548] transition-colors"
            >
              <span>Scan Drift</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {saveSuccess && (
        <div className="p-4 bg-[#E8F5E9] border border-[#C8E6C9] text-[#10B981] rounded-[10px] text-sm flex items-center justify-between gap-3 font-medium">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-[#10B981] shrink-0" />
            <span>Architecture definition successfully saved and activated for <strong>{activeProject.name}</strong>!</span>
          </div>
          <button
            onClick={() => navigate('/analyze')}
            className="inline-flex items-center gap-1 text-sm font-semibold text-[#10B981] underline hover:no-underline"
          >
            Go to Analyze Drift <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-[#FEE2E2] border border-[#FECACA] text-[#B42318] rounded-[10px] text-sm flex items-center gap-2.5 font-medium">
          <AlertCircle className="h-5 w-5 text-[#B42318] shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Editor Tabs */}
      <div className="flex items-center justify-between border-b border-[#D8E2EE]">
        <div className="flex space-x-8 text-base font-semibold">
          <button
            onClick={() => handleSwitchTab('visual')}
            className={`pb-3 border-b-2 transition-colors ${
              activeTab === 'visual'
                ? 'border-[#009F95] text-[#009F95]'
                : 'border-transparent text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <span className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Visual Rule Builder
            </span>
          </button>
          <button
            onClick={() => handleSwitchTab('code')}
            className={`pb-3 border-b-2 transition-colors ${
              activeTab === 'code'
                ? 'border-[#009F95] text-[#009F95]'
                : 'border-transparent text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <span className="flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              JSON / YAML Policy Definition
            </span>
          </button>
        </div>

        {activeTab === 'code' && (
          <div className="flex items-center gap-3 mb-2">
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as 'json' | 'yaml')}
              className="text-xs font-semibold bg-white border border-[#D8E2EE] rounded-lg px-3 py-1.5 text-[#0F172A] cursor-pointer"
            >
              <option value="json">JSON Format</option>
              <option value="yaml">YAML Format</option>
            </select>
            <button
              onClick={() => handleValidate()}
              className="px-3 py-1.5 text-xs font-semibold text-[#0F172A] bg-white border border-[#D8E2EE] rounded-lg hover:bg-[#F8FAFC]"
            >
              Validate Syntax
            </button>
          </div>
        )}
      </div>

      {/* Visual Editor Mode */}
      {activeTab === 'visual' ? (
        <div className="space-y-6">
          {/* Metadata */}
          <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE] grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#0F172A] mb-1.5">
                Architecture Policy Name
              </label>
              <input
                type="text"
                value={archName}
                onChange={(e) => setArchName(e.target.value)}
                className="w-full px-3.5 py-2 bg-white border border-[#D8E2EE] rounded-lg text-sm font-semibold text-[#0F172A] focus:border-[#00D4C7] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#0F172A] mb-1.5">
                Policy Description
              </label>
              <input
                type="text"
                value={archDescription}
                onChange={(e) => setArchDescription(e.target.value)}
                placeholder="e.g. Standard layered boundary policy"
                className="w-full px-3.5 py-2 bg-white border border-[#D8E2EE] rounded-lg text-sm text-[#0F172A] focus:border-[#00D4C7] focus:outline-none"
              />
            </div>
          </div>

          {/* Components Section */}
          <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#D8E2EE]">
              <div>
                <h3 className="text-[18px] font-semibold text-[#0F172A]">Architectural Components</h3>
                <p className="text-sm text-[#475569]">Modules and packages mapping to system layers</p>
              </div>
              <button
                onClick={addComponent}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg text-[#0F172A] bg-white hover:bg-[#F8FAFC] border border-[#D8E2EE] transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Add Component</span>
              </button>
            </div>

            <div className="space-y-4">
              {components.map((comp, idx) => (
                <div
                  key={idx}
                  className="p-5 rounded-[10px] border border-[#D8E2EE] bg-[#F8FAFC] space-y-4 text-sm"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-[#0F172A] mb-1">
                        Component Name
                      </label>
                      <input
                        type="text"
                        value={comp.name}
                        onChange={(e) => {
                          const updated = [...components];
                          updated[idx].name = e.target.value;
                          setComponents(updated);
                        }}
                        className="w-full px-3 py-2 bg-white border border-[#D8E2EE] rounded-lg text-sm font-semibold text-[#0F172A] focus:outline-none focus:border-[#00D4C7]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-[#0F172A] mb-1">
                        Layer (1 = outer)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={comp.layer || ''}
                        onChange={(e) => {
                          const updated = [...components];
                          updated[idx].layer = parseInt(e.target.value) || undefined;
                          setComponents(updated);
                        }}
                        className="w-full px-3 py-2 bg-white border border-[#D8E2EE] rounded-lg text-sm font-semibold text-[#0F172A] focus:outline-none focus:border-[#00D4C7]"
                      />
                    </div>
                    <div className="sm:col-span-2 flex items-end justify-between gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-semibold uppercase tracking-wide text-[#0F172A] mb-1">
                          Path Patterns (comma-separated globs)
                        </label>
                        <input
                          type="text"
                          value={comp.path_patterns.join(', ')}
                          onChange={(e) => {
                            const updated = [...components];
                            updated[idx].path_patterns = e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean);
                            setComponents(updated);
                          }}
                          placeholder="e.g. presentation/**, api/**, src/presentation/**"
                          className="w-full px-3 py-2 bg-white border border-[#D8E2EE] rounded-lg font-mono text-xs font-medium text-[#0F172A] focus:outline-none focus:border-[#00D4C7]"
                        />
                      </div>
                      <button
                        onClick={() => removeComponent(idx)}
                        className="p-2 text-[#475569] hover:text-[#B42318] rounded-lg hover:bg-[#FEE2E2]/50 transition-colors"
                        title="Remove Component"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Allowed / Forbidden Dependencies */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-[#D8E2EE]">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569] mb-1">
                        Allowed Dependencies (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={comp.allowed_dependencies.join(', ')}
                        onChange={(e) => {
                          const updated = [...components];
                          updated[idx].allowed_dependencies = e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean);
                          setComponents(updated);
                        }}
                        placeholder="e.g. application, domain, service"
                        className="w-full px-3 py-1.5 bg-white border border-[#D8E2EE] rounded-lg text-xs font-semibold text-[#0F172A] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[#B42318] mb-1">
                        Forbidden Dependencies (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={comp.forbidden_dependencies.join(', ')}
                        onChange={(e) => {
                          const updated = [...components];
                          updated[idx].forbidden_dependencies = e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean);
                          setComponents(updated);
                        }}
                        placeholder="e.g. infrastructure, presentation, repository"
                        className="w-full px-3 py-1.5 bg-white border border-[#D8E2EE] rounded-lg text-xs font-semibold text-[#0F172A] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Rules Section */}
          <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#D8E2EE]">
              <div>
                <h3 className="text-[18px] font-semibold text-[#0F172A]">Drift Detection Rules</h3>
                <p className="text-sm text-[#475569]">Cross-cutting layer, cyclic, and architectural policies</p>
              </div>
              <button
                onClick={addRule}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg text-[#0F172A] bg-white hover:bg-[#F8FAFC] border border-[#D8E2EE] transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Add Rule</span>
              </button>
            </div>

            <div className="space-y-4">
              {rules.map((rule, idx) => (
                <div
                  key={idx}
                  className="p-5 rounded-[10px] border border-[#D8E2EE] bg-[#F8FAFC] space-y-3.5 text-sm"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-[#0F172A] mb-1">
                        Rule ID
                      </label>
                      <input
                        type="text"
                        value={rule.id}
                        onChange={(e) => {
                          const updated = [...rules];
                          updated[idx].id = e.target.value;
                          setRules(updated);
                        }}
                        className="w-full px-3 py-1.5 bg-white border border-[#D8E2EE] rounded-lg font-mono text-xs font-semibold text-[#0F172A] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-[#0F172A] mb-1">
                        Rule Type
                      </label>
                      <select
                        value={rule.type}
                        onChange={(e) => {
                          const updated = [...rules];
                          updated[idx].type = e.target.value;
                          setRules(updated);
                        }}
                        className="w-full px-3 py-1.5 bg-white border border-[#D8E2EE] rounded-lg text-xs font-semibold text-[#0F172A] focus:outline-none cursor-pointer"
                      >
                        <option value="layer_direction">Layer Direction</option>
                        <option value="forbidden_dependency">Forbidden Dependency</option>
                        <option value="forbidden_import">Forbidden External Import</option>
                        <option value="circular_dependency">Circular Dependency</option>
                        <option value="unexpected_dependency">Unexpected Dependency</option>
                        <option value="unmapped_module">Unmapped Module</option>
                        <option value="missing_component">Missing Component</option>
                        <option value="adr_violation">Architecture Decision (ADR)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-[#0F172A] mb-1">
                        Severity
                      </label>
                      <select
                        value={rule.severity}
                        onChange={(e) => {
                          const updated = [...rules];
                          updated[idx].severity = e.target.value as any;
                          setRules(updated);
                        }}
                        className="w-full px-3 py-1.5 bg-white border border-[#D8E2EE] rounded-lg text-xs font-semibold text-[#0F172A] focus:outline-none cursor-pointer"
                      >
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => removeRule(idx)}
                        className="p-2 text-[#475569] hover:text-[#B42318] rounded-lg hover:bg-[#FEE2E2]/50 transition-colors"
                        title="Remove Rule"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Contextual Rule Target Fields */}
                  {(rule.type === 'forbidden_dependency' || rule.type === 'layer_direction') && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#D8E2EE]">
                      <div>
                        <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                          From Component (Source)
                        </label>
                        <input
                          type="text"
                          value={rule.from_component || ''}
                          onChange={(e) => {
                            const updated = [...rules];
                            updated[idx].from_component = e.target.value;
                            setRules(updated);
                          }}
                          placeholder="e.g. presentation, repository"
                          className="w-full px-3 py-1.5 bg-white border border-[#D8E2EE] rounded-lg text-xs font-mono font-semibold text-[#0F172A] focus:outline-none"
                          list="component-names"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                          To Component (Target)
                        </label>
                        <input
                          type="text"
                          value={rule.to_component || ''}
                          onChange={(e) => {
                            const updated = [...rules];
                            updated[idx].to_component = e.target.value;
                            setRules(updated);
                          }}
                          placeholder="e.g. repository, presentation"
                          className="w-full px-3 py-1.5 bg-white border border-[#D8E2EE] rounded-lg text-xs font-mono font-semibold text-[#0F172A] focus:outline-none"
                          list="component-names"
                        />
                      </div>
                    </div>
                  )}

                  {rule.type === 'forbidden_import' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#D8E2EE]">
                      <div>
                        <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                          From Component
                        </label>
                        <input
                          type="text"
                          value={rule.from_component || ''}
                          onChange={(e) => {
                            const updated = [...rules];
                            updated[idx].from_component = e.target.value;
                            setRules(updated);
                          }}
                          placeholder="e.g. presentation or domain"
                          className="w-full px-3 py-1.5 bg-white border border-[#D8E2EE] rounded-lg text-xs font-mono font-semibold text-[#0F172A] focus:outline-none"
                          list="component-names"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#B42318] mb-1">
                          Forbidden Module / Package Target
                        </label>
                        <input
                          type="text"
                          value={rule.target_module || ''}
                          onChange={(e) => {
                            const updated = [...rules];
                            updated[idx].target_module = e.target.value;
                            setRules(updated);
                          }}
                          placeholder="e.g. requests, urllib3, subprocess"
                          className="w-full px-3 py-1.5 bg-white border border-[#D8E2EE] rounded-lg text-xs font-mono font-bold text-[#B42318] focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {rule.type === 'circular_dependency' && (
                    <div className="pt-1 text-xs text-[#475569] font-medium italic">
                      Detects cyclical coupling across all defined architectural components and system layers.
                    </div>
                  )}

                  <datalist id="component-names">
                    {components.map((c, i) => (
                      <option key={i} value={c.name} />
                    ))}
                  </datalist>

                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Plain-Language Description & Remediation Advice
                    </label>
                    <input
                      type="text"
                      value={rule.description}
                      onChange={(e) => {
                        const updated = [...rules];
                        updated[idx].description = e.target.value;
                        setRules(updated);
                      }}
                      className="w-full px-3 py-1.5 bg-white border border-[#D8E2EE] rounded-lg text-xs text-[#0F172A] focus:outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Code Editor Mode */
        <div className="space-y-4">
          <div className="bg-[#03162D] rounded-[10px] border border-[#D8E2EE] shadow-none overflow-hidden">
            <textarea
              rows={24}
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              className="w-full p-5 font-mono text-sm leading-relaxed text-[#F8FAFC] bg-[#03162D] focus:outline-none resize-y"
              spellCheck={false}
            />
          </div>

          {validationResult && (
            <div
              className={`p-4 rounded-[10px] border text-sm font-medium ${
                validationResult.is_valid
                  ? 'bg-[#E8F5E9] border-[#C8E6C9] text-[#10B981]'
                  : 'bg-[#FEE2E2] border-[#FECACA] text-[#B42318]'
              }`}
            >
              {validationResult.is_valid ? (
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-5 w-5 text-[#10B981]" />
                  <span className="font-semibold">Definition syntax and component schema are fully valid!</span>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 font-semibold mb-1.5">
                    <AlertCircle className="h-5 w-5 text-[#B42318]" />
                    <span>Schema Validation Errors:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 font-mono text-xs">
                    {validationResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
