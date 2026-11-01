import React, { useState, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Network,
  Search,
  AlertTriangle,
  CheckCircle2,
  Table as TableIcon,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { api } from '../api/client';
import { DependencyGraphResponse } from '../types';

export const DependencyGraphPage: React.FC = () => {
  const { latestScan } = useProject();

  const [graphData, setGraphData] = useState<DependencyGraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const rfInstanceRef = React.useRef<any>(null);

  // View mode: interactive visual graph vs accessible table alternative
  const [viewMode, setViewMode] = useState<'graph' | 'table'>('graph');

  // Filters
  const [selectedComponent, setSelectedComponent] = useState<string>('');
  const [violationsOnly, setViolationsOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected element inspection
  const [selectedElement, setSelectedElement] = useState<{
    type: 'node' | 'edge';
    data: any;
  } | null>(null);

  // React Flow state
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const loadGraph = useCallback(async () => {
    if (!latestScan) {
      setGraphData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await api.getScanGraph(latestScan.id);
      setGraphData(data);
    } catch (err: any) {
      console.error('Failed to load dependency graph:', err);
      setError(err.message || 'Failed to retrieve dependency graph from server.');
    } finally {
      setLoading(false);
    }
  }, [latestScan]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // Transform graphData into React Flow nodes and edges with auto-layout
  useEffect(() => {
    if (!graphData) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Filter nodes
    let filteredNodes = graphData.nodes;
    if (selectedComponent) {
      filteredNodes = filteredNodes.filter((n) => n.component === selectedComponent);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filteredNodes = filteredNodes.filter(
        (n) => n.label.toLowerCase().includes(q) || (n.component && n.component.toLowerCase().includes(q))
      );
    }
    if (violationsOnly) {
      filteredNodes = filteredNodes.filter((n) => n.is_violation);
    }

    const nodeIds = new Set(filteredNodes.map((n) => n.id));

    // Filter edges
    let filteredEdges = graphData.edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
    );
    if (violationsOnly) {
      filteredEdges = filteredEdges.filter((e) => e.is_violation);
    }

    // Assign positions in a layered / grid arrangement
    const components = graphData.components || [];
    const compXMap: Record<string, number> = {};
    components.forEach((c, idx) => {
      compXMap[c] = idx * 300;
    });

    const compYCounter: Record<string, number> = {};

    const rfNodes: Node[] = filteredNodes.map((n) => {
      const c = n.component || 'unmapped';
      const x = compXMap[c] !== undefined ? compXMap[c] : components.length * 300;
      const yCount = compYCounter[c] || 0;
      compYCounter[c] = yCount + 1;
      const y = yCount * 125 + 40;

      return {
        id: n.id,
        position: { x, y },
        data: {
          label: (
            <div className="p-3 text-left">
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-xs uppercase font-semibold text-[#475569] tracking-wide font-mono">
                  {n.component || 'Unmapped'}
                </span>
                {n.is_violation && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-[#FEE2E2] text-[#B42318] border border-[#FECACA]">
                    Violation
                  </span>
                )}
              </div>
              <p className="font-semibold text-sm text-[#0F172A] truncate max-w-[210px]">{n.label}</p>
              <div className="text-xs text-[#475569] mt-1 font-medium">
                {n.classes_count} classes • {n.functions_count} fn • {n.imports_count} imports
              </div>
            </div>
          ),
          raw: n,
        },
        style: {
          background: n.is_violation ? '#FEE2E2' : '#FFFFFF',
          border: n.is_violation ? '2px solid #B42318' : '1px solid #D8E2EE',
          borderRadius: '10px',
          boxShadow: 'none',
          width: 240,
        },
      };
    });

    const rfEdges: Edge[] = filteredEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: e.is_violation,
      style: {
        stroke: e.is_violation ? '#B42318' : '#475569',
        strokeWidth: e.is_violation ? 2.5 : 1.5,
        strokeDasharray: e.is_violation ? '5 5' : undefined,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: e.is_violation ? '#B42318' : '#475569',
        width: 16,
        height: 16,
      },
      data: { raw: e },
    }));

    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [graphData, selectedComponent, violationsOnly, searchQuery]);

  // Auto-fit view when nodes update or filters change
  useEffect(() => {
    if (rfInstanceRef.current && nodes.length > 0) {
      const timer = setTimeout(() => {
        rfInstanceRef.current?.fitView({ padding: 0.2, duration: 200 });
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [nodes.length, selectedComponent, violationsOnly]);

  const handleNodeClick = (_: any, node: Node) => {
    setSelectedElement({ type: 'node', data: node.data.raw });
  };

  const handleEdgeClick = (_: any, edge: Edge) => {
    setSelectedElement({ type: 'edge', data: edge.data?.raw });
  };

  // Filtered lists for table view
  const filteredNodesList = graphData
    ? graphData.nodes.filter((n) => {
        if (selectedComponent && n.component !== selectedComponent) return false;
        if (violationsOnly && !n.is_violation) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return n.label.toLowerCase().includes(q) || (n.component && n.component.toLowerCase().includes(q));
        }
        return true;
      })
    : [];

  const filteredNodeIds = new Set(filteredNodesList.map((n) => n.id));

  const filteredEdgesList = graphData
    ? graphData.edges.filter((e) => {
        if (!filteredNodeIds.has(e.source) || !filteredNodeIds.has(e.target)) return false;
        if (violationsOnly && !e.is_violation) return false;
        return true;
      })
    : [];

  if (!latestScan) {
    return (
      <div className="max-w-xl mx-auto mt-12 p-8 bg-white border border-[#D8E2EE] rounded-[10px] text-center">
        <Network className="h-12 w-12 text-[#475569] mx-auto mb-3" />
        <h2 className="text-[22px] font-semibold text-[#0F172A] mb-2">No Scan Available</h2>
        <p className="text-sm text-[#475569] mb-4">
          Run an architectural scan first to construct the dependency graph and view relationship models.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto flex flex-col min-h-[calc(100vh-8rem)]">
      {/* Header & Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#D8E2EE] shrink-0">
        <div>
          <h1 className="text-[32px] font-bold text-[#0F172A] tracking-tight">Interactive Dependency Graph</h1>
          <p className="text-sm text-[#475569] mt-1">
            Real module dependencies extracted from source code. Highlighted red edges indicate confirmed architectural drift violations.
          </p>
        </div>

        {/* View Mode Toggle & Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Accessible View Mode Switcher */}
          <div className="inline-flex rounded-lg border border-[#D8E2EE] p-0.5 bg-[#F8FAFC]" role="tablist" aria-label="Graph View Mode">
            <button
              role="tab"
              aria-selected={viewMode === 'graph'}
              onClick={() => setViewMode('graph')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                viewMode === 'graph'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              <Network className="h-4 w-4 text-[#009F95]" />
              <span>Visual Graph</span>
            </button>
            <button
              role="tab"
              aria-selected={viewMode === 'table'}
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                viewMode === 'table'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              <TableIcon className="h-4 w-4" />
              <span>Accessible Table View</span>
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="h-4 w-4 text-[#475569] absolute left-3 top-2.5" />
            <input
              type="text"
              aria-label="Filter modules by name or component"
              placeholder="Filter modules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 bg-white border border-[#D8E2EE] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:border-[#00D4C7] w-44 sm:w-56"
            />
          </div>

          {/* Component Filter */}
          <select
            aria-label="Filter by architectural component"
            value={selectedComponent}
            onChange={(e) => setSelectedComponent(e.target.value)}
            className="px-3 py-1.5 bg-white border border-[#D8E2EE] rounded-lg text-sm text-[#0F172A] font-medium cursor-pointer focus:outline-none focus:border-[#00D4C7]"
          >
            <option value="">All Components</option>
            {graphData?.components.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Violations Only Toggle */}
          <label className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[#D8E2EE] rounded-lg cursor-pointer select-none">
            <input
              type="checkbox"
              checked={violationsOnly}
              onChange={(e) => setViolationsOnly(e.target.checked)}
              className="rounded text-[#009F95] focus:ring-[#00D4C7] h-4 w-4"
            />
            <span className="text-sm text-[#0F172A] font-semibold">Violations Only</span>
          </label>
        </div>
      </div>

      {/* Visual Legend */}
      <div className="bg-white px-4 py-2.5 rounded-[10px] border border-[#D8E2EE] flex flex-wrap items-center justify-between text-xs gap-3">
        <span className="font-semibold text-[#0F172A] uppercase tracking-wide">Graph Legend:</span>
        <div className="flex flex-wrap items-center gap-4 text-[#475569]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-white border border-[#D8E2EE] inline-block" />
            <span className="text-[#0F172A] font-medium">Compliant Module</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-[#FEE2E2] border border-[#B42318] inline-block" />
            <span className="text-[#B42318] font-semibold">Drift Violation Module</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 h-0.5 bg-[#475569] inline-block" />
            <span className="text-[#0F172A] font-medium">Approved Dependency</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 h-0.5 bg-[#B42318] border-b border-dashed border-[#B42318] inline-block" />
            <span className="text-[#B42318] font-semibold">Forbidden Drift Edge</span>
          </span>
        </div>
      </div>

      {/* Main View Area */}
      {viewMode === 'graph' ? (
        /* Visual Graph Canvas & Evidence Sidebar */
        <div className="flex flex-col lg:flex-row gap-4 h-[650px] min-h-[600px] w-full bg-white rounded-[10px] border border-[#D8E2EE] overflow-hidden">
          {/* Canvas */}
          <div className="flex-1 h-full w-full relative min-h-[550px]" style={{ minHeight: '550px', height: '100%', width: '100%' }}>
            {/* Loading Indicator Overlay */}
            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-white/80 backdrop-blur-xs z-20 text-center">
                <div className="h-8 w-8 border-3 border-[#D8E2EE] border-t-[#009F95] rounded-full animate-spin mb-3" />
                <p className="text-xs font-semibold text-[#0F172A]">
                  Loading graph structure and dependency edges...
                </p>
              </div>
            )}

            {/* Error Overlay with Retry */}
            {error && !loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-white z-20 text-center">
                <AlertTriangle className="h-10 w-10 text-[#B42318] mb-2" />
                <h3 className="text-sm font-semibold text-[#0F172A]">Failed to Load Dependency Graph</h3>
                <p className="text-xs text-[#475569] max-w-sm mt-1 mb-4">{error}</p>
                <button
                  onClick={loadGraph}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#03162D] hover:bg-[#0A2548] rounded-lg transition-colors"
                >
                  Retry Loading Graph
                </button>
              </div>
            )}

            {/* Scan exists but contains no discovered modules */}
            {!loading && !error && graphData && graphData.nodes.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-white z-10 text-center">
                <AlertTriangle className="h-10 w-10 text-[#B45309] mb-2" />
                <h3 className="text-base font-semibold text-[#0F172A]">No Discovered Modules</h3>
                <p className="text-xs text-[#475569] max-w-sm mt-1">
                  The scan completed, but no Python modules were discovered in the configured project source paths.
                </p>
              </div>
            )}

            {/* Filter Empty State Overlay */}
            {!loading && !error && graphData && graphData.nodes.length > 0 && nodes.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-white/95 backdrop-blur-xs z-10 text-center">
                <CheckCircle2 className="h-10 w-10 text-[#10B981] mb-2" />
                <h3 className="text-sm font-semibold text-[#0F172A]">No Matching Modules</h3>
                <p className="text-xs text-[#475569] max-w-sm mt-1">
                  {violationsOnly
                    ? 'No architectural violations detected matching the selected filters.'
                    : 'No modules found matching your current filter query.'}
                </p>
                <button
                  onClick={() => {
                    setSelectedComponent('');
                    setSearchQuery('');
                    setViolationsOnly(false);
                  }}
                  className="mt-3 px-3.5 py-1.5 text-xs font-semibold text-[#0F172A] bg-white hover:bg-[#F8FAFC] rounded-lg border border-[#D8E2EE] transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            )}

            <ReactFlow
              key={latestScan?.id || 'graph-canvas'}
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              onEdgeClick={handleEdgeClick}
              onInit={(instance) => {
                rfInstanceRef.current = instance;
                setTimeout(() => instance.fitView({ padding: 0.2 }), 50);
              }}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.2}
              maxZoom={2.0}
              style={{ width: '100%', height: '100%', minHeight: '550px' }}
            >
              <Background color="#D8E2EE" gap={20} />
              <Controls />
            </ReactFlow>
          </div>

          {/* Inspector Sidebar */}
          <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-[#D8E2EE] p-4 bg-[#F8FAFC] flex flex-col justify-between shrink-0 overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#D8E2EE]">
                <h3 className="font-semibold text-sm uppercase tracking-wider text-[#0F172A]">
                  Element Inspector
                </h3>
                {selectedElement && (
                  <button
                    onClick={() => setSelectedElement(null)}
                    className="text-xs text-[#009F95] hover:text-[#0A2548] underline font-medium"
                  >
                    Clear selection
                  </button>
                )}
              </div>

              {selectedElement ? (
                selectedElement.type === 'node' ? (
                  /* Node Inspector */
                  <div className="space-y-3.5 bg-white p-4 rounded-[10px] border border-[#D8E2EE]">
                    <div>
                      <span className="text-xs uppercase font-semibold text-[#475569] block">
                        Discovered Module
                      </span>
                      <h4 className="font-semibold text-[#0F172A] text-base break-all mt-0.5">
                        {selectedElement.data.label}
                      </h4>
                    </div>

                    <div>
                      <span className="text-xs uppercase font-semibold text-[#475569] block">
                        Component Layer
                      </span>
                      <span className="inline-block mt-0.5 px-2 py-0.5 bg-[#F8FAFC] border border-[#D8E2EE] rounded font-semibold text-[#0F172A] text-sm capitalize">
                        {selectedElement.data.component || 'Unmapped'}
                      </span>
                    </div>

                    <div>
                      <span className="text-xs uppercase font-semibold text-[#475569] block">
                        File Path
                      </span>
                      <span className="font-mono text-xs text-[#475569] break-all block mt-0.5">
                        {selectedElement.data.file_path}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-[#D8E2EE] flex justify-between text-xs text-[#475569] font-medium">
                      <span>Classes: {selectedElement.data.classes_count}</span>
                      <span>Functions: {selectedElement.data.functions_count}</span>
                      <span>Imports: {selectedElement.data.imports_count}</span>
                    </div>

                    {selectedElement.data.is_violation && (
                      <div className="p-2.5 bg-[#FEE2E2] border border-[#FECACA] rounded text-[#B42318] font-semibold text-xs flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-[#B42318]" />
                        <span>Involved in one or more architectural drift violations.</span>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Edge Inspector */
                  <div className="space-y-3.5 bg-white p-4 rounded-[10px] border border-[#D8E2EE]">
                    <div>
                      <span className="text-xs uppercase font-semibold text-[#475569] block">
                        Dependency Edge
                      </span>
                      <div className="font-semibold text-[#0F172A] text-sm mt-1 bg-[#F8FAFC] p-2.5 rounded border border-[#D8E2EE]">
                        <p className="text-[#475569] truncate">{selectedElement.data.source}</p>
                        <p className="text-[#0F172A] font-bold text-center my-1 text-xs">↓ depends on</p>
                        <p className="text-[#0F172A] font-bold truncate">{selectedElement.data.target}</p>
                      </div>
                    </div>

                    {selectedElement.data.import_statement && (
                      <div>
                        <span className="text-xs uppercase font-semibold text-[#475569] block">
                          Source Import Statement
                        </span>
                        <pre className="p-2.5 bg-[#03162D] text-[#F8FAFC] rounded text-xs font-mono overflow-x-auto mt-1 border border-[#D8E2EE]">
                          {selectedElement.data.import_statement}
                        </pre>
                        {selectedElement.data.import_line && (
                          <p className="text-xs text-[#475569] font-medium mt-1">
                            Line {selectedElement.data.import_line}
                          </p>
                        )}
                      </div>
                    )}

                    {selectedElement.data.is_violation ? (
                      <div className="p-3 bg-[#FEE2E2] border border-[#FECACA] rounded text-[#B42318] text-xs space-y-1">
                        <div className="font-semibold flex items-center gap-1.5 text-[#B42318]">
                          <AlertTriangle className="h-4 w-4" />
                          <span>Forbidden Architectural Drift Violation</span>
                        </div>
                        {selectedElement.data.violation_rule_id && (
                          <p className="font-mono text-xs text-[#B42318] font-semibold">
                            Rule ID: {selectedElement.data.violation_rule_id}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="p-2.5 bg-[#E8F5E9] border border-[#C8E6C9] rounded text-[#10B981] text-xs font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-[#10B981]" />
                        <span>Permitted architectural relationship</span>
                      </div>
                    )}
                  </div>
                )
              ) : (
                <p className="text-sm text-[#475569] italic">
                  Select any node or dependency edge in the canvas to inspect code evidence and rules.
                </p>
              )}
            </div>

            <div className="text-xs text-[#475569] font-medium pt-3 border-t border-[#D8E2EE] mt-4">
              {graphData
                ? `${graphData.total_modules} modules, ${graphData.total_dependencies} dependencies, ${graphData.total_violations} violations`
                : ''}
            </div>
          </div>
        </div>
      ) : (
        /* Accessible Table Alternative View (WCAG 2.2 AA) */
        <div className="space-y-6">
          {/* Summary Banner */}
          <div className="bg-white p-6 rounded-[10px] border border-[#D8E2EE] flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-[#F8FAFC] rounded-lg border border-[#D8E2EE] flex items-center justify-center text-[#009F95]">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-[18px] font-semibold text-[#0F172A]">Accessible Dependency Data Tables</h2>
                <p className="text-sm text-[#475569]">
                  Full tabular alternative presenting all AST discovered modules, component boundaries, and import relationships.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm font-semibold text-[#0F172A]">
              <span className="px-3 py-1 bg-[#F8FAFC] rounded-lg border border-[#D8E2EE]">
                {filteredNodesList.length} Modules
              </span>
              <span className="px-3 py-1 bg-[#F8FAFC] rounded-lg border border-[#D8E2EE]">
                {filteredEdgesList.length} Dependencies
              </span>
              <span className="px-3 py-1 bg-[#FEE2E2] text-[#B42318] rounded-lg border border-[#FECACA]">
                {filteredEdgesList.filter((e) => e.is_violation).length} Violations
              </span>
            </div>
          </div>

          {/* Table 1: Modules */}
          <div className="bg-white rounded-[10px] border border-[#D8E2EE] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#D8E2EE] bg-[#F8FAFC] flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#0F172A]">
                1. Discovered Source Code Modules ({filteredNodesList.length})
              </h3>
              <span className="text-xs text-[#475569] font-medium">Screen reader accessible</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-[#0F172A]">
                <caption className="sr-only">List of discovered source code modules and their architectural layer mapping</caption>
                <thead className="bg-[#F8FAFC] text-xs font-semibold text-[#475569] uppercase tracking-wider border-b border-[#D8E2EE]">
                  <tr>
                    <th scope="col" className="px-4 py-3">Module Identifier</th>
                    <th scope="col" className="px-4 py-3">Architecture Component</th>
                    <th scope="col" className="px-4 py-3">File Path</th>
                    <th scope="col" className="px-4 py-3 text-center">Classes</th>
                    <th scope="col" className="px-4 py-3 text-center">Functions</th>
                    <th scope="col" className="px-4 py-3 text-center">Imports</th>
                    <th scope="col" className="px-4 py-3 text-right">Drift Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D8E2EE]">
                  {filteredNodesList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-[#475569] italic">
                        No modules match the current filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredNodesList.map((m) => (
                      <tr key={m.id} className="hover:bg-[#F8FAFC] transition-colors">
                        <td className="px-4 py-3 font-semibold text-[#0F172A] font-mono text-sm">
                          {m.label}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 bg-[#F8FAFC] border border-[#D8E2EE] rounded text-xs font-semibold text-[#0F172A] capitalize">
                            {m.component || 'Unmapped'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-[#475569]">
                          {m.file_path}
                        </td>
                        <td className="px-4 py-3 text-center font-medium text-[#0F172A]">{m.classes_count}</td>
                        <td className="px-4 py-3 text-center font-medium text-[#0F172A]">{m.functions_count}</td>
                        <td className="px-4 py-3 text-center font-medium text-[#0F172A]">{m.imports_count}</td>
                        <td className="px-4 py-3 text-right">
                          {m.is_violation ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEE2E2] text-[#B42318] border border-[#FECACA]">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Violation
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E8F5E9] text-[#10B981] border border-[#C8E6C9]">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Compliant
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Table 2: Dependency Edges */}
          <div className="bg-white rounded-[10px] border border-[#D8E2EE] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#D8E2EE] bg-[#F8FAFC] flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#0F172A]">
                2. Module Dependency Relationships & Violations ({filteredEdgesList.length})
              </h3>
              <span className="text-xs text-[#475569] font-medium">Directional import links</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-[#0F172A]">
                <caption className="sr-only">List of module dependencies and architectural violation status</caption>
                <thead className="bg-[#F8FAFC] text-xs font-semibold text-[#475569] uppercase tracking-wider border-b border-[#D8E2EE]">
                  <tr>
                    <th scope="col" className="px-4 py-3">Source Module (Caller)</th>
                    <th scope="col" className="px-4 py-3">Direction</th>
                    <th scope="col" className="px-4 py-3">Target Module (Callee)</th>
                    <th scope="col" className="px-4 py-3">Architecture Mapping</th>
                    <th scope="col" className="px-4 py-3">Import Statement & Line</th>
                    <th scope="col" className="px-4 py-3 text-right">Relationship Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D8E2EE]">
                  {filteredEdgesList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-[#475569] italic">
                        No dependency edges match the current filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredEdgesList.map((e) => (
                      <tr key={e.id} className={e.is_violation ? 'bg-[#FEE2E2]/30 hover:bg-[#FEE2E2]/50' : 'hover:bg-[#F8FAFC]'}>
                        <td className="px-4 py-3 font-semibold text-[#0F172A] font-mono text-sm">
                          {e.source}
                        </td>
                        <td className="px-4 py-3 text-[#475569] text-center font-bold">
                          <ArrowRight className="h-4 w-4 inline" />
                        </td>
                        <td className="px-4 py-3 font-semibold text-[#0F172A] font-mono text-sm">
                          {e.target}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#475569]">
                          <span className="font-semibold text-[#0F172A]">{e.source_component || 'Unmapped'}</span>
                          <span className="mx-1 text-[#475569]">→</span>
                          <span className="font-semibold text-[#0F172A]">{e.target_component || 'Unmapped'}</span>
                        </td>
                        <td className="px-4 py-3">
                          {e.import_statement ? (
                            <div className="font-mono text-xs bg-[#03162D] text-[#F8FAFC] px-2 py-1 rounded inline-block">
                              {e.import_statement}
                              {e.import_line && (
                                <span className="text-[#CBD5E1] ml-1.5">(Line {e.import_line})</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[#475569] italic text-xs">Direct reference</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {e.is_violation ? (
                            <div className="inline-block text-right">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEE2E2] text-[#B42318] border border-[#FECACA]">
                                <AlertTriangle className="h-3.5 w-3.5 text-[#B42318]" />
                                Drift Violation
                              </span>
                              {e.violation_rule_id && (
                                <p className="text-xs font-mono text-[#B42318] font-bold mt-0.5">
                                  Rule: {e.violation_rule_id}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E8F5E9] text-[#10B981] border border-[#C8E6C9]">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Approved
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
