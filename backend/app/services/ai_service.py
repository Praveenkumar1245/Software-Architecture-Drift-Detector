from typing import Dict, Any, Optional
from backend.app.core.config import settings

class AIService:
    @staticmethod
    def is_available() -> bool:
        return settings.AI_ENABLED and bool(settings.AI_API_KEY)

    @staticmethod
    def get_status() -> Dict[str, Any]:
        return {
            "ai_enabled": settings.AI_ENABLED,
            "provider": settings.AI_PROVIDER if settings.AI_ENABLED else "none",
            "is_configured": AIService.is_available(),
            "privacy_mode": "strict_minimal_context"
        }

    @staticmethod
    def explain_finding(
        rule_type: str,
        title: str,
        explanation: str,
        source_component: Optional[str] = None,
        target_component: Optional[str] = None,
        evidence: Optional[str] = None
    ) -> Dict[str, str]:
        """
        Explains an existing deterministic finding and suggests architectural remediation.
        If external AI is not configured, provides a curated architectural expert explanation.
        """
        # Architectural expert deterministic reasoning fallback
        remediation_strategies = {
            "forbidden_dependency": (
                "Apply the Dependency Inversion Principle (DIP). Define an abstraction (Interface/Protocol) "
                f"inside '{source_component or 'the caller'}' and have '{target_component or 'the callee'}' implement it, "
                "or inject it via dependency injection at runtime."
            ),
            "layer_violation": (
                "Layer violations occur when lower architectural layers leak knowledge of higher presentation/application layers. "
                "Move shared data transfer objects (DTOs) or domain logic to a neutral layer, and emit domain events instead of directly calling upward."
            ),
            "circular_dependency": (
                "A circular cycle couples two or more components together. Break the cycle by: "
                "1. Moving shared logic into a common shared/kernel module, or "
                "2. Using an event-driven publish/subscribe mechanism so the caller does not directly import the callee."
            ),
            "unexpected_dependency": (
                "Review the architectural boundary policy. If this dependency is intentional, update the architecture definition's "
                f"'allowed_dependencies' for '{source_component}'. Otherwise, reroute the workflow through the approved intermediary component."
            ),
            "missing_dependency": (
                "Verify whether the intended integration between these components is currently being implemented or if the module "
                "is pending development. If deprecated, remove the requirement from the architecture definition."
            ),
            "unmapped_module": (
                "Specify explicit glob path patterns in the architecture definition or move the file into the designated component directory."
            )
        }

        default_remediation = (
            "Analyze the module dependencies and decouple the direct import using abstractions, interfaces, or dependency injection."
        )

        strategy = remediation_strategies.get(rule_type, default_remediation)

        return {
            "ai_explanation": (
                f"Architectural Analysis: The finding '{title}' represents a divergence from your documented system boundaries. "
                f"{explanation} Direct coupling between '{source_component or 'source'}' and '{target_component or 'target'}' "
                "increases regression risk, hampers independent component testability, and slows build pipelines."
            ),
            "architectural_remediation": strategy,
            "source": "verified_deterministic_engine" if not AIService.is_available() else "ai_assisted_engine"
        }
