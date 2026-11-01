import io
import zipfile
import uuid
import pytest
from fastapi.testclient import TestClient

from backend.app.services.email_service import EmailService

def create_valid_project_zip() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("app/__init__.py", "# app init\n")
        zf.writestr("app/domain/__init__.py", "")
        zf.writestr("app/domain/model.py", "class Model:\n    pass\n")
        zf.writestr("app/application/__init__.py", "")
        zf.writestr("app/application/service.py", "from app.domain.model import Model\n")
    buf.seek(0)
    return buf.getvalue()

def register_and_login_user(client: TestClient) -> dict:
    email = f"user.{uuid.uuid4().hex[:6]}@drift-test.com"
    pwd = "EnterprisePassword2026!"
    client.post("/api/v1/auth/signup", json={"email": email, "password": pwd, "full_name": "Test User"})
    mail = EmailService.get_latest_dev_email(email=email, email_type="signup_otp")
    client.post("/api/v1/auth/verify-signup-otp", json={"email": email, "otp": mail["token"]})
    login_res = client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
    token = login_res.json()["session_token"]
    return {"email": email, "token": token, "headers": {"Cookie": f"drift_session={token}", "Authorization": f"Bearer {token}"}}

def test_unauthenticated_requests_rejected(client: TestClient):
    """Protected endpoints reject requests without active session."""
    endpoints = [
        ("GET", "/api/v1/projects"),
        ("POST", "/api/v1/projects"),
        ("GET", "/api/v1/auth/me"),
        ("GET", "/api/v1/overview"),
        ("POST", "/api/v1/scans"),
    ]
    for method, path in endpoints:
        r = client.request(method, path)
        assert r.status_code == 401, f"{method} {path} should return 401"

def test_user_project_and_scan_isolation(client: TestClient):
    """User A cannot access User B's project or scans."""
    user_a = register_and_login_user(client)
    user_b = register_and_login_user(client)

    # User A creates a project
    proj_a = client.post(
        "/api/v1/projects",
        json={"name": "Project Alpha", "primary_language": "python"},
        headers=user_a["headers"]
    ).json()
    proj_a_id = proj_a["id"]

    # User B lists projects - Alpha should not appear
    b_projects = client.get("/api/v1/projects", headers=user_b["headers"]).json()
    b_ids = [p["id"] for p in b_projects]
    assert proj_a_id not in b_ids

    # User B directly requests User A's project -> 404
    get_proj = client.get(f"/api/v1/projects/{proj_a_id}", headers=user_b["headers"])
    assert get_proj.status_code == 404

