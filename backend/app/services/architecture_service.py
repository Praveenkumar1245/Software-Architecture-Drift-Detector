import json
import yaml
from typing import Optional, Tuple, Dict, Any, List
from sqlalchemy.orm import Session
from backend.app.models.architecture import ArchitectureDefinition
from backend.app.schemas.architecture import (
    ArchitectureDefinitionContent,
    ArchitectureValidationResult,
    ComponentDef,
    RuleDef
)

LAYERED_TEMPLATE = {
    "name": "Standard Layered Architecture",
    "description": "Enterprise 4-layer architecture with downward dependency rules",
    "version": 1,
    "components": [
        {
            "name": "presentation",
            "layer": 1,
            "description": "User interface, API controllers, routers, and request handlers",
            "path_patterns": ["presentation/**", "routers/**", "api/**", "controllers/**"],
            "allowed_dependencies": ["application", "domain"],
            "forbidden_dependencies": ["infrastructure"]
        },
        {
            "name": "application",
            "layer": 2,
            "description": "Application services, use cases, workflow orchestration",
            "path_patterns": ["application/**", "services/**", "use_cases/**"],
            "allowed_dependencies": ["domain"],
            "forbidden_dependencies": ["presentation"]
        },
        {
            "name": "domain",
            "layer": 3,
            "description": "Core business entities, value objects, domain logic",
            "path_patterns": ["domain/**", "models/**", "entities/**"],
            "allowed_dependencies": [],
            "forbidden_dependencies": ["presentation", "infrastructure"]
        },
        {
            "name": "infrastructure",
            "layer": 4,
            "description": "Database adapters, external APIs, persistence, messaging",
            "path_patterns": ["infrastructure/**", "db/**", "repositories/**"],
            "allowed_dependencies": ["domain"],
            "forbidden_dependencies": ["presentation"]
        }
    ],
    "rules": [
        {
            "id": "LAYER-DOWNWARD-001",
            "type": "layer_direction",
            "description": "Dependencies must only flow downward through layers. Lower layers cannot depend on upper layers.",
            "severity": "critical",
            "layer_direction": "downward_only"
        },
        {
            "id": "FORBIDDEN-DOMAIN-TO-PRESENTATION",
            "type": "forbidden_dependency",
            "description": "Domain core must never depend directly on the presentation layer.",
            "severity": "critical",
            "from_component": "domain",
            "to_component": "presentation"
        },
        {
            "id": "NO-CYCLIC-DEPENDENCIES",
            "type": "circular_dependency",
            "description": "No cyclic dependencies are permitted between architectural components.",
            "severity": "critical"
        }
    ]
}

CLEAN_ARCHITECTURE_TEMPLATE = {
    "name": "Clean / Hexagonal Architecture",
    "description": "Ports and adapters architecture with domain at the center",
    "version": 1,
    "components": [
        {
            "name": "adapters",
            "layer": 1,
            "description": "HTTP controllers, DB repositories, external clients",
            "path_patterns": ["adapters/**", "web/**", "api/**"],
            "allowed_dependencies": ["application", "domain"]
        },
        {
            "name": "application",
            "layer": 2,
            "description": "Use cases, ports, command/query handlers",
            "path_patterns": ["application/**", "use_cases/**"],
            "allowed_dependencies": ["domain"]
        },
        {
            "name": "domain",
            "layer": 3,
            "description": "Pure business domain entities and rules",
            "path_patterns": ["domain/**", "entities/**"],
            "allowed_dependencies": []
        }
    ],
    "rules": [
        {
            "id": "CLEAN-INWARD-DEPENDENCY",
            "type": "forbidden_dependency",
            "description": "Domain must not depend on application or adapters.",
            "severity": "critical",
            "from_component": "domain",
            "to_component": "adapters"
        },
        {
            "id": "NO-CYCLES",
            "type": "circular_dependency",
            "description": "Components must form a strict directed acyclic graph.",
            "severity": "critical"
        }
    ]
}

