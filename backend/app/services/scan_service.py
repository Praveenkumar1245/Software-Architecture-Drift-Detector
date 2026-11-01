import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Tuple, Set
import json
from sqlalchemy.orm import Session
from sqlalchemy import desc
from fastapi import HTTPException

from backend.app.models.project import Project
from backend.app.models.architecture import ArchitectureDefinition
from backend.app.models.scan import ScanRun, DiscoveredModule, DependencyRelationship
from backend.app.models.finding import Finding, FindingAuditLog
from backend.app.schemas.architecture import ArchitectureDefinitionContent
from backend.app.schemas.scan import (
    ScanRunResponse,
    DependencyGraphResponse,
    GraphNode,
    GraphEdge,
    ScanComparisonResponse
)
from backend.app.schemas.finding import FindingResponse
from backend.app.analyzers.python_ast import analyze_python_source
from backend.app.analyzers.graph_builder import ArchitectureGraph
from backend.app.rules.engine import DriftDetectionEngine
from backend.app.services.architecture_service import ArchitectureService
from backend.app.core.config import settings

class ScanService:
    @staticmethod
    def run_scan(
        db: Session,
        project_id: str,
        architecture_id: Optional[str] = None,
        source_version: Optional[str] = None
    ) -> ScanRun:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Prevent duplicate concurrent scans for same project
        running_scan = (
            db.query(ScanRun)
            .filter(ScanRun.project_id == project_id, ScanRun.status == "running")
            .first()
        )
        if running_scan:
            raise HTTPException(
                status_code=409,
                detail=f"A scan (ID: {running_scan.id}) is already currently running for this project."
            )

        # Get architecture definition
        arch_query = db.query(ArchitectureDefinition).filter(ArchitectureDefinition.project_id == project_id)
        if architecture_id:
            arch_def = arch_query.filter(ArchitectureDefinition.id == architecture_id).first()
            if not arch_def:
                # Check if the requested architecture belongs to another project or does not exist
                other_arch = db.query(ArchitectureDefinition).filter(ArchitectureDefinition.id == architecture_id).first()
                if other_arch:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Architecture definition '{other_arch.name}' (ID: {architecture_id}) belongs to another project and cannot be used for project '{project.name}'."
                    )
                else:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Architecture definition '{architecture_id}' was not found."
                    )
        else:
            arch_def = arch_query.filter(ArchitectureDefinition.is_active == True).first()
            if not arch_def:
                # Fallback to the latest version for this project if none is explicitly marked active
                arch_def = arch_query.order_by(ArchitectureDefinition.version.desc()).first()
                if arch_def:
                    arch_def.is_active = True
                    db.commit()

        if not arch_def:
            raise HTTPException(
                status_code=400,
                detail=f"No architecture definition found for project '{project.name}'. Please define or select an architecture definition before scanning."
            )

        # Parse architecture content
        try:
            val_res = ArchitectureService.parse_and_validate(arch_def.raw_content, arch_def.format)
            if not val_res.is_valid or not val_res.parsed_definition:
                raise ValueError("; ".join(val_res.errors))
            arch_content = val_res.parsed_definition
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid architecture definition structure: {str(e)}"
            )

        # Resolve source directory (support both absolute and relative storage paths)
        source_dir = Path(project.repository_path) if project.repository_path else None
        if source_dir and not source_dir.exists():
            for base in [settings.BASE_DIR, settings.DATA_DIR, Path.cwd()]:
                candidate = base / source_dir
                if candidate.exists():
                    source_dir = candidate
                    break

        if not source_dir or not source_dir.exists():
            raise HTTPException(
                status_code=400,
                detail="Project source code directory not found. Please upload project ZIP or configure source path."
            )

        # Create Scan record in RUNNING status
        scan = ScanRun(
            project_id=project_id,
            architecture_id=arch_def.id,
            status="running",
            source_version=source_version or f"v{int(time.time())}",
            started_at=datetime.now(timezone.utc)
        )
        db.add(scan)
        db.commit()
        db.refresh(scan)

        start_time = time.time()

        try:
            source_dirs = [s.strip() for s in (project.source_dirs or "").split(",") if s.strip()]
            exclude_dirs = [e.strip() for e in (project.exclude_dirs or "").split(",") if e.strip()]

            # 1. Discover and parse Python AST
            ast_result = analyze_python_source(
                root_dir=source_dir,
                source_dirs=source_dirs,
                exclude_dirs=exclude_dirs
            )

            # 2. Build dependency graph
            graph = ArchitectureGraph(definition=arch_content)
            graph.build(modules=ast_result.modules, dependencies=ast_result.dependencies)

            # 3. Evaluate Drift Rules
            engine = DriftDetectionEngine(definition=arch_content, graph=graph)
            findings_drafts, compliance = engine.evaluate(
                modules=ast_result.modules,
                dependencies=ast_result.dependencies,
                raw_dependencies=ast_result.raw_dependencies
            )

            # 4. Save Discovered Modules
            for mod_name, mod_info in ast_result.modules.items():
                comp_name = graph.module_to_component.get(mod_name)
                db_mod = DiscoveredModule(
                    scan_id=scan.id,
                    module_name=mod_name,
                    file_path=mod_info.file_path,
                    component_name=comp_name,
                    classes_count=mod_info.classes_count,
                    functions_count=mod_info.functions_count,
                    imports_count=len(mod_info.imports)
                )
                db.add(db_mod)

            # Map violation pairs for edge annotation
            violation_keys: Dict[Tuple[str, str], str] = {}
            for f in findings_drafts:
                if f.source_module and f.target_module:
                    violation_keys[(f.source_module, f.target_module)] = f.rule_id

            # 5. Save Dependency Relationships
            for dep in ast_result.dependencies:
                src_comp = graph.module_to_component.get(dep.source_module)
                tgt_comp = graph.module_to_component.get(dep.target_module)
                is_viol = (dep.source_module, dep.target_module) in violation_keys
                v_rule = violation_keys.get((dep.source_module, dep.target_module))

                db_rel = DependencyRelationship(
                    scan_id=scan.id,
                    source_module=dep.source_module,
                    target_module=dep.target_module,
                    source_component=src_comp,
                    target_component=tgt_comp,
                    import_line=dep.line_number,
                    import_statement=dep.statement,
                    is_violation=is_viol,
                    violation_rule_id=v_rule
                )
                db.add(db_rel)

            # 6. Fetch previous findings to retain accepted exceptions and first_detected timestamps
            prev_findings = (
                db.query(Finding)
                .filter(Finding.project_id == project_id)
                .all()
            )
            prev_map = {}
            for pf in prev_findings:
                # Key by rule_id + source + target
                key = (pf.rule_id, pf.source_module or "", pf.target_module or "", pf.source_component or "", pf.target_component or "")
                prev_map[key] = pf

            # 7. Save Findings
            crit_count = 0
            high_count = 0
            med_count = 0
            low_count = 0

            now = datetime.now(timezone.utc)
            for draft in findings_drafts:
                if draft.severity == "critical":
                    crit_count += 1
                elif draft.severity == "high":
                    high_count += 1
                elif draft.severity == "medium":
                    med_count += 1
                else:
                    low_count += 1

                key = (draft.rule_id, draft.source_module or "", draft.target_module or "", draft.source_component or "", draft.target_component or "")
                prev_match = prev_map.get(key)

                status = "open"
                first_detected = now
                exc_reason = None
                if prev_match:
                    first_detected = prev_match.first_detected_at
                    # Preserve accepted_exception status if already documented
                    if prev_match.status == "accepted_exception":
                        status = "accepted_exception"
                        exc_reason = prev_match.exception_reason

                db_finding = Finding(
                    scan_id=scan.id,
                    project_id=project_id,
                    rule_id=draft.rule_id,
                    rule_type=draft.rule_type,
                    title=draft.title,
                    explanation=draft.explanation,
                    severity=draft.severity,
                    source_module=draft.source_module,
                    target_module=draft.target_module,
                    source_component=draft.source_component,
                    target_component=draft.target_component,
                    file_path=draft.file_path,
                    line_number=draft.line_number,
                    expected_behavior=draft.expected_behavior,
                    actual_behavior=draft.actual_behavior,
                    evidence=draft.evidence,
                    confidence=draft.confidence,
                    remediation=draft.remediation,
                    status=status,
                    exception_reason=exc_reason,
                    first_detected_at=first_detected,
                    last_detected_at=now
                )
                db.add(db_finding)

            # 8. Complete Scan
            duration_ms = int((time.time() - start_time) * 1000)
            scan.status = "completed"
            scan.files_analyzed = ast_result.files_analyzed
            scan.modules_discovered = len(ast_result.modules)
            scan.dependencies_discovered = len(ast_result.dependencies)
            scan.total_findings = len(findings_drafts)
            scan.critical_findings = crit_count
            scan.high_findings = high_count
            scan.medium_findings = med_count
            scan.low_findings = low_count
            scan.compliance_percentage = compliance
            scan.duration_ms = duration_ms
            scan.completed_at = now

            db.commit()
            db.refresh(scan)
            return scan

        except Exception as e:
            db.rollback()
            # Mark scan as failed cleanly
            scan_fail = db.query(ScanRun).filter(ScanRun.id == scan.id).first()
            if scan_fail:
                scan_fail.status = "failed"
                scan_fail.error_message = str(e)
                scan_fail.completed_at = datetime.now(timezone.utc)
                scan_fail.duration_ms = int((time.time() - start_time) * 1000)
                db.commit()
            raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

    @staticmethod
    def get_graph_data(db: Session, scan_id: str) -> DependencyGraphResponse:
        scan = db.query(ScanRun).filter(ScanRun.id == scan_id).first()
        if not scan:
            raise HTTPException(status_code=404, detail="Scan not found")

        modules = db.query(DiscoveredModule).filter(DiscoveredModule.scan_id == scan_id).all()
        relationships = db.query(DependencyRelationship).filter(DependencyRelationship.scan_id == scan_id).all()
        findings = db.query(Finding).filter(Finding.scan_id == scan_id).all()

        violation_modules = set()
        for f in findings:
            if f.source_module:
                violation_modules.add(f.source_module)
            if f.target_module:
                violation_modules.add(f.target_module)

        nodes: List[GraphNode] = []
        components_set: Set[str] = set()

        for mod in modules:
            if mod.component_name:
                components_set.add(mod.component_name)

            nodes.append(
                GraphNode(
                    id=mod.module_name,
                    label=mod.module_name,
                    component=mod.component_name,
                    node_type="module",
                    file_path=mod.file_path,
                    is_violation=mod.module_name in violation_modules,
                    classes_count=mod.classes_count,
                    functions_count=mod.functions_count,
                    imports_count=mod.imports_count
                )
            )

        edges: List[GraphEdge] = []
        for rel in relationships:
            edges.append(
                GraphEdge(
                    id=f"{rel.source_module}->{rel.target_module}:{rel.import_line or 0}",
                    source=rel.source_module,
                    target=rel.target_module,
                    source_component=rel.source_component,
                    target_component=rel.target_component,
                    is_violation=rel.is_violation,
                    violation_rule_id=rel.violation_rule_id,
                    import_line=rel.import_line,
                    import_statement=rel.import_statement,
                    edge_type="forbidden" if rel.is_violation else "actual"
                )
            )

        return DependencyGraphResponse(
            scan_id=scan.id,
            project_id=scan.project_id,
            nodes=nodes,
            edges=edges,
            components=sorted(list(components_set)),
            total_modules=len(nodes),
            total_dependencies=len(edges),
            total_violations=sum(1 for e in edges if e.is_violation)
        )

    @staticmethod
    def compare_scans(db: Session, scan_a_id: str, scan_b_id: str) -> ScanComparisonResponse:
        scan_a = db.query(ScanRun).filter(ScanRun.id == scan_a_id).first()
        scan_b = db.query(ScanRun).filter(ScanRun.id == scan_b_id).first()

        if not scan_a or not scan_b:
            raise HTTPException(status_code=404, detail="One or both scans not found")

        findings_a = db.query(Finding).filter(Finding.scan_id == scan_a_id).all()
        findings_b = db.query(Finding).filter(Finding.scan_id == scan_b_id).all()

        # Generate fingerprints: rule_id + source + target + file_path
        def get_fingerprint(f: Finding) -> str:
            return f"{f.rule_id}::{f.source_module}::{f.target_module}::{f.source_component}::{f.target_component}::{f.file_path}"

        map_a = {get_fingerprint(f): f for f in findings_a}
        map_b = {get_fingerprint(f): f for f in findings_b}

        new_findings = [FindingResponse.model_validate(f) for k, f in map_b.items() if k not in map_a]
        resolved_findings = [FindingResponse.model_validate(f) for k, f in map_a.items() if k not in map_b]
        persistent_findings = [FindingResponse.model_validate(f) for k, f in map_b.items() if k in map_a]

        compliance_delta = round(scan_b.compliance_percentage - scan_a.compliance_percentage, 1)
        findings_delta = scan_b.total_findings - scan_a.total_findings

        return ScanComparisonResponse(
            scan_a=ScanRunResponse.model_validate(scan_a),
            scan_b=ScanRunResponse.model_validate(scan_b),
            new_findings=new_findings,
            resolved_findings=resolved_findings,
            persistent_findings=persistent_findings,
            compliance_delta=compliance_delta,
            findings_delta=findings_delta
        )
