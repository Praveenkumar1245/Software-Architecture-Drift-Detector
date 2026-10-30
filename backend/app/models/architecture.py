from datetime import datetime, timezone
import uuid
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Integer, Boolean
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

def generate_id() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class ArchitectureDefinition(Base):
    __tablename__ = "architecture_definitions"

    id = Column(String(36), primary_key=True, default=generate_id)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    version = Column(Integer, default=1, nullable=False)
    format = Column(String(20), default="json")  # json, yaml
    raw_content = Column(Text, nullable=False)
    components_data = Column(Text, nullable=False)  # JSON-encoded components list
    rules_data = Column(Text, nullable=False)       # JSON-encoded rules list
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    project = relationship("Project", back_populates="architecture_definitions")
    scans = relationship("ScanRun", back_populates="architecture")
