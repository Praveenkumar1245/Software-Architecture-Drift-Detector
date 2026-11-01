import io
import zipfile
import tempfile
from pathlib import Path
import pytest

from backend.app.analyzers.python_ast import analyze_python_source
from backend.app.analyzers.graph_builder import ArchitectureGraph
from backend.app.analyzers.safe_extract import sanitize_and_extract_zip, SafeExtractionError
from backend.app.rules.engine import DriftDetectionEngine
from backend.app.schemas.architecture import ArchitectureDefinitionContent, ComponentDef, RuleDef

def get_standard_layered_architecture() -> ArchitectureDefinitionContent:
    """Returns standard 4-layer enterprise architecture definition."""
    return ArchitectureDefinitionContent(
        name="Standard Layered Architecture",
        description="Enterprise 4-layer architecture with downward dependency rules",
        version=1,
        components=[
            ComponentDef(
                name="presentation",
                layer=1,
                description="User interface and API routes",
                path_patterns=["app/presentation/**"],
                allowed_dependencies=["application", "domain"],
                forbidden_dependencies=["infrastructure"]
            ),
            ComponentDef(
                name="application",
                layer=2,
                description="Application services and use cases",
                path_patterns=["app/application/**"],
                allowed_dependencies=["domain"],
                forbidden_dependencies=["presentation"]
            ),
            ComponentDef(
                name="domain",
                layer=3,
                description="Core domain models and business rules",
                path_patterns=["app/domain/**"],
                allowed_dependencies=[],
                forbidden_dependencies=["presentation", "infrastructure"]
            ),
            ComponentDef(
                name="infrastructure",
                layer=4,
                description="Database access and external services",
                path_patterns=["app/infrastructure/**"],
                allowed_dependencies=["domain"],
                forbidden_dependencies=["presentation"]
            )
        ],
        rules=[
            RuleDef(
                id="LAYER-DOWNWARD-001",
                type="layer_direction",
                description="Dependencies must flow downward only.",
                severity="critical",
                layer_direction="downward_only"
            ),
            RuleDef(
                id="FORBIDDEN-DOMAIN-TO-PRESENTATION",
                type="forbidden_dependency",
                description="Domain core must never depend directly on the presentation layer.",
                severity="critical",
                from_component="domain",
                to_component="presentation"
            ),
            RuleDef(
                id="NO-CYCLIC-DEPENDENCIES",
                type="circular_dependency",
                description="No cyclic dependencies are permitted.",
                severity="critical"
            )
        ]
    )

def test_project_a_correct_architecture():
    """
    TEST A – Correct Architecture:
    - Presentation depends on Application.
    - Application depends on Domain.
    - Infrastructure follows defined dependency rules (depends on Domain).
    - No forbidden imports.
    - No circular dependencies.
    Expected result: 0 architectural violations, 100.0% compliance.
    """
    arch = get_standard_layered_architecture()

    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        (root / "app" / "presentation").mkdir(parents=True)
        (root / "app" / "application").mkdir(parents=True)
        (root / "app" / "domain").mkdir(parents=True)
        (root / "app" / "infrastructure").mkdir(parents=True)

        (root / "app" / "__init__.py").write_text("# app init\n", encoding="utf-8")
        (root / "app" / "presentation" / "__init__.py").write_text("", encoding="utf-8")
        (root / "app" / "presentation" / "routes.py").write_text(
            "from app.application.order_service import OrderService\n"
            "class Controller:\n"
            "    def handle(self):\n"
            "        return OrderService().process()\n",
            encoding="utf-8"
        )

        (root / "app" / "application" / "__init__.py").write_text("", encoding="utf-8")
        (root / "app" / "application" / "order_service.py").write_text(
            "from app.domain.order import Order\n"
            "class OrderService:\n"
            "    def process(self):\n"
            "        return Order(100)\n",
            encoding="utf-8"
        )

        (root / "app" / "domain" / "__init__.py").write_text("", encoding="utf-8")
        (root / "app" / "domain" / "order.py").write_text(
            "class Order:\n"
            "    def __init__(self, amount: float):\n"
            "        self.amount = amount\n",
            encoding="utf-8"
        )

        (root / "app" / "infrastructure" / "__init__.py").write_text("", encoding="utf-8")
        (root / "app" / "infrastructure" / "repo.py").write_text(
            "from app.domain.order import Order\n"
            "class OrderRepository:\n"
            "    def save(self, order: Order):\n"
            "        pass\n",
            encoding="utf-8"
        )

        ast_res = analyze_python_source(root)
        assert ast_res.files_analyzed >= 4

        graph = ArchitectureGraph(definition=arch)
        graph.build(modules=ast_res.modules, dependencies=ast_res.dependencies)

        engine = DriftDetectionEngine(definition=arch, graph=graph)
        findings, compliance = engine.evaluate(ast_res.modules, ast_res.dependencies, ast_res.raw_dependencies)

        # Expected result: No architectural violations
        assert len(findings) == 0, f"Expected 0 violations, found: {[f.title for f in findings]}"
        assert compliance == 100.0

