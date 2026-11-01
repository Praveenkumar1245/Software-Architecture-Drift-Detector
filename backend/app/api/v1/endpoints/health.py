import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.app.core.database import get_db
from backend.app.core.config import settings

logger = logging.getLogger("drift_detector.health")
router = APIRouter()

@router.get("/health", tags=["Health"])
def health_check(db: Session = Depends(get_db)):
    """Verifies that the API, database connection, and storage paths are operational."""
    db_status = "unhealthy"
    try:
        db.execute(text("SELECT 1"))
        db_status = "healthy"
    except Exception as e:
        logger.error(f"Database health check failed: {e}", exc_info=True)
        raise HTTPException(status_code=503, detail="Database connection error. Service temporarily unavailable.")

    storage_status = "healthy"
    try:
        test_file = settings.DATA_DIR / ".health_check"
        test_file.write_text("ok")
        test_file.unlink()
    except Exception as e:
        storage_status = f"unhealthy: {str(e)}"

    return {
        "status": "healthy" if db_status == "healthy" and storage_status == "healthy" else "degraded",
        "database": db_status,
        "storage": storage_status,
        "version": settings.VERSION,
        "project": settings.PROJECT_NAME
    }

@router.get("/ready", tags=["Health"])
def readiness_check(db: Session = Depends(get_db)):
    """Readiness probe endpoint to verify database connectivity before serving traffic."""
    try:
        db.execute(text("SELECT 1"))
        return {
            "status": "ready",
            "database": "connected",
            "version": settings.VERSION
        }
    except Exception as e:
        logger.error(f"Readiness probe failed: {e}", exc_info=True)
        raise HTTPException(status_code=503, detail="Database connectivity is not ready.")
