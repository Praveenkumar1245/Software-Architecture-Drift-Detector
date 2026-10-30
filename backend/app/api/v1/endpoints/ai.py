from typing import Dict, Any, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends
from backend.app.api.deps import get_current_user
from backend.app.models.user import User
from backend.app.services.ai_service import AIService

router = APIRouter(prefix="/ai", tags=["AI Explanations"])

class FindingExplanationRequest(BaseModel):
    rule_type: str
    title: str
    explanation: str
    source_component: Optional[str] = None
    target_component: Optional[str] = None
    evidence: Optional[str] = None

@router.get("/status")
def get_ai_status(current_user: User = Depends(get_current_user)):
    """Returns whether AI provider integration is enabled and configured."""
    return AIService.get_status()

@router.post("/explain-finding")
def explain_finding(
    payload: FindingExplanationRequest,
    current_user: User = Depends(get_current_user)
):
    """Provides plain-language architectural explanation and remediation suggestions."""
    return AIService.explain_finding(
        rule_type=payload.rule_type,
        title=payload.title,
        explanation=payload.explanation,
        source_component=payload.source_component,
        target_component=payload.target_component,
        evidence=payload.evidence
    )