def test_zip_upload_and_scan_workflow(client: TestClient):
    """Upload project ZIP -> attach architecture definition -> execute scan -> verify results."""
    user = register_and_login_user(client)

    # Create project
    proj = client.post(
        "/api/v1/projects",
        json={"name": "Drift Detection Test", "primary_language": "python"},
        headers=user["headers"]
    ).json()
    proj_id = proj["id"]

    # Upload empty zip -> rejected
    empty_buf = io.BytesIO()
    with zipfile.ZipFile(empty_buf, "w") as zf:
        pass
    empty_buf.seek(0)
    empty_upload = client.post(
        f"/api/v1/projects/{proj_id}/upload-zip",
        files={"file": ("empty.zip", empty_buf.getvalue(), "application/zip")},
        headers=user["headers"]
    )
    assert empty_upload.status_code == 400

    # Upload valid zip
    valid_zip = create_valid_project_zip()
    upload_res = client.post(
        f"/api/v1/projects/{proj_id}/upload-zip",
        files={"file": ("project.zip", valid_zip, "application/zip")},
        headers=user["headers"]
    )
    assert upload_res.status_code == 200

    # Attach Architecture Definition
    arch_json = """{
      "name": "Standard Layered",
      "version": 1,
      "components": [
        {"name": "application", "layer": 1, "path_patterns": ["app/application/**"], "allowed_dependencies": ["domain"], "forbidden_dependencies": []},
        {"name": "domain", "layer": 2, "path_patterns": ["app/domain/**"], "allowed_dependencies": [], "forbidden_dependencies": ["application"]}
      ],
      "rules": [
        {"id": "R1", "type": "layer_direction", "description": "Downward only layers", "severity": "critical", "layer_direction": "downward_only"}
      ]
    }"""
    arch_res = client.post(
        "/api/v1/architectures",
        json={"project_id": proj_id, "name": "Layered Arch", "format": "json", "raw_content": arch_json, "is_active": True},
        headers=user["headers"]
    )
    assert arch_res.status_code == 201

    # Execute Scan
    scan_res = client.post(
        "/api/v1/scans",
        json={"project_id": proj_id},
        headers=user["headers"]
    )
    assert scan_res.status_code == 201
    scan_data = scan_res.json()
    assert scan_data["status"] == "completed"
    assert scan_data["compliance_percentage"] == 100.0
    assert scan_data["total_findings"] == 0
    scan_id = scan_data["id"]

    # Verify JSON Report
    json_rep = client.get(f"/api/v1/scans/{scan_id}/report/json", headers=user["headers"])
    assert json_rep.status_code == 200
    rep_data = json_rep.json()
    assert rep_data["project"]["name"] == "Drift Detection Test"
    assert rep_data["scan"]["compliance_percentage"] == 100.0
    assert isinstance(rep_data["findings"], list)

    # Verify CSV Report contains UTF-8 BOM
    csv_rep = client.get(f"/api/v1/scans/{scan_id}/report/csv", headers=user["headers"])
    assert csv_rep.status_code == 200
    assert csv_rep.content.startswith(b"\xef\xbb\xbf")
    assert "Finding ID" in csv_rep.content.decode("utf-8-sig")

    # Verify PDF Report generation
    pdf_rep = client.get(f"/api/v1/scans/{scan_id}/report/pdf", headers=user["headers"])
    assert pdf_rep.status_code == 200
    assert pdf_rep.headers["content-type"].startswith("application/pdf")
    assert pdf_rep.content.startswith(b"%PDF")

    # Verify Real Dependency Graph generation
    graph_res = client.get(f"/api/v1/scans/{scan_id}/graph", headers=user["headers"])
    assert graph_res.status_code == 200
    graph_data = graph_res.json()
    assert "nodes" in graph_data
    assert "edges" in graph_data
    assert graph_data["scan_id"] == scan_id
    assert len(graph_data["nodes"]) >= 2
    assert any(n["label"] == "app.application.service" for n in graph_data["nodes"])
    assert any(n["label"] == "app.domain.model" for n in graph_data["nodes"])
    assert any(e["source"] == "app.application.service" and e["target"] == "app.domain.model" for e in graph_data["edges"])

def test_user_scan_and_report_access_isolation(client: TestClient):
    """User B cannot access User A's scans, reports, or dependency graphs."""
    user_a = register_and_login_user(client)
    user_b = register_and_login_user(client)

    # User A creates project, uploads code, and runs scan
    proj = client.post(
        "/api/v1/projects",
        json={"name": "Confidential Architecture", "primary_language": "python"},
        headers=user_a["headers"]
    ).json()
    proj_id = proj["id"]

    valid_zip = create_valid_project_zip()
    client.post(
        f"/api/v1/projects/{proj_id}/upload-zip",
        files={"file": ("project.zip", valid_zip, "application/zip")},
        headers=user_a["headers"]
    )

    arch_json = """{
      "name": "Standard Layered",
      "version": 1,
      "components": [
        {"name": "application", "layer": 1, "path_patterns": ["app/application/**"], "allowed_dependencies": ["domain"], "forbidden_dependencies": []},
        {"name": "domain", "layer": 2, "path_patterns": ["app/domain/**"], "allowed_dependencies": [], "forbidden_dependencies": ["application"]}
      ],
      "rules": []
    }"""
    client.post(
        "/api/v1/architectures",
        json={"project_id": proj_id, "name": "Layered Arch", "format": "json", "raw_content": arch_json, "is_active": True},
        headers=user_a["headers"]
    )

    scan_res = client.post(
        "/api/v1/scans",
        json={"project_id": proj_id},
        headers=user_a["headers"]
    )
    assert scan_res.status_code == 201
    scan_id = scan_res.json()["id"]

    # User B attempts to access User A's scan data -> 404 Not Found
    assert client.get(f"/api/v1/scans/{scan_id}", headers=user_b["headers"]).status_code == 404
    assert client.get(f"/api/v1/scans/{scan_id}/graph", headers=user_b["headers"]).status_code == 404
    assert client.get(f"/api/v1/scans/{scan_id}/report/json", headers=user_b["headers"]).status_code == 404
    assert client.get(f"/api/v1/scans/{scan_id}/report/csv", headers=user_b["headers"]).status_code == 404
    assert client.get(f"/api/v1/scans/{scan_id}/report/pdf", headers=user_b["headers"]).status_code == 404
    assert client.get(f"/api/v1/scans/{scan_id}/findings", headers=user_b["headers"]).status_code == 404



