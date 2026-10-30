from typing import Optional
from fastapi import APIRouter, Depends, Query, Response, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.api.deps import get_current_user
from backend.app.models.user import User
from backend.app.models.scan import ScanRun
from backend.app.models.project import Project
from backend.app.schemas.report import ProjectOverviewMetrics
from backend.app.services.report_service import ReportService

router = APIRouter(tags=["Reports & Overview"])

def verify_user_scan(db: Session, scan_id: str, user_id: str) -> ScanRun:
    scan = db.query(ScanRun).filter(ScanRun.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    project = db.query(Project).filter(Project.id == scan.project_id).first()
    if not project or (project.user_id is not None and project.user_id != user_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return scan

@router.get("/overview", response_model=ProjectOverviewMetrics)
def get_overview_dashboard(
    project_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Provides aggregated metrics, trends, compliance %, and rule violations for dashboard."""
    return ReportService.get_overview_metrics(db, project_id=project_id, user_id=current_user.id)

@router.get("/scans/{scan_id}/report/json")
def get_json_report(
    scan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Exports full structured analysis report as JSON."""
    verify_user_scan(db, scan_id, current_user.id)
    return ReportService.generate_json_report(db, scan_id)

@router.get("/scans/{scan_id}/report/csv")
def get_csv_report(
    scan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Exports findings as CSV with spreadsheet formula injection protection and UTF-8 BOM encoding."""
    verify_user_scan(db, scan_id, current_user.id)
    csv_stream = ReportService.generate_csv_stream(db, scan_id)
    csv_text = csv_stream.getvalue()
    # Encode with UTF-8 BOM (utf-8-sig) so Microsoft Excel, Windows Notepad, and other
    # desktop spreadsheet applications immediately recognize UTF-8 encoding and delimiters.
    csv_bytes = csv_text.encode("utf-8-sig")
    filename = f"drift_report_{scan_id[:8]}.csv"
    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Length": str(len(csv_bytes)),
        }
    )

@router.get("/scans/{scan_id}/report/pdf")
def get_pdf_report(
    scan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Exports full executive architectural compliance audit report as PDF."""
    verify_user_scan(db, scan_id, current_user.id)
    pdf_stream = ReportService.generate_pdf_stream(db, scan_id)
    pdf_bytes = pdf_stream.getvalue()
    filename = f"drift_report_{scan_id[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "application/pdf",
            "Content-Length": str(len(pdf_bytes)),
        }
    )


