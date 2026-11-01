import os
import time
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from backend.app.core.config import settings
from backend.app.core.database import engine, Base, get_db
from backend.app.api.v1.api import api_router
from backend.app.api.v1.endpoints.health import health_check, readiness_check
import backend.app.models  # ensure models loaded

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("drift_detector")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing database tables...")
    settings.ensure_directories()
    Base.metadata.create_all(bind=engine)
    logger.info("Application startup complete.")
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Software Architecture Drift Detector REST API for detecting component, layer, and rule violations.",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Structured request logging middleware (never logs sensitive payloads, credentials, or tokens)
@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    start_time = time.time()
    try:
        response = await call_next(request)
        duration_ms = round((time.time() - start_time) * 1000, 2)
        client_host = request.client.host if request.client else "unknown"
        logger.info(
            f'{client_host} - "{request.method} {request.url.path}" {response.status_code} in {duration_ms}ms'
        )
        return response
    except Exception as exc:
        duration_ms = round((time.time() - start_time) * 1000, 2)
        logger.error(
            f'Exception during "{request.method} {request.url.path}" after {duration_ms}ms: {exc}',
            exc_info=True
        )
        raise

# Centralized Exception Handlers (prevent leaking internal filesystem paths or stack traces)
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=getattr(exc, "headers", None)
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for err in exc.errors():
        loc = " -> ".join([str(l) for l in err.get("loc", [])])
        msg = err.get("msg", "Invalid parameter")
        errors.append(f"{loc}: {msg}")
    detail_msg = "; ".join(errors) if errors else "Submitted data failed validation schema."
    return JSONResponse(
        status_code=422,
        content={"detail": f"Validation Error (422): {detail_msg}"}
    )

@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    logger.error(f"Database error during {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=503,
        content={"detail": "Database operation error. Service temporarily unavailable."}
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception during {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please consult the server logs."}
    )

# Include v1 API routes
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
def root():
    return {
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
        "health": f"{settings.API_V1_STR}/health",
        "ready": "/ready"
    }

@app.get("/health", tags=["Health"])
def root_health(db: Session = Depends(get_db)):
    """Root health check endpoint for cloud load balancers and deployment platforms."""
    return health_check(db=db)

@app.get("/ready", tags=["Health"])
def root_ready(db: Session = Depends(get_db)):
    """Root readiness probe endpoint for Kubernetes and container orchestrators."""
    return readiness_check(db=db)

if __name__ == "__main__":
    import uvicorn
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("backend.app.main:app", host=host, port=port, reload=True)
