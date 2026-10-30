from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime
from backend.app.schemas.finding import FindingResponse

class ScanRunCreate(BaseModel):
    project_id: str
    architecture_id: Optional[str] = None
    source_version: Optional[str] = None

class ScanRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    architecture_id: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    files_analyzed: int
    modules_discovered: int
    dependencies_discovered: int
    total_findings: int
    critical_findings: int
    high_findings: int
    medium_findings: int
    low_findings: int
    compliance_percentage: float
    source_version: Optional[str] = None
    duration_ms: int
    started_at: datetime
    completed_at: Optional[datetime] = None
    created_at: datetime

class DiscoveredModuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    module_name: str
    file_path: str
    component_name: Optional[str] = None
    classes_count: int
    functions_count: int
    imports_count: int

class DependencyRelationshipResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_module: str
    target_module: str
    source_component: Optional[str] = None
    target_component: Optional[str] = None
    import_line: Optional[int] = None
    import_statement: Optional[str] = None
    is_violation: bool
    violation_rule_id: Optional[str] = None

class GraphNode(BaseModel):
    id: str
    label: str
    component: Optional[str] = None
    layer: Optional[int] = None
    node_type: str = "module"  # module, component
    file_path: Optional[str] = None
    is_violation: bool = False
    classes_count: int = 0
    functions_count: int = 0
    imports_count: int = 0

class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    source_component: Optional[str] = None
    target_component: Optional[str] = None
    is_violation: bool = False
    violation_rule_id: Optional[str] = None
    import_line: Optional[int] = None
    import_statement: Optional[str] = None
    edge_type: str = "actual"  # actual, intended, forbidden

class DependencyGraphResponse(BaseModel):
    scan_id: str
    project_id: str
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    components: List[str]
    total_modules: int
    total_dependencies: int
    total_violations: int

class ScanComparisonResponse(BaseModel):
    scan_a: ScanRunResponse
    scan_b: ScanRunResponse
    new_findings: List[FindingResponse]
    resolved_findings: List[FindingResponse]
    persistent_findings: List[FindingResponse]
    compliance_delta: float
    findings_delta: int
