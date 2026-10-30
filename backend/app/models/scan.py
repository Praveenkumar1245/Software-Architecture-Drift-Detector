from datetime import datetime, timezone
import uuid
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Integer, Float, Boolean
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

def generate_id() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class ScanRun(Base):
    __tablename__ = "scan_runs"

    id = Column(String(36), primary_key=True, default=generate_id)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    architecture_id = Column(String(36), ForeignKey("architecture_definitions.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(50), default="queued", index=True)  # queued, running, completed, failed, cancelled
    error_message = Column(Text, nullable=True)
    files_analyzed = Column(Integer, default=0)
    modules_discovered = Column(Integer, default=0)
    dependencies_discovered = Column(Integer, default=0)
    total_findings = Column(Integer, default=0)
    critical_findings = Column(Integer, default=0)
    high_findings = Column(Integer, default=0)
    medium_findings = Column(Integer, default=0)
    low_findings = Column(Integer, default=0)
    compliance_percentage = Column(Float, default=100.0)
    source_version = Column(String(100), nullable=True)
    duration_ms = Column(Integer, default=0)
    started_at = Column(DateTime, default=utc_now, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    project = relationship("Project", back_populates="scans")
    architecture = relationship("ArchitectureDefinition", back_populates="scans")
    discovered_modules = relationship("DiscoveredModule", back_populates="scan", cascade="all, delete-orphan")
    dependency_relationships = relationship("DependencyRelationship", back_populates="scan", cascade="all, delete-orphan")
    findings = relationship("Finding", back_populates="scan", cascade="all, delete-orphan")

class DiscoveredModule(Base):
    __tablename__ = "discovered_modules"

    id = Column(String(36), primary_key=True, default=generate_id)
    scan_id = Column(String(36), ForeignKey("scan_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    module_name = Column(String(255), nullable=False)
    file_path = Column(Text, nullable=False)
    component_name = Column(String(255), nullable=True, index=True)
    classes_count = Column(Integer, default=0)
    functions_count = Column(Integer, default=0)
    imports_count = Column(Integer, default=0)

    scan = relationship("ScanRun", back_populates="discovered_modules")

class DependencyRelationship(Base):
    __tablename__ = "dependency_relationships"

    id = Column(String(36), primary_key=True, default=generate_id)
    scan_id = Column(String(36), ForeignKey("scan_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    source_module = Column(String(255), nullable=False, index=True)
    target_module = Column(String(255), nullable=False, index=True)
    source_component = Column(String(255), nullable=True)
    target_component = Column(String(255), nullable=True)
    import_line = Column(Integer, nullable=True)
    import_statement = Column(Text, nullable=True)
    is_violation = Column(Boolean, default=False)
    violation_rule_id = Column(String(100), nullable=True)

    scan = relationship("ScanRun", back_populates="dependency_relationships")
