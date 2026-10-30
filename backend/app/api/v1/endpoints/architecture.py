import json
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.api.deps import get_current_user
from backend.app.models.user import User
from backend.app.models.architecture import ArchitectureDefinition
from backend.app.models.project import Project
from backend.app.schemas.architecture import (
    ArchitectureCreate,
    ArchitectureUpdate,
    ArchitectureResponse,
    ArchitectureValidationResult,
    ComponentDef,
    RuleDef
)
from backend.app.services.architecture_service import ArchitectureService

router = APIRouter(prefix="/architectures", tags=["Architecture"])

def verify_user_project(db: Session, project_id: str, user_id: str) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or (project.user_id is not None and project.user_id != user_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.get("/templates", response_model=Dict[str, Any])
def get_architecture_templates(current_user: User = Depends(get_current_user)):
    """Retrieve pre-built starter architecture templates (Layered, Clean Architecture)."""
    return ArchitectureService.get_starter_templates()

@router.post("/validate", response_model=ArchitectureValidationResult)
def validate_architecture_definition(
    payload: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """Validates raw architecture definition syntax, schema, and rule references."""
    raw_content = payload.get("raw_content", "")
    format_type = payload.get("format", "json")
    return ArchitectureService.parse_and_validate(raw_content, format_type)

@router.get("/project/{project_id}", response_model=List[ArchitectureResponse])
def get_project_architectures(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all architecture definitions for a project."""
    verify_user_project(db, project_id, current_user.id)

    defs = (
        db.query(ArchitectureDefinition)
        .filter(ArchitectureDefinition.project_id == project_id)
        .order_by(ArchitectureDefinition.version.desc())
        .all()
    )

    results = []
    for d in defs:
        comp_data = json.loads(d.components_data) if d.components_data else []
        rules_data = json.loads(d.rules_data) if d.rules_data else []
        results.append(
            ArchitectureResponse(
                id=d.id,
                project_id=d.project_id,
                name=d.name,
                description=d.description,
                version=d.version,
                format=d.format,
                raw_content=d.raw_content,
                components=[ComponentDef(**c) for c in comp_data],
                rules=[RuleDef(**r) for r in rules_data],
                is_active=d.is_active,
                created_at=d.created_at,
                updated_at=d.updated_at
            )
        )
    return results

@router.post("", response_model=ArchitectureResponse, status_code=201)
def create_architecture(
    data: ArchitectureCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create or import a new architecture definition for a project."""
    verify_user_project(db, data.project_id, current_user.id)

    # If raw content provided, validate it
    raw_content = data.raw_content
    if not raw_content and data.definition:
        raw_content = data.definition.model_dump_json(indent=2)

    val_res = ArchitectureService.parse_and_validate(raw_content or "", data.format)
    if not val_res.is_valid or not val_res.parsed_definition:
        raise HTTPException(status_code=400, detail={"errors": val_res.errors})

    parsed = val_res.parsed_definition

    # Determine version
    latest_ver = (
        db.query(ArchitectureDefinition)
        .filter(ArchitectureDefinition.project_id == data.project_id)
        .order_by(ArchitectureDefinition.version.desc())
        .first()
    )
    new_version = (latest_ver.version + 1) if latest_ver else 1

    # Deactivate previous active definitions
    db.query(ArchitectureDefinition).filter(
        ArchitectureDefinition.project_id == data.project_id
    ).update({"is_active": False})

    arch = ArchitectureDefinition(
        project_id=data.project_id,
        name=parsed.name,
        description=parsed.description or data.description,
        version=new_version,
        format=data.format,
        raw_content=raw_content,
        components_data=json.dumps([c.model_dump() for c in parsed.components]),
        rules_data=json.dumps([r.model_dump() for r in parsed.rules]),
        is_active=True
    )
    db.add(arch)
    db.commit()
    db.refresh(arch)

    return ArchitectureResponse(
        id=arch.id,
        project_id=arch.project_id,
        name=arch.name,
        description=arch.description,
        version=arch.version,
        format=arch.format,
        raw_content=arch.raw_content,
        components=parsed.components,
        rules=parsed.rules,
        is_active=arch.is_active,
        created_at=arch.created_at,
        updated_at=arch.updated_at
    )

@router.get("/{arch_id}", response_model=ArchitectureResponse)
def get_architecture(
    arch_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get single architecture definition by ID."""
    arch = db.query(ArchitectureDefinition).filter(ArchitectureDefinition.id == arch_id).first()
    if not arch:
        raise HTTPException(status_code=404, detail="Architecture definition not found")

    verify_user_project(db, arch.project_id, current_user.id)

    comp_data = json.loads(arch.components_data) if arch.components_data else []
    rules_data = json.loads(arch.rules_data) if arch.rules_data else []

    return ArchitectureResponse(
        id=arch.id,
        project_id=arch.project_id,
        name=arch.name,
        description=arch.description,
        version=arch.version,
        format=arch.format,
        raw_content=arch.raw_content,
        components=[ComponentDef(**c) for c in comp_data],
        rules=[RuleDef(**r) for r in rules_data],
        is_active=arch.is_active,
        created_at=arch.created_at,
        updated_at=arch.updated_at
    )

@router.patch("/{arch_id}/activate", response_model=ArchitectureResponse)
def activate_architecture(
    arch_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Sets a specific architecture definition as the active policy for its project."""
    arch = db.query(ArchitectureDefinition).filter(ArchitectureDefinition.id == arch_id).first()
    if not arch:
        raise HTTPException(status_code=404, detail="Architecture definition not found")

    verify_user_project(db, arch.project_id, current_user.id)

    # Deactivate all other definitions for this project
    db.query(ArchitectureDefinition).filter(
        ArchitectureDefinition.project_id == arch.project_id
    ).update({"is_active": False})

    arch.is_active = True
    db.commit()
    db.refresh(arch)

    comp_data = json.loads(arch.components_data) if arch.components_data else []
    rules_data = json.loads(arch.rules_data) if arch.rules_data else []

    return ArchitectureResponse(
        id=arch.id,
        project_id=arch.project_id,
        name=arch.name,
        description=arch.description,
        version=arch.version,
        format=arch.format,
        raw_content=arch.raw_content,
        components=[ComponentDef(**c) for c in comp_data],
        rules=[RuleDef(**r) for r in rules_data],
        is_active=arch.is_active,
        created_at=arch.created_at,
        updated_at=arch.updated_at
    )

@router.put("/{arch_id}", response_model=ArchitectureResponse)
def update_architecture(
    arch_id: str,
    data: ArchitectureUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Updates an existing architecture definition in-place."""
    arch = db.query(ArchitectureDefinition).filter(ArchitectureDefinition.id == arch_id).first()
    if not arch:
        raise HTTPException(status_code=404, detail="Architecture definition not found")

    verify_user_project(db, arch.project_id, current_user.id)

    raw_content = data.raw_content
    if not raw_content and data.definition:
        raw_content = data.definition.model_dump_json(indent=2)
    elif not raw_content:
        raw_content = arch.raw_content

    val_res = ArchitectureService.parse_and_validate(raw_content, arch.format)
    if not val_res.is_valid or not val_res.parsed_definition:
        raise HTTPException(status_code=400, detail={"errors": val_res.errors})

    parsed = val_res.parsed_definition

    arch.name = data.name if data.name else parsed.name
    if data.description is not None:
        arch.description = data.description
    elif parsed.description:
        arch.description = parsed.description

    arch.raw_content = raw_content
    arch.components_data = json.dumps([c.model_dump() for c in parsed.components])
    arch.rules_data = json.dumps([r.model_dump() for r in parsed.rules])

    db.commit()
    db.refresh(arch)

    return ArchitectureResponse(
        id=arch.id,
        project_id=arch.project_id,
        name=arch.name,
        description=arch.description,
        version=arch.version,
        format=arch.format,
        raw_content=arch.raw_content,
        components=parsed.components,
        rules=parsed.rules,
        is_active=arch.is_active,
        created_at=arch.created_at,
        updated_at=arch.updated_at
    )

@router.delete("/{arch_id}", status_code=204)
def delete_architecture(
    arch_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Deletes an architecture definition."""
    arch = db.query(ArchitectureDefinition).filter(ArchitectureDefinition.id == arch_id).first()
    if not arch:
        raise HTTPException(status_code=404, detail="Architecture definition not found")

    verify_user_project(db, arch.project_id, current_user.id)
    project_id = arch.project_id
    was_active = arch.is_active

    db.delete(arch)
    db.commit()

    if was_active:
        latest = (
            db.query(ArchitectureDefinition)
            .filter(ArchitectureDefinition.project_id == project_id)
            .order_by(ArchitectureDefinition.version.desc())
            .first()
        )
        if latest:
            latest.is_active = True
            db.commit()

    return None
