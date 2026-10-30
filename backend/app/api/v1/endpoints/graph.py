from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.api.deps import get_current_user
from backend.app.models.user import User
from backend.app.models.scan import ScanRun
from backend.app.models.project import Project
from backend.app.schemas.scan import DependencyGraphResponse
from backend.app.services.scan_service import ScanService

router = APIRouter(tags=["Dependency Graph"])

def verify_user_project(db: Session, project_id: str, user_id: str) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or (project.user_id is not None and project.user_id != user_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.get("/scans/{scan_id}/graph", response_model=DependencyGraphResponse)
def get_dependency_graph(
    scan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve the interactive dependency graph (nodes and directed edges) for a scan."""
    scan = db.query(ScanRun).filter(ScanRun.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    verify_user_project(db, scan.project_id, current_user.id)
    return ScanService.get_graph_data(db, scan_id)
