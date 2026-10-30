from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime

class FindingBase(BaseModel):
    rule_id: str
    rule_type: str
    title: str
    explanation: str
    severity: str
    source_module: Optional[str] = None
    target_module: Optional[str] = None
    source_component: Optional[str] = None
    target_component: Optional[str] = None
    file_path: Optional[str] = None
    line_number: Optional[int] = None
    expected_behavior: Optional[str] = None
    actual_behavior: Optional[str] = None
    evidence: Optional[str] = None
    confidence: str = "high"
    remediation: Optional[str] = None
    status: str = "open"
    exception_reason: Optional[str] = None

class FindingResponse(FindingBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scan_id: str
    project_id: str
    first_detected_at: datetime
    last_detected_at: datetime
    created_at: datetime
    updated_at: datetime

class FindingStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(open|acknowledged|resolved|accepted_exception)$")
    reason: Optional[str] = Field(None, description="Reason for status change, required for accepted_exception")

class FindingAuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    finding_id: str
    previous_status: str
    new_status: str
    reason: Optional[str] = None
    created_at: datetime

class FindingDetailResponse(FindingResponse):
    audit_logs: List[FindingAuditLogResponse] = Field(default_factory=list)
