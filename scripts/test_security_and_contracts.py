import io
import zipfile
import json
import uuid
import sys
import httpx

BASE_URL = "http://127.0.0.1:8000/api/v1"

def create_zip_with_slip(filename: str = "../../evil.py", content: str = "print('hacked')") -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(filename, content)
    buf.seek(0)
    return buf.getvalue()

def create_corrupt_zip() -> bytes:
    return b"PK\x03\x04CORRUPTED_DATA_HEADER_NOT_A_VALID_ZIP_ARCHIVE"

def run_security_audit():
    print("=== STARTING PHASE 6 & 7: SECURITY AND CONTRACT AUDIT ===")
    client = httpx.Client(timeout=20.0)

    results = {}

    def test(name, condition, detail=""):
        if condition:
            print(f"[PASS] {name} {detail}")
            results[name] = "PASS"
        else:
            print(f"[FAIL] {name} {detail}")
            results[name] = "FAIL"
            raise AssertionError(f"Security check failed: {name} - {detail}")

    # ----------------------------------------------------
    # TEST 1: Missing Authentication
    # ----------------------------------------------------
    no_auth_client = httpx.Client(timeout=10.0)
    endpoints_to_test = [
        ("GET", f"{BASE_URL}/projects"),
        ("POST", f"{BASE_URL}/projects"),
        ("GET", f"{BASE_URL}/auth/me"),
        ("GET", f"{BASE_URL}/overview"),
        ("GET", f"{BASE_URL}/architectures/templates"),
        ("POST", f"{BASE_URL}/architectures/validate"),
        ("POST", f"{BASE_URL}/scans"),
    ]
    for method, url in endpoints_to_test:
        r = no_auth_client.request(method, url)
        test(f"Auth Enforcement: {method} {url}", r.status_code == 401, f"(Status: {r.status_code})")

    # ----------------------------------------------------
    # TEST 2: Invalid Login Credentials
    # ----------------------------------------------------
    inv_login = no_auth_client.post(f"{BASE_URL}/auth/login", json={
        "email": "nonexistent_architect@drift.com",
        "password": "WrongPassword123!"
    })
    test("Invalid Login Rejected", inv_login.status_code == 401, f"(Status: {inv_login.status_code})")

    # ----------------------------------------------------
    # TEST 3: User Setup for Isolation & Token Verification
    # ----------------------------------------------------
    user_a_email = f"user.a.{uuid.uuid4().hex[:6]}@drift-audit.com"
    user_a_pwd = "PasswordA123!@#"
    user_b_email = f"user.b.{uuid.uuid4().hex[:6]}@drift-audit.com"
    user_b_pwd = "PasswordB123!@#"

    # Register User A
    ra = client.post(f"{BASE_URL}/auth/register", json={"email": user_a_email, "password": user_a_pwd, "full_name": "User Alpha"})
    test("User A Registration", ra.status_code == 201)
    mail_a = client.get(f"{BASE_URL}/auth/dev/mailbox/latest").json()
    token_a = mail_a["token"]

    # Verify User A
    va = client.post(f"{BASE_URL}/auth/verify-email", json={"token": token_a})
    test("User A Verification", va.status_code == 200)

    # Reused Verification Token
    reused = client.post(f"{BASE_URL}/auth/verify-email", json={"token": token_a})
    test("Reused Verification Token Rejected", reused.status_code == 400, f"(Status: {reused.status_code})")

    # Expired / Invalid Verification Token
    invalid_tok = client.post(f"{BASE_URL}/auth/verify-email", json={"token": "completely_invalid_token_12345"})
    test("Invalid Verification Token Rejected", invalid_tok.status_code == 400, f"(Status: {invalid_tok.status_code})")

    # Register User B
    client_b = httpx.Client(timeout=20.0)
    rb = client_b.post(f"{BASE_URL}/auth/register", json={"email": user_b_email, "password": user_b_pwd, "full_name": "User Beta"})
    test("User B Registration", rb.status_code == 201)
    mail_b = client_b.get(f"{BASE_URL}/auth/dev/mailbox/latest").json()
    token_b = mail_b["token"]
    vb = client_b.post(f"{BASE_URL}/auth/verify-email", json={"token": token_b})
    test("User B Verification", vb.status_code == 200)

    # Login both users
    client_a = httpx.Client(timeout=20.0)
    la = client_a.post(f"{BASE_URL}/auth/login", json={"email": user_a_email, "password": user_a_pwd})
    test("User A Login", la.status_code == 200)

    lb = client_b.post(f"{BASE_URL}/auth/login", json={"email": user_b_email, "password": user_b_pwd})
    test("User B Login", lb.status_code == 200)

    # ----------------------------------------------------
    # TEST 4: Cross-Tenant Isolation
    # ----------------------------------------------------
    # User A creates a private project
    pa = client_a.post(f"{BASE_URL}/projects", json={
        "name": "Secret Project Alpha",
        "description": "Proprietary",
        "repository_type": "local_zip"
    })
    test("User A Project Creation", pa.status_code == 201)
    proj_a_id = pa.json()["id"]

    # User B attempts to access User A's project
    b_get_a = client_b.get(f"{BASE_URL}/projects/{proj_a_id}")
    test("Cross-User Isolation: GET Project", b_get_a.status_code == 404, f"(Status: {b_get_a.status_code})")

    b_update_a = client_b.put(f"{BASE_URL}/projects/{proj_a_id}", json={"name": "Hacked Name"})
    test("Cross-User Isolation: PUT Project", b_update_a.status_code == 404, f"(Status: {b_update_a.status_code})")

    b_del_a = client_b.delete(f"{BASE_URL}/projects/{proj_a_id}")
    test("Cross-User Isolation: DELETE Project", b_del_a.status_code == 404, f"(Status: {b_del_a.status_code})")

    # ----------------------------------------------------
    # TEST 5: Malformed Architecture Files
    # ----------------------------------------------------
    malformed_json_res = client_a.post(f"{BASE_URL}/architectures/validate", json={
        "raw_content": "{ invalid json without quotes: 123 ",
        "format": "json"
    })
    test("Malformed JSON Architecture Rejected", malformed_json_res.json()["is_valid"] is False, f"Errors: {malformed_json_res.json()['errors']}")

    missing_components_res = client_a.post(f"{BASE_URL}/architectures/validate", json={
        "raw_content": json.dumps({"name": "Empty Arch", "components": []}),
        "format": "json"
    })
    test("Architecture Without Components Rejected", missing_components_res.json()["is_valid"] is False)

    # ----------------------------------------------------
    # TEST 6: Upload Security (Zip Slip, Corrupt Zip, Wrong Extension)
    # ----------------------------------------------------
    # 6a. Wrong extension (.txt instead of .zip)
    fake_txt = io.BytesIO(b"Just a text file")
    txt_res = client_a.post(
        f"{BASE_URL}/projects/{proj_a_id}/upload",
        files={"file": ("malicious.txt", fake_txt, "text/plain")}
    )
    test("Non-ZIP Upload Rejected", txt_res.status_code == 400, f"(Status: {txt_res.status_code})")

    # 6b. Corrupt ZIP file
    corrupt_bytes = create_corrupt_zip()
    corrupt_res = client_a.post(
        f"{BASE_URL}/projects/{proj_a_id}/upload",
        files={"file": ("corrupt.zip", io.BytesIO(corrupt_bytes), "application/zip")}
    )
    test("Corrupt ZIP Archive Rejected", corrupt_res.status_code == 400, f"(Status: {corrupt_res.status_code})")

    # 6c. Path Traversal / Zip Slip Attempt
    slip_bytes = create_zip_with_slip("../../etc_passwd.py", "malicious_content = True")
    slip_res = client_a.post(
        f"{BASE_URL}/projects/{proj_a_id}/upload",
        files={"file": ("slip.zip", io.BytesIO(slip_bytes), "application/zip")}
    )
    test("Zip Slip Path Traversal Blocked", slip_res.status_code == 400, f"(Status: {slip_res.status_code})")

    # ----------------------------------------------------
    # TEST 7: Invalid Resource Identifiers
    # ----------------------------------------------------
    nonexistent_proj = client_a.get(f"{BASE_URL}/projects/00000000-0000-0000-0000-000000000000")
    test("Nonexistent Project Returns 404", nonexistent_proj.status_code == 404)

    nonexistent_scan = client_a.get(f"{BASE_URL}/scans/00000000-0000-0000-0000-000000000000")
    test("Nonexistent Scan Returns 404", nonexistent_scan.status_code == 404)

    # ----------------------------------------------------
    # TEST 8: Password Reset Token Security
    # ----------------------------------------------------
    reset_req = client_a.post(f"{BASE_URL}/auth/forgot-password", json={"email": user_a_email})
    test("Forgot Password Accepted Generically", reset_req.status_code == 200)

    # Enumeration resistance: non-existent email gets same generic success
    ghost_reset = client_a.post(f"{BASE_URL}/auth/forgot-password", json={"email": "nobody@nowhere-not-real.com"})
    test("Account Enumeration Resistant (Forgot Password)", ghost_reset.status_code == 200)

    mail_reset = client_a.get(f"{BASE_URL}/auth/dev/mailbox/latest").json()
    reset_token = mail_reset["token"]

    # Invalidate with wrong token
    bad_reset = client_a.post(f"{BASE_URL}/auth/reset-password", json={"token": "bogus_token", "new_password": "NewPassword2026!"})
    test("Invalid Password Reset Token Rejected", bad_reset.status_code == 400)

    # Valid reset
    new_pwd = "NewSecurePassword2026!#"
    good_reset = client_a.post(f"{BASE_URL}/auth/reset-password", json={"token": reset_token, "new_password": new_pwd})
    test("Valid Password Reset Executed", good_reset.status_code == 200)

    # Reused reset token rejected
    reused_reset = client_a.post(f"{BASE_URL}/auth/reset-password", json={"token": reset_token, "new_password": "AnotherPassword!"})
    test("Reused Password Reset Token Rejected", reused_reset.status_code == 400)

    # Previous session invalidated by password reset
    old_session_check = client_a.get(f"{BASE_URL}/auth/me")
    test("Sessions Revoked on Password Reset", old_session_check.status_code == 401)

    # Login with new password succeeds
    new_login = client_a.post(f"{BASE_URL}/auth/login", json={"email": user_a_email, "password": new_pwd})
    test("Login With New Password Succeeded", new_login.status_code == 200)

    # ----------------------------------------------------
    # TEST 9: Session Termination / Logout
    # ----------------------------------------------------
    logout_res = client_a.post(f"{BASE_URL}/auth/logout")
    test("Logout Endpoint Succeeded", logout_res.status_code == 200)

    after_logout = client_a.get(f"{BASE_URL}/auth/me")
    test("Session Terminated After Logout", after_logout.status_code == 401)

    print("\n=== ALL SECURITY & CONTRACT CHECKS COMPLETED SUCCESSFULLY ===")
    print(f"Total Security Assertions: {len(results)} passed, 0 failed.")

if __name__ == "__main__":
    try:
        run_security_audit()
    except Exception as e:
        print(f"SECURITY AUDIT ERROR: {str(e)}", file=sys.stderr)
        sys.exit(1)
