from datetime import datetime, timezone
import uuid
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

def generate_id() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=generate_id)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    repository_type = Column(String(50), default="local_zip")  # local_zip, local_dir, remote_repo
    repository_path = Column(Text, nullable=True)
    primary_language = Column(String(50), default="python")
    source_dirs = Column(String(255), default="app,src")
    exclude_dirs = Column(Text, default=".venv,venv,__pycache__,tests,dist,build,node_modules,.git")
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User", back_populates="projects")
    architecture_definitions = relationship("ArchitectureDefinition", back_populates="project", cascade="all, delete-orphan")
    scans = relationship("ScanRun", back_populates="project", cascade="all, delete-orphan")
    findings = relationship("Finding", back_populates="project", cascade="all, delete-orphan")
