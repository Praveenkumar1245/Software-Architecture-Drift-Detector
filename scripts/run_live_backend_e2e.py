import io
import zipfile
import uuid
import httpx

BASE_URL = "http://127.0.0.1:8000/api/v1"

def build_test_zip() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("app/__init__.py", "# app\n")
        z.writestr("app/presentation/__init__.py", "")
        z.writestr("app/presentation/api.py", "from app.application.service import Service\nclass API: pass\n")
        z.writestr("app/application/__init__.py", "")
        z.writestr("app/application/service.py", "from app.domain.model import Model\nclass Service: pass\n")
        z.writestr("app/domain/__init__.py", "")
        z.writestr("app/domain/model.py", "class Model: pass\n")
    buf.seek(0)
    return buf.getvalue()

def run_e2e():
    print("=" * 60)
    print("RUNNING LIVE END-TO-END BACKEND INTEGRATION AUDIT")
    print("=" * 60)

    client = httpx.Client(timeout=15.0)

    # 1. Health check
    h = client.get("http://127.0.0.1:8000/health")
    assert h.status_code == 200, f"Health check failed: {h.text}"
    print("[PASS] 1. Root and API Health Check Status: 200 OK")

    # 2. Signup
    test_email = f"audit.user.{uuid.uuid4().hex[:6]}@drift-audit.com"
    test_pwd = "EnterpriseSecure2026!#"
    r_signup = client.post(f"{BASE_URL}/auth/signup", json={
        "email": test_email,
        "password": test_pwd,
        "full_name": "Audit Engineer"
    })
    assert r_signup.status_code == 201, f"Signup failed: {r_signup.text}"
    print(f"[PASS] 2. User Signup Created: {test_email} (Status 201)")

    # 3. OTP Retrieval & Verification
    mail = client.get(f"{BASE_URL}/auth/dev/mailbox/latest").json()
    otp_code = mail["token"]
    assert len(otp_code) == 6 and otp_code.isdigit()
    r_verify = client.post(f"{BASE_URL}/auth/verify-signup-otp", json={
        "email": test_email,
        "otp": otp_code
    })
    assert r_verify.status_code == 200, f"OTP verification failed: {r_verify.text}"
    print(f"[PASS] 3. 6-Digit OTP Verified ({otp_code}) - Account Activated")

    # 4. Login
    r_login = client.post(f"{BASE_URL}/auth/login", json={
        "email": test_email,
        "password": test_pwd
    })
    assert r_login.status_code == 200, f"Login failed: {r_login.text}"
    session_token = r_login.json()["session_token"]
    assert session_token, "No session token returned"
    print("[PASS] 4. Login Succeeded, Session Cookie and Bearer Token Established")

    auth_headers = {
        "Authorization": f"Bearer {session_token}",
        "Cookie": f"drift_session={session_token}"
    }

    # 5. Create Project
    r_proj = client.post(f"{BASE_URL}/projects", json={
        "name": "Audit Sample Project",
        "primary_language": "python",
        "description": "Integration test project"
    }, headers=auth_headers)
    assert r_proj.status_code == 201, f"Project creation failed: {r_proj.text}"
    proj_id = r_proj.json()["id"]
    print(f"[PASS] 5. Registered Project (ID: {proj_id})")

    # 6. Upload Project ZIP
    zip_bytes = build_test_zip()
    r_upload = client.post(
        f"{BASE_URL}/projects/{proj_id}/upload-zip",
        files={"file": ("project.zip", zip_bytes, "application/zip")},
        headers=auth_headers
    )
    assert r_upload.status_code == 200, f"Upload failed: {r_upload.text}"
    print("[PASS] 6. Source ZIP Uploaded and Extracted Safely")

    # 7. Add Architecture Definition
    arch_payload = {
        "project_id": proj_id,
        "name": "3-Tier Layered",
        "format": "json",
        "raw_content": """{
          "name": "3-Tier Layered",
          "version": 1,
          "components": [
            {"name": "presentation", "layer": 1, "path_patterns": ["app/presentation/**"], "allowed_dependencies": ["application"], "forbidden_dependencies": ["domain"]},
            {"name": "application", "layer": 2, "path_patterns": ["app/application/**"], "allowed_dependencies": ["domain"], "forbidden_dependencies": []},
            {"name": "domain", "layer": 3, "path_patterns": ["app/domain/**"], "allowed_dependencies": [], "forbidden_dependencies": ["presentation"]}
          ],
          "rules": [
            {"id": "L1", "type": "layer_direction", "description": "Downward layers only", "severity": "critical", "layer_direction": "downward_only"}
          ]
        }""",
        "is_active": True
    }
    r_arch = client.post(f"{BASE_URL}/architectures", json=arch_payload, headers=auth_headers)
    assert r_arch.status_code == 201, f"Architecture creation failed: {r_arch.text}"
    print("[PASS] 7. Architecture Definition Attached and Validated")

    # 8. Execute Drift Scan
    r_scan = client.post(f"{BASE_URL}/scans", json={"project_id": proj_id}, headers=auth_headers)
    assert r_scan.status_code == 201, f"Scan failed: {r_scan.text}"
    scan_data = r_scan.json()
    assert scan_data["status"] == "completed"
    assert scan_data["compliance_percentage"] == 100.0
    scan_id = scan_data["id"]
    print(f"[PASS] 8. Scan Executed (Compliance: {scan_data['compliance_percentage']}%, Findings: {scan_data['total_findings']})")

    # 9. Download JSON Report
    r_json = client.get(f"{BASE_URL}/scans/{scan_id}/report/json", headers=auth_headers)
    assert r_json.status_code == 200
    assert r_json.json()["project"]["name"] == "Audit Sample Project"
    print("[PASS] 9. JSON Report Downloaded & Validated")

    # 10. Download CSV Report (Check UTF-8 BOM)
    r_csv = client.get(f"{BASE_URL}/scans/{scan_id}/report/csv", headers=auth_headers)
    assert r_csv.status_code == 200
    assert r_csv.content.startswith(b"\xef\xbb\xbf"), "Missing UTF-8 BOM"
    print("[PASS] 10. CSV Report Downloaded with Valid UTF-8 BOM")

    # 11. Download PDF Report
    r_pdf = client.get(f"{BASE_URL}/scans/{scan_id}/report/pdf", headers=auth_headers)
    assert r_pdf.status_code == 200
    assert r_pdf.content.startswith(b"%PDF"), "Invalid PDF signature"
    print("[PASS] 11. PDF Report Downloaded with Valid %PDF Header")

    # 12. Logout
    r_logout = client.post(f"{BASE_URL}/auth/logout", headers=auth_headers)
    assert r_logout.status_code == 200
    print("[PASS] 12. User Logged Out (Session invalidated)")

    # 13. Verify Protected Endpoint Rejection after Logout
    r_after = client.get(f"{BASE_URL}/projects", headers=auth_headers)
    assert r_after.status_code == 401
    print("[PASS] 13. Revoked Session Cannot Access Protected Endpoints (401 Unauthorized)")

    print("=" * 60)
    print("ALL 13 LIVE BACKEND INTEGRATION SCENARIOS PASSED")
    print("=" * 60)

if __name__ == "__main__":
    run_e2e()
