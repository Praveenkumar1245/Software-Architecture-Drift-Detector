import os
import shutil
from pathlib import Path
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from fastapi import UploadFile, HTTPException

from backend.app.core.config import settings
from backend.app.models.project import Project
from backend.app.models.scan import ScanRun
from backend.app.models.finding import Finding
from backend.app.schemas.project import ProjectCreate, ProjectUpdate, ProjectWithStatsResponse
from backend.app.analyzers.safe_extract import sanitize_and_extract_zip, SafeExtractionError

class ProjectService:
    @staticmethod
    def get_all(db: Session, user_id: Optional[str] = None) -> List[ProjectWithStatsResponse]:
        query = db.query(Project)
        if user_id:
            query = query.filter((Project.user_id == user_id) | (Project.user_id.is_(None)))
        projects = query.order_by(desc(Project.created_at)).all()
        result: List[ProjectWithStatsResponse] = []

        for p in projects:
            latest_scan = (
                db.query(ScanRun)
                .filter(ScanRun.project_id == p.id)
                .order_by(desc(ScanRun.created_at))
                .first()
            )
            total_scans = db.query(ScanRun).filter(ScanRun.project_id == p.id).count()
            open_findings = (
                db.query(Finding)
                .filter(Finding.project_id == p.id, Finding.status == "open")
                .count()
            )
            critical_findings = (
                db.query(Finding)
                .filter(Finding.project_id == p.id, Finding.status == "open", Finding.severity == "critical")
                .count()
            )

            result.append(
                ProjectWithStatsResponse(
                    id=p.id,
                    name=p.name,
                    description=p.description,
                    repository_type=p.repository_type,
                    repository_path=p.repository_path,
                    primary_language=p.primary_language,
                    source_dirs=p.source_dirs,
                    exclude_dirs=p.exclude_dirs,
                    created_at=p.created_at,
                    updated_at=p.updated_at,
                    total_scans=total_scans,
                    latest_scan_status=latest_scan.status if latest_scan else None,
                    latest_scan_timestamp=latest_scan.started_at if latest_scan else None,
                    latest_compliance_percentage=latest_scan.compliance_percentage if latest_scan else None,
                    open_findings_count=open_findings,
                    critical_findings_count=critical_findings
                )
            )
        return result

    @staticmethod
    def get_by_id(db: Session, project_id: str, user_id: Optional[str] = None) -> Optional[Project]:
        query = db.query(Project).filter(Project.id == project_id)
        if user_id:
            query = query.filter((Project.user_id == user_id) | (Project.user_id.is_(None)))
        return query.first()

    @staticmethod
    def create(db: Session, data: ProjectCreate, user_id: Optional[str] = None) -> Project:
        project = Project(
            name=data.name,
            description=data.description,
            repository_type=data.repository_type,
            repository_path=data.repository_path,
            primary_language=data.primary_language,
            source_dirs=data.source_dirs,
            exclude_dirs=data.exclude_dirs,
            user_id=user_id
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        return project

    @staticmethod
    def update(db: Session, project_id: str, data: ProjectUpdate) -> Optional[Project]:
        project = ProjectService.get_by_id(db, project_id)
        if not project:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(project, key, value)

        db.commit()
        db.refresh(project)
        return project

    @staticmethod
    def delete(db: Session, project_id: str) -> bool:
        project = ProjectService.get_by_id(db, project_id)
        if not project:
            return False

        # Clean storage directory
        proj_dir = settings.PROJECTS_DIR / project_id
        if proj_dir.exists():
            shutil.rmtree(proj_dir, ignore_errors=True)

        db.delete(project)
        db.commit()
        return True

    @staticmethod
    def handle_zip_upload(db: Session, project_id: str, file: UploadFile) -> dict:
        project = ProjectService.get_by_id(db, project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        if not file.filename or not file.filename.lower().endswith(".zip"):
            raise HTTPException(status_code=400, detail="Only .zip files are supported")

        proj_storage = settings.PROJECTS_DIR / project_id
        upload_zip_path = proj_storage / "uploaded_archive.zip"
        source_target_dir = proj_storage / "source"

        proj_storage.mkdir(parents=True, exist_ok=True)

        # Save uploaded file
        try:
            with open(upload_zip_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save upload: {str(e)}")

        # Extract safely
        try:
            extracted_files = sanitize_and_extract_zip(upload_zip_path, source_target_dir)
        except SafeExtractionError as see:
            raise HTTPException(status_code=400, detail=str(see))

        if not extracted_files:
            raise HTTPException(status_code=400, detail="Uploaded archive is empty. Please provide a ZIP containing source files.")

        # Update project record with sanitized path
        clean_rel_path = f"data/projects/{project_id}/source"
        project.repository_type = "local_zip"
        project.repository_path = clean_rel_path
        db.commit()
        db.refresh(project)

        return {
            "repository_path": clean_rel_path,
            "files_count": len(extracted_files)
        }