def test_project_b_incorrect_architecture():
    """
    TEST B – Incorrect Architecture:
    - Presentation depends on Application.
    - Application depends on Domain.
    - Domain improperly imports Presentation (violation!).
    - Circular dependency: presentation -> application -> domain -> presentation.
    Expected result: Detected violations with source files, line numbers, and compliance < 100%.
    """
    arch = get_standard_layered_architecture()

    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        (root / "app" / "presentation").mkdir(parents=True)
        (root / "app" / "application").mkdir(parents=True)
        (root / "app" / "domain").mkdir(parents=True)
        (root / "app" / "infrastructure").mkdir(parents=True)

        (root / "app" / "__init__.py").write_text("# app init\n", encoding="utf-8")
        (root / "app" / "presentation" / "__init__.py").write_text("", encoding="utf-8")
        (root / "app" / "presentation" / "routes.py").write_text(
            "from app.application.order_service import OrderService\n"
            "def format_response(msg):\n"
            "    return f'Result: {msg}'\n",
            encoding="utf-8"
        )

        (root / "app" / "application" / "__init__.py").write_text("", encoding="utf-8")
        (root / "app" / "application" / "order_service.py").write_text(
            "from app.domain.order import Order\n"
            "class OrderService:\n"
            "    def process(self):\n"
            "        return Order(100)\n",
            encoding="utf-8"
        )

        # VIOLATION: Domain imports Presentation!
        (root / "app" / "domain" / "__init__.py").write_text("", encoding="utf-8")
        (root / "app" / "domain" / "order.py").write_text(
            "from app.presentation.routes import format_response\n"
            "class Order:\n"
            "    def __init__(self, amount: float):\n"
            "        self.amount = amount\n"
            "    def display(self):\n"
            "        return format_response(self.amount)\n",
            encoding="utf-8"
        )

        (root / "app" / "infrastructure" / "__init__.py").write_text("", encoding="utf-8")
        (root / "app" / "infrastructure" / "repo.py").write_text(
            "from app.domain.order import Order\n"
            "class OrderRepository:\n"
            "    def save(self, order: Order):\n"
            "        pass\n",
            encoding="utf-8"
        )

        ast_res = analyze_python_source(root)
        graph = ArchitectureGraph(definition=arch)
        graph.build(modules=ast_res.modules, dependencies=ast_res.dependencies)

        engine = DriftDetectionEngine(definition=arch, graph=graph)
        findings, compliance = engine.evaluate(ast_res.modules, ast_res.dependencies, ast_res.raw_dependencies)

        # Expected result: Detector must identify actual violations and display source files/locations
        assert len(findings) > 0, "Expected violations to be detected in Test B"
        assert compliance < 100.0

        rule_types = {f.rule_type for f in findings}
        assert "forbidden_dependency" in rule_types or "layer_direction" in rule_types

        # Verify that domain->presentation violation is captured with exact file and line number
        domain_violations = [f for f in findings if f.source_component == "domain"]
        assert len(domain_violations) > 0
        v = domain_violations[0]
        assert v.file_path is not None and "order.py" in v.file_path.replace("\\", "/")
        assert v.line_number == 1
        assert "presentation" in (v.target_component or "").lower()

def test_invalid_zip_and_empty_zip_handling():
    """Verify system handles invalid ZIPs and empty ZIPs gracefully."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)

        # 1. Corrupt ZIP
        corrupt_zip = tmp_path / "corrupt.zip"
        corrupt_zip.write_bytes(b"PK\x03\x04NOT_A_VALID_ZIP_ARCHIVE_DATA")
        target_dir = tmp_path / "extracted_corrupt"
        with pytest.raises(SafeExtractionError) as exc_info:
            sanitize_and_extract_zip(corrupt_zip, target_dir)
        assert "corrupt" in str(exc_info.value).lower() or "invalid" in str(exc_info.value).lower()

        # 2. Empty ZIP
        empty_buf = io.BytesIO()
        with zipfile.ZipFile(empty_buf, "w") as zf:
            pass
        empty_zip = tmp_path / "empty.zip"
        empty_zip.write_bytes(empty_buf.getvalue())
        target_empty = tmp_path / "extracted_empty"
        files = sanitize_and_extract_zip(empty_zip, target_empty)
        assert len(files) == 0

