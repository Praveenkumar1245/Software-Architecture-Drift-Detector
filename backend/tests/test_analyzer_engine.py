import io
import zipfile
import tempfile
from pathlib import Path
import pytest

from backend.app.analyzers.python_ast import analyze_python_source, discover_python_files
from backend.app.analyzers.graph_builder import ArchitectureGraph
from backend.app.analyzers.safe_extract import sanitize_and_extract_zip, SafeExtractionError
from backend.app.rules.engine import DriftDetectionEngine
from backend.app.schemas.architecture import ArchitectureDefinitionContent, ComponentDef, RuleDef

def test_python_ast_import_extraction():
    """Verify AST parser extracts imports, classes, and function counts properly."""
    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        app_dir = root / "app"
        app_dir.mkdir()

        # Service file
        service_file = app_dir / "service.py"
        service_file.write_text("""
from app.model import User
import os

class UserService:
    def get_user(self):
        pass
""", encoding="utf-8")

        # Model file
        model_file = app_dir / "model.py"
        model_file.write_text("""
class User:
    pass
""", encoding="utf-8")

        res = analyze_python_source(root)
        assert res.files_analyzed == 2
        assert "app.service" in res.modules
        assert "app.model" in res.modules
        assert res.modules["app.service"].classes_count == 1
        assert res.modules["app.service"].functions_count == 1
        assert len(res.dependencies) >= 1
        assert any(d.source_module == "app.service" and d.target_module == "app.model" for d in res.dependencies)

def test_safe_extract_zip_slip_prevention():
    """Verify zip extractor detects and aborts path traversal attempts (Zip Slip)."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("../../evil.py", "print('malicious')")
    buf.seek(0)

    with tempfile.TemporaryDirectory() as tmpdir:
        zip_path = Path(tmpdir) / "exploit.zip"
        zip_path.write_bytes(buf.getvalue())
        target_dir = Path(tmpdir) / "extracted"

        with pytest.raises(SafeExtractionError) as exc_info:
            sanitize_and_extract_zip(zip_path, target_dir)
        assert "unsafe" in str(exc_info.value).lower() or "traversal" in str(exc_info.value).lower()

def test_safe_extract_corrupt_zip():
    """Verify corrupt zip archives are handled gracefully."""
    with tempfile.TemporaryDirectory() as tmpdir:
        bad_zip = Path(tmpdir) / "corrupt.zip"
        bad_zip.write_bytes(b"PK\x03\x04INVALID_HEADER")
        target_dir = Path(tmpdir) / "extracted"

        with pytest.raises(SafeExtractionError) as exc_info:
            sanitize_and_extract_zip(bad_zip, target_dir)
        assert "corrupt" in str(exc_info.value).lower() or "invalid" in str(exc_info.value).lower()

def test_rule_engine_clean_architecture():
    """A clean architecture conforming to rules produces 100% compliance and 0 findings."""
    arch = ArchitectureDefinitionContent(
        name="Layered",
        version=1,
        components=[
            ComponentDef(
                name="presentation",
                layer=1,
                path_patterns=["app/presentation/**"],
                allowed_dependencies=["application"],
                forbidden_dependencies=["domain", "infrastructure"]
            ),
            ComponentDef(
                name="application",
                layer=2,
                path_patterns=["app/application/**"],
                allowed_dependencies=["domain"],
                forbidden_dependencies=["presentation"]
            ),
            ComponentDef(
                name="domain",
                layer=3,
                path_patterns=["app/domain/**"],
                allowed_dependencies=[],
                forbidden_dependencies=["presentation", "application"]
            )
        ],
        rules=[
            RuleDef(id="R1", type="layer_direction", description="Downward only layers", severity="critical", layer_direction="downward_only"),
            RuleDef(id="R2", type="circular_dependency", description="No circular dependencies", severity="critical")
        ]
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        (root / "app" / "presentation").mkdir(parents=True)
        (root / "app" / "application").mkdir(parents=True)
        (root / "app" / "domain").mkdir(parents=True)

        (root / "app" / "presentation" / "views.py").write_text("from app.application.service import do_work\n", encoding="utf-8")
        (root / "app" / "application" / "service.py").write_text("from app.domain.entity import Item\ndef do_work(): pass\n", encoding="utf-8")
        (root / "app" / "domain" / "entity.py").write_text("class Item: pass\n", encoding="utf-8")

        res = analyze_python_source(root)
        graph = ArchitectureGraph(definition=arch)
        graph.build(modules=res.modules, dependencies=res.dependencies)

        engine = DriftDetectionEngine(definition=arch, graph=graph)
        findings, compliance = engine.evaluate(res.modules, res.dependencies, res.raw_dependencies)

        assert len(findings) == 0
        assert compliance == 100.0

def test_rule_engine_detects_violations():
    """Detects layer direction violations, forbidden dependencies, and circular dependency."""
    arch = ArchitectureDefinitionContent(
        name="Layered",
        version=1,
        components=[
            ComponentDef(
                name="presentation",
                layer=1,
                path_patterns=["app/presentation/**"],
                allowed_dependencies=["application"],
                forbidden_dependencies=["domain"]
            ),
            ComponentDef(
                name="application",
                layer=2,
                path_patterns=["app/application/**"],
                allowed_dependencies=["domain"],
                forbidden_dependencies=["presentation"]
            ),
            ComponentDef(
                name="domain",
                layer=3,
                path_patterns=["app/domain/**"],
                allowed_dependencies=[],
                forbidden_dependencies=["presentation"]
            )
        ],
        rules=[
            RuleDef(id="R1", type="layer_direction", description="Downward only layers", severity="critical", layer_direction="downward_only"),
            RuleDef(id="R2", type="forbidden_dependency", description="Domain cannot depend on presentation", severity="critical", from_component="domain", to_component="presentation"),
            RuleDef(id="R3", type="circular_dependency", description="No circular dependencies", severity="critical")
        ]
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        (root / "app" / "presentation").mkdir(parents=True)
        (root / "app" / "application").mkdir(parents=True)
        (root / "app" / "domain").mkdir(parents=True)

        # Presentation -> Application
        (root / "app" / "presentation" / "views.py").write_text("from app.application.service import do_work\n", encoding="utf-8")
        # Application -> Domain
        (root / "app" / "application" / "service.py").write_text("from app.domain.entity import Item\ndef do_work(): pass\n", encoding="utf-8")
        # Domain -> Presentation (VIOLATION! Layer direction L3 -> L1, Forbidden dependency, and Cycle)
        (root / "app" / "domain" / "entity.py").write_text("from app.presentation.views import render_ui\nclass Item: pass\n", encoding="utf-8")

        res = analyze_python_source(root)
        graph = ArchitectureGraph(definition=arch)
        graph.build(modules=res.modules, dependencies=res.dependencies)

        engine = DriftDetectionEngine(definition=arch, graph=graph)
        findings, compliance = engine.evaluate(res.modules, res.dependencies, res.raw_dependencies)

        assert len(findings) > 0
        assert compliance < 100.0

        # Check violation types
        rule_types = {f.rule_type for f in findings}
        assert "layer_direction" in rule_types or "forbidden_dependency" in rule_types or "circular_dependency" in rule_types

        # Findings must include source/target components and file locations
        for f in findings:
            assert f.severity in ["critical", "high", "medium", "low"]
            assert f.explanation is not None
            if f.file_path:
                assert f.line_number is not None
