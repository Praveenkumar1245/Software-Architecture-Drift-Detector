import io
import csv
import json
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from fastapi import HTTPException
from fastapi.responses import StreamingResponse

from backend.app.models.project import Project
from backend.app.models.architecture import ArchitectureDefinition
from backend.app.models.scan import ScanRun, DiscoveredModule, DependencyRelationship
from backend.app.models.finding import Finding
from backend.app.schemas.report import (
    ProjectOverviewMetrics,
    TrendPoint,
    ViolatedRuleStat,
    ComponentComplianceStat
)
from backend.app.schemas.scan import ScanRunResponse

def sanitize_csv_field(val: Any) -> str:
    """Protects against spreadsheet formula injection by prepending single quote if needed."""
    if val is None:
        return ""
    text = str(val).strip()
    if text and text[0] in ('=', '+', '-', '@', '\t', '\r'):
        return f"'{text}"
    return text

class ReportService:
    @staticmethod
    def get_overview_metrics(db: Session, project_id: Optional[str] = None, user_id: Optional[str] = None) -> ProjectOverviewMetrics:
        user_project_ids = None
        if user_id:
            user_project_ids = [p[0] for p in db.query(Project.id).filter((Project.user_id == user_id) | (Project.user_id.is_(None))).all()]

        proj_query = db.query(Project)
        scan_query = db.query(ScanRun).filter(ScanRun.status == "completed")
        finding_query = db.query(Finding)

        if user_project_ids is not None:
            proj_query = proj_query.filter(Project.id.in_(user_project_ids))
            scan_query = scan_query.filter(ScanRun.project_id.in_(user_project_ids))
            finding_query = finding_query.filter(Finding.project_id.in_(user_project_ids))

        project_name = None
        if project_id:
            if user_project_ids is not None and project_id not in user_project_ids:
                raise HTTPException(status_code=404, detail="Project not found")
            project = db.query(Project).filter(Project.id == project_id).first()
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")
            project_name = project.name
            scan_query = scan_query.filter(ScanRun.project_id == project_id)
            finding_query = finding_query.filter(Finding.project_id == project_id)

        total_projects = proj_query.count()
        total_scans = scan_query.count()

        latest_scan = scan_query.order_by(desc(ScanRun.created_at)).first()

        # If a latest scan exists, base active findings and compliance on it
        total_findings = 0
        crit_findings = 0
        high_findings = 0
        med_findings = 0
        low_findings = 0
        compliance = 100.0

        if latest_scan:
            compliance = latest_scan.compliance_percentage
            total_findings = latest_scan.total_findings
            crit_findings = latest_scan.critical_findings
            high_findings = latest_scan.high_findings
            med_findings = latest_scan.medium_findings
            low_findings = latest_scan.low_findings
        else:
            total_findings = finding_query.count()
            crit_findings = finding_query.filter(Finding.severity == "critical").count()
            high_findings = finding_query.filter(Finding.severity == "high").count()
            med_findings = finding_query.filter(Finding.severity == "medium").count()
            low_findings = finding_query.filter(Finding.severity == "low").count()

        # Build trend points
        recent_scans = (
            scan_query.order_by(ScanRun.created_at.asc())
            .limit(10)
            .all()
        )
        trends: List[TrendPoint] = []
        for s in recent_scans:
            trends.append(
                TrendPoint(
                    timestamp=s.created_at.strftime("%b %d, %H:%M"),
                    scan_id=s.id,
                    compliance_percentage=s.compliance_percentage,
                    total_findings=s.total_findings,
                    critical_findings=s.critical_findings,
                    high_findings=s.high_findings
                )
            )

        # Top violated rules
        top_rules_raw = (
            db.query(
                Finding.rule_id,
                Finding.rule_type,
                Finding.severity,
                Finding.title,
                func.count(Finding.id).label("cnt")
            )
            .group_by(Finding.rule_id, Finding.rule_type, Finding.severity, Finding.title)
            .order_by(desc("cnt"))
            .limit(5)
            .all()
        )
        top_rules: List[ViolatedRuleStat] = []
        for r in top_rules_raw:
            top_rules.append(
                ViolatedRuleStat(
                    rule_id=r[0],
                    rule_type=r[1],
                    severity=r[2],
                    description=r[3],
                    count=r[4]
                )
            )

        # Component stats from latest scan if available
        comp_stats: List[ComponentComplianceStat] = []
        if latest_scan:
            modules = db.query(DiscoveredModule).filter(DiscoveredModule.scan_id == latest_scan.id).all()
            relationships = db.query(DependencyRelationship).filter(DependencyRelationship.scan_id == latest_scan.id).all()
            findings = db.query(Finding).filter(Finding.scan_id == latest_scan.id).all()

            components = sorted(list({m.component_name for m in modules if m.component_name}))
            for c in components:
                c_mods = sum(1 for m in modules if m.component_name == c)
                in_deps = sum(1 for r in relationships if r.target_component == c)
                out_deps = sum(1 for r in relationships if r.source_component == c)
                c_viols = sum(1 for f in findings if f.source_component == c or f.target_component == c)
                comp_stats.append(
                    ComponentComplianceStat(
                        component=c,
                        modules_count=c_mods,
                        incoming_dependencies=in_deps,
                        outgoing_dependencies=out_deps,
                        violations_count=c_viols,
                        is_compliant=c_viols == 0
                    )
                )

        return ProjectOverviewMetrics(
            project_id=project_id,
            project_name=project_name,
            total_projects=total_projects,
            total_scans=total_scans,
            total_findings=total_findings,
            critical_findings=crit_findings,
            high_findings=high_findings,
            medium_findings=med_findings,
            low_findings=low_findings,
            compliance_percentage=compliance,
            latest_scan=ScanRunResponse.model_validate(latest_scan) if latest_scan else None,
            severity_distribution={
                "critical": crit_findings,
                "high": high_findings,
                "medium": med_findings,
                "low": low_findings
            },
            trends=trends,
            top_violated_rules=top_rules,
            component_stats=comp_stats
        )

    @staticmethod
    def generate_json_report(db: Session, scan_id: str) -> Dict[str, Any]:
        scan = db.query(ScanRun).filter(ScanRun.id == scan_id).first()
        if not scan:
            raise HTTPException(status_code=404, detail="Scan not found")

        project = db.query(Project).filter(Project.id == scan.project_id).first()
        arch = db.query(ArchitectureDefinition).filter(ArchitectureDefinition.id == scan.architecture_id).first() if scan.architecture_id else None
        findings = db.query(Finding).filter(Finding.scan_id == scan_id).all()
        modules = db.query(DiscoveredModule).filter(DiscoveredModule.scan_id == scan_id).all()

        return {
            "report_generated_at": datetime.now(timezone.utc).isoformat(),
            "project": {
                "id": project.id if project else None,
                "name": project.name if project else None,
                "primary_language": project.primary_language if project else None
            },
            "architecture": {
                "id": arch.id if arch else None,
                "name": arch.name if arch else None,
                "version": arch.version if arch else None
            },
            "scan": {
                "id": scan.id,
                "status": scan.status,
                "started_at": scan.started_at.isoformat() if scan.started_at else None,
                "completed_at": scan.completed_at.isoformat() if scan.completed_at else None,
                "duration_ms": scan.duration_ms,
                "files_analyzed": scan.files_analyzed,
                "modules_discovered": scan.modules_discovered,
                "dependencies_discovered": scan.dependencies_discovered,
                "compliance_percentage": scan.compliance_percentage,
                "total_findings": scan.total_findings,
                "critical_findings": scan.critical_findings,
                "high_findings": scan.high_findings,
                "medium_findings": scan.medium_findings,
                "low_findings": scan.low_findings
            },
            "findings": [
                {
                    "id": f.id,
                    "rule_id": f.rule_id,
                    "rule_type": f.rule_type,
                    "severity": f.severity,
                    "title": f.title,
                    "explanation": f.explanation,
                    "source_module": f.source_module,
                    "target_module": f.target_module,
                    "source_component": f.source_component,
                    "target_component": f.target_component,
                    "file_path": f.file_path,
                    "line_number": f.line_number,
                    "expected_behavior": f.expected_behavior,
                    "actual_behavior": f.actual_behavior,
                    "evidence": f.evidence,
                    "confidence": f.confidence,
                    "remediation": f.remediation,
                    "status": f.status,
                    "first_detected_at": f.first_detected_at.isoformat() if f.first_detected_at else None,
                    "last_detected_at": f.last_detected_at.isoformat() if f.last_detected_at else None
                }
                for f in findings
            ]
        }

    @staticmethod
    def generate_csv_stream(db: Session, scan_id: str) -> io.StringIO:
        scan = db.query(ScanRun).filter(ScanRun.id == scan_id).first()
        if not scan:
            raise HTTPException(status_code=404, detail="Scan not found")

        findings = db.query(Finding).filter(Finding.scan_id == scan_id).all()

        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

        # Header row
        writer.writerow([
            "Finding ID",
            "Rule ID",
            "Rule Type",
            "Severity",
            "Title",
            "Source Module",
            "Target Module",
            "Source Component",
            "Target Component",
            "File Path",
            "Line Number",
            "Status",
            "Explanation",
            "Evidence",
            "Remediation"
        ])

        for f in findings:
            writer.writerow([
                sanitize_csv_field(f.id),
                sanitize_csv_field(f.rule_id),
                sanitize_csv_field(f.rule_type),
                sanitize_csv_field(f.severity),
                sanitize_csv_field(f.title),
                sanitize_csv_field(f.source_module),
                sanitize_csv_field(f.target_module),
                sanitize_csv_field(f.source_component),
                sanitize_csv_field(f.target_component),
                sanitize_csv_field(f.file_path),
                sanitize_csv_field(f.line_number),
                sanitize_csv_field(f.status),
                sanitize_csv_field(f.explanation),
                sanitize_csv_field(f.evidence),
                sanitize_csv_field(f.remediation)
            ])

        output.seek(0)
        return output

    @classmethod
    def generate_pdf_stream(cls, db: Session, scan_id: str) -> io.BytesIO:
        from backend.app.services.pdf_generator import PdfReportGenerator
        report_data = cls.generate_json_report(db, scan_id)
        return PdfReportGenerator.generate_pdf(report_data)
