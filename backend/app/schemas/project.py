from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime

class ProjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    repository_type: str = Field("local_zip", pattern="^(local_zip|local_dir|remote_repo)$")
    repository_path: Optional[str] = None
    primary_language: str = Field("python", max_length=50)
    source_dirs: str = Field("app,src", max_length=255)
    exclude_dirs: str = Field(".venv,venv,__pycache__,tests,dist,build,node_modules,.git")

class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    primary_language: Optional[str] = None
    source_dirs: Optional[str] = None
    exclude_dirs: Optional[str] = None

class ProjectResponse(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    updated_at: datetime

class ProjectWithStatsResponse(ProjectResponse):
    total_scans: int = 0
    latest_scan_status: Optional[str] = None
    latest_scan_timestamp: Optional[datetime] = None
    latest_compliance_percentage: Optional[float] = None
    open_findings_count: int = 0
    critical_findings_count: int = 0