class ArchitectureService:
    @staticmethod
    def parse_and_validate(raw_content: str, format_type: str = "json") -> ArchitectureValidationResult:
        errors: List[str] = []
        warnings: List[str] = []
        data: Dict[str, Any] = {}

        if not raw_content or not raw_content.strip():
            return ArchitectureValidationResult(
                is_valid=False,
                errors=["Architecture definition content is empty."]
            )

        # Parse format
        try:
            if format_type.lower() == "yaml" or format_type.lower() == "yml":
                data = yaml.safe_load(raw_content)
            else:
                data = json.loads(raw_content)
        except Exception as e:
            return ArchitectureValidationResult(
                is_valid=False,
                errors=[f"Syntax error parsing {format_type.upper()}: {str(e)}"]
            )

        if not isinstance(data, dict):
            return ArchitectureValidationResult(
                is_valid=False,
                errors=["Root of architecture definition must be a JSON/YAML object/dictionary."]
            )

        # Normalize alternative keys for flexibility (e.g. project_name -> name, layers -> components)
        normalized_data = dict(data)
        if "project_name" in normalized_data and "name" not in normalized_data:
            normalized_data["name"] = normalized_data["project_name"]

        if "layers" in normalized_data and "components" not in normalized_data:
            mapped_components = []
            for idx, l in enumerate(normalized_data["layers"]):
                if not isinstance(l, dict):
                    continue
                layer_name = l.get("name") or f"layer_{idx + 1}"
                path = l.get("path")
                path_patterns = l.get("path_patterns")
                if not path_patterns:
                    if path:
                        path_clean = path.rstrip("/\\")
                        path_patterns = [f"{path_clean}/**", path_clean]
                    else:
                        path_patterns = [f"{layer_name}/**", layer_name]

                mapped_components.append({
                    "name": layer_name,
                    "layer": l.get("layer") or (idx + 1),
                    "description": l.get("description") or f"Layer {layer_name}",
                    "path_patterns": path_patterns,
                    "allowed_dependencies": l.get("allowed_dependencies") or l.get("may_depend_on") or [],
                    "forbidden_dependencies": l.get("forbidden_dependencies") or [],
                    "required_dependencies": l.get("required_dependencies") or []
                })
            normalized_data["components"] = mapped_components

        if "rules" in normalized_data and isinstance(normalized_data["rules"], list):
            mapped_rules = []
            for idx, r in enumerate(normalized_data["rules"]):
                if not isinstance(r, dict):
                    continue
                r_copy = dict(r)
                rule_id = r_copy.get("id") or f"RULE-{idx + 1}"
                rule_type = r_copy.get("type", "forbidden_dependency")

                # Normalize rule types
                if rule_type == "layer_dependency":
                    if r_copy.get("action") == "forbid":
                        rule_type = "forbidden_dependency"
                    else:
                        rule_type = "layer_direction"
                elif rule_type == "forbidden_import":
                    rule_type = "forbidden_import"

                from_comp = r_copy.get("from_component") or r_copy.get("from")
                to_comp = r_copy.get("to_component") or r_copy.get("to") or r_copy.get("target")
                target_mod = r_copy.get("target_module") or r_copy.get("target") or (to_comp if rule_type == "forbidden_import" else None)

                rule_config = r_copy.get("config", {})
                if target_mod and "target" not in rule_config:
                    rule_config["target"] = target_mod

                mapped_rules.append({
                    "id": rule_id,
                    "type": rule_type,
                    "description": r_copy.get("description") or (f"Prohibit import of '{target_mod}'" if rule_type == "forbidden_import" else f"Architectural policy {rule_id}"),
                    "severity": r_copy.get("severity", "high"),
                    "from_component": from_comp,
                    "to_component": to_comp,
                    "target_module": target_mod,
                    "layer_direction": r_copy.get("layer_direction", "downward_only"),
                    "config": rule_config
                })
            normalized_data["rules"] = mapped_rules

        # Validate with Pydantic model
        try:
            parsed = ArchitectureDefinitionContent(**normalized_data)
            return ArchitectureValidationResult(
                is_valid=True,
                errors=[],
                warnings=warnings,
                parsed_definition=parsed
            )
        except Exception as ve:
            errors.append(str(ve))
            return ArchitectureValidationResult(
                is_valid=False,
                errors=errors,
                warnings=warnings
            )

    @staticmethod
    def get_starter_templates() -> Dict[str, Dict[str, Any]]:
        return {
            "layered": LAYERED_TEMPLATE,
            "clean": CLEAN_ARCHITECTURE_TEMPLATE
        }
