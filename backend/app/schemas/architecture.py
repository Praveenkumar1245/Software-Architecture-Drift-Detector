from pydantic import BaseModel, Field, model_validator, ConfigDict
from typing import Optional, List, Any, Dict
from datetime import datetime

class ComponentDef(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    layer: Optional[int] = Field(None, ge=1)
    description: Optional[str] = None
    path_patterns: List[str] = Field(default_factory=list)
    allowed_dependencies: List[str] = Field(default_factory=list)
    forbidden_dependencies: List[str] = Field(default_factory=list)
    required_dependencies: List[str] = Field(default_factory=list)

class RuleDef(BaseModel):
    id: str = Field(..., min_length=1, max_length=100)
    type: str = Field(..., pattern="^(layer_direction|forbidden_dependency|forbidden_import|circular_dependency|unexpected_dependency|missing_dependency|unmapped_module|missing_component|adr_violation)$")
    description: str
    severity: str = Field("high", pattern="^(critical|high|medium|low)$")
    from_component: Optional[str] = None
    to_component: Optional[str] = None
    target_module: Optional[str] = None
    layer_direction: Optional[str] = "downward_only"  # downward_only, adjacent_downward_only, onion
    config: Optional[Dict[str, Any]] = Field(default_factory=dict)

class ArchitectureDefinitionContent(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    version: Optional[int] = 1
    components: List[ComponentDef] = Field(..., min_length=1)
    rules: List[RuleDef] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_components_and_rules(self):
        comp_names = {c.name for c in self.components}
        if len(comp_names) != len(self.components):
            raise ValueError("Duplicate component names found in architecture definition")
        
        rule_ids = set()
        for rule in self.rules:
            if rule.id in rule_ids:
                raise ValueError(f"Duplicate rule identifier: {rule.id}")
            rule_ids.add(rule.id)
            
            if rule.from_component and rule.from_component not in comp_names:
                raise ValueError(f"Rule {rule.id} references unknown from_component: '{rule.from_component}'")
            if rule.type != "forbidden_import" and rule.to_component and rule.to_component not in comp_names:
                raise ValueError(f"Rule {rule.id} references unknown to_component: '{rule.to_component}'")
        return self

class ArchitectureCreate(BaseModel):
    project_id: str
    name: str
    description: Optional[str] = None
    format: str = Field("json", pattern="^(json|yaml)$")
    raw_content: Optional[str] = None
    definition: Optional[ArchitectureDefinitionContent] = None

class ArchitectureUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    raw_content: Optional[str] = None
    definition: Optional[ArchitectureDefinitionContent] = None

class ArchitectureResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    name: str
    description: Optional[str] = None
    version: int
    format: str
    raw_content: str
    components: List[ComponentDef]
    rules: List[RuleDef]
    is_active: bool
    created_at: datetime
    updated_at: datetime

class ArchitectureValidationResult(BaseModel):
    is_valid: bool
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    parsed_definition: Optional[ArchitectureDefinitionContent] = None
