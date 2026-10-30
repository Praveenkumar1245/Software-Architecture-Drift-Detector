from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from backend.app.core.database import get_db
from backend.app.api.deps import get_current_user
from backend.app.models.user import User
from backend.app.models.scan import ScanRun
from backend.app.models.project import Project
from backend.app.schemas.scan import (
    ScanRunCreate,
    ScanRunResponse,
    ScanComparisonResponse
)
from backend.app.services.scan_service import ScanService

router = APIRouter(tags=["Scans"])

def verify_user_project(db: Session, project_id: str, user_id: str) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or (project.user_id is not None and project.user_id != user_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.post("/scans", response_model=ScanRunResponse, status_code=201)
def trigger_scan(
    data: ScanRunCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Starts an architectural drift detection scan for a project."""
    verify_user_project(db, data.project_id, current_user.id)
    scan = ScanService.run_scan(
        db=db,
        project_id=data.project_id,
        architecture_id=data.architecture_id,
        source_version=data.source_version
    )
    return scan

@router.get("/projects/{project_id}/scans", response_model=List[ScanRunResponse])
def list_project_scans(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all scans run for a project, sorted by most recent first."""
    verify_user_project(db, project_id, current_user.id)
    scans = (
        db.query(ScanRun)
        .filter(ScanRun.project_id == project_id)
        .order_by(desc(ScanRun.created_at))
        .all()
    )
    return scans

@router.get("/scans/{scan_id}", response_model=ScanRunResponse)
def get_scan(
    scan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve details, status, and summary statistics of a specific scan."""
    scan = db.query(ScanRun).filter(ScanRun.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    verify_user_project(db, scan.project_id, current_user.id)
    return scan

@router.get("/scans/{scan_a_id}/compare/{scan_b_id}", response_model=ScanComparisonResponse)
def compare_scans(
    scan_a_id: str,
    scan_b_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Compares two scans and returns new findings, resolved findings, persistent findings, and metric deltas."""
    scan_a = db.query(ScanRun).filter(ScanRun.id == scan_a_id).first()
    if not scan_a:
        raise HTTPException(status_code=404, detail="Scan A not found")
    verify_user_project(db, scan_a.project_id, current_user.id)
    return ScanService.compare_scans(db, scan_a_id, scan_b_id)
