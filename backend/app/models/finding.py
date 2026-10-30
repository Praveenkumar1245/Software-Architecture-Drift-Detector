from datetime import datetime, timezone
import uuid
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Integer
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

def generate_id() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class Finding(Base):
    __tablename__ = "findings"

    id = Column(String(36), primary_key=True, default=generate_id)
    scan_id = Column(String(36), ForeignKey("scan_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    rule_id = Column(String(100), nullable=False, index=True)
    rule_type = Column(String(100), nullable=False)
    title = Column(String(255), nullable=False)
    explanation = Column(Text, nullable=False)
    severity = Column(String(20), nullable=False, index=True)  # critical, high, medium, low
    source_module = Column(String(255), nullable=True)
    target_module = Column(String(255), nullable=True)
    source_component = Column(String(255), nullable=True)
    target_component = Column(String(255), nullable=True)
    file_path = Column(Text, nullable=True)
    line_number = Column(Integer, nullable=True)
    expected_behavior = Column(Text, nullable=True)
    actual_behavior = Column(Text, nullable=True)
    evidence = Column(Text, nullable=True)
    confidence = Column(String(50), default="high")
    remediation = Column(Text, nullable=True)
    status = Column(String(50), default="open", index=True)  # open, acknowledged, resolved, accepted_exception
    exception_reason = Column(Text, nullable=True)
    first_detected_at = Column(DateTime, default=utc_now, nullable=False)
    last_detected_at = Column(DateTime, default=utc_now, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    project = relationship("Project", back_populates="findings")
    scan = relationship("ScanRun", back_populates="findings")
    audit_logs = relationship("FindingAuditLog", back_populates="finding", cascade="all, delete-orphan")

class FindingAuditLog(Base):
    __tablename__ = "finding_audit_logs"

    id = Column(String(36), primary_key=True, default=generate_id)
    finding_id = Column(String(36), ForeignKey("findings.id", ondelete="CASCADE"), nullable=False, index=True)
    previous_status = Column(String(50), nullable=False)
    new_status = Column(String(50), nullable=False)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    finding = relationship("Finding", back_populates="audit_logs")