def test_health_and_readiness_endpoints(client: TestClient):
    """Health and readiness probes return 200 with operational database status."""
    res_health = client.get("/health")
    assert res_health.status_code == 200
    assert res_health.json()["status"] in ("healthy", "degraded")
    assert res_health.json()["database"] == "healthy"

    res_ready = client.get("/ready")
    assert res_ready.status_code == 200
    assert res_ready.json()["status"] == "ready"
    assert res_ready.json()["database"] == "connected"

    res_v1_ready = client.get("/api/v1/ready")
    assert res_v1_ready.status_code == 200
    assert res_v1_ready.json()["status"] == "ready"


def test_database_connection_helper():
    """Verify check_db_connection() helper confirms database availability."""
    from backend.app.core.database import check_db_connection
    is_connected, msg = check_db_connection()
    assert is_connected is True
    assert "operational" in msg.lower()


def test_circular_dependency_detection(client: TestClient):
    """Circular imports between modules (A -> B -> A) are accurately identified."""
    user = register_and_login_user(client)

    proj = client.post(
        "/api/v1/projects",
        json={"name": "Circular Dependency Project", "primary_language": "python"},
        headers=user["headers"]
    ).json()
    proj_id = proj["id"]

    # Create zip with cycle: mod_a imports mod_b, mod_b imports mod_a
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("cycle_pkg/__init__.py", "")
        zf.writestr("cycle_pkg/mod_a.py", "import cycle_pkg.mod_b\nclass A:\n    pass\n")
        zf.writestr("cycle_pkg/mod_b.py", "import cycle_pkg.mod_a\nclass B:\n    pass\n")
    buf.seek(0)

    client.post(
        f"/api/v1/projects/{proj_id}/upload-zip",
        files={"file": ("circular.zip", buf.getvalue(), "application/zip")},
        headers=user["headers"]
    )

    arch_json = """{
      "name": "Cycle Rules",
      "version": 1,
      "components": [
        {"name": "cycle_pkg", "layer": 1, "path_patterns": ["cycle_pkg/**"], "allowed_dependencies": [], "forbidden_dependencies": []}
      ],
      "rules": [
        {"id": "CIRC-1", "type": "circular_dependency", "description": "No cyclic module imports", "severity": "critical"}
      ]
    }"""
    client.post(
        "/api/v1/architectures",
        json={"project_id": proj_id, "name": "Cycle Arch", "format": "json", "raw_content": arch_json, "is_active": True},
        headers=user["headers"]
    )

    scan_res = client.post("/api/v1/scans", json={"project_id": proj_id}, headers=user["headers"])
    assert scan_res.status_code == 201
    scan = scan_res.json()
    assert scan["total_findings"] >= 1
    assert scan["critical_findings"] >= 1

    findings = client.get(f"/api/v1/scans/{scan['id']}/findings", headers=user["headers"]).json()
    assert any(f["rule_type"] == "circular_dependency" for f in findings)
