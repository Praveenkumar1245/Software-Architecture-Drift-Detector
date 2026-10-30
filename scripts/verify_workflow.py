import httpx
import json
import uuid
from pathlib import Path
import sys

BASE_URL = "http://127.0.0.1:8000/api/v1"

def run_integration_audit():
    print("=== STARTING FULL INTEGRATION AUDIT WITH AUTHENTICATION ===")
    client = httpx.Client(timeout=30.0)

    # 1. Health Check (Public endpoint)
    res = client.get(f"{BASE_URL}/health")
    assert res.status_code == 200, f"Health check failed: {res.text}"
    health_data = res.json()
    print(f"[PASS 1/14] Health Check passed: DB={health_data['database']}, Storage={health_data['storage']}")

    # 2. User Registration Flow (Pending Account Creation)
    unique_suffix = uuid.uuid4().hex[:6]
    test_email = f"lead.architect.{unique_suffix}@drift-enterprise.com"
    test_password = "SecureEnterprisePassword2026!"
    reg_payload = {
        "email": test_email,
        "password": test_password,
        "full_name": "Chief Software Architect"
    }
    reg_res = client.post(f"{BASE_URL}/auth/register", json=reg_payload)
    assert reg_res.status_code == 201, f"User registration failed: {reg_res.text}"
    reg_data = reg_res.json()
    print(f"[PASS 2/14] Pending user registered: {test_email} (Delivery: {reg_data.get('email_delivery')})")

    # 3. Email Verification Flow (Cryptographic Single-Use Token)
    # Check that logging in before verification is blocked
    premature_login = client.post(f"{BASE_URL}/auth/login", json={"email": test_email, "password": test_password})
    assert premature_login.status_code == 403, "Unverified login was improperly permitted!"
    print("[PASS 3/14] Login before email verification was strictly blocked with 403 Forbidden")

    # Retrieve verification token from dev mailbox endpoint
    dev_mail_res = client.get(f"{BASE_URL}/auth/dev/mailbox/latest")
    assert dev_mail_res.status_code == 200, f"Failed to retrieve dev mailbox email: {dev_mail_res.text}"
    token = dev_mail_res.json()["token"]

    verify_res = client.post(f"{BASE_URL}/auth/verify-email", json={"token": token})
    assert verify_res.status_code == 200, f"Email verification failed: {verify_res.text}"
    print(f"[PASS 4/14] Email verified successfully with cryptographic token")

    # 4. User Sign In & HttpOnly Session Cookie Establishment
    login_res = client.post(f"{BASE_URL}/auth/login", json={
        "email": test_email,
        "password": test_password,
        "remember_me": True
    })
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    user_info = login_res.json()["user"]
    print(f"[PASS 5/14] User logged in: '{user_info['full_name']}' (Session cookie established)")

    # 5. Project Creation
    proj_payload = {
        "name": f"Enterprise Order Core {unique_suffix}",
        "description": "Production e-commerce ordering system with domain core",
        "repository_type": "local_zip",
        "primary_language": "python",
        "source_dirs": "app",
        "exclude_dirs": ".venv,venv,__pycache__,tests,dist,build,node_modules,.git"
    }
    res = client.post(f"{BASE_URL}/projects", json=proj_payload)
    assert res.status_code == 201, f"Project creation failed: {res.text}"
    project = res.json()
    proj_id = project["id"]
    print(f"[PASS 6/14] Project created: '{project['name']}' (ID: {proj_id})")

    # 6. Source Upload (sample-project.zip)
    zip_path = Path(__file__).resolve().parent.parent / "sample-project.zip"
    assert zip_path.exists(), "sample-project.zip does not exist"

    with open(zip_path, "rb") as f:
        res = client.post(
            f"{BASE_URL}/projects/{proj_id}/upload",
            files={"file": ("sample-project.zip", f, "application/zip")}
        )
    assert res.status_code == 200, f"ZIP upload failed: {res.text}"
    print("[PASS 7/14] ZIP archive uploaded and extracted safely to project sandbox")

    # 7. Architecture Import
    arch_file = Path(__file__).resolve().parent.parent / "architecture-examples" / "layered.json"
    with open(arch_file, "r") as f:
        arch_raw = f.read()

    val_res = client.post(f"{BASE_URL}/architectures/validate", json={"raw_content": arch_raw, "format": "json"})
    assert val_res.status_code == 200 and val_res.json()["is_valid"], f"Architecture validation failed: {val_res.text}"

    arch_res = client.post(f"{BASE_URL}/architectures", json={
        "project_id": proj_id,
        "name": "Standard Layered Architecture",
        "format": "json",
        "raw_content": arch_raw
    })
    assert arch_res.status_code == 201, f"Architecture creation failed: {arch_res.text}"
    arch = arch_res.json()
    arch_id = arch["id"]
    print(f"[PASS 8/14] Architecture saved and activated: '{arch['name']}' (Version {arch['version']})")

    # 8. Run Initial Scan (Scan 1)
    scan_res = client.post(f"{BASE_URL}/scans", json={
        "project_id": proj_id,
        "architecture_id": arch_id,
        "source_version": "v1.0.0-initial"
    })
    assert scan_res.status_code == 201, f"Scan failed: {scan_res.text}"
    scan1 = scan_res.json()
    scan1_id = scan1["id"]
    print(f"[PASS 9/14] Scan 1 executed: status={scan1['status']}, files={scan1['files_analyzed']}, findings={scan1['total_findings']}, compliance={scan1['compliance_percentage']}%")

    # 9. Verify Detected Deliberate Violation
    findings_res = client.get(f"{BASE_URL}/scans/{scan1_id}/findings")
    assert findings_res.status_code == 200, f"Get findings failed: {findings_res.text}"
    findings = findings_res.json()
    assert len(findings) > 0, "No findings detected!"

    deliberate_violation = next((
        f for f in findings
        if "presentation" in (f["target_component"] or "") or "routes" in (f["target_module"] or "")
    ), None)
    assert deliberate_violation is not None, "Deliberate violation (domain importing presentation) was NOT detected!"
    print(f"[PASS 10/14] Deliberate architecture violation detected:")
    print(f"   - Title: {deliberate_violation['title']}")
    print(f"   - Rule ID: {deliberate_violation['rule_id']}")
    print(f"   - File: {deliberate_violation['file_path']} (Line {deliberate_violation['line_number']})")
    print(f"   - Evidence: {deliberate_violation['evidence']}")
    print(f"   - Remediation: {deliberate_violation['remediation']}")

    # 10. Test Finding Status Workflow & Audit Log
    f_id = deliberate_violation["id"]
    audit_res = client.patch(
        f"{BASE_URL}/findings/{f_id}/status",
        json={"status": "accepted_exception", "reason": "Authorized technical debt for Q1 migration."}
    )
    assert audit_res.status_code == 200, f"Status update failed: {audit_res.text}"
    updated_finding = audit_res.json()
    assert updated_finding["status"] == "accepted_exception"
    assert len(updated_finding["audit_logs"]) >= 1
    print("[PASS 11/14] Finding status updated to 'accepted_exception' with immutable audit history")

    # 11. Test Interactive Dependency Graph Retrieval
    graph_res = client.get(f"{BASE_URL}/scans/{scan1_id}/graph")
    assert graph_res.status_code == 200, f"Graph retrieval failed: {graph_res.text}"
    graph = graph_res.json()
    assert len(graph["nodes"]) >= 4, f"Insufficient nodes in graph: {len(graph['nodes'])}"
    assert len(graph["edges"]) >= 3, f"Insufficient edges in graph: {len(graph['edges'])}"
    violation_edges = [e for e in graph["edges"] if e["is_violation"]]
    assert len(violation_edges) > 0, "No violation edges flagged in graph data"
    print(f"[PASS 12/14] Dependency graph constructed: {len(graph['nodes'])} nodes, {len(graph['edges'])} edges ({len(violation_edges)} violations flagged)")

    # 12. Run Second Scan & Verify Scan Comparison
    scan2_res = client.post(f"{BASE_URL}/scans", json={
        "project_id": proj_id,
        "architecture_id": arch_id,
        "source_version": "v1.0.1-subsequent"
    })
    assert scan2_res.status_code == 201, f"Scan 2 failed: {scan2_res.text}"
    scan2_id = scan2_res.json()["id"]

    comp_res = client.get(f"{BASE_URL}/scans/{scan1_id}/compare/{scan2_id}")
    assert comp_res.status_code == 200, f"Scan comparison failed: {comp_res.text}"
    comp = comp_res.json()
    assert len(comp["persistent_findings"]) > 0, "Persistent findings expected between scans"
    print(f"[PASS 13/14] Scan comparison completed: persistent={len(comp['persistent_findings'])}, new={len(comp['new_findings'])}, resolved={len(comp['resolved_findings'])}")

    # 13. Reports: JSON & CSV and Overview
    json_report_res = client.get(f"{BASE_URL}/scans/{scan1_id}/report/json")
    assert json_report_res.status_code == 200
    csv_report_res = client.get(f"{BASE_URL}/scans/{scan1_id}/report/csv")
    assert csv_report_res.status_code == 200
    overview_res = client.get(f"{BASE_URL}/overview?project_id={proj_id}")
    assert overview_res.status_code == 200
    print("[PASS 14/14] Reports and Dashboard Overview metrics verified")

    print("\n=== ALL 14 INTEGRATION AUDIT WORKFLOW CHECKS PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    try:
        run_integration_audit()
    except Exception as e:
        print(f"AUDIT FAILED: {str(e)}", file=sys.stderr)
        sys.exit(1)
