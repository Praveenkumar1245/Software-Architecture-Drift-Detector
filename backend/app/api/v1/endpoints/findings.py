from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from backend.app.core.database import get_db
from backend.app.api.deps import get_current_user
from backend.app.models.user import User
from backend.app.models.finding import Finding, FindingAuditLog
from backend.app.models.scan import ScanRun
from backend.app.models.project import Project
from backend.app.schemas.finding import (
    FindingResponse,
    FindingDetailResponse,
    FindingStatusUpdate,
    FindingAuditLogResponse
)

router = APIRouter(tags=["Findings"])

def verify_user_project(db: Session, project_id: str, user_id: str) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or (project.user_id is not None and project.user_id != user_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.get("/scans/{scan_id}/findings", response_model=List[FindingResponse])
def list_scan_findings(
    scan_id: str,
    severity: Optional[str] = Query(None, pattern="^(critical|high|medium|low)$"),
    status: Optional[str] = Query(None, pattern="^(open|acknowledged|resolved|accepted_exception)$"),
    rule_type: Optional[str] = None,
    component: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve all findings for a scan with filtering options."""
    scan = db.query(ScanRun).filter(ScanRun.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    verify_user_project(db, scan.project_id, current_user.id)

    query = db.query(Finding).filter(Finding.scan_id == scan_id)

    if severity:
        query = query.filter(Finding.severity == severity)
    if status:
        query = query.filter(Finding.status == status)
    if rule_type:
        query = query.filter(Finding.rule_type == rule_type)
    if component:
        query = query.filter((Finding.source_component == component) | (Finding.target_component == component))
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            (Finding.title.ilike(search_pattern)) |
            (Finding.explanation.ilike(search_pattern)) |
            (Finding.source_module.ilike(search_pattern)) |
            (Finding.target_module.ilike(search_pattern))
        )

    return query.order_by(
        desc(Finding.severity == "critical"),
        desc(Finding.severity == "high"),
        desc(Finding.severity == "medium"),
        desc(Finding.created_at)
    ).all()

@router.get("/findings/{finding_id}", response_model=FindingDetailResponse)
def get_finding_details(
    finding_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get full details and status audit history for a finding."""
    finding = db.query(Finding).filter(Finding.id == finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")

    verify_user_project(db, finding.project_id, current_user.id)

    audit_logs = (
        db.query(FindingAuditLog)
        .filter(FindingAuditLog.finding_id == finding_id)
        .order_by(desc(FindingAuditLog.created_at))
        .all()
    )

    resp = FindingDetailResponse.model_validate(finding)
    resp.audit_logs = [FindingAuditLogResponse.model_validate(log) for log in audit_logs]
    return resp

@router.patch("/findings/{finding_id}/status", response_model=FindingDetailResponse)
def update_finding_status(
    finding_id: str,
    payload: FindingStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update finding status (open, acknowledged, resolved, accepted_exception) with audit logging."""
    finding = db.query(Finding).filter(Finding.id == finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")

    verify_user_project(db, finding.project_id, current_user.id)

    if payload.status == "accepted_exception" and (not payload.reason or not payload.reason.strip()):
        raise HTTPException(
            status_code=400,
            detail="A documented reason is mandatory when accepting an architectural exception."
        )

    previous_status = finding.status
    finding.status = payload.status
    if payload.status == "accepted_exception":
        finding.exception_reason = payload.reason
    finding.updated_at = datetime.now(timezone.utc)

    # Record audit log
    audit_log = FindingAuditLog(
        finding_id=finding.id,
        previous_status=previous_status,
        new_status=payload.status,
        reason=payload.reason
    )
    db.add(audit_log)
    db.commit()
    db.refresh(finding)

    audit_logs = (
        db.query(FindingAuditLog)
        .filter(FindingAuditLog.finding_id == finding_id)
        .order_by(desc(FindingAuditLog.created_at))
        .all()
    )

    resp = FindingDetailResponse.model_validate(finding)
    resp.audit_logs = [FindingAuditLogResponse.model_validate(log) for log in audit_logs]
    return resp
