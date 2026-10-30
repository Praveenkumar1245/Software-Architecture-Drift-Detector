from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.api.deps import get_current_user
from backend.app.models.user import User
from backend.app.schemas.project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectWithStatsResponse
)
from backend.app.services.project_service import ProjectService

router = APIRouter(prefix="/projects", tags=["Projects"])

@router.get("", response_model=List[ProjectWithStatsResponse])
def list_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all projects belonging to the authenticated user."""
    return ProjectService.get_all(db, user_id=current_user.id)

@router.post("", response_model=ProjectResponse, status_code=201)
def create_project(
    data: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new software project owned by current user."""
    return ProjectService.create(db, data, user_id=current_user.id)

@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get project details by ID with authorization check."""
    proj = ProjectService.get_by_id(db, project_id, user_id=current_user.id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    return proj

@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: str,
    data: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update project name, description, or exclusions."""
    proj = ProjectService.get_by_id(db, project_id, user_id=current_user.id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    updated = ProjectService.update(db, project_id, data)
    return updated

@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a project and its associated scans and findings."""
    proj = ProjectService.get_by_id(db, project_id, user_id=current_user.id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    ProjectService.delete(db, project_id)
    return None

@router.post("/{project_id}/upload")
def upload_project_zip(
    project_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload and extract a project source code ZIP archive safely."""
    proj = ProjectService.get_by_id(db, project_id, user_id=current_user.id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    extracted_path = ProjectService.handle_zip_upload(db, project_id, file)
    return {
        "message": "Project archive uploaded and extracted successfully",
        "repository_path": extracted_path
    }
