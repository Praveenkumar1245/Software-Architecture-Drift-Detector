from fastapi import APIRouter
from backend.app.api.v1.endpoints import (
    health,
    auth,
    projects,
    architecture,
    scans,
    findings,
    graph,
    reports,
    ai
)

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(projects.router)
api_router.include_router(architecture.router)
api_router.include_router(scans.router)
api_router.include_router(findings.router)
api_router.include_router(graph.router)
api_router.include_router(reports.router)
api_router.include_router(ai.router)
