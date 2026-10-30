from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from backend.app.schemas.scan import ScanRunResponse
from backend.app.schemas.finding import FindingResponse

class TrendPoint(BaseModel):
    timestamp: str
    scan_id: str
    compliance_percentage: float
    total_findings: int
    critical_findings: int
    high_findings: int

class ViolatedRuleStat(BaseModel):
    rule_id: str
    rule_type: str
    severity: str
    count: int
    description: str

class ComponentComplianceStat(BaseModel):
    component: str
    layer: Optional[int] = None
    modules_count: int
    incoming_dependencies: int
    outgoing_dependencies: int
    violations_count: int
    is_compliant: bool

class ProjectOverviewMetrics(BaseModel):
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    total_projects: int = 0
    total_scans: int = 0
    total_findings: int = 0
    critical_findings: int = 0
    high_findings: int = 0
    medium_findings: int = 0
    low_findings: int = 0
    compliance_percentage: float = 100.0
    latest_scan: Optional[ScanRunResponse] = None
    severity_distribution: Dict[str, int] = {}
    trends: List[TrendPoint] = []
    top_violated_rules: List[ViolatedRuleStat] = []
    component_stats: List[ComponentComplianceStat] = []

class ReportExportRequest(BaseModel):
    scan_id: str
    format: str = "json"  # json, csv
